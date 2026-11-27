import type { Prisma } from "@prisma/client";
import db from "@/lib/db";

export function isInstitutionLifecycleOperational(status: string | null | undefined): boolean {
  return status === "ACTIVE" || status === "PENDING";
}

export function toApplicationInstitutionLifecycleData(institution: {
  name: string;
  code: string | null;
  slug: string;
  type: string;
  status: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
}) {
  return {
    name: institution.name,
    code: institution.code || institution.slug,
    slug: institution.slug,
    type: institution.type,
    status: institution.status,
    email: institution.email,
    phone: institution.phone,
    address: institution.address,
    city: institution.city,
    state: institution.state,
    country: institution.country,
    isActive: !["SUSPENDED", "ARCHIVED"].includes(institution.status),
  };
}

export async function updateInstitutionLifecycle(
  tx: Prisma.TransactionClient,
  institutionId: string,
  data: Prisma.PlatformInstitutionUpdateInput
) {
  const platformInstitution = await tx.platformInstitution.update({
    where: { id: institutionId },
    data,
  });

  // Keep this mapping aligned with syncInstitutionToAppDb: PENDING remains
  // available for onboarding/recovery; suspension and archival disable access.
  const applicationData = toApplicationInstitutionLifecycleData(platformInstitution);

  await tx.institution.upsert({
    where: { id: institutionId },
    create: { id: institutionId, ...applicationData } as Prisma.InstitutionUncheckedCreateInput,
    update: applicationData as Prisma.InstitutionUncheckedUpdateInput,
  });

  return platformInstitution;
}

/**
 * Checks both records so stale application rows cannot preserve tenant access.
 * ACTIVE and PENDING are operational under the existing login/onboarding rules.
 * Both UUID and legacy non-UUID institution IDs are validated against the
 * database records; unknown IDs return false.
 */
export async function isInstitutionOperational(institutionId: string): Promise<boolean> {
  if (!institutionId) return false;

  const rows = await db.$queryRaw<Array<{
    platformStatus: string | null;
    archivedAt: Date | null;
    applicationStatus: string | null;
    applicationActive: boolean | null;
  }>>`
    SELECT pi.status AS "platformStatus", pi."archivedAt" AS "archivedAt",
           i.status AS "applicationStatus", i."isActive" AS "applicationActive"
    FROM "Institution" pi
    FULL OUTER JOIN institutions i ON i.id::text = pi.id::text
    WHERE COALESCE(pi.id::text, i.id::text) = ${institutionId}
    LIMIT 1
  `;

  const institution = rows[0];
  if (!institution || institution.archivedAt) return false;
  if (institution.applicationActive === false) return false;

  // Platform records are authoritative for UUID institutions. Legacy non-UUID
  // institutions (inst_*) may exist only in the application database.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(institutionId);
  if (isUuid && !institution.platformStatus) return false;

  if (institution.platformStatus && !isInstitutionLifecycleOperational(institution.platformStatus)) return false;
  if (institution.applicationStatus && !isInstitutionLifecycleOperational(institution.applicationStatus)) return false;

  // A platform record may exist before the application institution is provisioned.
  return Boolean(institution.platformStatus || institution.applicationStatus) &&
    (!institution.platformStatus || isInstitutionLifecycleOperational(institution.platformStatus)) &&
    (!institution.applicationStatus || isInstitutionLifecycleOperational(institution.applicationStatus));
}
