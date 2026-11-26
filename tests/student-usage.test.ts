import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { countInstitutionStudents } from "../lib/billing/student-usage";

test("counts student usage within the authenticated institution only", async () => {
  let where: unknown;
  const client = {
    student: {
      count: async (args: { where: { institutionId: string } }) => {
        where = args.where;
        return 12;
      },
    },
  } as unknown as Pick<Prisma.TransactionClient, "student">;

  assert.equal(await countInstitutionStudents(client, "institution-1"), 12);
  assert.deepEqual(where, { institutionId: "institution-1" });
});
