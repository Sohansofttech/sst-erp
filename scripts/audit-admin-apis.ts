import * as fs from "fs";
import * as path from "path";

const apiDir = path.join(process.cwd(), "app/api/admin");

function inspectRoutes(dir: string, base = ""): Array<{ endpoint: string; hasDb: boolean; hasMock: boolean; methods: string[] }> {
  let results: Array<{ endpoint: string; hasDb: boolean; hasMock: boolean; methods: string[] }> = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(inspectRoutes(fullPath, `${base}/${entry.name}`));
    } else if (entry.name === "route.ts" || entry.name === "route.js") {
      const content = fs.readFileSync(fullPath, "utf-8");
      const hasDb = content.includes("db.") || content.includes("prisma.") || content.includes("$queryRaw") || content.includes("institution-admin.service");
      const hasMock = content.includes("mock") || content.includes("MOCK") || content.includes("demoData");
      const methods: string[] = [];
      if (/export\s+async\s+function\s+GET/i.test(content)) methods.push("GET");
      if (/export\s+async\s+function\s+POST/i.test(content)) methods.push("POST");
      if (/export\s+async\s+function\s+PUT/i.test(content)) methods.push("PUT");
      if (/export\s+async\s+function\s+DELETE/i.test(content)) methods.push("DELETE");
      if (/export\s+async\s+function\s+PATCH/i.test(content)) methods.push("PATCH");

      results.push({
        endpoint: `/api/admin${base}`,
        hasDb,
        hasMock,
        methods,
      });
    }
  }

  return results;
}

const audited = inspectRoutes(apiDir);
console.log(`Audited ${audited.length} Admin API Endpoints:\n`);
audited.forEach(a => {
  const status = a.hasDb ? "✔ DB-Wired" : (a.hasMock ? "⚠ Mock Data" : "❌ No DB");
  console.log(`${a.endpoint.padEnd(38)} [${a.methods.join(", ")}] -> ${status}`);
});
