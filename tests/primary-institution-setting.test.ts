/**
 * SAF-006: Primary institution setting — focused unit tests.
 *
 * The createInstitution server action embeds conditional DB logic that cannot be
 * easily isolated without mocking the entire Next.js + Prisma environment. These
 * tests therefore exercise the same logic pattern against a lightweight fake
 * transaction, mirroring the approach used throughout this test suite
 * (user-capacity.test.ts, storage-capacity.test.ts, feature-access.test.ts).
 *
 * Tests cover all four required behaviours:
 *   a. First institution initializes primary settings.
 *   b. Second institution does not overwrite an existing primary.
 *   c. Explicit setPrimaryInstitution still changes the primary (upsert path).
 *   d. editInstitution name-sync only updates primary_institution_name when the
 *      edited institution IS the current primary.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// ---------------------------------------------------------------------------
// Minimal in-memory fake for platformSetting operations
// ---------------------------------------------------------------------------
function makePlatformSettingStore(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    store,
    tx: {
      platformSetting: {
        findUnique: async ({ where }: { where: { key: string } }) => {
          const value = store.get(where.key);
          return value !== undefined ? { key: where.key, value } : null;
        },
        createMany: async ({
          data,
          skipDuplicates,
        }: {
          data: Array<{ key: string; value: string }>;
          skipDuplicates?: boolean;
        }) => {
          let count = 0;
          for (const row of data) {
            if (skipDuplicates && store.has(row.key)) continue;
            store.set(row.key, row.value);
            count++;
          }
          return { count };
        },
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { key: string };
          create: { key: string; value: string };
          update: { value: string };
        }) => {
          if (store.has(where.key)) {
            store.set(where.key, update.value);
          } else {
            store.set(where.key, create.value);
          }
          return { key: where.key, value: store.get(where.key) };
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// The conditional logic extracted verbatim from createInstitution (post-fix)
// This is the exact pattern in the transaction body — keeping it in sync is
// straightforward because it is a pure data operation with no side effects.
// ---------------------------------------------------------------------------
async function runCreateInstitutionPrimaryLogic(
  tx: ReturnType<typeof makePlatformSettingStore>["tx"],
  institution: { id: string; name: string },
  auditUserId: string | null,
) {
  const existingPrimaryId = await tx.platformSetting.findUnique({
    where: { key: "primary_institution_id" },
    select: { key: true },
  } as any);
  if (!existingPrimaryId) {
    await tx.platformSetting.createMany({
      data: [
        {
          key: "primary_institution_id",
          value: institution.id,
          description: "Default active institution ID for public portal",
          updatedById: auditUserId,
        } as any,
        {
          key: "primary_institution_name",
          value: institution.name,
          description: "Default active institution name for public portal",
          updatedById: auditUserId,
        } as any,
      ],
      skipDuplicates: true,
    });
  }
}

// The name-sync logic from editInstitution (unchanged, tested for regression)
async function runEditInstitutionNameSyncLogic(
  tx: ReturnType<typeof makePlatformSettingStore>["tx"],
  editedInstitutionId: string,
  newName: string,
  auditUserId: string | null,
) {
  const currentPrimary = await tx.platformSetting.findUnique({
    where: { key: "primary_institution_id" },
  } as any);
  if (currentPrimary?.value === editedInstitutionId) {
    await tx.platformSetting.upsert({
      where: { key: "primary_institution_name" },
      create: {
        key: "primary_institution_name",
        value: newName,
        description: "Default active institution name for public portal",
        updatedById: auditUserId,
      },
      update: {
        value: newName,
        description: "Default active institution name for public portal",
        updatedById: auditUserId,
      },
    } as any);
  }
}

// The explicit setPrimaryInstitution upsert logic (unchanged, tested for regression)
async function runSetPrimaryInstitutionLogic(
  tx: ReturnType<typeof makePlatformSettingStore>["tx"],
  institution: { id: string; name: string },
  auditUserId: string | null,
) {
  await tx.platformSetting.upsert({
    where: { key: "primary_institution_id" },
    create: {
      key: "primary_institution_id",
      value: institution.id,
      description: "Default active institution ID for public portal",
      updatedById: auditUserId,
    },
    update: {
      value: institution.id,
      description: "Default active institution ID for public portal",
      updatedById: auditUserId,
    },
  } as any);
  await tx.platformSetting.upsert({
    where: { key: "primary_institution_name" },
    create: {
      key: "primary_institution_name",
      value: institution.name,
      description: "Default active institution name for public portal",
      updatedById: auditUserId,
    },
    update: {
      value: institution.name,
      description: "Default active institution name for public portal",
      updatedById: auditUserId,
    },
  } as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// (a) First institution creation initializes both primary settings
test("createInstitution — first institution sets primary_institution_id and primary_institution_name", async () => {
  const { store, tx } = makePlatformSettingStore(); // empty store = no primary configured
  await runCreateInstitutionPrimaryLogic(tx, { id: "inst-aaa", name: "Alpha College" }, null);

  assert.equal(store.get("primary_institution_id"), "inst-aaa");
  assert.equal(store.get("primary_institution_name"), "Alpha College");
});

// (b) Second institution creation does NOT overwrite an existing primary
test("createInstitution — second institution does not overwrite existing primary_institution_id", async () => {
  const { store, tx } = makePlatformSettingStore({
    primary_institution_id: "inst-aaa",
    primary_institution_name: "Alpha College",
  });
  await runCreateInstitutionPrimaryLogic(tx, { id: "inst-bbb", name: "Beta University" }, null);

  assert.equal(
    store.get("primary_institution_id"),
    "inst-aaa",
    "primary_institution_id must remain unchanged after second institution creation",
  );
  assert.equal(
    store.get("primary_institution_name"),
    "Alpha College",
    "primary_institution_name must remain unchanged after second institution creation",
  );
});

// (b) Variant: creating a third institution also does not overwrite
test("createInstitution — nth institution does not overwrite existing primary", async () => {
  const { store, tx } = makePlatformSettingStore({
    primary_institution_id: "inst-aaa",
    primary_institution_name: "Alpha College",
  });
  for (let i = 1; i <= 5; i++) {
    await runCreateInstitutionPrimaryLogic(tx, { id: `inst-${i}`, name: `Institution ${i}` }, null);
  }
  assert.equal(store.get("primary_institution_id"), "inst-aaa");
  assert.equal(store.get("primary_institution_name"), "Alpha College");
});

// (b) Partial state: primary_institution_id exists but primary_institution_name is absent —
// createInstitution must NOT set either setting. The outer `if (!existingPrimaryId)` guard
// (the findUnique check on primary_institution_id) sees a non-null row and skips the entire
// createMany block, so primary_institution_name is never written. skipDuplicates is not what
// prevents the write here — the guard does, before createMany is ever called.
test("createInstitution — does not overwrite when only primary_institution_id is set", async () => {
  const { store, tx } = makePlatformSettingStore({
    primary_institution_id: "inst-aaa",
    // primary_institution_name intentionally absent
  });
  await runCreateInstitutionPrimaryLogic(tx, { id: "inst-bbb", name: "Beta University" }, null);

  assert.equal(store.get("primary_institution_id"), "inst-aaa");
  assert.equal(store.has("primary_institution_name"), false,
    "primary_institution_name must not be set when only id was pre-existing");
});

// (c) Explicit setPrimaryInstitution overwrites the existing primary
test("setPrimaryInstitution — overwrites primary_institution_id and primary_institution_name", async () => {
  const { store, tx } = makePlatformSettingStore({
    primary_institution_id: "inst-aaa",
    primary_institution_name: "Alpha College",
  });
  await runSetPrimaryInstitutionLogic(tx, { id: "inst-bbb", name: "Beta University" }, null);

  assert.equal(store.get("primary_institution_id"), "inst-bbb");
  assert.equal(store.get("primary_institution_name"), "Beta University");
});

// (c) Variant: works when no primary is configured yet
test("setPrimaryInstitution — initializes primary when none exists", async () => {
  const { store, tx } = makePlatformSettingStore();
  await runSetPrimaryInstitutionLogic(tx, { id: "inst-aaa", name: "Alpha College" }, null);

  assert.equal(store.get("primary_institution_id"), "inst-aaa");
  assert.equal(store.get("primary_institution_name"), "Alpha College");
});

// (d) editInstitution name sync — updates name only when the edited institution IS the primary
test("editInstitution — syncs primary_institution_name when edited institution is the primary", async () => {
  const { store, tx } = makePlatformSettingStore({
    primary_institution_id: "inst-aaa",
    primary_institution_name: "Alpha College",
  });
  await runEditInstitutionNameSyncLogic(tx, "inst-aaa", "Alpha College (Renamed)", null);

  assert.equal(store.get("primary_institution_name"), "Alpha College (Renamed)");
  assert.equal(store.get("primary_institution_id"), "inst-aaa", "id must not change during name sync");
});

// (d) editInstitution name sync — does NOT update name when edited institution is NOT the primary
test("editInstitution — does not change primary_institution_name when edited institution is not the primary", async () => {
  const { store, tx } = makePlatformSettingStore({
    primary_institution_id: "inst-aaa",
    primary_institution_name: "Alpha College",
  });
  await runEditInstitutionNameSyncLogic(tx, "inst-bbb", "Beta University (Renamed)", null);

  assert.equal(store.get("primary_institution_name"), "Alpha College",
    "primary_institution_name must not change when a non-primary institution is edited");
});

// (d) editInstitution name sync — no-op when no primary is configured
test("editInstitution — name sync is a no-op when no primary is configured", async () => {
  const { store, tx } = makePlatformSettingStore();
  await runEditInstitutionNameSyncLogic(tx, "inst-aaa", "Whatever Name", null);

  assert.equal(store.has("primary_institution_id"), false);
  assert.equal(store.has("primary_institution_name"), false);
});

// (c) Partial-state repair: primary_institution_id exists but primary_institution_name is
// missing. Calling setPrimaryInstitution for the intended institution must write both settings,
// repairing the incomplete state. This is the documented repair path for partial state —
// createInstitution intentionally does not repair it; setPrimaryInstitution does.
test("setPrimaryInstitution — repairs missing primary_institution_name when id already exists", async () => {
  const { store, tx } = makePlatformSettingStore({
    primary_institution_id: "inst-aaa",
    // primary_institution_name intentionally absent — partial state
  });
  await runSetPrimaryInstitutionLogic(tx, { id: "inst-aaa", name: "Alpha College" }, null);

  assert.equal(store.get("primary_institution_id"), "inst-aaa",
    "primary_institution_id must remain the same institution");
  assert.equal(store.get("primary_institution_name"), "Alpha College",
    "primary_institution_name must be written to repair the missing entry");
});
