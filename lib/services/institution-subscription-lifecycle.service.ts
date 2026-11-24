import "server-only";

import type { Prisma } from "@prisma/client";

export async function lockInstitutionSubscriptionLifecycle(
  tx: Prisma.TransactionClient,
  institutionId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Institution"
    WHERE "id" = ${institutionId}::uuid
    FOR UPDATE
  `;

  if (rows.length !== 1) {
    throw new Error("Institution not found.");
  }
}

export function currentOrScheduledSubscriptionWhere(
  institutionId: string,
  now = new Date(),
): Prisma.InstitutionSubscriptionWhereInput {
  return {
    institutionId,
    status: { in: ["ACTIVE", "TRIALING"] },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

export function currentSubscriptionWhere(
  institutionId: string,
  now = new Date(),
): Prisma.InstitutionSubscriptionWhereInput {
  return {
    ...currentOrScheduledSubscriptionWhere(institutionId, now),
    startsAt: { lte: now },
  };
}
