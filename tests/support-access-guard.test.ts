import assert from "node:assert/strict";
import { test } from "node:test";
import db from "../lib/db";
import {
  assertSupportAccess,
  requireRead,
  requireWrite,
  validateDurationMinutes,
  SupportAccessDeniedError,
  SUPPORT_READ,
  SUPPORT_WRITE,
} from "../lib/security/support-access";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const INST = "22222222-2222-4222-8222-222222222222";

function mockPrisma(overrides: Record<string, any>) {
  const original: Record<string, any> = {};
  // Auto-derive findMany from findFirst when only findFirst is supplied, so the
  // guard's findMany-based session selection works with single-session mocks.
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

function baseSession(overrides: Record<string, any>) {
  const now = new Date();
  return {
    id: "sess-1",
    status: "ACTIVE",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + 3_600_000),
    endedAt: null,
    ...overrides,
  };
}

test("duration validation 1..480", () => {
  assert.equal(validateDurationMinutes(1), true);
  assert.equal(validateDurationMinutes(480), true);
  assert.equal(validateDurationMinutes(0), false);
  assert.equal(validateDurationMinutes(481), false);
  assert.equal(validateDurationMinutes(1.5), false);
});

test("ACTIVE session with READ grants READ", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: { findFirst: async () => baseSession({}) },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ });
    assert.ok(audit.events.some((e) => e.action === "SUPPORT_ACCESS_GRANTED"));
  } finally {
    restore();
  }
});

test("READ does not authorize WRITE", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: { findFirst: async () => baseSession({ allowedActions: [SUPPORT_READ] }) },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assert.rejects(
      () => assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_WRITE }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "WRONG_SCOPE"
    );
  } finally {
    restore();
  }
});

test("WRITE does not authorize READ", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: { findFirst: async () => baseSession({ allowedActions: [SUPPORT_WRITE] }) },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assert.rejects(
      () => assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "WRONG_SCOPE"
    );
  } finally {
    restore();
  }
});

test("expired session denied", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: { findFirst: async () => baseSession({ expiresAt: new Date(Date.now() - 1000) }) },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assert.rejects(
      () => assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "EXPIRED"
    );
  } finally {
    restore();
  }
});

test("revoked session denied", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: { findFirst: async () => baseSession({ status: "REVOKED", endedAt: new Date() }) },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assert.rejects(
      () => assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ }),
      (e: any) => e instanceof SupportAccessDeniedError
    );
  } finally {
    restore();
  }
});

test("REQUESTED (not yet approved) denied", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: { findFirst: async () => baseSession({ status: "REQUESTED", startsAt: null }) },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assert.rejects(
      () => assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "NOT_APPROVED"
    );
  } finally {
    restore();
  }
});

test("future startsAt denied (NOT_STARTED)", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: {
      findFirst: async () => baseSession({ startsAt: new Date(Date.now() + 600_000) }),
    },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assert.rejects(
      () => assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "NOT_STARTED"
    );
  } finally {
    restore();
  }
});

test("development bypass never grants access", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: { findFirst: async () => baseSession({}) },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assert.rejects(
      () =>
        assertSupportAccess({
          actorId: ACTOR,
          institutionId: INST,
          requiredAction: SUPPORT_READ,
          developmentMode: true,
        }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "DEV_BYPASS"
    );
  } finally {
    restore();
  }
});

test("missing identity denied (NO_IDENTITY)", async () => {
  const audit = auditStub();
  const restore = mockPrisma({ platformAuditLog: audit.platformAuditLog });
  try {
    await assert.rejects(
      () => assertSupportAccess({ actorId: null, institutionId: INST, requiredAction: SUPPORT_READ }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "NO_IDENTITY"
    );
  } finally {
    restore();
  }
});

test("APPROVED session lazily activates and audit is written", async () => {
  const audit = auditStub();
  let reloaded = false;
  const restore = mockPrisma({
    supportAccessSession: {
      findFirst: async () => baseSession({ status: "APPROVED" }),
      findUnique: async () => {
        reloaded = true;
        return baseSession({ status: "ACTIVE" });
      },
      updateMany: async () => ({ count: 1 }),
    },
    platformAuditLog: audit.platformAuditLog,
    $transaction: async (fn: any) =>
      fn({
        supportAccessSession: { updateMany: async () => ({ count: 1 }) },
        platformAuditLog: audit.platformAuditLog,
      }),
  });
  try {
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ });
    assert.equal(reloaded, true);
    assert.ok(audit.events.some((e) => e.action === "SUPPORT_ACCESS_ACTIVATED"));
  } finally {
    restore();
  }
});

test("activation audit failure fails closed", async () => {
  const restore = mockPrisma({
    supportAccessSession: {
      findFirst: async () => baseSession({ status: "APPROVED" }),
      findUnique: async () => baseSession({ status: "ACTIVE" }),
      updateMany: async () => ({ count: 1 }),
    },
    platformAuditLog: {
      create: async () => {
        throw new Error("audit down");
      },
    },
    $transaction: async (fn: any) =>
      fn({
        supportAccessSession: { updateMany: async () => ({ count: 1 }) },
        platformAuditLog: {
          create: async () => {
            throw new Error("audit down");
          },
        },
      }),
  });
  try {
    await assert.rejects(
      () => assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "AUDIT_FAILURE"
    );
  } finally {
    restore();
  }
});

