import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { assertUserRegistrationCapacity, UserCapacityError } from "../lib/billing/user-capacity";

function makeTransaction(options: { institutionExists?: boolean; maxUsers?: number | null; activeUsers?: number; hasSubscription?: boolean } = {}) {
  const calls: string[] = [];
  const captured: { subscriptionWhere?: any; userWhere?: any } = {};
  const transaction = {
    $queryRaw: async () => {
      calls.push("lock");
      return options.institutionExists === false ? [] : [{ id: "institution-1" }];
    },
    institutionSubscription: {
      findFirst: async (args: any) => {
        calls.push("subscription");
        captured.subscriptionWhere = args?.where;
        if (options.hasSubscription === false) return null;
        return { plan: { maxUsers: options.maxUsers ?? null } };
      },
    },
    user: {
      count: async (args: any) => {
        calls.push("count");
        captured.userWhere = args?.where;
        return options.activeUsers ?? 0;
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { transaction, calls, captured };
}

test("allows user registration below maxUsers", async () => {
  const { transaction, captured } = makeTransaction({ maxUsers: 5, activeUsers: 2 });
  const r = await assertUserRegistrationCapacity(transaction, "institution-1");
  assert.deepEqual(r, { maxUsers: 5, activeUsers: 2 });
  assert.equal(captured.subscriptionWhere.status.in.includes("ACTIVE"), true);
  assert.equal(captured.subscriptionWhere.status.in.includes("TRIALING"), true);
  assert.ok(captured.subscriptionWhere.startsAt.lte instanceof Date);
  assert.ok(captured.subscriptionWhere.OR);
  assert.equal(captured.userWhere.institutionId, "institution-1");
  assert.equal(captured.userWhere.status, "ACTIVE");
  assert.deepEqual(captured.userWhere.platformRole, { not: "SUPER_ADMIN" });
  assert.deepEqual(captured.userWhere.role, { in: ["ADMIN", "TEACHER", "STAFF", "PARENT"] });
  assert.ok(!captured.userWhere.role.in.includes("HOD"), "HOD must not be counted as a separate role");
  assert.ok(!captured.userWhere.role.in.includes("STUDENT"), "STUDENT must be excluded");
});

test("rejects at maxUsers", async () => {
  const { transaction } = makeTransaction({ maxUsers: 5, activeUsers: 5 });
  await assert.rejects(() => assertUserRegistrationCapacity(transaction, "institution-1"), (e: unknown) => e instanceof UserCapacityError && e.statusCode === 409);
});

test("allows unlimited when maxUsers null", async () => {
  const { transaction } = makeTransaction({ maxUsers: null, activeUsers: 100 });
  const r = await assertUserRegistrationCapacity(transaction, "institution-1");
  assert.deepEqual(r, { maxUsers: null });
});

test("blocks without subscription", async () => {
  const { transaction, calls } = makeTransaction({ hasSubscription: false });
  await assert.rejects(() => assertUserRegistrationCapacity(transaction, "institution-1"), (e: unknown) => e instanceof UserCapacityError && e.statusCode === 403);
  assert.equal(calls.includes("count"), false);
});

test("active students do not consume maxUsers", async () => {
  const { transaction } = makeTransaction({ maxUsers: 1, activeUsers: 0 });
  const r = await assertUserRegistrationCapacity(transaction, "institution-1");
  assert.deepEqual(r, { maxUsers: 1, activeUsers: 0 });
});

test("inactive users do not consume maxUsers", async () => {
  const { transaction } = makeTransaction({ maxUsers: 1, activeUsers: 0 });
  const r = await assertUserRegistrationCapacity(transaction, "institution-1");
  assert.deepEqual(r, { maxUsers: 1, activeUsers: 0 });
});

test("blocks missing institution", async () => {
  const { transaction, calls } = makeTransaction({ institutionExists: false });
  await assert.rejects(() => assertUserRegistrationCapacity(transaction, "institution-1"), (e: unknown) => e instanceof UserCapacityError && e.statusCode === 403);
  assert.equal(calls.includes("subscription"), false);
  assert.equal(calls.includes("count"), false);
});

test("lock happens before subscription and count", async () => {
  const { transaction, calls } = makeTransaction({ maxUsers: 5, activeUsers: 2 });
  await assertUserRegistrationCapacity(transaction, "institution-1");
  assert.deepEqual(calls, ["lock", "subscription", "count"]);
});

test("active PARENT accounts consume maxUsers", async () => {
  // The count query must include PARENT; an active parent pushes usage to the limit.
  const { transaction, captured } = makeTransaction({ maxUsers: 3, activeUsers: 3 });
  await assert.rejects(
    () => assertUserRegistrationCapacity(transaction, "institution-1"),
    (e: unknown) => e instanceof UserCapacityError && e.statusCode === 409,
  );
  assert.ok(captured.userWhere.role.in.includes("PARENT"), "PARENT must be counted");
  assert.ok(!captured.userWhere.role.in.includes("STUDENT"), "STUDENT must be excluded");
});

test("inactive PARENT accounts do not consume maxUsers", async () => {
  // status:ACTIVE filter means inactive parents are not counted.
  const { transaction, captured } = makeTransaction({ maxUsers: 1, activeUsers: 0 });
  const r = await assertUserRegistrationCapacity(transaction, "institution-1");
  assert.deepEqual(r, { maxUsers: 1, activeUsers: 0 });
  assert.equal(captured.userWhere.status, "ACTIVE");
});