import { ForbiddenError } from "@/lib/auth/session";
import db from "@/lib/db";

type InstitutionAdminContext = {
  email: string;
  userInstitutionId: string | null;
};

type MembershipLookup = (email: string, institutionId: string) => Promise<boolean>;

async function hasActiveInstitutionAdminMembership(email: string, institutionId: string): Promise<boolean> {
  const platformUsers = await db.platformUser.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
    take: 2,
  });

  if (platformUsers.length !== 1) {
    return false;
  }

  const membership = await db.institutionMembership.findFirst({
    where: {
      userId: platformUsers[0].id,
      institutionId,
      status: "ACTIVE",
      roles: {
        some: {
          institutionId,
          role: {
            institutionId,
            code: { in: ["INSTITUTION_ADMIN", "ADMIN"] },
          },
        },
      },
    },
    select: { id: true },
  });

  return membership !== null;
}

export async function assertInstitutionAdminMembership(
  context: InstitutionAdminContext,
  requestedInstitutionId: string,
  lookup: MembershipLookup = hasActiveInstitutionAdminMembership,
): Promise<void> {
  if (!context.email || !context.userInstitutionId || context.userInstitutionId !== requestedInstitutionId) {
    throw new ForbiddenError("Access denied: Account does not belong to this institution.");
  }

  if (!await lookup(context.email, requestedInstitutionId)) {
    throw new ForbiddenError("Access denied: Account does not have an active administrator membership for this institution.");
  }
}
