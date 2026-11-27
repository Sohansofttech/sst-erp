import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import {
  reserveStorage,
  finalizeStorageReservation,
  releaseStorageReservation,
  recoverExpiredReservations,
  heartbeatReservation,
  computeFileSize,
  StorageCapacityError,
} from "../lib/billing/storage-capacity";

function makeTransaction() {
  const state = { usage: null as any, reservations: [] as any[] };
  const tx: any = {
    $queryRaw: async () => [{ id: "inst-1" }],
    institutionStorageUsage: {
      findUnique: async ({ where }: any) => state.usage,
      upsert: async ({ where, create, update }: any) => {
        if (!state.usage) { state.usage = { ...create }; } else { state.usage.reservedBytes += update.reservedBytes?.increment ?? 0; }
        return state.usage;
      },
      update: async ({ data }: any) => {
        if (data.usedBytes?.increment) state.usage.usedBytes += data.usedBytes.increment;
        if (data.reservedBytes?.increment) state.usage.reservedBytes += data.reservedBytes.increment;
        if (data.reservedBytes?.decrement) state.usage.reservedBytes -= data.reservedBytes.decrement;
        return state.usage;
      },
      updateMany: async ({ where, data }: any) => {
        if (!state.usage) return { count: 0 };
        const matches =
          where.institutionId === undefined || state.usage.institutionId === where.institutionId;
        const reservedMatch =
          where.reservedBytes === undefined || state.usage.reservedBytes === where.reservedBytes;
        if (matches && reservedMatch) {
          if (data.usedBytes !== undefined) state.usage.usedBytes = data.usedBytes;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    storageUploadReservation: {
      create: async ({ data }: any) => { const r = { id: "res-1", ...data }; state.reservations.push(r); return r; },
      findUnique: async ({ where }: any) => state.reservations.find((r) => r.id === where.id) || null,
      findMany: async (args: any) => {
        return state.reservations.filter((r) => {
          if (r.status !== "RESERVED") return false;
          if (args?.where?.expiresAt?.lt && !(r.expiresAt < args.where.expiresAt.lt)) return false;
          return true;
        });
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const r of state.reservations) {
          if (r.id !== where.id || r.status !== where.status) continue;
          // Evaluate expiresAt: { lt: date } means r.expiresAt < date
          if (where.expiresAt?.lt && !(r.expiresAt < where.expiresAt.lt)) continue;
          // Evaluate OR: at least one condition must match
          if (where.OR) {
            const orMatches = where.OR.some((cond: any) => {
              if (cond.heartbeatAt?.lte) {
                return !r.heartbeatAt || r.heartbeatAt <= cond.heartbeatAt.lte;
              }
              if (cond.heartbeatAt === null) return r.heartbeatAt === null;
              return true;
            });
            if (!orMatches) continue;
          }
          Object.assign(r, data);
          count++;
        }
        return { count };
      },
      update: async ({ where, data }: any) => {
        const r = state.reservations.find((x) => x.id === where.id);
        if (r) Object.assign(r, data);
        return r;
      },
    },
  };
  return { tx: tx as Prisma.TransactionClient, state };
}

test("reserveStorage creates reservation", async () => {
  const { tx } = makeTransaction();
  const id = await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  assert.equal(id, "res-1");
});

test("finalize moves reserved to used", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  await finalizeStorageReservation(tx, "res-1");
  assert.equal(state.reservations[0].status, "FINALIZED");
});

test("release decrements reserved", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  await releaseStorageReservation(tx, "res-1");
  assert.equal(state.reservations[0].status, "RELEASED");
});

test("capacity exceeded throws", async () => {
  const { tx } = makeTransaction();
  await reserveStorage(tx, "inst-1", 10, BigInt(50), "path/file");
  await assert.rejects(() => reserveStorage(tx, "inst-1", 100, BigInt(50), "path/file2"), (e: any) => e?.message === "Storage limit exceeded.");
});

test("recoverExpired finalizes if exists", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  // expire
  state.reservations[0].expiresAt = new Date(Date.now() - 1000);
  state.reservations[0].heartbeatAt = null;
  await recoverExpiredReservations(tx, "inst-1", async () => ({ state: "exists", size: 100 }));
  assert.equal(state.reservations[0].status, "FINALIZED");
});

test("recoverExpired releases if missing", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  state.reservations[0].expiresAt = new Date(Date.now() - 1000);
  state.reservations[0].heartbeatAt = null;
  await recoverExpiredReservations(tx, "inst-1", async () => ({ state: "missing" }));
  assert.equal(state.reservations[0].status, "RELEASED");
});

test("recoverExpired skips unknown", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  state.reservations[0].expiresAt = new Date(Date.now() - 1000);
  state.reservations[0].heartbeatAt = null;
  await recoverExpiredReservations(tx, "inst-1", async () => ({ state: "unknown" }));
  assert.equal(state.reservations[0].status, "RESERVED");
});

