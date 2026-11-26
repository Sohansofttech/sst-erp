import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

process.env.JWT_SECRET ||= "test-jwt-secret-at-least-32-characters-long!";

import db from "../lib/db";
import { signToken } from "../lib/auth/jwt";
import { ForbiddenError, getAuthErrorStatus, getSession, UnauthorizedError } from "../lib/auth/session";
import { signTeacherSession, verifyTeacherSession } from "../lib/auth/teacher-session";
import {
  isInstitutionLifecycleOperational,
  isInstitutionOperational,
  toApplicationInstitutionLifecycleData,
  updateInstitutionLifecycle,
} from "../lib/services/institution-lifecycle";

const INSTITUTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const platformRecord = (status: string) => ({
  id: INSTITUTION_ID,
  name: "Lifecycle Test Institution",
  code: "LIFE",
  slug: "lifecycle-test",
  type: "COLLEGE",
  status,
  email: null,
  phone: null,
  address: null,
  city: null,
  state: null,
  country: "India",
});

function withMockedQueryRaw<T>(
  rowsByCall: Array<{
    platformStatus: string | null;
    archivedAt: Date | null;
    applicationStatus: string | null;
    applicationActive: boolean | null;
  }>,
  fn: () => Promise<T>,
): Promise<T> {
  const original = db.$queryRaw;
  (db as unknown as { $queryRaw: () => Promise<typeof rowsByCall> }).$queryRaw = async () => rowsByCall;
  return fn().finally(() => {
    (db as unknown as { $queryRaw: typeof original }).$queryRaw = original;
  });
}

test("ACTIVE and PENDING institutions are operational; suspended and archived are not", () => {
  assert.equal(isInstitutionLifecycleOperational("ACTIVE"), true);
  assert.equal(isInstitutionLifecycleOperational("PENDING"), true);
  assert.equal(isInstitutionLifecycleOperational("SUSPENDED"), false);
  assert.equal(isInstitutionLifecycleOperational("ARCHIVED"), false);
  assert.equal(isInstitutionLifecycleOperational("UNKNOWN"), false);
  assert.equal(isInstitutionLifecycleOperational(null), false);
  assert.equal(isInstitutionLifecycleOperational(undefined), false);
});

test("application lifecycle mapping preserves PENDING recovery and disables suspension/archive", () => {
  const { id: _id, ...pendingFields } = platformRecord("PENDING");
  assert.deepEqual(toApplicationInstitutionLifecycleData(platformRecord("PENDING")), {
    ...pendingFields,
    isActive: true,
  });
  assert.equal(toApplicationInstitutionLifecycleData(platformRecord("ACTIVE")).isActive, true);
  assert.equal(toApplicationInstitutionLifecycleData(platformRecord("SUSPENDED")).isActive, false);
  assert.equal(toApplicationInstitutionLifecycleData(platformRecord("ARCHIVED")).isActive, false);
});

test("lifecycle synchronization updates both platform and application records for suspend, archive, recover, and activate", async () => {
  const archivedAt = new Date("2026-01-15T00:00:00.000Z");
  const transitions: Array<{
    input: Prisma.PlatformInstitutionUpdateInput;
    expectedStatus: string;
    expectedActive: boolean;
  }> = [
    { input: { status: "SUSPENDED" }, expectedStatus: "SUSPENDED", expectedActive: false },
    { input: { status: "ARCHIVED", archivedAt }, expectedStatus: "ARCHIVED", expectedActive: false },
    { input: { status: "PENDING", archivedAt: null }, expectedStatus: "PENDING", expectedActive: true },
    { input: { status: "ACTIVE" }, expectedStatus: "ACTIVE", expectedActive: true },
  ];

  for (const transition of transitions) {
    const writes: Array<{ target: string; id: string; status: string; isActive?: boolean }> = [];
    const tx = {
      platformInstitution: {
        update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
          writes.push({ target: "platform", id: where.id, status: data.status });
          return platformRecord(data.status);
        },
      },
      institution: {
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { id: string };
          create: { id: string; status: string; isActive: boolean };
          update: { status: string; isActive: boolean };
        }) => {
          assert.equal(create.id, where.id);
          assert.equal(update.status, create.status);
          assert.equal(update.isActive, create.isActive);
          writes.push({
            target: "application",
            id: where.id,
            status: update.status,
            isActive: update.isActive,
          });
          return create;
        },
      },
    } as unknown as Prisma.TransactionClient;

    await updateInstitutionLifecycle(tx, INSTITUTION_ID, transition.input);

    assert.deepEqual(writes, [
      { target: "platform", id: INSTITUTION_ID, status: transition.expectedStatus },
      {
        target: "application",
        id: INSTITUTION_ID,
        status: transition.expectedStatus,
        isActive: transition.expectedActive,
      },
    ]);
  }
});

