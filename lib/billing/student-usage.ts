import { Prisma } from "@prisma/client";

export async function countInstitutionStudents(
  client: Pick<Prisma.TransactionClient, "student">,
  institutionId: string,
) {
  return client.student.count({ where: { institutionId } });
}