test("successful listing with no matching object (unknown) must not release reservation", async () => {
  // buildObjectExistsProbe now reports "unknown" when list() succeeds but the
  // object is not found; recovery must retain the reservation in that case.
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  state.reservations[0].expiresAt = new Date(Date.now() - 1000);
  state.reservations[0].heartbeatAt = null;
  await recoverExpiredReservations(tx, "inst-1", async () => ({ state: "unknown" }));
  assert.equal(state.reservations[0].status, "RESERVED");
  assert.equal(state.usage.reservedBytes, BigInt(100));
});

test("unknown object state retains reservation and reserved bytes (idempotent)", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  state.reservations[0].expiresAt = new Date(Date.now() - 1000);
  state.reservations[0].heartbeatAt = null;
  const probe = async () => ({ state: "unknown" as const });
  await recoverExpiredReservations(tx, "inst-1", probe);
  await recoverExpiredReservations(tx, "inst-1", probe);
  assert.equal(state.reservations[0].status, "RESERVED");
  assert.equal(state.usage.reservedBytes, BigInt(100));
  assert.equal(state.usage.usedBytes, BigInt(0));
});

test("concurrent finalizeStorageReservation does not double-count usedBytes", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  await Promise.all([
    finalizeStorageReservation(tx, "res-1"),
    finalizeStorageReservation(tx, "res-1"),
  ]);
  assert.equal(state.reservations[0].status, "FINALIZED");
  assert.equal(state.usage.usedBytes, BigInt(100));
  assert.equal(state.usage.reservedBytes, BigInt(0));
});

test("concurrent releaseStorageReservation does not double-decrement reservedBytes", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  await Promise.all([
    releaseStorageReservation(tx, "res-1"),
    releaseStorageReservation(tx, "res-1"),
  ]);
  assert.equal(state.reservations[0].status, "RELEASED");
  assert.equal(state.usage.reservedBytes, BigInt(0));
});

test("double finalizeStorageReservation is idempotent", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  await finalizeStorageReservation(tx, "res-1");
  await finalizeStorageReservation(tx, "res-1");
  assert.equal(state.reservations[0].status, "FINALIZED");
  assert.equal(state.usage.usedBytes, BigInt(100));
});

test("double releaseStorageReservation is idempotent", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  await releaseStorageReservation(tx, "res-1");
  await releaseStorageReservation(tx, "res-1");
  assert.equal(state.reservations[0].status, "RELEASED");
  assert.equal(state.usage.reservedBytes, BigInt(0));
});

test("recoverExpired skips when object exists but size mismatches", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  state.reservations[0].expiresAt = new Date(Date.now() - 1000);
  state.reservations[0].heartbeatAt = null;
  await recoverExpiredReservations(tx, "inst-1", async () => ({ state: "exists", size: 50 }));
  assert.equal(state.reservations[0].status, "RESERVED");
});

test("recoverExpired skips when heartbeat is recent", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  state.reservations[0].expiresAt = new Date(Date.now() - 1000);
  state.reservations[0].heartbeatAt = new Date();
  await recoverExpiredReservations(tx, "inst-1", async () => ({ state: "missing" }));
  assert.equal(state.reservations[0].status, "RESERVED");
});

test("reconcileStorageUsage corrects usedBytes when no active reservations", async () => {
  const { tx, state } = makeTransaction();
  // Create usage row with some existing value
  await tx.institutionStorageUsage.upsert({
    where: { institutionId: "inst-1" },
    create: { institutionId: "inst-1", usedBytes: BigInt(0), reservedBytes: BigInt(0) },
    update: {},
  });
  await tx.institutionStorageUsage.update({
    where: { institutionId: "inst-1" },
    data: { usedBytes: BigInt(500), reservedBytes: BigInt(0) },
  });

  // Reconcile to actual 1000 bytes
  const { reconcileStorageUsage } = await import("../lib/billing/storage-capacity");
  await reconcileStorageUsage(tx, "inst-1", BigInt(1000));
  // usedBytes must be corrected to the actual persisted value (1000).
  assert.equal(state.usage.usedBytes, BigInt(1000));
});

test("reconcileStorageUsage skips when reservedBytes > 0 (no double-count)", async () => {
  const { tx, state } = makeTransaction();
  // Create usage with reservedBytes > 0
  state.usage = { institutionId: "inst-1", usedBytes: BigInt(100), reservedBytes: BigInt(200) };
  const { reconcileStorageUsage } = await import("../lib/billing/storage-capacity");
  await reconcileStorageUsage(tx, "inst-1", BigInt(1000));
  // usedBytes should NOT be changed because reservedBytes > 0
  assert.equal(state.usage.usedBytes, BigInt(100));
});

test("reserveStorage enforces tenant isolation by institutionId", async () => {
  const { tx, state } = makeTransaction();
  const idA = await reserveStorage(tx, "inst-a", 100, BigInt(1000), "inst-a/file");
  const idB = await reserveStorage(tx, "inst-b", 200, BigInt(1000), "inst-b/file");
  assert.ok(idA);
  assert.ok(idB);
  // Verify both reservations carry their institutionId
  assert.equal(state.reservations[0].institutionId, "inst-a");
  assert.equal(state.reservations[1].institutionId, "inst-b");
});

