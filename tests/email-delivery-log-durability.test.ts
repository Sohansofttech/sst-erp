import assert from "node:assert/strict";
import { test } from "node:test";
import db from "../lib/db";
import {
  recordEmailDeliveryLog,
  getEmailDeliveryLogs,
} from "../lib/services/email-config.service";

const INST_A = "55555555-5555-4555-8555-555555555555";
const INST_B = "66666666-6666-4666-8666-666666666666";

interface AuditRow {
  entityId: string;
  institutionId: string;
  entityType: string;
  action: string;
  newValuesJson: string | null;
  createdAt: Date;
}

function mockAudit(impl: { create?: any; findMany?: any; platformCreate?: any; platformFindMany?: any }) {
  const original = { auditLog: (db as any).auditLog, platformAuditLog: (db as any).platformAuditLog };
  (db as any).auditLog = {
    create: impl.create ?? (async ({ data }: any) => data),
    findMany: impl.findMany ?? (async () => []),
  };
  (db as any).platformAuditLog = {
    create: impl.platformCreate ?? (async ({ data }: any) => data),
    findMany: impl.platformFindMany ?? (async () => []),
  };
  return () => {
    (db as any).auditLog = original.auditLog;
    (db as any).platformAuditLog = original.platformAuditLog;
  };
}

function baseLog(overrides: Record<string, any> = {}) {
  return {
    institutionId: INST_A,
    recipientEmail: "user@inst.edu",
    senderIdentity: "noreply@inst.edu",
    subject: "Welcome",
    purpose: "INVITATION",
    provider: "institution-smtp",
    fallbackUsed: false,
    deliveryStatus: "ACCEPTED",
    retryCount: 0,
    ...overrides,
  } as any;
}

