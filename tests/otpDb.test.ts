import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import {
  assertOtpChallenge,
  createOtpChallenge,
  incrementRateLimit,
  OtpChallengeError,
  verifyAndConsumeOtpChallenge,
} from "../lib/auth/otpDb";

type TestOtpRow = {
  id: string;
  mobile: string;
  tokenHash: string;
  attempts: number;
  expiresAt: Date;
};

const originalDelegateDescriptor = Object.getOwnPropertyDescriptor(db, "otpToken");
const originalQueryDescriptor = Object.getOwnPropertyDescriptor(db, "$queryRaw");
let rows = new Map<string, TestOtpRow>();

function installOtpDelegate() {
  const delegate = {
    async upsert(args: {
      where: { mobile: string };
      update: Partial<TestOtpRow>;
      create: Omit<TestOtpRow, "attempts"> & { attempts?: number };
    }) {
      const current = rows.get(args.where.mobile);
      const row = current
        ? { ...current, ...args.update, mobile: current.mobile }
        : { ...args.create, attempts: args.create.attempts ?? 0 };
      rows.set(row.mobile, row);
      return row;
    },
    async findUnique(args: { where: { mobile: string } }) {
      const row = rows.get(args.where.mobile);
      return row ? { ...row } : null;
    },
    async updateMany(args: {
      where: { id: string; tokenHash: string; attempts: number; expiresAt: { gt: Date } };
      data: { attempts: { increment: number } };
    }) {
      const row = rows.get([...rows.values()].find((item) => item.id === args.where.id)?.mobile || "");
      if (
        !row ||
        row.tokenHash !== args.where.tokenHash ||
        row.attempts !== args.where.attempts ||
        row.expiresAt <= args.where.expiresAt.gt
      ) {
        return { count: 0 };
      }
      row.attempts += args.data.attempts.increment;
      return { count: 1 };
    },
    async deleteMany(args: {
      where: {
        mobile?: string;
        id?: string;
        tokenHash?: string;
        attempts?: number;
        expiresAt?: { gt?: Date; lte?: Date };
      };
    }) {
      let count = 0;
      for (const [mobile, row] of rows) {
        const where = args.where;
        if (
          (where.mobile === undefined || row.mobile === where.mobile) &&
          (where.id === undefined || row.id === where.id) &&
          (where.tokenHash === undefined || row.tokenHash === where.tokenHash) &&
          (where.attempts === undefined || row.attempts === where.attempts) &&
          (where.expiresAt?.gt === undefined || row.expiresAt > where.expiresAt.gt) &&
          (where.expiresAt?.lte === undefined || row.expiresAt <= where.expiresAt.lte)
        ) {
          rows.delete(mobile);
          count += 1;
        }
      }
      return { count };
    },
  };

  Object.defineProperty(db, "otpToken", {
    configurable: true,
    writable: true,
    value: delegate,
  });
}

afterEach(() => {
  rows = new Map();
  if (originalDelegateDescriptor) {
    Object.defineProperty(db, "otpToken", originalDelegateDescriptor);
  } else {
    delete (db as unknown as Record<string, unknown>).otpToken;
  }
  if (originalQueryDescriptor) {
    Object.defineProperty(db, "$queryRaw", originalQueryDescriptor);
  } else {
    delete (db as unknown as Record<string, unknown>).$queryRaw;
  }
});

test("failed OTP attempts persist and the challenge expires after the attempt limit", async () => {
  installOtpDelegate();
  const challengeId = await createOtpChallenge("9876543210", "123456", 5);
  const stored = rows.get("9876543210");
  assert.ok(stored);
  assert.notEqual(stored.tokenHash, "123456");
  assert.equal(await bcrypt.compare("123456", stored.tokenHash), true);

  for (let attempt = 1; attempt < 5; attempt += 1) {
    await assert.rejects(
      verifyAndConsumeOtpChallenge("9876543210", challengeId, "000000"),
      (error: unknown) => error instanceof OtpChallengeError && error.code === "INVALID_OTP"
    );
  }
  assert.equal(rows.get("9876543210")?.attempts, 4);

  await assert.rejects(
    verifyAndConsumeOtpChallenge("9876543210", challengeId, "000000"),
    (error: unknown) => error instanceof OtpChallengeError && error.code === "MAX_ATTEMPTS"
  );
  assert.equal(rows.has("9876543210"), false);
});

test("expired challenges are deleted", async () => {
  installOtpDelegate();
  const challengeId = await createOtpChallenge("9876543210", "123456", 5);
  const row = rows.get("9876543210");
  assert.ok(row);
  row.expiresAt = new Date(Date.now() - 1000);

  await assert.rejects(
    assertOtpChallenge("9876543210", challengeId),
    (error: unknown) => error instanceof OtpChallengeError && error.code === "EXPIRED"
  );
  assert.equal(rows.has("9876543210"), false);
});

test("expired OTP rows are cleaned when a new challenge is created", async () => {
  installOtpDelegate();
  await createOtpChallenge("9876543210", "123456", 5);
  const expiredRow = rows.get("9876543210");
  assert.ok(expiredRow);
  expiredRow.expiresAt = new Date(Date.now() - 1000);

  await createOtpChallenge("9876543211", "654321", 5);

  assert.equal(rows.has("9876543210"), false);
  assert.equal(rows.has("9876543211"), true);
});

test("successful OTP challenges are atomic and single-use", async () => {
  installOtpDelegate();
  const challengeId = await createOtpChallenge("9876543210", "123456", 5);

  const results = await Promise.allSettled([
    verifyAndConsumeOtpChallenge("9876543210", challengeId, "123456"),
    verifyAndConsumeOtpChallenge("9876543210", challengeId, "123456"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(rows.has("9876543210"), false);
});

test("database rate-limit statement handles concurrent sends atomically", async () => {
  let sendCount = 0;
  let sqlStatement = "";
  Object.defineProperty(db, "$queryRaw", {
    configurable: true,
    writable: true,
    value: async (strings: TemplateStringsArray) => {
      sqlStatement = strings.join(" ");
      if (sendCount >= 1) return [];
      sendCount += 1;
      return [{ mobile: "9876543210" }];
    },
  });

  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => incrementRateLimit("9876543210"))
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    results.filter(
      (result) => result.status === "rejected" && result.reason instanceof OtpChallengeError && result.reason.code === "RATE_LIMIT"
    ).length,
    5
  );
  assert.match(sqlStatement, /ON CONFLICT/);
  assert.match(sqlStatement, /sendCount/);
  assert.match(sqlStatement, /lastSentAt/);
});