test("heartbeat renews expiresAt before recovery — recovery skips renewed reservation", async () => {
  const { tx, state } = makeTransaction();
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  // Expire the reservation
  state.reservations[0].expiresAt = new Date(Date.now() - 1000);
  state.reservations[0].heartbeatAt = null;
  // Heartbeat renews it (extends expiresAt, sets heartbeatAt)
  await heartbeatReservation(tx, "res-1");
  assert.ok(state.reservations[0].expiresAt > new Date());
  assert.ok(state.reservations[0].heartbeatAt !== null);
  // Recovery should skip: heartbeatAt is recent AND expiresAt is in the future
  await recoverExpiredReservations(tx, "inst-1", async () => ({ state: "exists", size: 100 }));
  assert.equal(state.reservations[0].status, "RESERVED");
});

test("heartbeat reservation not found — heartbeat is no-op", async () => {
  const { tx } = makeTransaction();
  // Should not throw; heartbeat of non-existent reservation is a no-op
  await heartbeatReservation(tx, "non-existent-id");
  assert.ok(true, "heartbeatReservation of missing reservation did not throw");
});

test("computeFileSize returns byteLength for Buffer", async () => {
  const buf = Buffer.from("hello world");
  assert.equal(computeFileSize(buf), buf.byteLength);
});

test("computeFileSize returns byteLength for Uint8Array", async () => {
  const arr = new Uint8Array([1, 2, 3, 4, 5]);
  assert.equal(computeFileSize(arr), 5);
});

test("computeFileSize returns size for Blob", async () => {
  const blob = new Blob(["hello world"]);
  assert.equal(computeFileSize(blob), 11);
});

test("computeFileSize rejects invalid size", async () => {
  // Wrong-type input (not File/Blob/Buffer/Uint8Array) must throw
  assert.throws(
    () => computeFileSize({} as any),
    (e: any) => e instanceof StorageCapacityError && e.statusCode === 400
  );
});

test("computeFileSize throws StorageCapacityError for unknown type", async () => {
  assert.throws(
    () => computeFileSize(null as any),
    (e: any) => e instanceof StorageCapacityError
  );
});

test("computeFileSize rejects zero-byte Blob — aligns with DB fileSizeBytes > 0 CHECK", async () => {
  const empty = new Blob([]);
  assert.throws(
    () => computeFileSize(empty),
    (e: any) => e instanceof StorageCapacityError && e.statusCode === 400,
  );
});

test("computeFileSize rejects zero-byte Buffer — aligns with DB fileSizeBytes > 0 CHECK", async () => {
  const empty = Buffer.alloc(0);
  assert.throws(
    () => computeFileSize(empty),
    (e: any) => e instanceof StorageCapacityError && e.statusCode === 400,
  );
});

test("computeFileSize rejects zero-byte Uint8Array — aligns with DB fileSizeBytes > 0 CHECK", async () => {
  const empty = new Uint8Array(0);
  assert.throws(
    () => computeFileSize(empty),
    (e: any) => e instanceof StorageCapacityError && e.statusCode === 400,
  );
});

test("reconcileStorageUsage acquires Institution lock before reading usage row", async () => {
  const lockOrder: string[] = [];
  const tx: any = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join("?");
      if (sql.includes('"Institution"')) lockOrder.push("Institution");
      else if (sql.includes("InstitutionStorageUsage")) lockOrder.push("InstitutionStorageUsage");
      return [{ id: "inst-1" }];
    },
    institutionStorageUsage: {
      findUnique: async () => {
        lockOrder.push("findUnique");
        return null;
      },
      create: async () => {},
    },
  };
  const { reconcileStorageUsage } = await import("../lib/billing/storage-capacity");
  await reconcileStorageUsage(tx, "inst-1", BigInt(500));
  // "Institution" lock must be first; findUnique (usage read) must come after
  assert.equal(lockOrder[0], "Institution", '"Institution" row must be locked first');
  assert.ok(lockOrder.indexOf("Institution") < lockOrder.indexOf("findUnique"),
    '"Institution" lock must precede the usage row read');
  // InstitutionStorageUsage row lock must NOT appear — that was the removed inconsistency
  assert.equal(lockOrder.includes("InstitutionStorageUsage"), false,
    "InstitutionStorageUsage row lock must not be acquired (removed to fix lock-order inconsistency)");
});

test("reserveStorage locks the physical Institution table (not institutions)", async () => {
  const queries: string[] = [];
  const tx: any = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      queries.push(strings.join("?"));
      return [{ id: "inst-1" }];
    },
    institutionStorageUsage: {
      findUnique: async () => null,
      upsert: async ({ create }: any) => create,
    },
    storageUploadReservation: {
      create: async ({ data }: any) => ({ id: "res-1", ...data }),
    },
  };
  const { reserveStorage } = await import("../lib/billing/storage-capacity");
  await reserveStorage(tx, "inst-1", 100, BigInt(1000), "path/file");
  assert.equal(queries.length, 1);
  assert.ok(queries[0].includes('"Institution"'), 'lock must target "Institution"');
  assert.ok(!/FROM institutions/i.test(queries[0]), "lock must NOT target the app institutions table");
});