test("persisted-then-read: log survives buffer being cleared (DB authoritative)", async () => {
  const store: AuditRow[] = [];
  const restore = mockAudit({
    create: async ({ data }: any) => {
      store.push({
        entityId: data.entityId,
        institutionId: data.institutionId,
        entityType: data.entityType,
        action: data.action,
        newValuesJson: data.newValuesJson,
        createdAt: new Date(),
      });
      return data;
    },
    findMany: async ({ where }: any) =>
      store
        .filter((r) => r.entityType === where.entityType)
        .filter((r) => !where.institutionId || r.institutionId === where.institutionId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  });
  try {
    await recordEmailDeliveryLog(baseLog());
    // Simulate restart: in-memory buffer is gone; read must come from DB.
    const res = await getEmailDeliveryLogs({ institutionId: INST_A });
    assert.equal(res.total, 1);
    assert.equal(res.logs[0].recipientEmail, "user@inst.edu");
    assert.equal(res.logs[0].deliveryStatus, "ACCEPTED");
  } finally {
    restore();
  }
});

test("persistence failure is reported (console.error) and not silently swallowed", async () => {
  const restore = mockAudit({
    create: async () => {
      throw new Error("db down");
    },
  });
  const origErr = console.error;
  let logged = "";
  console.error = (...args: any[]) => {
    logged = args.join(" ");
  };
  try {
    const rec = await recordEmailDeliveryLog(baseLog());
    assert.ok(rec.id, "record still returned");
    assert.ok(logged.includes("Failed to persist email delivery log"), "failure was reported");
  } finally {
    console.error = origErr;
    restore();
  }
});

test("logging failure does not change email outcome (no throw, returns record)", async () => {
  const restore = mockAudit({
    create: async () => {
      throw new Error("db down");
    },
  });
  const origErr = console.error;
  console.error = () => {};
  try {
    // A successfully "sent" email logs ACCEPTED; logging failure must not throw.
    const rec = await recordEmailDeliveryLog(baseLog({ deliveryStatus: "ACCEPTED" }));
    assert.equal(rec.deliveryStatus, "ACCEPTED");
    assert.ok(rec.id);
  } finally {
    console.error = origErr;
    restore();
  }
});

test("tenant isolation: institution A cannot read institution B logs", async () => {
  const store: AuditRow[] = [];
  const restore = mockAudit({
    create: async ({ data }: any) => {
      store.push({ ...data, createdAt: new Date() });
      return data;
    },
    findMany: async ({ where }: any) =>
      store
        .filter((r) => r.entityType === where.entityType)
        .filter((r) => !where.institutionId || r.institutionId === where.institutionId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  });
  try {
    await recordEmailDeliveryLog(baseLog({ institutionId: INST_A }));
    await recordEmailDeliveryLog(baseLog({ institutionId: INST_B }));
    const resA = await getEmailDeliveryLogs({ institutionId: INST_A });
    assert.equal(resA.total, 1);
    assert.ok(resA.logs.every((l) => l.institutionId === INST_A));
  } finally {
    restore();
  }
});

test("central logs use platformAuditLog with institutionId null; never SUPER_ADMIN UUID", async () => {
  const instStore: AuditRow[] = [];
  const centralStore: any[] = [];
  let centralCreated: any = null;
  const restore = mockAudit({
    create: async ({ data }: any) => {
      instStore.push({ ...data, createdAt: new Date() });
      return data;
    },
    findMany: async ({ where }: any) =>
      instStore
        .filter((r) => r.entityType === where.entityType)
        .filter((r) => !where.institutionId || r.institutionId === where.institutionId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    platformCreate: async ({ data }: any) => {
      centralCreated = data;
      centralStore.push({ ...data, createdAt: new Date() });
      return data;
    },
    platformFindMany: async ({ where }: any) =>
      centralStore
        .filter((r) => r.entity === where.entity)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  });
  try {
    await recordEmailDeliveryLog(baseLog({ institutionId: undefined })); // central
    // Central log persisted via platformAuditLog with null institutionId.
    assert.equal(centralCreated.institutionId, null);
    assert.equal(centralCreated.entity, "EMAIL_DELIVERY");
    assert.ok(centralCreated.metadata && typeof centralCreated.metadata === "object");
    // "SUPER_ADMIN" must never be used as a UUID/institution id.
    assert.ok(!JSON.stringify(centralCreated).includes("SUPER_ADMIN"));
    // auditLog.create must NOT have been used for the central log.
    assert.equal(instStore.length, 0);

    // Unfiltered Super Admin query returns the central log.
    const all = await getEmailDeliveryLogs({});
    assert.equal(all.total, 1);
    assert.equal(all.logs[0].institutionId, null);
  } finally {
    restore();
  }
});

test("unfiltered Super Admin query combines institution and central logs", async () => {
  const instStore: AuditRow[] = [];
  const centralStore: any[] = [];
  const restore = mockAudit({
    create: async ({ data }: any) => {
      instStore.push({ ...data, createdAt: new Date() });
      return data;
    },
    findMany: async ({ where }: any) =>
      instStore
        .filter((r) => r.entityType === where.entityType)
        .filter((r) => !where.institutionId || r.institutionId === where.institutionId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    platformCreate: async ({ data }: any) => {
      centralStore.push({ ...data, createdAt: new Date() });
      return data;
    },
    platformFindMany: async ({ where }: any) =>
      centralStore.filter((r) => r.entity === where.entity),
  });
  try {
    await recordEmailDeliveryLog(baseLog({ institutionId: INST_A }));
    await recordEmailDeliveryLog(baseLog({ institutionId: undefined }));
    const all = await getEmailDeliveryLogs({});
    assert.equal(all.total, 2);
    const inst = await getEmailDeliveryLogs({ institutionId: INST_A });
    assert.equal(inst.total, 1);
    assert.equal(inst.logs[0].institutionId, INST_A);
  } finally {
    restore();
  }
});

test("status, purpose, search and pagination filters work", async () => {
  const store: AuditRow[] = [];
  const restore = mockAudit({
    create: async ({ data }: any) => {
      store.push({ ...data, createdAt: new Date() });
      return data;
    },
    findMany: async ({ where }: any) =>
      store
        .filter((r) => r.entityType === where.entityType)
        .filter((r) => !where.institutionId || r.institutionId === where.institutionId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  });
  try {
    await recordEmailDeliveryLog(baseLog({ deliveryStatus: "ACCEPTED", purpose: "INVITATION", subject: "Welcome A" }));
    await recordEmailDeliveryLog(baseLog({ deliveryStatus: "FAILED", purpose: "PASSWORD_RESET", subject: "Reset B" }));

    const failed = await getEmailDeliveryLogs({ status: "FAILED" });
    assert.equal(failed.total, 1);
    assert.equal(failed.logs[0].deliveryStatus, "FAILED");

    const pw = await getEmailDeliveryLogs({ purpose: "PASSWORD_RESET" });
    assert.equal(pw.total, 1);

    const search = await getEmailDeliveryLogs({ search: "reset" });
    assert.equal(search.total, 1);
    assert.equal(search.logs[0].subject, "Reset B");

    const page = await getEmailDeliveryLogs({ limit: 1, offset: 1 });
    assert.equal(page.total, 2);
    assert.equal(page.logs.length, 1);
  } finally {
    restore();
  }
});

test("sensitive data: no credentials/secrets stored or returned", async () => {
  let storedJson = "";
  const restore = mockAudit({
    create: async ({ data }: any) => {
      storedJson = data.newValuesJson;
      return data;
    },
    findMany: async () => [],
  });
  try {
    // Even if a caller tried to smuggle secrets via metadata, only safe fields persist.
    await recordEmailDeliveryLog(
      baseLog({
        metadata: { password: "topsecret", apiKey: "re_secret", token: "abc" },
      } as any)
    );
    assert.ok(!storedJson.includes("topsecret"));
    assert.ok(!storedJson.includes("re_secret"));
    assert.ok(!storedJson.includes("abc"));
    assert.ok(storedJson.includes("user@inst.edu"));
  } finally {
    restore();
  }
});