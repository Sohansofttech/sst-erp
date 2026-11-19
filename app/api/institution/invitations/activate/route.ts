import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/super-admin/prisma";
import { hashInvitationToken } from "@/lib/services/institution-invitation.service";
import { validatePasswordStrength, hashPassword, checkPwnedPassword } from "@/lib/auth/password-security";

const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json({ success: false, error: "Too many activation attempts. Try again later." }, { status: 429 });
  }

  let body: { token?: string; password?: string; confirmPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) return NextResponse.json({ success: false, error: "Activation token is required." }, { status: 400 });
  if (!body.password || body.password !== body.confirmPassword) {
    return NextResponse.json({ success: false, error: "Passwords are required and must match." }, { status: 400 });
  }

  const tokenHash = hashInvitationToken(token);
  const invitation = await prisma.institutionAdminInvitation.findUnique({
    where: { tokenHash },
    include: { institution: { select: { id: true, name: true, status: true, archivedAt: true } } },
  });
  if (!invitation) return NextResponse.json({ success: false, error: "Invalid or already used activation link." }, { status: 400 });
  if (invitation.status === "ACCEPTED") return NextResponse.json({ success: false, error: "This activation link has already been used." }, { status: 400 });
  if (invitation.status === "REVOKED") return NextResponse.json({ success: false, error: "This activation link has been revoked." }, { status: 400 });
  if (invitation.status === "EXPIRED" || invitation.expiresAt <= new Date()) {
    await prisma.institutionAdminInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ success: false, error: "This activation link has expired." }, { status: 400 });
  }
  if (invitation.status !== "SENT") {
    return NextResponse.json({ success: false, error: "This invitation is not ready for activation." }, { status: 400 });
  }
  if (invitation.institution.archivedAt || invitation.institution.status === "SUSPENDED") {
    return NextResponse.json({ success: false, error: "This institution is not operational." }, { status: 403 });
  }

  const appUser = await prisma.user.findUnique({ where: { id: invitation.platformUserId } });
  if (!appUser || appUser.institutionId !== invitation.institutionId) {
    return NextResponse.json({ success: false, error: "Administrator account association is invalid." }, { status: 400 });
  }

  const passwordCheck = validatePasswordStrength(body.password, { email: invitation.email, fullName: appUser.fullName || appUser.name || undefined });
  if (!passwordCheck.valid) {
    return NextResponse.json({ success: false, error: passwordCheck.errors.join(" ") }, { status: 400 });
  }
  const pwned = await checkPwnedPassword(body.password);
  if (pwned.compromised) {
    return NextResponse.json({ success: false, error: "This password appears in known breach data. Choose a different password." }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.password);
  const acceptedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.institutionAdminInvitation.updateMany({
        where: { id: invitation.id, status: "SENT", expiresAt: { gt: new Date() } },
        data: { status: "ACCEPTED", acceptedAt },
      });
      if (consumed.count !== 1) throw new Error("This activation link has already been used or expired.");
      await tx.user.update({
        where: { id: invitation.platformUserId },
        data: { passwordHash, isActive: true, status: "ACTIVE", emailVerifiedAt: acceptedAt, lastLoginAt: null },
      });
      await tx.platformUser.update({
        where: { id: invitation.platformUserId },
        data: { status: "ACTIVE", emailVerifiedAt: acceptedAt },
      });
      await tx.institutionMembership.updateMany({
        where: { userId: invitation.platformUserId, institutionId: invitation.institutionId },
        data: { status: "ACTIVE", joinedAt: acceptedAt },
      });
      await tx.platformInstitution.update({
        where: { id: invitation.institutionId },
        data: { provisioningStatus: "ACTIVATED", onboardingStage: "COMPLETED" },
      });
      await tx.platformAuditLog.create({
        data: {
          institutionId: invitation.institutionId,
          userId: invitation.platformUserId,
          action: "INSTITUTION_ADMIN_ACTIVATED",
          entity: "InstitutionAdminInvitation",
          entityId: invitation.id,
          result: "SUCCESS",
          metadata: { email: invitation.email },
        },
      });
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Activation failed." }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: "Account activated successfully.",
    redirectUrl: "/admin/login",
  });
}
