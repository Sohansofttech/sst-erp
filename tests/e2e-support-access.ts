import "dotenv/config";
import assert from "node:assert/strict";
import { signGoogleLoginProof } from "../lib/auth/jwt";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3100";
const jar = new Map<string, string>();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    redirect: "manual",
    ...init,
    headers: { ...(init.headers as Record<string, string>), cookie: cookieHeader() },
  });
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i);
    const value = pair.slice(i + 1);
    if (!value || /expires=Thu, 01 Jan 1970/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
  return res;
}

function actionFields(html: string, institutionId: string): FormData {
  const idx = html.indexOf(`value="${institutionId}"`);
  assert(idx > 0, "institution row not found in HTML");
  const start = html.lastIndexOf("<form", idx);
  const end = html.indexOf("</form>", idx);
  const form = html.slice(start, end);
  const fd = new FormData();
  for (const m of form.matchAll(/<input[^>]*>/g)) {
    const name = m[0].match(/name="([^"]+)"/)?.[1];
    const value = m[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if (name) fd.set(name, value);
  }
  return fd;
}

async function findRowHtml(institutionName: string, institutionId: string) {
  const res = await call(`/super-admin/institutions?q=${encodeURIComponent(institutionName.slice(0, 20))}`);
  assert.equal(res.status, 200);
  return res.text();
}

async function main() {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const inst = async (status: string, like?: string) =>
    (await pool.query(
      `select id,name from public."Institution" where status::text=$1 and "archivedAt" is null and ($2::text is null or name ilike $2) order by "createdAt" limit 1`,
      [status, like ?? null]
    )).rows[0];

  const proof = await signGoogleLoginProof({ email: "kiran@junkitout.in", role: "SUPER_ADMIN" });
  const login = await call("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginType: "GOOGLE", googleProof: proof, email: "kiran@junkitout.in", portalRole: "SUPER_ADMIN" }),
  });
  assert.equal(login.status, 200, "Super Admin login");
  const before = await (await call("/super-admin/institutions")).text();
  assert(!before.includes("Super Admin access required"), "Super Admin pages load");
  console.log("1 Super Admin login + Institution Management: OK");

  // Non-active institutions: friendly message, no error, status unchanged
  for (const [status, expect] of [["PENDING", /not activated yet/], ["SUSPENDED", /suspended/]] as const) {
    const row = await inst(status);
    const html = await findRowHtml(row.name, row.id);
    const res = await call("/super-admin/institutions", { method: "POST", body: actionFields(html, row.id) });
    const loc = res.headers.get("location") || "";
    assert(res.status === 303 || res.status === 307, `${status} should redirect, got ${res.status}`);
    assert(loc.includes(`portalIssue=${status.toLowerCase()}`), `${status} redirect: ${loc}`);
    assert(!jar.has("sst_super_admin_support"), "No support cookie for non-active institution");
    const page = await call(loc.replace(BASE, ""));
    const text = await page.text();
    assert.equal(page.status, 200);
    assert.match(text, expect);
    assert(!/Application error|digest/i.test(text), "No technical error screen");
    const now = (await pool.query(`select status::text s from public."Institution" where id=$1`, [row.id])).rows[0].s;
    assert.equal(now, status, "Status must not change");
    console.log(`2 ${status} institution shows friendly message: OK`);
  }

  // Active institutions: open directly, isolated, return
  for (const like of ["Aarohan%", "Agra%"]) {
    const row = await inst("ACTIVE", like);
    const html = await findRowHtml(row.name, row.id);
    const res = await call("/super-admin/institutions", { method: "POST", body: actionFields(html, row.id) });
    assert.equal(res.headers.get("location")?.replace(BASE, ""), "/admin", `redirect to /admin, got ${res.status}`);
    assert(jar.has("sst_super_admin_support"));

    const admin = await call("/admin");
    assert.equal(admin.status, 200, `/admin status ${admin.status} ${admin.headers.get("location")}`);
    const adminHtml = await admin.text();
    assert(!adminHtml.includes("NEXT_REDIRECT") && !/\/admin\/login/.test(adminHtml.slice(0, 4000)), "no login redirect");

    // Same APIs the dashboard uses: session and institution profile must be the selected institution only
    const me = await (await call("/api/auth/me")).json();
    assert.equal(me.data.session.supportInstitutionId, row.id, "session bound to selected institution");
    assert.equal(me.data.session.institutionId, row.id);
    const settings = await (await call("/api/admin/settings")).json();
    assert.equal(settings.institutionId?.toLowerCase(), row.id.toLowerCase(), "admin API scoped to selected institution");
    assert.equal(settings.data?.id?.toLowerCase(), row.id.toLowerCase());
    const sup = await (await call("/super-admin/institutions")).text();
    assert(!sup.includes("Super Admin access required"), "Super Admin identity intact while support active");

    const sessions = await pool.query(
      `select id,status::text s,"institutionId" from public."SupportAccessSession" where "institutionId"=$1 order by "startsAt" desc limit 1`,
      [row.id]
    );
    assert.equal(sessions.rows[0].s, "ACTIVE");
    const audit = await pool.query(`select 1 from public."AuditLog" where "entityId"=$1 and action='SUPER_ADMIN_INSTITUTION_PORTAL_OPENED'`, [sessions.rows[0].id]);
    assert.equal(audit.rowCount, 1, "open audited");

    const exit = await call("/api/super-admin/support-access/exit", { method: "POST" });
    assert(String(exit.headers.get("location")).includes("/super-admin/institutions"), "exit redirect");
    assert(!jar.has("sst_super_admin_support"), "support cookie cleared");
    const after = await call("/super-admin/institutions");
    const afterHtml = await after.text();
    assert.equal(after.status, 200);
    assert(!afterHtml.includes("Super Admin access required") && !afterHtml.includes("No institutions found"), "list still shows data");
    const closed = await pool.query(`select status::text s from public."SupportAccessSession" where id=$1`, [sessions.rows[0].id]);
    assert.equal(closed.rows[0].s, "REVOKED");
    const exitAudit = await pool.query(`select 1 from public."AuditLog" where "entityId"=$1 and action='SUPER_ADMIN_SUPPORT_ACCESS_EXITED'`, [sessions.rows[0].id]);
    assert.equal(exitAudit.rowCount, 1, "exit audited");
    console.log(`3 ${row.name}: open -> dashboard -> return: OK`);
  }
  await pool.end();
  console.log("E2E support access flow passed");
}

main().catch((e) => { console.error(e); process.exit(1); });

