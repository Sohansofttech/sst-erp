import db from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export interface ProvisionAdminInput {
  institutionId: string;
  adminName?: string;
  adminEmail?: string;
  password?: string;
  actorUserId?: string;
}

export interface ProvisionAdminResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    status: string;
    isActive: boolean;
  };
  institution?: {
    id: string;
    name: string;
    code: string | null;
    slug: string;
  };
  invitationSent?: boolean;
  previewUrl?: string | false;
  invitationError?: string | null;
  error?: string;
}

/**
 * Synchronizes an institution record from table "Institution" (PlatformInstitution)
 * into table "institutions" (App Academic Institution) so all foreign keys and
 * academic queries resolve seamlessly.
 */
export async function syncInstitutionToAppDb(institutionId: string): Promise<boolean> {
  try {
    const rows: any = await db.$queryRaw`
      SELECT id, name, code, slug, type, status, email, phone, address, city, state, "postalCode", country, website, "createdAt", "updatedAt"
      FROM "Institution"
      WHERE id::text = ${institutionId}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) return false;
    const inst = rows[0];

    await db.$executeRaw`
      INSERT INTO institutions (
        id, code, name, slug, type, status, address, phone, email, website, "isActive", "createdAt", "updatedAt", city, state, country
      ) VALUES (
        ${inst.id},
        ${inst.code || inst.slug || "INST-" + inst.id.slice(0, 6)},
        ${inst.name},
        ${inst.slug || null},
        ${inst.type || "COLLEGE"},
        ${inst.status || "ACTIVE"},
        ${inst.address || null},
        ${inst.phone || null},
        ${inst.email || null},
        ${inst.website || null},
        ${inst.status !== "ARCHIVED" && inst.status !== "SUSPENDED"},
        ${inst.createdAt || new Date()},
        ${inst.updatedAt || new Date()},
        ${inst.city || null},
        ${inst.state || null},
        ${inst.country || "India"}
      )
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        address = EXCLUDED.address,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        website = EXCLUDED.website,
        "isActive" = EXCLUDED."isActive",
        "updatedAt" = NOW(),
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        country = EXCLUDED.country
    `;

    return true;
  } catch (err) {
    console.error("Error syncing institution to app db:", err);
    return false;
  }
}

/**
 * Provisions an Institution Admin account, creates the system Role,
 * adds the user to PlatformUser ("User"), links via InstitutionMembership,
 * assigns MembershipRole, and creates the record in "users" table for ERP login.
 */
export async function provisionInstitutionAdmin(input: ProvisionAdminInput): Promise<ProvisionAdminResult> {
  const { institutionId, actorUserId } = input;

  try {
    // 1. Fetch institution from "Institution" table
    const instRows: any = await db.$queryRaw`
      SELECT id, name, code, slug, email FROM "Institution" WHERE id::text = ${institutionId} LIMIT 1
    `;
    if (!instRows || instRows.length === 0) {
      return { success: false, error: "Institution not found in platform database." };
    }
    const inst = instRows[0];

    // Ensure it exists in table "institutions"
    await syncInstitutionToAppDb(institutionId);

    // 2. Determine admin details
    const adminEmail = (input.adminEmail || inst.email || `admin@${inst.slug || "institution"}.edu.in`).trim().toLowerCase();
    const adminName = (input.adminName || `${inst.name} Administrator`).trim();

    // 3. Ensure system Role "INSTITUTION_ADMIN" exists for this institution
    let roleId: string;
    const existingRoles: any = await db.$queryRaw`
      SELECT id FROM "Role" WHERE "institutionId"::text = ${institutionId} AND code = 'INSTITUTION_ADMIN' LIMIT 1
    `;
    if (existingRoles.length > 0) {
      roleId = existingRoles[0].id;
    } else {
      roleId = crypto.randomUUID();
      await db.$executeRaw`
        INSERT INTO "Role" (id, "institutionId", name, code, description, "isSystem", "createdAt", "updatedAt")
        VALUES (
          ${roleId}::uuid,
          ${institutionId}::uuid,
          'Institution Administrator',
          'INSTITUTION_ADMIN',
          'Primary administrator for institution portal',
          true,
          NOW(),
          NOW()
        )
      `;
    }

    // 4. Ensure PlatformUser exists in table "User" (INACTIVE until invitation setup)
    let platformUserId: string;
    const existingPlatformUsers: any = await db.$queryRaw`
      SELECT id, status FROM "User" WHERE LOWER(email) = LOWER(${adminEmail}) LIMIT 1
    `;
    if (existingPlatformUsers.length > 0) {
      platformUserId = existingPlatformUsers[0].id;
    } else {
      platformUserId = crypto.randomUUID();
      await db.$executeRaw`
        INSERT INTO "User" (id, name, email, status, "platformRole", "createdAt", "updatedAt")
        VALUES (
          ${platformUserId}::uuid,
          ${adminName},
          ${adminEmail},
          'INACTIVE'::"UserStatus",
          'NONE'::"PlatformRole",
          NOW(),
          NOW()
        )
      `;
    }

    // 5. Ensure InstitutionMembership exists in table "InstitutionMembership" (INVITED status)
    let membershipId: string;
    const existingMemberships: any = await db.$queryRaw`
      SELECT id, status FROM "InstitutionMembership"
      WHERE "userId"::text = ${platformUserId} AND "institutionId"::text = ${institutionId}
      LIMIT 1
    `;
    if (existingMemberships.length > 0) {
      membershipId = existingMemberships[0].id;
    } else {
      membershipId = crypto.randomUUID();
      await db.$executeRaw`
        INSERT INTO "InstitutionMembership" (id, "userId", "institutionId", status, "joinedAt", "createdAt", "updatedAt")
        VALUES (
          ${membershipId}::uuid,
          ${platformUserId}::uuid,
          ${institutionId}::uuid,
          'INVITED'::"MembershipStatus",
          NOW(),
          NOW(),
          NOW()
        )
      `;
    }

    // 6. Ensure MembershipRole link exists
    await db.$executeRaw`
      INSERT INTO "MembershipRole" ("membershipId", "roleId", "institutionId", "assignedAt")
      VALUES (
        ${membershipId}::uuid,
        ${roleId}::uuid,
        ${institutionId}::uuid,
        NOW()
      )
      ON CONFLICT ("membershipId", "roleId") DO NOTHING
    `;

    // 7. Ensure record exists in table "users" for ERP authentication (DORMANT, NO STATIC PASSWORD)
    let appUserId: string;
    const existingAppUsers: any = await db.$queryRaw`
      SELECT id, "passwordHash", "isActive", status FROM users WHERE LOWER(email) = LOWER(${adminEmail}) AND "institutionId" = ${institutionId} LIMIT 1
    `;
    if (existingAppUsers.length > 0) {
      appUserId = existingAppUsers[0].id;
      const isAlreadyActive = Boolean(existingAppUsers[0].isActive && existingAppUsers[0].passwordHash);
      await db.$executeRaw`
        UPDATE users
        SET "fullName" = ${adminName},
            name = ${adminName},
            role = 'ADMIN',
            "isActive" = ${isAlreadyActive},
            status = ${isAlreadyActive ? 'ACTIVE' : 'INACTIVE'},
            "updatedAt" = NOW()
        WHERE id = ${appUserId}
      `;
    } else {
      appUserId = platformUserId; // Use same ID for consistency across User and users
      await db.$executeRaw`
        INSERT INTO users (
          id, "institutionId", email, "passwordHash", role, "fullName", name, "isActive", status, "platformRole", "createdAt", "updatedAt"
        ) VALUES (
          ${appUserId},
          ${institutionId},
          ${adminEmail},
          NULL,
          'ADMIN',
          ${adminName},
          ${adminName},
          false,
          'INACTIVE',
          'NONE',
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          "institutionId" = EXCLUDED."institutionId",
          role = 'ADMIN',
          "fullName" = EXCLUDED."fullName",
          name = EXCLUDED.name,
          "isActive" = false,
          status = 'INACTIVE',
          "updatedAt" = NOW()
      `;
    }

    // 8. Generate secure single-use password setup token & dispatch invitation email
    const { signPasswordSetupToken } = await import("@/lib/auth/jwt");
    const { sendPasswordSetupInvitation, getAppBaseUrl } = await import("@/lib/services/email.service");

    const setupToken = await signPasswordSetupToken({
      userId: appUserId,
      email: adminEmail,
      institutionId,
      passwordHash: null,
    });

    const appUrl = getAppBaseUrl();
    const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;

    let invitationSent = false;
    let invitationPreviewUrl: string | false = false;
    let invitationError: string | null = null;

    try {
      const emailRes = await sendPasswordSetupInvitation(
        { email: adminEmail, name: adminName },
        {
          setupUrl,
          institutionName: inst.name || "Campus Administration",
          expiresIn: "24 hours",
          loginUrl: `${appUrl}/admin`,
        }
      );
      invitationSent = emailRes.success;
      invitationPreviewUrl = emailRes.previewUrl || false;
      if (!emailRes.success) invitationError = emailRes.error || "Email delivery failed";
    } catch (emailErr: any) {
      console.warn("[provisionInstitutionAdmin] Invitation dispatch warning:", emailErr.message);
      invitationError = emailErr.message;
    }

    // 9. Transactional Audit Logging (Setup tokens and passwords are NEVER logged)
    try {
      const auditId = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO audit_logs (
          "id", "institutionId", "userId", "actorUserId", "action", "entityType", "entityId", "newValuesJson", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        auditId,
        institutionId,
        appUserId,
        actorUserId || null,
        invitationSent ? "INVITATION_SENT" : "INVITATION_FAILED",
        "ADMIN_CREDENTIALS",
        appUserId,
        JSON.stringify({
          recipient: adminEmail,
          previewUrl: invitationPreviewUrl || undefined,
          error: invitationError || undefined,
        })
      );
    } catch (auditErr: any) {
      console.warn("[provisionInstitutionAdmin] Audit log write warning:", auditErr.message);
    }

    if (actorUserId) {
      try {
        await db.$executeRaw`
          INSERT INTO "AuditLog" (id, "institutionId", "userId", action, entity, "entityId", metadata, result, "createdAt")
          VALUES (
            gen_random_uuid(),
            ${institutionId}::uuid,
            ${actorUserId}::uuid,
            'ADMIN_MEMBERSHIP_PROVISIONED',
            'InstitutionMembership',
            ${membershipId},
            ${JSON.stringify({ adminEmail, role: "INSTITUTION_ADMIN", invitationSent })}::jsonb,
            'SUCCESS',
            NOW()
          )
        `;
      } catch {
        // Audit log table non-critical
      }
    }

    return {
      success: true,
      user: {
        id: appUserId,
        email: adminEmail,
        fullName: adminName,
        role: "ADMIN",
        status: "INACTIVE",
        isActive: false,
      },
      institution: {
        id: inst.id,
        name: inst.name,
        code: inst.code,
        slug: inst.slug,
      },
      invitationSent,
      previewUrl: invitationPreviewUrl,
      invitationError,
    };
  } catch (err: any) {
    console.error("Error provisioning institution admin:", err);
    return { success: false, error: err.message || "Failed to provision institution admin." };
  }
}

/**
 * Syncs all active PlatformInstitutions into table "institutions" and provisions
 * admin accounts if not already present.
 */
export async function syncAllPlatformInstitutions(): Promise<{ synced: number; provisioned: number }> {
  let synced = 0;
  let provisioned = 0;

  try {
    const platformInsts: any = await db.$queryRaw`
      SELECT id, name, code, slug, email FROM "Institution" WHERE "archivedAt" IS NULL
    `;

    for (const inst of platformInsts) {
      const ok = await syncInstitutionToAppDb(inst.id);
      if (ok) synced++;

      // Check if admin user exists in users table
      const adminUsers: any = await db.$queryRaw`
        SELECT id FROM users WHERE "institutionId" = ${inst.id} AND role = 'ADMIN' LIMIT 1
      `;
      if (adminUsers.length === 0) {
        const provRes = await provisionInstitutionAdmin({
          institutionId: inst.id,
          adminEmail: inst.email || undefined,
          adminName: `${inst.name} Administrator`,
        });
        if (provRes.success) provisioned++;
      }
    }
  } catch (err) {
    console.error("syncAllPlatformInstitutions error:", err);
  }

  return { synced, provisioned };
}

/**
 * Resends an account setup invitation to an Institution Administrator.
 * Generates a fresh single-use password setup token and dispatches an invitation email.
 */
export async function resendInstitutionAdminInvitation(
  institutionId: string,
  adminUserId?: string,
  actorUserId?: string
): Promise<{
  success: boolean;
  message: string;
  previewUrl?: string | false;
  email?: string;
}> {
  try {
    const instRows: any = await db.$queryRaw`
      SELECT id, name, slug FROM "Institution" WHERE id::text = ${institutionId} LIMIT 1
    `;
    const inst = instRows?.[0];

    const adminUser = await db.user.findFirst({
      where: {
        institutionId,
        role: "ADMIN",
        ...(adminUserId ? { id: adminUserId } : {}),
      },
      select: { id: true, email: true, fullName: true, name: true, passwordHash: true },
    });

    if (!adminUser) {
      return { success: false, message: "No institution admin found for this institution." };
    }

    const { signPasswordSetupToken } = await import("@/lib/auth/jwt");
    const { sendPasswordSetupInvitation } = await import("@/lib/services/email.service");

    const setupToken = await signPasswordSetupToken({
      userId: adminUser.id,
      email: adminUser.email,
      institutionId,
      passwordHash: adminUser.passwordHash || null,
    });

    const { getAppBaseUrl } = await import("@/lib/services/email.service");
    const appUrl = getAppBaseUrl();
    const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;

    const emailRes = await sendPasswordSetupInvitation(
      { email: adminUser.email, name: adminUser.fullName || adminUser.name || "Administrator" },
      {
        setupUrl,
        institutionName: inst?.name || "Campus Administration",
        expiresIn: "24 hours",
        loginUrl: `${appUrl}/admin`,
      }
    );

    try {
      const auditId = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO audit_logs (
          "id", "institutionId", "userId", "actorUserId", "action", "entityType", "entityId", "newValuesJson", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        auditId,
        institutionId,
        adminUser.id,
        actorUserId || null,
        emailRes.success ? "INVITATION_RESENT" : "INVITATION_FAILED",
        "ADMIN_CREDENTIALS",
        adminUser.id,
        JSON.stringify({
          recipient: adminUser.email,
          previewUrl: emailRes.previewUrl || undefined,
          error: emailRes.error || undefined,
        })
      );
    } catch {}

    return {
      success: emailRes.success,
      message: emailRes.success
        ? `Invitation sent successfully to ${adminUser.email}.`
        : `Email delivery failed: ${emailRes.error || "Transport failure"}`,
      previewUrl: emailRes.previewUrl,
      email: adminUser.email,
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Failed to resend invitation." };
  }
}