test("requireRead/requireWrite skip non-super-admin", async () => {
  let called = false;
  const restore = mockPrisma({
    supportAccessSession: {
      findFirst: async () => {
        called = true;
        return baseSession({});
      },
    },
  });
  try {
    await requireRead({ userRole: "ADMIN", userId: ACTOR, institutionId: INST });
    await requireWrite({ userRole: "INSTITUTION_ADMIN", userId: ACTOR, institutionId: INST });
    assert.equal(called, false);
  } finally {
    restore();
  }
});

test("no caching: revocation after a successful check denies the next call", async () => {
  const audit = auditStub();
  let active = true;
  const restore = mockPrisma({
    supportAccessSession: {
      findFirst: async () =>
        active
          ? baseSession({ status: "ACTIVE" })
          : baseSession({ status: "REVOKED", endedAt: new Date() }),
    },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    // First call succeeds (ACTIVE).
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ });
    // Revoke, then the very next call must be denied (live DB read, no cache).
    active = false;
    await assert.rejects(
      () => assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ }),
      (e: any) => e instanceof SupportAccessDeniedError && (e.reason === "REVOKED" || e.reason === "ENDED")
    );
  } finally {
    restore();
  }
});

test("mixed-method: READ session cannot authorize a WRITE handler", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: { findFirst: async () => baseSession({ allowedActions: [SUPPORT_READ] }) },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    // Simulate GET handler (requireRead) -> ok.
    await requireRead({ userRole: "SUPER_ADMIN", userId: ACTOR, institutionId: INST });
    // Simulate POST handler (requireWrite) on same READ-only session -> denied.
    await assert.rejects(
      () => requireWrite({ userRole: "SUPER_ADMIN", userId: ACTOR, institutionId: INST }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "WRONG_SCOPE"
    );
  } finally {
    restore();
  }
});

test("newer invalid session does not block an older valid ACTIVE session", async () => {
  const audit = auditStub();
  const now = new Date();
  const olderValid = baseSession({
    id: "sess-old",
    status: "ACTIVE",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() - 7200_000),
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: null,
  });
  const newerInvalid = baseSession({
    id: "sess-new",
    status: "REQUESTED",
    allowedActions: [SUPPORT_READ],
    startsAt: null,
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: null,
  });
  const restore = mockPrisma({
    // findMany returns newest-first: [newerInvalid, olderValid].
    supportAccessSession: { findMany: async () => [newerInvalid, olderValid] },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ });
    assert.ok(audit.events.some((e) => e.action === "SUPPORT_ACCESS_GRANTED"));
  } finally {
    restore();
  }
});

test("newer REVOKED session does not block an older valid ACTIVE session", async () => {
  const audit = auditStub();
  const now = new Date();
  const olderValid = baseSession({
    id: "sess-old",
    status: "ACTIVE",
    allowedActions: [SUPPORT_WRITE],
    startsAt: new Date(now.getTime() - 7200_000),
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: null,
  });
  const newerRevoked = baseSession({
    id: "sess-new",
    status: "REVOKED",
    allowedActions: [SUPPORT_WRITE],
    startsAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: new Date(),
  });
  const restore = mockPrisma({
    supportAccessSession: { findMany: async () => [newerRevoked, olderValid] },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_WRITE });
  } finally {
    restore();
  }
});

test("activation audit emitted only when updateMany flips count===1", async () => {
  const audit = auditStub();
  const now = new Date();
  // Simulate a concurrent activation: our updateMany flips 0 rows (someone else
  // already activated). No SUPPORT_ACCESS_ACTIVATED event should be written, but
  // the re-read confirms ACTIVE so access is still granted.
  const restore = mockPrisma({
    supportAccessSession: {
      findMany: async () => [
        baseSession({ id: "sess-1", status: "APPROVED", allowedActions: [SUPPORT_READ] }),
      ],
      findUnique: async () => baseSession({ id: "sess-1", status: "ACTIVE", allowedActions: [SUPPORT_READ] }),
      updateMany: async () => ({ count: 0 }),
    },
    platformAuditLog: audit.platformAuditLog,
    $transaction: async (fn: any) =>
      fn({
        supportAccessSession: { updateMany: async () => ({ count: 0 }) },
        platformAuditLog: audit.platformAuditLog,
      }),
  });
  try {
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ });
    assert.equal(audit.events.some((e) => e.action === "SUPPORT_ACCESS_ACTIVATED"), false);
    assert.ok(audit.events.some((e) => e.action === "SUPPORT_ACCESS_GRANTED"));
  } finally {
    restore();
  }
});

