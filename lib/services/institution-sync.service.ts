import db from "@/lib/db";

/**
 * Synchronizes an institution record from the platform "Institution" table
 * into the application "institutions" table using the standard app DB client.
 *
 * Kept separate from `institution-provisioning.service.ts` so non-Super-Admin
 * callers (such as login fallback) never transitively depend on `superAdminPrisma`.
 */
export async function syncInstitutionToAppDb(institutionId: string): Promise<boolean> {
  try {
    const rows = await db.$queryRaw<Array<{
      id: string;
      name: string;
      code: string | null;
      slug: string | null;
      type: string | null;
      status: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
      website: string | null;
      createdAt: Date | null;
      updatedAt: Date | null;
    }>>`
      SELECT id, name, code, slug, type, status, email, phone, address, city, state, "postalCode", country, website, "createdAt", "updatedAt"
      FROM "Institution" WHERE id::text = ${institutionId} LIMIT 1
    `;
    if (!rows.length) return false;
    const inst = rows[0];
    await db.$executeRaw`
      INSERT INTO institutions (
        id, code, name, slug, type, status, address, phone, email, website, "isActive", "createdAt", "updatedAt", city, state, country
      ) VALUES (
        ${inst.id}, ${inst.code || inst.slug || "INST-" + inst.id.slice(0, 6)}, ${inst.name}, ${inst.slug},
        ${inst.type || "COLLEGE"}, ${inst.status || "PENDING"}, ${inst.address || null}, ${inst.phone || null},
        ${inst.email || null}, ${inst.website || null}, ${inst.status !== "ARCHIVED" && inst.status !== "SUSPENDED"},
        ${inst.createdAt || new Date()}, ${inst.updatedAt || new Date()}, ${inst.city || null}, ${inst.state || null}, ${inst.country || "India"}
      )
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code, name = EXCLUDED.name, slug = EXCLUDED.slug, type = EXCLUDED.type,
        status = EXCLUDED.status, address = EXCLUDED.address, phone = EXCLUDED.phone, email = EXCLUDED.email,
        website = EXCLUDED.website, "isActive" = EXCLUDED."isActive", "updatedAt" = NOW(),
        city = EXCLUDED.city, state = EXCLUDED.state, country = EXCLUDED.country
    `;
    return true;
  } catch (error) {
    console.error("[InstitutionProvisioning] Sync failed:", error);
    return false;
  }
}
