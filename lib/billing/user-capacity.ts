import { Prisma } from "@prisma/client";

export class UserCapacityError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "UserCapacityError";
  }
}

export async function assertUserRegistrationCapacity(
  tx: Prisma.TransactionClient,
  institutionId: string,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Institution" WHERE id = ${institutionId}::uuid FOR UPDATE
  `;
  if (locked.length === 0) {
    throw new UserCapacityError("The institution record is unavailable.", 403);
  }

  const now = new Date();
  const subscription = await tx.institutionSubscription.findFirst({
    where: {
      institutionId,
      status: { in: ["ACTIVE", "TRIALING"] },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: { startsAt: "desc" },
    select: { plan: { select: { maxUsers: true } } },
  });
  if (!subscription) {
    throw new UserCapacityError("An active subscription is required before registering users.", 403);
  }

  const maxUsers = subscription.plan.maxUsers;
  if (maxUsers === null) return { maxUsers: null };

  const activeUsers = await tx.user.count({
    where: {
      institutionId,
      status: "ACTIVE",
      platformRole: { not: "SUPER_ADMIN" },
      role: { in: ["ADMIN", "TEACHER", "STAFF", "PARENT"] },
    },
  });
  if (activeUsers >= maxUsers) {
    throw new UserCapacityError(`The user limit of ${maxUsers} has been reached.`, 409);
  }
  return { maxUsers, activeUsers };
}
