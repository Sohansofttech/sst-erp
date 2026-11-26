import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: ".env.test", override: true });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL missing from .env.test");
}

const url = new URL(databaseUrl);

if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.port !== "5434" ||
  url.pathname.replace(/^\/+/, "") !== "erp_sst_test"
) {
  throw new Error(
    "Blocked: Prisma local-test config only permits erp_sst_test on port 5434."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
