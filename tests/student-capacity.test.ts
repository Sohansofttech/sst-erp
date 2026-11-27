import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import {
  assertStudentRegistrationCapacity,
  StudentCapacityError,
} from "../lib/billing/student-capacity";

function makeTransaction(options: {
  institutionExists?: boolean;
  studentLimit?: number | null;
  registeredStudents?: number;
  hasActiveSubscription?: boolean;
  subscriptionStatus?: string;
  subscriptionStartsInFuture?: boolean;
  subscriptionExpired?: boolean;
} = {}) {
  const calls: string[] = [];
  const transaction = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      calls.push(strings.join(""));
      return options.institutionExists === false ? [] : [{ id: "institution-1" }];
    },
    institutionSubscription: {
      findFirst: async (args: { where?: { status?: string | { in: string[] } } } = {}) => {
        calls.push("subscription");
        if (options.hasActiveSubscription === false) return null;
        const statusFilter = args?.where?.status;
        const allowed = Array.isArray((statusFilter as { in?: string[] })?.in)
          ? (statusFilter as { in: string[] }).in
          : [statusFilter as string];
        const status = options.subscriptionStatus ?? "ACTIVE";
        if (!allowed.includes(status)) return null;
        if (options.subscriptionStartsInFuture) return null;
        if (options.subscriptionExpired) return null;
        return { plan: { studentLimit: options.studentLimit ?? null } };
      },
    },
    student: {
      count: async () => {
        calls.push("count");
        return options.registeredStudents ?? 0;
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { transaction, calls };
}

test("allows student registration below the active plan limit after locking the tenant row", async () => {
  const { transaction, calls } = makeTransaction({
    studentLimit: 10,
    registeredStudents: 9,
  });

  const capacity = await assertStudentRegistrationCapacity(transaction, "institution-1");

  assert.deepEqual(capacity, { registeredStudents: 9, studentLimit: 10 });
  assert.match(calls[0], /FOR UPDATE/);
  assert.deepEqual(calls.slice(1), ["subscription", "count"]);
});

test("rejects registration at the student limit", async () => {
  const { transaction } = makeTransaction({ studentLimit: 10, registeredStudents: 10 });

  await assert.rejects(
    () => assertStudentRegistrationCapacity(transaction, "institution-1"),
    (error: unknown) => error instanceof StudentCapacityError && error.statusCode === 409,
  );
});

test("blocks registration when an institution has no active subscription", async () => {
  const { transaction, calls } = makeTransaction({ hasActiveSubscription: false });

  await assert.rejects(
    () => assertStudentRegistrationCapacity(transaction, "institution-1"),
    (error: unknown) => error instanceof StudentCapacityError && error.statusCode === 403,
  );
  assert.equal(calls.includes("count"), false);
});

test("accepts TRIALING subscription within valid date window", async () => {
  const { transaction } = makeTransaction({ subscriptionStatus: "TRIALING", studentLimit: 5, registeredStudents: 2 });
  const capacity = await assertStudentRegistrationCapacity(transaction, "institution-1");
  assert.deepEqual(capacity, { registeredStudents: 2, studentLimit: 5 });
});

test("rejects TRIALING subscription with future startsAt", async () => {
  const { transaction } = makeTransaction({ subscriptionStatus: "TRIALING", subscriptionStartsInFuture: true });
  await assert.rejects(
    () => assertStudentRegistrationCapacity(transaction, "institution-1"),
    (error: unknown) => error instanceof StudentCapacityError && error.statusCode === 403,
  );
});

test("rejects TRIALING subscription with expired endsAt", async () => {
  const { transaction } = makeTransaction({ subscriptionStatus: "TRIALING", subscriptionExpired: true });
  await assert.rejects(
    () => assertStudentRegistrationCapacity(transaction, "institution-1"),
    (error: unknown) => error instanceof StudentCapacityError && error.statusCode === 403,
  );
});

for (const status of ["EXPIRED", "CANCELED", "CANCELLED", "SUSPENDED"]) {
  test(`rejects ${status} subscription`, async () => {
    const { transaction } = makeTransaction({ subscriptionStatus: status });
    await assert.rejects(
      () => assertStudentRegistrationCapacity(transaction, "institution-1"),
      (error: unknown) => error instanceof StudentCapacityError && error.statusCode === 403,
    );
  });
}

test("allows unlimited active plans and rejects missing institution rows", async () => {
  const unlimited = makeTransaction({ studentLimit: null, registeredStudents: 5000 });
  assert.deepEqual(
    await assertStudentRegistrationCapacity(unlimited.transaction, "institution-1"),
    { registeredStudents: 5000, studentLimit: null },
  );

  const missing = makeTransaction({ institutionExists: false });
  await assert.rejects(
    () => assertStudentRegistrationCapacity(missing.transaction, "institution-1"),
    (error: unknown) => error instanceof StudentCapacityError && error.statusCode === 403,
  );
  assert.deepEqual(missing.calls, ["\n    SELECT id\n    FROM institutions\n    WHERE id = ::uuid\n    FOR UPDATE\n  "]);
});
