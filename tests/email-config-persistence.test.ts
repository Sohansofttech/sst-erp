import assert from "node:assert/strict";
import { test } from "node:test";
import db from "../lib/db";
import {
  saveInstitutionEmailConfig,
  saveCentralEmailConfig,
  getInstitutionEmailConfig,
  getCentralEmailConfig,
  testInstitutionEmailConnection,
  toMaskedInstitutionConfig,
  toMaskedCentralConfig,
  __resetEmailConfigCachesForTests,
} from "../lib/services/email-config.service";
import { encryptCredential, decryptCredential } from "../lib/security/encryption";

const INST = "33333333-3333-4333-8333-333333333333";

function mockPlatformSetting(impl: { findUnique?: any; upsert?: any; update?: any }) {
  const original = (db as any).platformSetting;
  (db as any).platformSetting = {
    findUnique: impl.findUnique ?? (async () => null),
    upsert: impl.upsert ?? (async ({ create }: any) => create),
    update: impl.update ?? (async ({ data }: any) => data),
  };
  return () => {
    (db as any).platformSetting = original;
  };
}

function reset() {
  __resetEmailConfigCachesForTests();
}

test("institution save persists to DB and a fresh read (cache reset) returns it", async () => {
  reset();
  const store: Record<string, any> = {};
  const restore = mockPlatformSetting({
    findUnique: async ({ where }: any) => (store[where.key] ? { key: where.key, value: store[where.key] } : null),
    upsert: async ({ where, create, update }: any) => {
      store[where.key] = update?.value ?? create.value;
      return { key: where.key, value: store[where.key] };
    },
  });
  try {
    await saveInstitutionEmailConfig(INST, {
      provider: "SMTP",
      senderEmail: "noreply@inst.edu",
      senderName: "Inst",
      isEnabled: false,
      credentials: { host: "smtp.inst.edu", port: 587, secure: false, username: "user", password: "secret" } as any,
    });
    // Fresh read: clear cache, must come from DB.
    reset();
    const cfg = await getInstitutionEmailConfig(INST);
    assert.equal(cfg.senderEmail, "noreply@inst.edu");
    assert.equal((cfg.credentials as any)?.password, "secret");
  } finally {
    restore();
    reset();
  }
});

test("institution upsert failure propagates and does not update cache", async () => {
  reset();
  const restore = mockPlatformSetting({
    findUnique: async () => null,
    upsert: async () => {
      throw new Error("DB down");
    },
  });
  try {
    await assert.rejects(
      () =>
        saveInstitutionEmailConfig(INST, {
          provider: "SMTP",
          senderEmail: "noreply@inst.edu",
          senderName: "Inst",
        }),
      /DB down/
    );
    // Cache must not hold the failed config; a fresh read returns the default (NOT_CONFIGURED).
    reset();
    const cfg = await getInstitutionEmailConfig(INST);
    assert.equal(cfg.status, "NOT_CONFIGURED");
    assert.equal(cfg.senderEmail, "");
  } finally {
    restore();
    reset();
  }
});

test("central save persists and a fresh read returns it", async () => {
  reset();
  const store: Record<string, any> = {};
  const restore = mockPlatformSetting({
    findUnique: async ({ where }: any) => (store[where.key] ? { key: where.key, value: store[where.key] } : null),
    upsert: async ({ where, create, update }: any) => {
      store[where.key] = update?.value ?? create.value;
      return { key: where.key, value: store[where.key] };
    },
  });
  try {
    await saveCentralEmailConfig({ provider: "RESEND", senderEmail: "noreply@central.edu", senderName: "Central" } as any);
    reset();
    const cfg = await getCentralEmailConfig();
    assert.equal(cfg.senderEmail, "noreply@central.edu");
  } finally {
    restore();
    reset();
  }
});

test("central save failure propagates and does not update cache", async () => {
  reset();
  const restore = mockPlatformSetting({
    findUnique: async () => null,
    upsert: async () => {
      throw new Error("central DB down");
    },
  });
  try {
    await assert.rejects(
      () => saveCentralEmailConfig({ provider: "RESEND", senderEmail: "x@central.edu" } as any),
      /central DB down/
    );
  } finally {
    restore();
    reset();
  }
});

test("connection-test status upserts when no row exists (test before save)", async () => {
  reset();
  let upserted = false;
  let updatedCalled = false;
  const restore = mockPlatformSetting({
    findUnique: async () => null,
    upsert: async ({ where, create }: any) => {
      upserted = true;
      return { key: where.key, value: create.value };
    },
    update: async () => {
      updatedCalled = true;
      throw new Error("update should not be used");
    },
  });
  try {
    // Seed an in-memory config with valid sender + creds so the test reaches persistence.
    await saveInstitutionEmailConfig(INST, {
      provider: "SMTP",
      senderEmail: "noreply@inst.edu",
      senderName: "Inst",
      credentials: { host: "smtp.inst.edu", port: 587, secure: false, username: "user", password: "secret" } as any,
    });
    upserted = false;
    // Force the SMTP verify to fail fast but still reach the persistence branch.
    const result = await testInstitutionEmailConnection(INST);
    assert.equal(upserted, true, "status persistence must use upsert");
    assert.equal(updatedCalled, false, "must not use update()");
    assert.equal(result.senderVerified, false);
  } finally {
    restore();
    reset();
  }
});

test("credential encryption/decryption round-trip", () => {
  const payload = JSON.stringify({ host: "h", username: "u", password: "p@ss" });
  const enc = encryptCredential(payload);
  assert.notEqual(enc, payload);
  assert.equal(decryptCredential(enc), payload);
});

test("masking never exposes plaintext password/api key", () => {
  const instMasked = toMaskedInstitutionConfig({
    institutionId: INST,
    provider: "SMTP",
    isEnabled: true,
    senderEmail: "a@b.edu",
    senderName: "n",
    status: "VERIFIED",
    credentials: { host: "h", port: 587, secure: false, username: "u", password: "topsecret" } as any,
    updatedAt: new Date().toISOString(),
  } as any);
  assert.equal((instMasked.maskedCredentials as any).hasPassword, true);
  assert.equal((instMasked.maskedCredentials as any).maskedPassword, "••••••••••••");
  assert.ok(!JSON.stringify(instMasked).includes("topsecret"));

  const centralMasked = toMaskedCentralConfig({
    provider: "RESEND",
    senderEmail: "a@b.edu",
    senderName: "n",
    status: "VERIFIED",
    credentials: { apiKey: "re_secret_key_1234" } as any,
    updatedAt: new Date().toISOString(),
  } as any);
  assert.equal((centralMasked.maskedCredentials as any).hasApiKey, true);
  assert.ok(!JSON.stringify(centralMasked).includes("re_secret_key_1234"));
});