test("activation audit emitted when updateMany flips count===1", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: {
      findMany: async () => [
        baseSession({ id: "sess-1", status: "APPROVED", allowedActions: [SUPPORT_READ] }),
      ],
      findUnique: async () => baseSession({ id: "sess-1", status: "ACTIVE", allowedActions: [SUPPORT_READ] }),
      updateMany: async () => ({ count: 1 }),
    },
    platformAuditLog: audit.platformAuditLog,
    $transaction: async (fn: any) =>
      fn({
        supportAccessSession: { updateMany: async () => ({ count: 1 }) },
        platformAuditLog: audit.platformAuditLog,
      }),
  });
  try {
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ });
    assert.equal(audit.events.some((e) => e.action === "SUPPORT_ACCESS_ACTIVATED"), true);
  } finally {
    restore();
  }
});

// --- Multiple-session selection: an invalid newer session must not block a
// genuinely authorizable older session (actor + institution scoping preserved).

test("newer expired APPROVED does not block older valid ACTIVE", async () => {
  const audit = auditStub();
  const now = new Date();
  const olderValid = baseSession({
    id: "sess-old",
    status: "ACTIVE",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() - 7200_000),
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: null,
  });
  const newerExpiredApproved = baseSession({
    id: "sess-new",
    status: "APPROVED",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() - 60_000), // already expired
    endedAt: null,
  });
  const restore = mockPrisma({
    supportAccessSession: { findMany: async () => [newerExpiredApproved, olderValid] },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ });
    assert.ok(audit.events.some((e) => e.action === "SUPPORT_ACCESS_GRANTED"));
  } finally {
    restore();
  }
});

test("newer future-start APPROVED does not block older valid ACTIVE", async () => {
  const audit = auditStub();
  const now = new Date();
  const olderValid = baseSession({
    id: "sess-old",
    status: "ACTIVE",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() - 7200_000),
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: null,
  });
  const newerFutureApproved = baseSession({
    id: "sess-new",
    status: "APPROVED",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() + 3600_000), // not started yet
    expiresAt: new Date(now.getTime() + 7200_000),
    endedAt: null,
  });
  const restore = mockPrisma({
    supportAccessSession: { findMany: async () => [newerFutureApproved, olderValid] },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ });
    assert.ok(audit.events.some((e) => e.action === "SUPPORT_ACCESS_GRANTED"));
  } finally {
    restore();
  }
});

test("newer session missing required permission does not block older valid session", async () => {
  const audit = auditStub();
  const now = new Date();
  // Older session carries WRITE; newer only carries READ. A WRITE request must
  // authorize against the older WRITE session, not be denied by the newer READ one.
  const olderValid = baseSession({
    id: "sess-old",
    status: "ACTIVE",
    allowedActions: [SUPPORT_WRITE],
    startsAt: new Date(now.getTime() - 7200_000),
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: null,
  });
  const newerWrongScope = baseSession({
    id: "sess-new",
    status: "ACTIVE",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: null,
  });
  const restore = mockPrisma({
    supportAccessSession: { findMany: async () => [newerWrongScope, olderValid] },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_WRITE });
    assert.ok(audit.events.some((e) => e.action === "SUPPORT_ACCESS_GRANTED"));
  } finally {
    restore();
  }
});

test("newer REVOKED does not block older valid session (explicit)", async () => {
  const audit = auditStub();
  const now = new Date();
  const olderValid = baseSession({
    id: "sess-old",
    status: "ACTIVE",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() - 7200_000),
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: null,
  });
  const newerRevoked = baseSession({
    id: "sess-new",
    status: "REVOKED",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: new Date(),
  });
  const restore = mockPrisma({
    supportAccessSession: { findMany: async () => [newerRevoked, olderValid] },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ });
    assert.ok(audit.events.some((e) => e.action === "SUPPORT_ACCESS_GRANTED"));
  } finally {
    restore();
  }
});

test("no valid session exists -> denied (newest overall reason)", async () => {
  const audit = auditStub();
  const now = new Date();
  const newerExpired = baseSession({
    id: "sess-new",
    status: "APPROVED",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() - 60_000),
    endedAt: null,
  });
  const olderRevoked = baseSession({
    id: "sess-old",
    status: "REVOKED",
    allowedActions: [SUPPORT_READ],
    startsAt: new Date(now.getTime() - 7200_000),
    expiresAt: new Date(now.getTime() + 3600_000),
    endedAt: new Date(),
  });
  const restore = mockPrisma({
    supportAccessSession: { findMany: async () => [newerExpired, olderRevoked] },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assert.rejects(
      () => assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "EXPIRED"
    );
    assert.equal(audit.events.some((e) => e.action === "SUPPORT_ACCESS_GRANTED"), false);
  } finally {
    restore();
  }
});

test("no sessions at all -> NO_SESSION", async () => {
  const audit = auditStub();
  const restore = mockPrisma({
    supportAccessSession: { findMany: async () => [] },
    platformAuditLog: audit.platformAuditLog,
  });
  try {
    await assert.rejects(
      () => assertSupportAccess({ actorId: ACTOR, institutionId: INST, requiredAction: SUPPORT_READ }),
      (e: any) => e instanceof SupportAccessDeniedError && e.reason === "NO_SESSION"
    );
  } finally {
    restore();
  }
});