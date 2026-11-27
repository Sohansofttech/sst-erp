import { db } from "@/lib/db";
import { supabaseStorage, COURSE_MATERIALS_BUCKET } from "@/lib/supabase/storage";
import { reconcileStorageUsage } from "@/lib/billing/storage-capacity";

export type ObjectExistence = "exists" | "missing" | "unknown";

export async function objectExists(path: string): Promise<ObjectExistence> {
  try {
    const parts = path.split("/");
    const folder = parts.slice(0, -1).join("/");
    const name = parts[parts.length - 1];
    const { data, error } = await supabaseStorage.storage.from(COURSE_MATERIALS_BUCKET).list(folder, { limit: 1, search: name });
    if (error) return "unknown";
    if (data && data.some((o) => o.name === name)) return "exists";
    return "unknown";
  } catch {
    return "unknown";
  }
}

interface SupabaseObjectEntry {
  name: string;
  size: number | null;
  isFolder: boolean;
}

async function listDirectoryContents(
  bucket: string,
  dirPath: string,
): Promise<SupabaseObjectEntry[]> {
  const results: SupabaseObjectEntry[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { data, error } = await supabaseStorage.storage.from(bucket).list(dirPath, { limit, offset });
    if (error) {
      throw new Error(
        `Supabase listing failed for bucket "${bucket}" dir "${dirPath}": ${error.message}`,
      );
    }
    if (!data) break;
    for (const obj of data) {
      const isFolder = obj.metadata == null || obj.metadata.size == null;
      results.push({
        name: obj.name,
        size: obj.metadata?.size ?? null,
        isFolder,
      });
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return results;
}

export async function reconcileInstitutionStorage(institutionId: string): Promise<{ usedBytes: bigint; orphans: string[] }> {
  const orphans: string[] = [];
  let totalBytes = BigInt(0);

  async function processDirectory(dirPath: string): Promise<void> {
    const entries = await listDirectoryContents(COURSE_MATERIALS_BUCKET, dirPath);
    for (const entry of entries) {
      const fullPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
      if (entry.isFolder) {
        await processDirectory(fullPath);
      } else if (entry.size !== null) {
        totalBytes += BigInt(entry.size);
        const reservation = await db.storageUploadReservation.findFirst({ where: { institutionId, objectPath: fullPath } });
        if (!reservation) {
          orphans.push(fullPath);
        }
      }
    }
  }

  await processDirectory(institutionId);

  await db.$transaction(async (tx) => {
    await reconcileStorageUsage(tx, institutionId, totalBytes);
  });
  return { usedBytes: totalBytes, orphans };
}
