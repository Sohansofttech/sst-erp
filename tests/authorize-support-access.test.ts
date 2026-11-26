import assert from "node:assert/strict";
import { test } from "node:test";
import db from "../lib/db";
import { authorizeStudentOrParentAccess } from "../lib/security/authorize";
import { SUPPORT_READ } from "../lib/security/support-access";
import { SessionUser } from "../types";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const INST = "22222222-2222-4222-8222-222222222222";
const STUDENT = "st_student_1";

function mockPrisma(overrides: Record<string, any>) {
  const original: Record<string, any> = {};
  // Auto-derive findMany from findFirst when only findFirst is supplied, matching
  // the guard's findMany-based session selection.
  const normalized: Record<string, any> = { ...overrides };
  if (normalized.supportAccessSession && normalized.supportAccessSession.findFirst && !normalized.supportAccessSession.findMany) {
    const ff = normalized.supportAccessSession.findFirst;
    normalized.supportAccessSession = {
      ...normalized.supportAccessSession,
      findMany: async () => {
        const r = await ff();
        return r ? [r] : [];
      },
    };
  }
  for (const key of Object.keys(normalized)) {
    original[key] = (db as any)[key];
    (db as any)[key] = normalized[key];
  }
  return () => {
    for (const key of Object.keys(normalized)) {
      (db as any)[key] = original[key];
    }
  };
}

function auditStub() {
  const events: any[] = [];
  return {
    events,
    platformAuditLog: {
      create: async ({ data }: any) => {
        events.push(data);
        return data;
      },
    },
  };
}

function superAdminSession(): SessionUser {
  return { role: "SUPER_ADMIN", userId: ACTOR, institutionId: null } as unknown as SessionUser;
}

test("SUPER_ADMIN student read without READ session is denied", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    student: { findUnique: async () => ({ id: STUDENT, institutionId: INST }) },
    supportAccessSession: { findFirst: async () => null },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assert.rejects(
      () => authorizeStudentOrParentAccess(superAdminSession(), STUDENT),
      (e: any) => e?.reason === "NO_SESSION" || e?.name === "SupportAccessDeniedError"
    );
  } finally {
    restore();
  }
});

test("SUPER_ADMIN student read with valid READ session is allowed", async () => {
  const audit = auditStub();
  const now = new Date();
  const restore = mockPrisma({
    student: { findUnique: async () => ({ id: STUDENT, institutionId: INST }) },
    supportAccessSession: {
      findFirst: async () => ({
        id: "sess-1",
        status: "ACTIVE",
        allowedActions: [SUPPORT_READ],
        startsAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() + 3_600_000),
        endedAt: null,
      }),
    },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    const r = await authorizeStudentOrParentAccess(superAdminSession(), STUDENT);
    assert.equal(r.studentId, STUDENT);
    assert.equal(r.isParent, false);
  } finally {
    restore();
  }
});

test("normal STUDENT access still works without any support session", async () => {
  const restore = mockPrisma({
    student: { findUnique: async () => ({ id: STUDENT, institutionId: INST }) },
  });
  try {
    const session = { role: "STUDENT", userId: "u1", institutionId: INST, studentId: STUDENT } as unknown as SessionUser;
    const r = await authorizeStudentOrParentAccess(session, STUDENT);
    assert.equal(r.studentId, STUDENT);
  } finally {
    restore();
  }
});

test("normal STUDENT cross-student access still blocked (IDOR)", async () => {
  const restore = mockPrisma({
    student: { findUnique: async () => ({ id: "st_other", institutionId: INST }) },
  });
  try {
    const session = { role: "STUDENT", userId: "u1", institutionId: INST, studentId: STUDENT } as unknown as SessionUser;
    await assert.rejects(() => authorizeStudentOrParentAccess(session, "st_other"));
  } finally {
    restore();
  }
});