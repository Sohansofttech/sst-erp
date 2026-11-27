/**
 * SAF-007 codemod: insert requireReadReq/requireWriteReq guards into every exported
 * admin API handler, immediately after the resolved-context statement.
 *
 * Conservative and idempotent:
 * - Skips handlers already containing requireRead/requireWrite/requireReadReq/requireWriteReq.
 * - Supports the common patterns:
 *     const ctx = await resolveAdminContext(req)         -> requireXxxReq(req, ctx.institutionId)
 *     const { institutionId } = await resolveAdminContext(req) -> requireXxxReq(req, institutionId)
 *     const { institutionId: inst } = ...                 -> requireXxxReq(req, inst)
 * - Logs any handler it cannot handle for manual review.
 * - Adds the import once per file.
 *
 * Run: npx tsx scripts/apply-support-access-codemod.ts
 */
import ts from "typescript";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "app/api/admin");
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
const RESOLVERS = ["resolveAdminContext", "requireActiveSubscription", "resolveDivisionContext"];
const EXCLUSIONS = new Set([
  "app/api/admin/subscriptions/order/route.ts",
  "app/api/admin/subscriptions/verify/route.ts",
]);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.name === "route.ts") out.push(full);
  }
  return out;
}

function hasGuard(fn: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const id = n.expression.text;
      if (["requireRead", "requireWrite", "requireReadReq", "requireWriteReq", "assertSupportAccess"].includes(id)) found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return found;
}

function firstParamName(fn: ts.FunctionLikeDeclaration): string | null {
  const p = fn.parameters[0];
  if (p && ts.isIdentifier(p.name)) return p.name.text;
  return null;
}

interface CtxInfo {
  instExpr: string;
  insertAfter: ts.Node;
}

function findCtx(fn: ts.Node): CtxInfo | null {
  let result: CtxInfo | null = null;
  const visit = (n: ts.Node) => {
    if (result) return;
    if (ts.isVariableStatement(n)) {
      for (const decl of n.declarationList.declarations) {
        const init = decl.initializer;
        const isResolver =
          init &&
          ts.isAwaitExpression(init) &&
          ts.isCallExpression(init.expression) &&
          ts.isIdentifier(init.expression.expression) &&
          RESOLVERS.includes(init.expression.expression.text);
        if (!isResolver) continue;
        if (ts.isIdentifier(decl.name)) {
          result = { instExpr: `${decl.name.text}.institutionId`, insertAfter: n };
        } else if (ts.isObjectBindingPattern(decl.name)) {
          for (const el of decl.name.elements) {
            if (ts.isIdentifier(el.name) && el.name.text === "institutionId") {
              result = { instExpr: "institutionId", insertAfter: n };
            } else if (el.propertyName && (ts.isIdentifier(el.propertyName) || ts.isStringLiteral(el.propertyName)) && el.propertyName.text === "institutionId" && ts.isIdentifier(el.name)) {
              result = { instExpr: el.name.text, insertAfter: n };
            }
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return result;
}

async function main() {
  const files = (await walk(ROOT)).sort();
  const manual: string[] = [];
  let changedFiles = 0;
  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
    if (EXCLUSIONS.has(rel)) continue;
    let src = await fs.readFile(file, "utf8");
    let sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const inserts: { pos: number; text: string }[] = [];
    const handled: { name: string; method: string }[] = [];

    const collect = (node: ts.Node) => {
      const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (ts.isFunctionDeclaration(node) && node.name && isExported) {
        const m = node.name.text.toUpperCase();
        if (METHODS.includes(m) && !hasGuard(node)) {
          const reqName = firstParamName(node) ?? "req";
          const ctx = findCtx(node);
          if (!ctx) {
            manual.push(`${rel} :: ${node.name.text} (no resolver found)`);
            return;
          }
          const guard = m === "GET" || m === "HEAD" ? "requireReadReq" : "requireWriteReq";
          inserts.push({ pos: ctx.insertAfter.getEnd(), text: `\n    await ${guard}(${reqName}, ${ctx.instExpr});` });
          handled.push({ name: node.name.text, method: m });
        }
      }
      ts.forEachChild(node, collect);
    };
    collect(sf);

    if (handled.length === 0) continue;

    // Apply inserts from the end to keep positions valid.
    inserts.sort((a, b) => b.pos - a.pos);
    for (const ins of inserts) {
      src = src.slice(0, ins.pos) + ins.text + src.slice(ins.pos);
    }

    // Ensure import exists.
    if (!/from "@\/lib\/security\/support-access"/.test(src)) {
      const importLine = `import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";\n`;
      // insert after the last top-level import
      sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      let lastImportEnd = 0;
      for (const st of sf.statements) {
        if (ts.isImportDeclaration(st)) lastImportEnd = st.getEnd();
      }
      src = src.slice(0, lastImportEnd) + "\n" + importLine + src.slice(lastImportEnd);
    }

    await fs.writeFile(file, src, "utf8");
    changedFiles++;
    console.log(`patched ${rel}: ${handled.map((h) => h.method + " " + h.name).join(", ")}`);
  }
  console.log(`\nFiles changed: ${changedFiles}`);
  if (manual.length) {
    console.log("\nMANUAL REVIEW NEEDED:");
    for (const m of manual) console.log("  " + m);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});