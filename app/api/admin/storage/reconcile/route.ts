import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { db } from "@/lib/db";
import { reconcileInstitutionStorage } from "@/lib/services/storage-reconciliation.service";
import { assertSupportAccess, SUPPORT_WRITE } from "@/lib/security/support-access";

export async function POST(request: NextRequest) {
  const actor = await requireSuperAdmin();
  const body = await request.json().catch(() => ({}));
  const institutionId = body?.institutionId;
  if (!institutionId || typeof institutionId !== "string") {
    return NextResponse.json({ success: false, error: "institutionId required" }, { status: 400 });
  }
  // SAF-007: storage reconciliation is an institution-scoped WRITE performed by a
  // Super Admin and requires an approved WRITE_SUPPORT_CONTEXT session. The dev
  // bypass can never satisfy this.
  await assertSupportAccess({
    actorId: actor.id,
    institutionId,
    requiredAction: SUPPORT_WRITE,
    developmentMode: actor.developmentMode,
  });
  const inst = await db.platformInstitution.findUnique({ where: { id: institutionId }, select: { id: true } });
  if (!inst) {
    return NextResponse.json({ success: false, error: "Institution not found" }, { status: 404 });
  }
  const result = await reconcileInstitutionStorage(institutionId);

  try {
    await db.platformAuditLog.create({
      data: {
        userId: actor.id ?? undefined,
        institutionId,
        action: "STORAGE_RECONCILED",
        entity: "InstitutionStorage",
        entityId: institutionId,
        result: "SUCCESS",
        metadata: {
          usedBytes: result.usedBytes.toString(),
          orphanCount: result.orphans.length,
        },
      },
    });
  } catch {
    // Audit log failure must not fail the reconciliation response.
  }

  return NextResponse.json({ success: true, data: { usedBytes: result.usedBytes.toString(), orphans: result.orphans } });
}
