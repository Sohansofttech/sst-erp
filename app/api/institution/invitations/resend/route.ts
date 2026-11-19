import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { provisionInstitutionAdmin } from "@/lib/services/institution-provisioning.service";

export async function POST(request: NextRequest) {
  const actor = await requireSuperAdmin();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = z.object({ institutionId: z.uuid(), adminName: z.string().trim().min(2).max(160).optional(), adminEmail: z.email().optional(), adminPhone: z.string().trim().max(40).optional() }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Valid institution and administrator details are required." }, { status: 400 });
  }
  const result = await provisionInstitutionAdmin({
    institutionId: parsed.data.institutionId,
    adminName: parsed.data.adminName,
    adminEmail: parsed.data.adminEmail,
    adminPhone: parsed.data.adminPhone,
    actorUserId: actor.id ?? undefined,
    resend: true,
  });
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, invitation: result.invitation });
}
