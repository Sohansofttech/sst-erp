import { Prisma } from "@prisma/client";

export class StorageCapacityError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "StorageCapacityError";
  }
}

export async function reserveStorage(
  tx: Prisma.TransactionClient,
  institutionId: string,
  fileSizeBytes: number,
  storageLimitBytes: bigint,
  objectPath: string,
) {
  await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${institutionId}::uuid FOR UPDATE`;
  const usage = await tx.institutionStorageUsage.findUnique({ where: { institutionId } });
  const used = usage?.usedBytes ?? BigInt(0);
  const reserved = usage?.reservedBytes ?? BigInt(0);
  if (used + reserved + BigInt(fileSizeBytes) > storageLimitBytes) {
    throw new StorageCapacityError("Storage limit exceeded.", 409);
  }
  await tx.institutionStorageUsage.upsert({
    where: { institutionId },
    create: { institutionId, usedBytes: BigInt(0), reservedBytes: BigInt(fileSizeBytes) },
    update: { reservedBytes: { increment: BigInt(fileSizeBytes) } },
  });
  const reservation = await tx.storageUploadReservation.create({
    data: { institutionId, fileSizeBytes: BigInt(fileSizeBytes), objectPath, status: "RESERVED", expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  });
  return reservation.id;
}

export async function finalizeStorageReservation(
  tx: Prisma.TransactionClient,
  reservationId: string,
) {
  const res = await tx.storageUploadReservation.findUnique({ where: { id: reservationId } });
  if (!res || res.status !== "RESERVED") return;
  const updated = await tx.storageUploadReservation.updateMany({
    where: { id: reservationId, status: "RESERVED" },
    data: { status: "FINALIZED" },
  });
  if (updated.count === 0) return;
  await tx.institutionStorageUsage.update({
    where: { institutionId: res.institutionId },
    data: { usedBytes: { increment: res.fileSizeBytes }, reservedBytes: { decrement: res.fileSizeBytes } },
  });
}

export async function releaseStorageReservation(
  tx: Prisma.TransactionClient,
  reservationId: string,
) {
  const res = await tx.storageUploadReservation.findUnique({ where: { id: reservationId } });
  if (!res || res.status !== "RESERVED") return;
  const updated = await tx.storageUploadReservation.updateMany({
    where: { id: reservationId, status: "RESERVED" },
    data: { status: "RELEASED" },
  });
  if (updated.count === 0) return;
  await tx.institutionStorageUsage.update({
    where: { institutionId: res.institutionId },
    data: { reservedBytes: { decrement: res.fileSizeBytes } },
  });
}

export async function heartbeatReservation(
  tx: Prisma.TransactionClient,
  reservationId: string,
) {
  // Consistent per-institution locking: lock the institution row first, same
  // acquisition order as reserveStorage ("Institution" FOR UPDATE) and
  // recoverExpiredReservations ("Institution" FOR UPDATE). This serializes
  // heartbeat and recovery per institution and prevents deadlocks.
  const reservation = await tx.storageUploadReservation.findUnique({
    where: { id: reservationId },
    select: { institutionId: true, status: true },
  });
  if (!reservation || reservation.status !== "RESERVED") return;
  await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${reservation.institutionId}::uuid FOR UPDATE`;
  await tx.storageUploadReservation.updateMany({
    where: { id: reservationId, status: "RESERVED" },
    data: { heartbeatAt: new Date(), expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  });
}

export async function recoverExpiredReservations(
  tx: Prisma.TransactionClient,
  institutionId: string,
  objectExists: (path: string) => Promise<{ state: "exists" | "missing" | "unknown"; size?: number }>,
) {
  await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${institutionId}::uuid FOR UPDATE`;
  const expired = await tx.storageUploadReservation.findMany({
    where: { institutionId, status: "RESERVED", expiresAt: { lt: new Date() } },
  });
  for (const res of expired) {
    if (res.heartbeatAt && res.heartbeatAt > new Date(Date.now() - 60 * 1000)) continue;
    let state: "exists" | "missing" | "unknown" = "unknown";
    let size: number | undefined;
    try {
      const result = await objectExists(res.objectPath);
      state = result.state;
      size = result.size;
    } catch {
      state = "unknown";
    }
    if (state === "unknown") continue;
    if (state === "exists") {
      // Verify object size matches the reservation before finalizing.
      // A partial or different-sized upload must not be finalized.
      if (size !== undefined && BigInt(size) !== res.fileSizeBytes) continue;
      const recentHeartbeatThreshold = new Date(Date.now() - 60 * 1000);
      const updated = await tx.storageUploadReservation.updateMany({
        where: {
          id: res.id,
          status: "RESERVED",
          expiresAt: { lt: new Date() },
          OR: [
            { heartbeatAt: null },
            { heartbeatAt: { lte: recentHeartbeatThreshold } },
          ],
        },
        data: { status: "FINALIZED" },
      });
      if (updated.count === 1) {
        await tx.institutionStorageUsage.update({
          where: { institutionId },
          data: { usedBytes: { increment: res.fileSizeBytes }, reservedBytes: { decrement: res.fileSizeBytes } },
        });
      }
    } else {
      const recentHeartbeatThreshold = new Date(Date.now() - 60 * 1000);
      const updated = await tx.storageUploadReservation.updateMany({
        where: {
          id: res.id,
          status: "RESERVED",
          expiresAt: { lt: new Date() },
          OR: [
            { heartbeatAt: null },
            { heartbeatAt: { lte: recentHeartbeatThreshold } },
          ],
        },
        data: { status: "RELEASED" },
      });
      if (updated.count === 1) {
        await tx.institutionStorageUsage.update({
          where: { institutionId },
          data: { reservedBytes: { decrement: res.fileSizeBytes } },
        });
      }
    }
  }
}

export async function reconcileStorageUsage(
  tx: Prisma.TransactionClient,
  institutionId: string,
  actualBytes: bigint,
) {
  // Lock the institution row first — same acquisition order as reserveStorage,
  // heartbeatReservation, and recoverExpiredReservations — to prevent deadlocks
  // when those functions run concurrently with reconciliation.
  await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${institutionId}::uuid FOR UPDATE`;
  const usage = await tx.institutionStorageUsage.findUnique({ where: { institutionId } });
  if (!usage) {
    await tx.institutionStorageUsage.create({ data: { institutionId, usedBytes: actualBytes, reservedBytes: BigInt(0) } });
    return;
  }
  // Only correct usedBytes when no reservations are in flight.
  // If reservations exist, their bytes are still reserved and must not be double-counted
  // against Supabase objects that may already include in-progress uploads.
  if (usage.reservedBytes === BigInt(0)) {
    const updated = await tx.institutionStorageUsage.updateMany({
      where: { institutionId, reservedBytes: usage.reservedBytes },
      data: { usedBytes: actualBytes },
    });
    if (updated.count === 0) {
      throw new Error(
        `Storage reconciliation failed: concurrent modification detected for institution ${institutionId}`,
      );
    }
  }
}

/**
 * Compute the byte size of a file input supported by uploadCourseMaterialFile.
 * File/Blob expose .size; Buffer/Uint8Array expose .byteLength (or .length).
 * Throws StorageCapacityError for unknown or invalid sizes.
 */
export function computeFileSize(file: File | Blob | Buffer | Uint8Array): number {
  if (file instanceof File || file instanceof Blob) {
    const size = file.size;
    // Reject zero-byte files: the DB enforces fileSizeBytes > 0 and a zero-byte
    // upload has no meaningful content to store or account for.
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
      throw new StorageCapacityError("File must not be empty.", 400);
    }
    return size;
  }
  if (file instanceof Buffer || file instanceof Uint8Array) {
    const byteLength = file.byteLength ?? file.length;
    if (typeof byteLength !== "number" || !Number.isFinite(byteLength) || byteLength <= 0) {
      throw new StorageCapacityError("File must not be empty.", 400);
    }
    return byteLength;
  }
  throw new StorageCapacityError("Unsupported file type.", 400);
}