test("lifecycle synchronization uses matching ID and propagates application write failures", async () => {
  const writes: string[] = [];
  const tx = {
    platformInstitution: {
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        writes.push(`platform:${where.id}:${data.status}`);
        return platformRecord(data.status);
      },
    },
    institution: {
      upsert: async ({ where, create, update }: { where: { id: string }; create: { id: string; status: string }; update: { status: string } }) => {
        writes.push(`application:${where.id}:${create.id}:${update.status}`);
        throw new Error("application write failed");
      },
    },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    updateInstitutionLifecycle(tx, INSTITUTION_ID, { status: "SUSPENDED" }),
    /application write failed/,
  );
  assert.deepEqual(writes, [
    `platform:${INSTITUTION_ID}:SUSPENDED`,
    `application:${INSTITUTION_ID}:${INSTITUTION_ID}:SUSPENDED`,
  ]);
});

test("isInstitutionOperational blocks suspended, archived, drifted, and deactivated institutions while keeping valid trial/pending/legacy", async () => {
  assert.equal(await isInstitutionOperational(""), false);
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: null, archivedAt: null, applicationStatus: "ACTIVE", applicationActive: true }],
      () => isInstitutionOperational("inst_apex"),
    ),
    true,
  );

  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: "ACTIVE", archivedAt: null, applicationStatus: "ACTIVE", applicationActive: true }],
      () => isInstitutionOperational(INSTITUTION_ID),
    ),
    true,
  );
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: "PENDING", archivedAt: null, applicationStatus: "PENDING", applicationActive: true }],
      () => isInstitutionOperational(INSTITUTION_ID),
    ),
    true,
  );
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: "PENDING", archivedAt: null, applicationStatus: null, applicationActive: null }],
      () => isInstitutionOperational(INSTITUTION_ID),
    ),
    true,
  );
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: "SUSPENDED", archivedAt: null, applicationStatus: "ACTIVE", applicationActive: true }],
      () => isInstitutionOperational(INSTITUTION_ID),
    ),
    false,
  );
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: "ACTIVE", archivedAt: null, applicationStatus: "SUSPENDED", applicationActive: false }],
      () => isInstitutionOperational(INSTITUTION_ID),
    ),
    false,
  );
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: "ACTIVE", archivedAt: new Date(), applicationStatus: "ACTIVE", applicationActive: true }],
      () => isInstitutionOperational(INSTITUTION_ID),
    ),
    false,
  );
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: "ACTIVE", archivedAt: null, applicationStatus: "ACTIVE", applicationActive: false }],
      () => isInstitutionOperational(INSTITUTION_ID),
    ),
    false,
  );
  assert.equal(
    await withMockedQueryRaw([], () => isInstitutionOperational(INSTITUTION_ID)),
    false,
  );
});

