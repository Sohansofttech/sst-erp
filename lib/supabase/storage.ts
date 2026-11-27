import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import {
  reserveStorage,
  finalizeStorageReservation,
  releaseStorageReservation,
  heartbeatReservation,
  recoverExpiredReservations,
  computeFileSize,
  StorageCapacityError,
} from "@/lib/billing/storage-capacity";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

export const supabaseStorage = createClient(supabaseUrl, supabaseKey);

export const COURSE_MATERIALS_BUCKET = "course-materials";

export interface UploadMaterialParams {
  file: Buffer | Uint8Array | Blob | File;
  filename: string;
  contentType?: string;
  institutionId?: string;
  folder?: string;
}

export interface UploadMaterialResult {
  publicUrl: string;
  filePath: string;
  fileSizeLabel?: string;
}

export async function uploadCourseMaterialFile({
  file,
  filename,
  contentType,
  institutionId,
  folder = "materials",
}: UploadMaterialParams): Promise<UploadMaterialResult> {
  if (!institutionId) {
    throw new Error("institutionId is required for storage tenant isolation.");
  }

  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  const timestamp = Date.now();
  const filePath = `${institutionId}/${folder}/${timestamp}_${sanitizedFilename}`;

  const size = computeFileSize(file);
  let reservationId: string | null = null;

  const sub = await db.institutionSubscription.findFirst({
    where: { institutionId, status: { in: ["ACTIVE", "TRIALING"] }, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
    orderBy: { startsAt: "desc" },
    select: { plan: { select: { storageLimitMb: true } } },
  });
  // No valid active/trialing subscription: reject the upload (no quota bypass).
  if (!sub) {
    throw new StorageCapacityError(
      "An active subscription is required before uploading files.",
      403,
    );
  }
  const limitMb = sub.plan?.storageLimitMb;
  // null storageLimitMb = unlimited (established plan convention); a numeric
  // limit requires a reservation before upload. Never upload without the check.
  if (limitMb !== null && limitMb !== undefined) {
    const storageLimitBytes = BigInt(limitMb) * BigInt(1024 * 1024);
    reservationId = await db.$transaction(async (tx) => {
      // Run expired-reservation recovery under the same per-institution lock
      // before reserving, so stale reservations cannot block new uploads.
      await recoverExpiredReservations(tx, institutionId, buildObjectExistsProbe());
      return reserveStorage(tx, institutionId, size, storageLimitBytes, filePath);
    });
  }

  let heartbeatTimer: any = null;
  let heartbeatFailureCount = 0;
  let heartbeatInProgress = false;
  const MAX_HEARTBEAT_FAILURES = 3;

  if (reservationId) {
    heartbeatTimer = setInterval(async () => {
      if (heartbeatInProgress) return;
      heartbeatInProgress = true;
      try {
        await db.$transaction(async (tx) => {
          await heartbeatReservation(tx, reservationId!);
        });
        heartbeatFailureCount = 0;
      } catch (e) {
        heartbeatFailureCount++;
        console.error("[storage] heartbeat failed", e);
        if (heartbeatFailureCount >= MAX_HEARTBEAT_FAILURES) {
          // Stop heartbeats after repeated failures. Do NOT release the
          // reservation: the upload may still be in progress and must remain
          // recoverable. The upload itself will either succeed (finalize below)
          // or fail (release in the upload-error branch).
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      } finally {
        heartbeatInProgress = false;
      }
    }, 60000);
  }

  const resolvedContentType = contentType || getMimeTypeFromFilename(sanitizedFilename);

  try {
    const { error: uploadError } = await supabaseStorage.storage
      .from(COURSE_MATERIALS_BUCKET)
      .upload(filePath, file, { contentType: resolvedContentType, upsert: true });

    if (uploadError) {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reservationId) {
        try {
          await db.$transaction(async (tx) => {
            await releaseStorageReservation(tx, reservationId);
          });
        } catch {}
      }
      throw new Error(`File upload failed: ${uploadError.message || "Unknown storage error"}`);
    }

    // Supabase upload succeeded. Do NOT release the reservation on subsequent
    // failures; leave it RESERVED so reconciliation can recover the object.
    if (reservationId) {
      await db.$transaction(async (tx) => {
        await heartbeatReservation(tx, reservationId);
        await finalizeStorageReservation(tx, reservationId);
      });
    }

    const { data: publicUrlData } = supabaseStorage.storage.from(COURSE_MATERIALS_BUCKET).getPublicUrl(filePath);

    if (heartbeatTimer) clearInterval(heartbeatTimer);
    return { publicUrl: publicUrlData.publicUrl, filePath };
  } catch (e) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    // If the Supabase upload succeeded but a later step (finalize / getPublicUrl)
    // failed, the reservation is intentionally left RESERVED for recovery.
    // Do not release it here, otherwise the uploaded object would never be counted.
    throw e;
  }
}

function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "doc": return "application/msword";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "ppt": return "application/vnd.ms-powerpoint";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "xls": return "application/vnd.ms-excel";
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "mp4": return "video/mp4";
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "txt": return "text/plain";
    default: return "application/octet-stream";
  }
}

/**
 * Builds an object-existence probe backed by the Supabase storage listing API.
 * Returns the actual object size when the object is found. A successful listing
 * that does not contain the object is NOT treated as definitive absence — the
 * listing API can be eventually consistent or filtered — so it reports "unknown"
 * to avoid releasing a reservation whose object may actually exist. Only a
 * positive, verified match yields "exists"; absence is never assumed here.
 */
function buildObjectExistsProbe(): (path: string) => Promise<{ state: "exists" | "missing" | "unknown"; size?: number }> {
  return async (path: string) => {
    try {
      const lastSlash = path.lastIndexOf("/");
      const folder = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
      const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
      const { data, error } = await supabaseStorage.storage
        .from(COURSE_MATERIALS_BUCKET)
        .list(folder, { search: name, limit: 100 });
      if (error) return { state: "unknown" };
      if (!Array.isArray(data)) return { state: "unknown" };
      const match = data.find((entry: any) => entry?.name === name);
      // No verified match: absence is not reliably established by list(), so do
      // not release the reservation — report "unknown".
      if (!match) return { state: "unknown" };
      const size = typeof match.metadata?.size === "number" ? match.metadata.size : undefined;
      return { state: "exists", size };
    } catch {
      return { state: "unknown" };
    }
  };
}
