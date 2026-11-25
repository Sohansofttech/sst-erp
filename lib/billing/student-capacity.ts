import { Prisma } from "@prisma/client";
import { countInstitutionStudents } from "@/lib/billing/student-usage";

export class StudentCapacityError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "StudentCapacityError";
  }
}

export async function assertStudentRegistrationCapacity(
  tx: Prisma.TransactionClient,
  institutionId: string,
) {
  const lockedInstitutions = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM institutions
    WHERE id = ${institutionId}::uuid
    FOR UPDATE
  `;
  if (lockedInstitutions.length === 0) {
    throw new StudentCapacityError("The institution record is unavailable.", 403);
  }

  const now = new Date();
  const subscription = await tx.institutionSubscription.findFirst({
    where: {
      institutionId,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: { startsAt: "desc" },
    select: { plan: { select: { studentLimit: true } } },
  });
  if (!subscription) {
    throw new StudentCapacityError(
      "An active subscription is required before registering students.",
      403,
    );
  }

  const registeredStudents = await countInstitutionStudents(tx, institutionId);
  const studentLimit = subscription.plan.studentLimit;
  if (studentLimit !== null && registeredStudents >= studentLimit) {
    throw new StudentCapacityError(
      `The student limit of ${studentLimit} has been reached. Upgrade the institution plan to register more students.`,
      409,
    );
  }

  return { registeredStudents, studentLimit };
}