test("getSession blocks existing tenant sessions on suspended/archived institutions and leaves Super Admin unaffected", async () => {
  const adminToken = await signToken({
    userId: "11111111-1111-4111-8111-111111111111",
    email: "admin@life.edu",
    fullName: "Life Admin",
    role: "ADMIN",
    institutionId: INSTITUTION_ID,
    institutionName: "Lifecycle Test Institution",
  });
  const superAdminToken = await signToken({
    userId: "22222222-2222-4222-8222-222222222222",
    email: "super@platform.edu",
    fullName: "Super Admin",
    role: "SUPER_ADMIN",
    institutionId: INSTITUTION_ID,
    institutionName: "Platform",
  });

  const adminReq = new NextRequest("http://localhost/api/student/events", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const superReq = new NextRequest("http://localhost/api/super-admin/health", {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });

  await withMockedQueryRaw(
    [{ platformStatus: "SUSPENDED", archivedAt: null, applicationStatus: "SUSPENDED", applicationActive: false }],
    async () => {
      await assert.rejects(
        getSession(adminReq),
        (err: unknown) => err instanceof ForbiddenError && getAuthErrorStatus(err) === 403,
      );
      const superSession = await getSession(superReq);
      assert.equal(superSession?.role, "SUPER_ADMIN");
    },
  );

  await withMockedQueryRaw(
    [{ platformStatus: "ACTIVE", archivedAt: null, applicationStatus: "ACTIVE", applicationActive: true }],
    async () => {
      const adminSession = await getSession(adminReq);
      assert.equal(adminSession?.institutionId, INSTITUTION_ID);
    },
  );

  assert.equal(getAuthErrorStatus(new UnauthorizedError("nope")), 401);
  assert.equal(getAuthErrorStatus(new ForbiddenError("nope")), 403);
  assert.equal(getAuthErrorStatus(new Error("other")), null  );
});

test("legacy and one-sided institution records follow lifecycle rules", async () => {
  // Suspended legacy institution
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: null, archivedAt: null, applicationStatus: "SUSPENDED", applicationActive: false }],
      () => isInstitutionOperational("inst_apex"),
    ),
    false,
  );

  // Archived legacy institution
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: null, archivedAt: new Date(), applicationStatus: "ARCHIVED", applicationActive: false }],
      () => isInstitutionOperational("inst_horizon"),
    ),
    false,
  );

  // Legacy institution with isActive=false
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: null, archivedAt: null, applicationStatus: "ACTIVE", applicationActive: false }],
      () => isInstitutionOperational("inst_apex"),
    ),
    false,
  );

  // Unknown legacy institution ID returns false
  assert.equal(
    await withMockedQueryRaw([], () => isInstitutionOperational("inst_unknown")),
    false,
  );

  // UUID institution exists only on platform side
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: "ACTIVE", archivedAt: null, applicationStatus: null, applicationActive: null }],
      () => isInstitutionOperational(INSTITUTION_ID),
    ),
    true,
  );

  // UUID institution exists only on application side -> rejected (platform authoritative)
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: null, archivedAt: null, applicationStatus: "PENDING", applicationActive: true }],
      () => isInstitutionOperational(INSTITUTION_ID),
    ),
    false,
  );

  // UUID institution exists on both sides
  assert.equal(
    await withMockedQueryRaw(
      [{ platformStatus: "ACTIVE", archivedAt: null, applicationStatus: "ACTIVE", applicationActive: true }],
      () => isInstitutionOperational(INSTITUTION_ID),
    ),
    true,
  );
});

test("verifyTeacherSession rejects suspended/archived institutions and allows active/pending institutions", async () => {
  const teacherToken = await signTeacherSession({
    userId: "33333333-3333-4333-8333-333333333333",
    teacherId: "44444444-4444-4444-8444-444444444444",
    institutionId: INSTITUTION_ID,
    institutionSlug: "lifecycle-test",
    email: "teacher@life.edu",
    fullName: "Teacher",
    employeeId: "EMP-1",
    designation: "Professor",
    department: "CSE",
    activeRole: "teacher",
    availableRoles: ["teacher"],
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600_000,
    lastActivity: Date.now(),
  });

  await withMockedQueryRaw(
    [{ platformStatus: "ARCHIVED", archivedAt: new Date(), applicationStatus: "ARCHIVED", applicationActive: false }],
    async () => {
      assert.equal(await verifyTeacherSession(teacherToken), null);
    },
  );

  await withMockedQueryRaw(
    [{ platformStatus: "PENDING", archivedAt: null, applicationStatus: "PENDING", applicationActive: true }],
    async () => {
      const payload = await verifyTeacherSession(teacherToken);
      assert.equal(payload?.institutionId, INSTITUTION_ID);
    },
  );
});

test("integration: real FULL OUTER JOIN query (guarded)", async (t) => {
  let dbAvailable = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  if (!dbAvailable) {
    t.skip("Database unavailable; skipping integration test.");
    return;
  }
  assert.equal(await isInstitutionOperational("00000000-0000-4000-8000-000000000000"), false);
});
