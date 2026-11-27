/**
 * SAF-007 Support-Access Coverage Inventory (read-only analysis tool).
 *
 * Uses the TypeScript compiler API to inventory every exported HTTP handler in
 * app/api/admin route.ts files and report whether the handler body *references*
 * requireRead() / requireWrite() (or requireReadReq/requireWriteReq, or a direct
 * assertSupportAccess() call with the matching SUPPORT_READ/WRITE action).
 *
 * LIMITATIONS — this is an INVENTORY aid, NOT a proof of correctness:
 * - PRESENCE-ONLY: it detects that a guard is *referenced* somewhere in the
 *   handler body. It does NOT verify the guard's ORDERING (i.e. that the guard
 *   runs before any data access or side effect, and after identity/tenant are
 *   resolved). A guard placed after the protected operation would still count
 *   as "ok" here while being insecure.
 * - NO INDIRECT COVERAGE: it does NOT follow indirect calls through service
 *   layers, helpers, aliases, re-exports, or dynamically dispatched functions.
 *   A handler that authorizes only inside a called service is reported as
 *   MISSING, and a handler that merely imports an unused guard symbol is
 *   reported as covered.
 * - NO BRANCH/CONDITION ANALYSIS: it does not evaluate whether the guard is
 *   reachable on every code path or behind a conditional.
 *
 * Therefore a clean report is necessary but NOT sufficient. A manual,
 * handler-by-handler security review remains required for each file.
 *
 * MANUAL HANDLER-BY-HANDLER SECURITY CHECKLIST (per route.ts, per method):
 *   [ ] Guard call present (requireRead/requireWrite or _Req variant).
 *   [ ] Guard executes BEFORE any DB/service access or side effect.
 *   [ ] Guard executes AFTER actor identity + institution are resolved.
 *   [ ] READ handlers use READ; WRITE handlers use WRITE (no method inference).
 *   [ ] No indirect authorization path is relied upon without a direct guard.
 *   [ ] Excluded handlers are genuinely unreachable by SUPER_ADMIN.
 *
 * Run: npx tsx scripts/verify-support-access-coverage.ts
 * Exit code 1 if any Super-Admin-reachable handler lacks the expected guard call.
 */
import ts from "typescript";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "app/api/admin");
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

// Handlers unreachable by Super Admin (role-excluded auth). Each MUST have a reason.
const EXCLUSIONS: Record<string, string> = {
  "app/api/admin/subscriptions/order/route.ts": "requireInstitutionAdminSession excludes SUPER_ADMIN",
  "app/api/admin/subscriptions/verify/route.ts": "requireInstitutionAdminSession excludes SUPER_ADMIN",
};

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

function methodOf(name: string): Method | null {
  const u = name.toUpperCase();
  return (METHODS as readonly string[]).includes(u) ? (u as Method) : null;
}

function guardCallsInBody(sf: ts.SourceFile, fn: ts.Node): { read: boolean; write: boolean } {
  let read = false;
  let write = false;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const id = n.expression.text;
      if (id === "requireRead" || id === "requireReadReq") read = true;
      if (id === "requireWrite" || id === "requireWriteReq") write = true;
      // Direct assertSupportAccess with a SUPPORT_READ/WRITE argument.
      if (id === "assertSupportAccess") {
        const arg = n.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          for (const p of arg.properties) {
            if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
              const v = p.initializer;
              if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) {
                if (v.text === "READ_SUPPORT_CONTEXT") read = true;
                if (v.text === "WRITE_SUPPORT_CONTEXT") write = true;
              } else if (ts.isIdentifier(v)) {
                if (v.text === "SUPPORT_READ") read = true;
                if (v.text === "SUPPORT_WRITE") write = true;
              }
            }
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  void sf;
  return { read, write };
}

interface Row {
  file: string;
  handler: string;
  method: Method;
  hasRead: boolean;
  hasWrite: boolean;
  ok: boolean;
  note: string;
}

async function main() {
  const files = (await walk(ROOT)).sort();
  const rows: Row[] = [];
  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
    const excluded = EXCLUSIONS[rel];
    const src = await fs.readFile(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    sf.forEachChild((node) => {
      if (!ts.isExportDeclaration && !ts.isFunctionDeclaration(node)) return;
      let name: string | undefined;
      let fn: ts.Node | undefined;
      const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (ts.isFunctionDeclaration(node) && node.name && isExported) {
        name = node.name.text;
        fn = node;
      } else if (ts.isExportDeclaration(node)) {
        // export { GET, POST }
        const clause = node.exportClause;
        if (clause && ts.isNamedExports(clause)) {
          for (const el of clause.elements) {
            const m = methodOf(el.name.text);
            if (m) rows.push({ file: rel, handler: el.name.text, method: m, hasRead: false, hasWrite: false, ok: !!excluded, note: excluded ?? "MISSING (export list)" });
          }
        }
      }
      if (name && fn) {
        const m = methodOf(name);
        if (!m) return;
        const g = guardCallsInBody(sf, fn);
        const expectedRead = m === "GET" || m === "HEAD";
        const ok = !!excluded || (expectedRead ? g.read : g.write);
        rows.push({
          file: rel,
          handler: name,
          method: m,
          hasRead: g.read,
          hasWrite: g.write,
          ok,
          note: excluded ?? (ok ? "" : `MISSING require${expectedRead ? "Read" : "Write"}`),
        });
      }
    });
  }

  const fails = rows.filter((r) => !r.ok);
  const report = { total: rows.length, failing: fails.length, rows };
  await fs.writeFile(path.resolve(process.cwd(), "saf007-coverage.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (fails.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});