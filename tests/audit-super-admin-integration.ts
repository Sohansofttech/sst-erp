import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function run() {
  try {
    const actor: any = await prisma.$queryRaw`
      SELECT * FROM "User" WHERE id = '0c374562-114e-4b53-b649-236dd139b372';
    `;
    console.log("Actor User row in 'User':", actor);

    const allPlatformUsers: any = await prisma.$queryRaw`
      SELECT id, name, email, "platformRole", status, "createdAt" FROM "User";
    `;
    console.log("All users in 'User' table:", allPlatformUsers);

    const adminUsers: any = await prisma.$queryRaw`
      SELECT id, email, "fullName", role, "institutionId", "isActive" FROM "users" WHERE role = 'ADMIN' OR role = 'SUPER_ADMIN';
    `;
    console.log("Admin/SuperAdmin users in 'users' table:", adminUsers);

    const institutionsInSnake: any = await prisma.$queryRaw`
      SELECT * FROM "institutions";
    `;
    console.log("Rows in 'institutions' table:", institutionsInSnake);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
