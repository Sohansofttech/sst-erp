import "dotenv/config";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as login } from "../app/api/auth/login/route";
import { prisma } from "../lib/super-admin/prisma";
import { isSupportContextAllowed } from "../lib/auth/support-access";
import { SUPPORT_ACCESS_COOKIE_NAME, signGoogleLoginProof, verifyToken, AUTH_COOKIE_NAME } from "../lib/auth/jwt";

async function loginAs(email: string, institutionCode: string) {
  const googleProof = await signGoogleLoginProof({ email, role: "ADMIN" });
  const req = new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginType: "GOOGLE", googleProof, email, institutionCode, portalRole: "ADMIN" }),
  });
  const res = await login(req);
  return { res, body: await res.json() };
}

async function main() {
  const [arohan, agra] = await Promise.all([
    prisma.platformInstitution.findFirst({ where: { name: { contains: "Aarohan", mode: "insensitive" } } }),
    prisma.platformInstitution.findFirst({ where: { name: { contains: "Agra", mode: "insensitive" } } }),
  ]);
  assert(arohan && agra && arohan.id !== agra.id, "Both institutions must exist and differ");
  assert.notEqual(arohan.code?.toLowerCase(), agra.code?.toLowerCase());

  const adminOf = async (institutionId: string) =>
    (
      await prisma.$queryRaw<{ email: string }[]>`
        SELECT email FROM users
        WHERE "institutionId" = ${institutionId} AND role::text = 'ADMIN'
          AND "isActive" = true AND status::text = 'ACTIVE' LIMIT 1`
    )[0];
  const [arohanAdmin, agraAdmin] = await Promise.all([adminOf(arohan.id), adminOf(agra.id)]);
  assert(arohanAdmin && agraAdmin, "Each institution needs an admin");

  // A: Arohan code + Arohan admin -> Arohan session only; stale support cookie cleared
  const a = await loginAs(arohanAdmin.email, arohan.code!.toLowerCase());
  assert.equal(a.res.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.data.user.institutionId, arohan.id);
  const tokenA = a.res.cookies.get(AUTH_COOKIE_NAME)?.value;
  assert.equal((await verifyToken(tokenA!))?.institutionId, arohan.id);
  const cleared = a.res.cookies.get(SUPPORT_ACCESS_COOKIE_NAME);
  assert(cleared && cleared.value === "", "Login must clear any support cookie");

  // B: Agra code + Agra admin -> Agra only
  const b = await loginAs(agraAdmin.email, ` ${agra.code} `);
  assert.equal(b.res.status, 200, JSON.stringify(b.body));
  assert.equal(b.body.data.user.institutionId, agra.id);

  // C: Arohan code + Agra admin -> rejected, no session cookie
  const c = await loginAs(agraAdmin.email, arohan.code!);
  assert(c.res.status >= 400, "Cross-institution login must be rejected");
  assert(!c.res.cookies.get(AUTH_COOKIE_NAME)?.value, "No session may be issued");

  // Unknown code is rejected, and an institution id is not accepted as a code
  assert.equal((await loginAs(arohanAdmin.email, "NO-SUCH-CODE")).res.status, 400);
  assert.equal((await loginAs(arohanAdmin.email, arohan.id)).res.status, 400);

  // D: a stale support context never applies to a non-Super-Admin session
  const kiran = "e609b2d1-7609-4348-a928-c25d3410c7a2";
  assert.equal(isSupportContextAllowed({ userId: "admin-1", role: "ADMIN" }, kiran), false);
  assert.equal(isSupportContextAllowed({ userId: "other", role: "SUPER_ADMIN" }, kiran), false);
  assert.equal(isSupportContextAllowed(null, kiran), false);
  assert.equal(isSupportContextAllowed({ userId: kiran, role: "SUPER_ADMIN" }, kiran), true);

  console.log("Institution admin tenant-selection checks passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
