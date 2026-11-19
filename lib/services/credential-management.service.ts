import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { signPasswordSetupToken } from "@/lib/auth/jwt";
import { sendPasswordSetupInvitation, sendRoleCredentialInvitation } from "@/lib/services/email.service";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface IssueStudentCredentialsOptions {
  institutionId: string;
  studentId: string;
  customPassword?: string;
  forceReset?: boolean;
  actorUserId?: string | null;
}

export interface IssueTeacherCredentialsOptions {
  institutionId: string;
  teacherId?: string; // Teacher.id
  userId?: string;    // User.id
  employeeId?: string;
  email?: string;
  fullName?: string;
  department?: string;
  designation?: string;
  customPassword?: string;
  forceReset?: boolean;
  actorUserId?: string | null;
}

export interface IssueParentCredentialsOptions {
  institutionId: string;
  guardianAccountId?: string; // GuardianAccount.id
  email?: string;
  fullName?: string;
  phone?: string;
  relationship?: string;
  studentIds: string[]; // At least one student must be linked
  customPassword?: string;
  forceReset?: boolean;
  actorUserId?: string | null;
}

export interface TogglePortalAccessOptions {
  institutionId: string;
  userId: string;
  isActive: boolean;
  reason?: string;
  actorUserId?: string | null;
}

export interface ResetUserPasswordOptions {
  institutionId: string;
  userId: string;
  customPassword?: string;
  actorUserId?: string | null;
}

export interface CredentialIssuanceResult {
  success: boolean;
  code?: "ACCOUNT_EXISTS" | "VALIDATION_ERROR" | "TENANT_VIOLATION" | "PROFILE_NOT_FOUND";
  message: string;
  userId?: string;
  email?: string;
  temporaryPassword?: string; // Returned only once, never persisted
  entityId?: string;
  role?: string;
  details?: Record<string, any>;
}

export interface CredentialStatusResult {
  hasAccount: boolean;
  isActive: boolean;
  status: string; // "ACTIVE" | "PENDING_SETUP" | "DISABLED" | "NO_ACCOUNT" | "INELIGIBLE" | "UNVERIFIED" | "NOT_FOUND"
  invitationStatus?: "PENDING" | "SENT" | "FAILED" | "ACCEPTED";
  email: string | null;
  lastLoginAt: Date | null;
  role: string | null;
  userId: string | null;
  entityId?: string;
  fullName?: string;
  rollNumber?: string;
  employeeId?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a value is a valid 36-character UUID string.
 * Prevents PostgreSQL @db.Uuid column conversion errors in Prisma queries.
 */
export function isValidUuid(val: any): boolean {
  return typeof val === "string" && UUID_REGEX.test(val.trim());
}

// ============================================================================
// Password Generation & Validation Helpers
// ============================================================================

const UPPERCASE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude I, O
const LOWERCASE_CHARS = "abcdefghijkmnpqrstuvwxyz"; // exclude l, o
const NUMBER_CHARS = "23456789";                   // exclude 0, 1
const SYMBOL_CHARS = "!@#$%^&*";
const ALL_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + NUMBER_CHARS + SYMBOL_CHARS;

/**
 * Generate a cryptographically secure, high-entropy temporary password.
 * Guarantees at least 1 uppercase, 1 lowercase, 1 digit, and 1 symbol.
 */
export function generateSecureTemporaryPassword(length = 12): string {
  if (length < 10) length = 10;

  // Guarantee at least one of each required category
  const chars: string[] = [
    UPPERCASE_CHARS[crypto.randomInt(0, UPPERCASE_CHARS.length)],
    LOWERCASE_CHARS[crypto.randomInt(0, LOWERCASE_CHARS.length)],
    NUMBER_CHARS[crypto.randomInt(0, NUMBER_CHARS.length)],
    SYMBOL_CHARS[crypto.randomInt(0, SYMBOL_CHARS.length)],
  ];

  for (let i = chars.length; i < length; i++) {
    chars.push(ALL_CHARS[crypto.randomInt(0, ALL_CHARS.length)]);
  }

  // Cryptographically shuffle array using Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  return chars.join("");
}

/**
 * Distinguish eligible teaching faculty from non-teaching staff.
 * Safeguard #2: Only eligible teaching faculty should receive the TEACHER portal role.
 */
const TEACHING_PATTERNS = [
  /\bprofessor\b/i,
  /\bassociate professor\b/i,
  /\bassistant professor\b/i,
  /\blecturer\b/i,
  /\bteacher\b/i,
  /\bfaculty\b/i,
  /\binstructor\b/i,
  /\bhead of department\b/i,
  /\bhod\b/i,
  /\bdean\b/i,
  /\bmentor\b/i,
  /\btutor\b/i,
  /\bpgt\b/i,
  /\btgt\b/i,
  /\bprt\b/i,
];

const NON_TEACHING_PATTERNS = [
  /\baccountant\b/i,
  /\bclerk\b/i,
  /\blibrarian\b/i,
  /\bregistrar\b/i,
  /\bdriver\b/i,
  /\bsecurity\b/i,
  /\bhousekeeping\b/i,
  /\bofficer\b/i,
  /\bmaintenance\b/i,
  /\bwarden\b/i,
  /\badmin\b/i,
  /\blab assistant\b/i,
  /\btechnical\b/i,
  /\btechnician\b/i,
];

export function isTeachingFaculty(designation?: string, explicitRole?: string): boolean {
  if (!designation) return explicitRole === "TEACHER";

  const desLower = designation.toLowerCase().trim();

  // Explicit non-teaching patterns ALWAYS take precedence
  for (const pattern of NON_TEACHING_PATTERNS) {
    if (pattern.test(desLower)) return false;
  }

  // Check teaching patterns
  for (const pattern of TEACHING_PATTERNS) {
    if (pattern.test(desLower)) return true;
  }

  return explicitRole === "TEACHER";
}

/**
 * Transaction-safe audit logger that directly targets live columns in audit_logs,
 * guaranteeing full database compatibility without unmigrated columns.
 */
async function recordAuditSafe(
  tx: Prisma.TransactionClient,
  params: {
    institutionId: string;
    actorUserId?: string | null;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    oldValuesJson?: string | null;
    newValuesJson?: string | null;
  }
) {
  try {
    const auditId = crypto.randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO audit_logs (id, "institutionId", "userId", "actorUserId", action, "entityType", "entityId", "oldValuesJson", "newValuesJson", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      auditId,
      params.institutionId,
      params.userId || null,
      params.actorUserId || null,
      params.action,
      params.entityType,
      params.entityId || null,
      params.oldValuesJson || null,
      params.newValuesJson || null
    );
    return auditId;
  } catch (err) {
    console.warn("[AuditLog] Warning: failed to record audit log:", err);
  }
}

// ============================================================================
// Core Credential Management Functions
// ============================================================================

/**
 * Issue or reset credentials for a Student within the specified institution.
 */
export async function issueStudentCredentials(
  options: IssueStudentCredentialsOptions
): Promise<CredentialIssuanceResult> {
  const { institutionId, studentId, customPassword, forceReset = false, actorUserId } = options;

  if (!institutionId || !studentId) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Institution ID and Student ID are required.",
    };
  }

  // 1. Verify Student exists within the tenant with flexible identifier matching
  const studentOrFilters: any[] = [];
  if (isValidUuid(studentId)) {
    studentOrFilters.push({ id: studentId });
    studentOrFilters.push({ userId: studentId });
  }
  studentOrFilters.push({ rollNumber: studentId });
  studentOrFilters.push({ admissionNumber: studentId });
  if (studentId.includes("@")) {
    studentOrFilters.push({ email: studentId.trim().toLowerCase() });
  }

  const student = await db.student.findFirst({
    where: {
      institutionId,
      OR: studentOrFilters,
    },
    select: {
      id: true,
      institutionId: true,
      userId: true,
      rollNumber: true,
      admissionNumber: true,
      fullName: true,
      firstName: true,
      lastName: true,
      email: true,
      institutionalEmail: true,
      user: {
        select: {
          id: true,
          email: true,
          isActive: true,
          status: true,
          passwordHash: true,
          role: true,
          institutionId: true,
        },
      },
    },
  });

  if (!student) {
    return {
      success: false,
      code: "PROFILE_NOT_FOUND",
      message: "Student profile not found in this institution.",
    };
  }

  // Resolve student email
  const studentEmail = (
    student.institutionalEmail ||
    student.email ||
    `${student.rollNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@student.${institutionId.slice(0, 8)}.edu`
  ).trim().toLowerCase();

  // 2. Check existing account & prevent accidental overwrite (Safeguard #1)
  const isCurrentlyProvisioned =
    !!student.user &&
    student.user.isActive &&
    !!student.user.passwordHash &&
    student.user.passwordHash !== "UNPROVISIONED" &&
    student.user.passwordHash.startsWith("$2");

  if (student.user && isCurrentlyProvisioned && !forceReset) {
    return {
      success: false,
      code: "ACCOUNT_EXISTS",
      message: "Student already has an active portal account. Use reset credentials to generate a new password.",
      userId: student.user.id,
      email: student.user.email,
      entityId: student.id,
    };
  }

  // Check if email is already taken by another user
  const existingUserByEmail = await db.user.findFirst({
    where: { email: studentEmail },
    select: {
      id: true,
      institutionId: true,
      role: true,
      studentProfile: { select: { id: true } },
    },
  });

  if (existingUserByEmail) {
    if (existingUserByEmail.institutionId && existingUserByEmail.institutionId !== institutionId) {
      return {
        success: false,
        code: "TENANT_VIOLATION",
        message: "Email is already registered under another institution.",
      };
    }

    if (existingUserByEmail.id !== student.userId) {
      if (existingUserByEmail.studentProfile && existingUserByEmail.studentProfile.id !== student.id) {
        return {
          success: false,
          code: "VALIDATION_ERROR",
          message: "Email is already associated with another student account.",
        };
      }
      if (existingUserByEmail.role && existingUserByEmail.role !== "STUDENT") {
        return {
          success: false,
          code: "VALIDATION_ERROR",
          message: `User already exists with an incompatible role: ${existingUserByEmail.role}.`,
        };
      }
    }
  }

  // 3. Generate secure password and bcrypt hash (Safeguard #4)
  const temporaryPassword = customPassword || generateSecureTemporaryPassword(12);
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const targetUserId = student.userId || existingUserByEmail?.id;
  const isReset = !!targetUserId && isCurrentlyProvisioned;

  // 4. Transactional execution (Safeguard #6)
  return await db.$transaction(async (tx) => {
    let finalUserId: string;

    if (targetUserId) {
      // Update existing user account
      const updatedUser = await tx.user.update({
        where: { id: targetUserId },
        data: {
          passwordHash,
          isActive: true,
          status: "ACTIVE",
          role: "STUDENT",
          institutionId,
        },
      });
      finalUserId = updatedUser.id;
    } else {
      // Create new user account
      const newUser = await tx.user.create({
        data: {
          institutionId,
          email: studentEmail,
          fullName: student.fullName || `${student.firstName} ${student.lastName}`.trim(),
          passwordHash,
          role: "STUDENT",
          isActive: true,
          status: "ACTIVE",
          lastLoginAt: null, // First-login indicator
        },
      });
      finalUserId = newUser.id;
    }

    // Link student profile to user
    await tx.student.update({
      where: { id: student.id },
      data: { userId: finalUserId },
    });

    // Record audit log without passwords (Safeguard #5)
    await recordAuditSafe(tx, {
      institutionId,
      actorUserId: actorUserId || null,
      userId: finalUserId,
      action: isReset ? "PASSWORD_RESET" : "CREDENTIAL_ISSUED",
      entityType: "STUDENT_CREDENTIALS",
      entityId: student.id,
      newValuesJson: JSON.stringify({
        role: "STUDENT",
        email: studentEmail,
        status: "ACTIVE",
        isActive: true,
        actionType: isReset ? "RESET" : "INITIAL_ISSUANCE",
      }),
    });

    return {
      success: true,
      message: isReset ? "Student credentials reset successfully." : "Student credentials issued successfully.",
      userId: finalUserId,
      email: studentEmail,
      temporaryPassword, // One-time display only
      entityId: student.id,
      role: "STUDENT",
      details: {
        rollNumber: student.rollNumber,
        admissionNumber: student.admissionNumber,
        fullName: student.fullName,
      },
    };
  });
}

/**
 * Issue or reset credentials for a Teaching Faculty member.
 * Safeguard #2: Clearly distinguishes teaching faculty from non-teaching staff.
 */
export async function issueTeacherCredentials(
  options: IssueTeacherCredentialsOptions
): Promise<CredentialIssuanceResult> {
  const {
    institutionId,
    teacherId,
    userId,
    employeeId,
    email,
    fullName,
    department,
    designation,
    customPassword,
    forceReset = false,
    actorUserId,
  } = options;

  if (!institutionId) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Institution ID is required.",
    };
  }

  // 1. Locate teacher record if teacherId or userId provided
  let existingTeacher: any = null;
  const teacherOrFilters: any[] = [];
  if (teacherId && isValidUuid(teacherId)) {
    teacherOrFilters.push({ id: teacherId });
    teacherOrFilters.push({ userId: teacherId });
  }
  if (userId && isValidUuid(userId)) {
    teacherOrFilters.push({ userId });
  }
  if (employeeId) {
    teacherOrFilters.push({ employeeId });
  }
  if (teacherId && !isValidUuid(teacherId)) {
    teacherOrFilters.push({ employeeId: teacherId });
  }
  if (email && email.includes("@")) {
    teacherOrFilters.push({ user: { email: email.trim().toLowerCase() } });
  }

  if (teacherOrFilters.length > 0) {
    existingTeacher = await db.teacher.findFirst({
      where: {
        institutionId,
        OR: teacherOrFilters,
      },
      include: { user: true },
    });
  }

  if (!existingTeacher && teacherId) {
    return {
      success: false,
      code: "PROFILE_NOT_FOUND",
      message: "Teacher profile not found in this institution.",
    };
  }

  const effectiveDesignation = designation || existingTeacher?.designation || "Assistant Professor";
  const effectiveRole = "TEACHER";

  // Safeguard #2: Check teaching faculty eligibility
  if (!isTeachingFaculty(effectiveDesignation, effectiveRole)) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: `Staff member with designation "${effectiveDesignation}" is classified as non-teaching and is not eligible for the TEACHER portal role.`,
    };
  }

  const targetEmail = (
    email ||
    existingTeacher?.user?.email ||
    ""
  ).trim().toLowerCase();

  if (!targetEmail) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Email address is required to issue faculty credentials.",
    };
  }

  const targetUserId = userId || existingTeacher?.userId;
  const existingUser = existingTeacher?.user || (targetUserId ? await db.user.findUnique({ where: { id: targetUserId } }) : null);

  // Check if account already exists and active (Safeguard #1)
  const isCurrentlyProvisioned =
    !!existingUser &&
    existingUser.isActive &&
    !!existingUser.passwordHash &&
    existingUser.passwordHash !== "UNPROVISIONED" &&
    existingUser.passwordHash.startsWith("$2");

  if (existingUser && isCurrentlyProvisioned && !forceReset) {
    return {
      success: false,
      code: "ACCOUNT_EXISTS",
      message: "Faculty member already has an active portal account. Use reset credentials to generate a new password.",
      userId: existingUser.id,
      email: existingUser.email,
      entityId: existingTeacher?.id,
    };
  }

  // Check email conflict
  const userByEmail = await db.user.findFirst({
    where: { email: targetEmail },
    select: { id: true, institutionId: true, role: true },
  });

  if (userByEmail) {
    if (userByEmail.institutionId && userByEmail.institutionId !== institutionId) {
      return {
        success: false,
        code: "TENANT_VIOLATION",
        message: "Email is already registered under another institution.",
      };
    }
    if (targetUserId && userByEmail.id !== targetUserId) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        message: "Email is already associated with another user account.",
      };
    }
  }

  // Generate password
  const temporaryPassword = customPassword || generateSecureTemporaryPassword(12);
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const isReset = isCurrentlyProvisioned;
  const effectiveEmployeeId = employeeId || existingTeacher?.employeeId || `FAC-${Date.now().toString().slice(-4)}`;

  return await db.$transaction(async (tx) => {
    let finalUserId: string;

    if (existingUser) {
      const updated = await tx.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          isActive: true,
          status: "ACTIVE",
          role: "TEACHER",
          institutionId,
        },
      });
      finalUserId = updated.id;
    } else if (userByEmail) {
      const updated = await tx.user.update({
        where: { id: userByEmail.id },
        data: {
          passwordHash,
          isActive: true,
          status: "ACTIVE",
          role: "TEACHER",
          institutionId,
        },
      });
      finalUserId = updated.id;
    } else {
      const created = await tx.user.create({
        data: {
          institutionId,
          email: targetEmail,
          fullName: fullName || existingTeacher?.user?.fullName || "Faculty Member",
          passwordHash,
          role: "TEACHER",
          isActive: true,
          status: "ACTIVE",
          lastLoginAt: null,
        },
      });
      finalUserId = created.id;
    }

    // Ensure teacher profile exists
    let teacherRecord = existingTeacher;
    if (!teacherRecord) {
      teacherRecord = await tx.teacher.upsert({
        where: { userId: finalUserId },
        update: {
          department: department || "General Academics",
          designation: effectiveDesignation,
        },
        create: {
          institutionId,
          userId: finalUserId,
          employeeId: effectiveEmployeeId,
          department: department || "General Academics",
          designation: effectiveDesignation,
        },
      });
    }

    // Audit log (no password)
    await recordAuditSafe(tx, {
      institutionId,
      actorUserId: actorUserId || null,
      userId: finalUserId,
      action: isReset ? "PASSWORD_RESET" : "CREDENTIAL_ISSUED",
      entityType: "TEACHER_CREDENTIALS",
      entityId: teacherRecord.id,
      newValuesJson: JSON.stringify({
        role: "TEACHER",
        email: targetEmail,
        employeeId: effectiveEmployeeId,
        designation: effectiveDesignation,
        status: "ACTIVE",
      }),
    });

    return {
      success: true,
      message: isReset ? "Faculty credentials reset successfully." : "Faculty credentials issued successfully.",
      userId: finalUserId,
      email: targetEmail,
      temporaryPassword,
      entityId: teacherRecord.id,
      role: "TEACHER",
      details: {
        employeeId: effectiveEmployeeId,
        designation: effectiveDesignation,
        department: department || teacherRecord.department,
      },
    };
  });
}

/**
 * Issue or reset credentials for a Parent / Guardian.
 * Safeguard #3: Uses verified student-guardian relationships and supports 1 parent linked to multiple children.
 */
export async function issueParentCredentials(
  options: IssueParentCredentialsOptions
): Promise<CredentialIssuanceResult> {
  const {
    institutionId,
    guardianAccountId,
    email,
    fullName,
    phone = "+91 98000 00000",
    relationship = "GUARDIAN",
    studentIds,
    customPassword,
    forceReset = false,
    actorUserId,
  } = options;

  if (!institutionId) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Institution ID is required.",
    };
  }

  // 1. Locate existing guardian account if specified or lookup via email
  let existingGuardianAccount: any = null;
  if (guardianAccountId) {
    if (guardianAccountId.includes("@")) {
      existingGuardianAccount = await db.guardianAccount.findFirst({
        where: {
          institutionId,
          user: { email: guardianAccountId.trim().toLowerCase() },
        },
        include: { user: true, guardianLinks: true },
      });
    } else {
      existingGuardianAccount = await db.guardianAccount.findFirst({
        where: {
          id: guardianAccountId,
          institutionId,
        },
        include: { user: true, guardianLinks: true },
      });
      if (!existingGuardianAccount) {
        existingGuardianAccount = await db.guardianAccount.findFirst({
          where: {
            userId: guardianAccountId,
            institutionId,
          },
          include: { user: true, guardianLinks: true },
        });
      }
    }
    if (!existingGuardianAccount) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "Guardian account not found in this institution.",
      };
    }
  }

  const targetEmail = (
    email ||
    existingGuardianAccount?.user?.email ||
    ""
  ).trim().toLowerCase();

  if (!targetEmail) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Parent email is required to issue portal credentials.",
    };
  }

  if (!existingGuardianAccount && targetEmail) {
    const userByEmail = await db.user.findFirst({
      where: { email: targetEmail, institutionId },
      include: { guardianAccount: { include: { guardianLinks: true } } },
    });
    if (userByEmail?.guardianAccount) {
      existingGuardianAccount = {
        ...userByEmail.guardianAccount,
        user: userByEmail,
      };
    }
  }

  // 2. Validate linked students within the same tenant (Safeguard #3)
  const targetStudentIds = [
    ...(studentIds || []),
    ...(existingGuardianAccount?.guardianLinks?.map((l: any) => l.studentId) || []),
  ];
  const uniqueStudentIds = Array.from(new Set(targetStudentIds)).filter(Boolean);

  if (uniqueStudentIds.length === 0) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Cannot provision parent portal access: At least one student must be linked to the parent account.",
    };
  }

  // Verify all linked students belong to this institution
  const validStudents = await db.student.findMany({
    where: {
      id: { in: uniqueStudentIds },
      institutionId,
    },
    select: { id: true, rollNumber: true, fullName: true },
  });

  if (validStudents.length !== uniqueStudentIds.length) {
    return {
      success: false,
      code: "TENANT_VIOLATION",
      message: "One or more linked students do not exist or belong to another institution.",
    };
  }

  // 3. Inspect existing GuardianLink records & verify relationships (Safeguards #1, #3 & #4)
  const existingLinksMap = new Map<string, any>();
  if (existingGuardianAccount?.guardianLinks) {
    for (const link of existingGuardianAccount.guardianLinks) {
      existingLinksMap.set(link.studentId, link);
    }
  }

  const verifiedStudents: typeof validStudents = [];
  const unverifiedStudents: typeof validStudents = [];

  for (const student of validStudents) {
    const existingLink = existingLinksMap.get(student.id);
    if (existingLink && existingLink.isVerified === true) {
      verifiedStudents.push(student);
    } else {
      unverifiedStudents.push(student);
    }
  }

  // Requirement: Reject or safely skip portal access for unverified parent–child relationships
  if (verifiedStudents.length === 0) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Cannot issue parent portal credentials: No verified parent-student relationships found. At least one linked child must have an existing verified guardian relationship before portal credentials can be issued.",
      details: {
        totalLinkedStudents: validStudents.length,
        verifiedCount: 0,
        unverifiedCount: unverifiedStudents.length,
        unverifiedChildren: unverifiedStudents.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          rollNumber: s.rollNumber,
        })),
      },
    };
  }

  const existingUser = existingGuardianAccount?.user;

  // Check if account already exists and active (Safeguard #1)
  const isCurrentlyProvisioned =
    !!existingUser &&
    existingUser.isActive &&
    !!existingUser.passwordHash &&
    existingUser.passwordHash !== "UNPROVISIONED" &&
    existingUser.passwordHash.startsWith("$2");

  if (existingUser && isCurrentlyProvisioned && !forceReset) {
    return {
      success: false,
      code: "ACCOUNT_EXISTS",
      message: "Parent already has an active portal account. Use reset credentials to generate a new password.",
      userId: existingUser.id,
      email: existingUser.email,
      entityId: existingGuardianAccount?.id,
    };
  }

  // Check email conflict
  const userByEmail = await db.user.findFirst({
    where: { email: targetEmail },
    select: { id: true, institutionId: true, role: true },
  });

  if (userByEmail) {
    if (userByEmail.institutionId && userByEmail.institutionId !== institutionId) {
      return {
        success: false,
        code: "TENANT_VIOLATION",
        message: "Email is already registered under another institution.",
      };
    }
    if (existingUser && userByEmail.id !== existingUser.id) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        message: "Email is already associated with another user account.",
      };
    }
  }

  const temporaryPassword = customPassword || generateSecureTemporaryPassword(12);
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const isReset = isCurrentlyProvisioned;

  return await db.$transaction(async (tx) => {
    let finalUserId: string;

    if (existingUser) {
      const updated = await tx.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          isActive: true,
          status: "ACTIVE",
          role: "PARENT",
          institutionId,
        },
      });
      finalUserId = updated.id;
    } else if (userByEmail) {
      const updated = await tx.user.update({
        where: { id: userByEmail.id },
        data: {
          passwordHash,
          isActive: true,
          status: "ACTIVE",
          role: "PARENT",
          institutionId,
        },
      });
      finalUserId = updated.id;
    } else {
      const created = await tx.user.create({
        data: {
          institutionId,
          email: targetEmail,
          fullName: fullName || "Parent / Guardian",
          phone,
          passwordHash,
          role: "PARENT",
          isActive: true,
          status: "ACTIVE",
          lastLoginAt: null, // First-login indicator
        },
      });
      finalUserId = created.id;
    }

    // Upsert GuardianAccount
    const guardianAccount = await tx.guardianAccount.upsert({
      where: { userId: finalUserId },
      update: {
        fullName: fullName || existingGuardianAccount?.fullName || "Parent / Guardian",
        phone: phone || existingGuardianAccount?.phone || "+91 98000 00000",
        relationship: relationship || existingGuardianAccount?.relationship || "GUARDIAN",
      },
      create: {
        institutionId,
        userId: finalUserId,
        fullName: fullName || "Parent / Guardian",
        phone: phone || "+91 98000 00000",
        relationship: relationship || "GUARDIAN",
      },
    });

    // Safely update or create child links without unauthorized verification promotion
    for (const student of validStudents) {
      const existingLink = await tx.guardianLink.findFirst({
        where: {
          guardianAccountId: guardianAccount.id,
          studentId: student.id,
        },
      });

      if (existingLink) {
        // Safeguards #1 & #2: NEVER promote isVerified from false to true; preserve existing status!
        // Safeguard #3: Enable portal access ONLY if relationship is already verified!
        await tx.guardianLink.update({
          where: { id: existingLink.id },
          data: {
            isVerified: existingLink.isVerified,
            canAccessPortal: existingLink.isVerified === true,
            relationship: relationship || existingLink.relationship,
            institutionId,
          },
        });
      } else {
        // Safeguard #5: Do NOT create or activate unauthorized parent–child relationships
        await tx.guardianLink.create({
          data: {
            institutionId,
            guardianAccountId: guardianAccount.id,
            studentId: student.id,
            relationship: relationship || "GUARDIAN",
            isVerified: false, // Default to unverified
            canAccessPortal: false, // Inaccessible to portal until formally verified
            isPrimary: false,
          },
        });
      }
    }

    // Audit log (no password)
    await recordAuditSafe(tx, {
      institutionId,
      actorUserId: actorUserId || null,
      userId: finalUserId,
      action: isReset ? "PASSWORD_RESET" : "CREDENTIAL_ISSUED",
      entityType: "PARENT_CREDENTIALS",
      entityId: guardianAccount.id,
      newValuesJson: JSON.stringify({
        role: "PARENT",
        email: targetEmail,
        totalLinkedStudents: validStudents.length,
        verifiedStudentCount: verifiedStudents.length,
        unverifiedStudentCount: unverifiedStudents.length,
        status: "ACTIVE",
        actionType: isReset ? "PASSWORD_RESET" : "CREDENTIAL_ISSUED",
      }),
    });

    return {
      success: true,
      message: isReset ? "Parent credentials reset successfully." : "Parent credentials issued successfully.",
      userId: finalUserId,
      email: targetEmail,
      temporaryPassword,
      entityId: guardianAccount.id,
      role: "PARENT",
      details: {
        verifiedChildren: verifiedStudents.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          rollNumber: s.rollNumber,
        })),
        unverifiedChildren: unverifiedStudents.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          rollNumber: s.rollNumber,
        })),
        totalLinkedStudents: validStudents.length,
        verifiedCount: verifiedStudents.length,
      },
    };
  });
}

/**
 * Toggle portal access (active/inactive) for any account within the institution.
 * Safeguard #5: Disabling an account immediately prevents login and invalidates access.
 */
export async function togglePortalAccess(
  options: TogglePortalAccessOptions
): Promise<{ success: boolean; message: string; isActive: boolean }> {
  const { institutionId, userId, isActive, reason, actorUserId } = options;

  if (!institutionId || !userId) {
    throw new Error("Institution ID and User ID are required.");
  }

  // Enforce tenant isolation
  const targetUser = await db.user.findFirst({
    where: { id: userId, institutionId },
    select: { id: true, role: true, email: true, isActive: true, status: true },
  });

  if (!targetUser) {
    throw new Error("User account not found in this institution.");
  }

  const newStatus = isActive ? "ACTIVE" : "INACTIVE";

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        isActive,
        status: newStatus,
      },
    });

    // If parent account, toggle child link portal access (safeguard: preserve unverified status)
    if (targetUser.role === "PARENT" || targetUser.role === "GUARDIAN") {
      const gAccount = await tx.guardianAccount.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (gAccount) {
        if (isActive) {
          // Safeguard: ONLY restore portal access for verified parent-student relationships!
          await tx.guardianLink.updateMany({
            where: { guardianAccountId: gAccount.id, institutionId, isVerified: true },
            data: { canAccessPortal: true },
          });
        } else {
          // Disabling parent revokes portal access across all child links
          await tx.guardianLink.updateMany({
            where: { guardianAccountId: gAccount.id, institutionId },
            data: { canAccessPortal: false },
          });
        }
      }
    }

    // Record audit log
    await recordAuditSafe(tx, {
      institutionId,
      actorUserId: actorUserId || null,
      userId,
      action: isActive ? "ACCESS_RESTORED" : "ACCESS_REVOKED",
      entityType: "USER_ACCESS",
      entityId: userId,
      oldValuesJson: JSON.stringify({ isActive: targetUser.isActive, status: targetUser.status }),
      newValuesJson: JSON.stringify({ isActive, status: newStatus, reason: reason || null }),
    });
  });

  return {
    success: true,
    message: isActive ? "Portal access enabled successfully." : "Portal access disabled successfully.",
    isActive,
  };
}

/**
 * Reset a user's password directly by User ID within the tenant.
 */
export async function resetUserPassword(
  options: ResetUserPasswordOptions
): Promise<CredentialIssuanceResult> {
  const { institutionId, userId, customPassword, actorUserId } = options;

  if (!institutionId || !userId) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Institution ID and User ID are required.",
    };
  }

  const user = await db.user.findFirst({
    where: { id: userId, institutionId },
    select: { id: true, role: true, email: true },
  });

  if (!user) {
    return {
      success: false,
      code: "PROFILE_NOT_FOUND",
      message: "User account not found in this institution.",
    };
  }

  const temporaryPassword = customPassword || generateSecureTemporaryPassword(12);
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        isActive: true,
        status: "ACTIVE",
      },
    });

    await recordAuditSafe(tx, {
      institutionId,
      actorUserId: actorUserId || null,
      userId,
      action: "PASSWORD_RESET",
      entityType: "USER_CREDENTIALS",
      entityId: userId,
      newValuesJson: JSON.stringify({
        role: user.role,
        email: user.email,
        status: "ACTIVE",
        actionType: "DIRECT_RESET",
      }),
    });
  });

  return {
    success: true,
    message: "Password reset successfully.",
    userId,
    email: user.email,
    temporaryPassword,
    role: user.role || undefined,
  };
}

async function resolveInvitationStatus(userId: string | null): Promise<"PENDING" | "SENT" | "FAILED" | "ACCEPTED"> {
  if (!userId) return "PENDING";
  try {
    const logs = await db.$queryRawUnsafe<Array<{ action: string }>>(
      `SELECT action FROM audit_logs 
       WHERE "userId" = $1 AND action IN ('INVITATION_SENT', 'INVITATION_RESENT', 'INVITATION_FAILED', 'PASSWORD_CHANGED')
       ORDER BY "createdAt" DESC 
       LIMIT 1`,
      userId
    );
    if (!logs || logs.length === 0) {
      return "SENT";
    }
    const act = logs[0].action;
    if (act === "INVITATION_SENT" || act === "INVITATION_RESENT") return "SENT";
    if (act === "INVITATION_FAILED") return "FAILED";
    if (act === "PASSWORD_CHANGED") return "ACCEPTED";
  } catch {
    // fallback
  }
  return "SENT";
}

/**
 * Query live credential status for an entity (Student, Teacher, or Parent).
 * Employs safe UUID checks, identifier fallbacks, and auto-healing to eliminate false verification errors.
 */
export async function getUserCredentialStatus(
  institutionId: string,
  entityType: "STUDENT" | "TEACHER" | "PARENT",
  entityId: string
): Promise<CredentialStatusResult> {
  let user: any = null;
  let resolvedEntity: any = null;

  if (entityType === "STUDENT") {
    const studentOrFilters: any[] = [];
    if (isValidUuid(entityId)) {
      studentOrFilters.push({ id: entityId });
      studentOrFilters.push({ userId: entityId });
    }
    studentOrFilters.push({ rollNumber: entityId });
    studentOrFilters.push({ admissionNumber: entityId });
    if (entityId.includes("@")) {
      studentOrFilters.push({ email: entityId.trim().toLowerCase() });
    }

    const student = await db.student.findFirst({
      where: {
        institutionId,
        OR: studentOrFilters,
      },
      include: { user: true },
    });

    if (student) {
      resolvedEntity = student;
      user = student.user;
      // Auto-heal: If student has no linked user, check if a student User with matching email exists
      if (!user && student.email) {
        const existingUser = await db.user.findFirst({
          where: { email: student.email.trim().toLowerCase(), institutionId },
        });
        if (existingUser) {
          await db.student.update({
            where: { id: student.id },
            data: { userId: existingUser.id },
          });
          user = existingUser;
        }
      }
    }
  } else if (entityType === "TEACHER") {
    const teacherOrFilters: any[] = [];
    if (isValidUuid(entityId)) {
      teacherOrFilters.push({ id: entityId });
      teacherOrFilters.push({ userId: entityId });
    }
    teacherOrFilters.push({ employeeId: entityId });
    if (entityId.includes("@")) {
      teacherOrFilters.push({ user: { email: entityId.trim().toLowerCase() } });
    }

    const teacher = await db.teacher.findFirst({
      where: {
        institutionId,
        OR: teacherOrFilters,
      },
      include: { user: true },
    });

    if (teacher) {
      resolvedEntity = teacher;
      user = teacher.user;
    }
  } else if (entityType === "PARENT") {
    const guardianOrFilters: any[] = [];
    if (isValidUuid(entityId)) {
      guardianOrFilters.push({ id: entityId });
      guardianOrFilters.push({ userId: entityId });
    }
    if (entityId.includes("@")) {
      guardianOrFilters.push({ user: { email: entityId.trim().toLowerCase() } });
    }

    if (guardianOrFilters.length === 0) {
      return {
        hasAccount: false,
        isActive: false,
        status: "NOT_FOUND",
        email: null,
        lastLoginAt: null,
        role: null,
        userId: null,
        entityId,
      };
    }

    const guardian = await db.guardianAccount.findFirst({
      where: {
        institutionId,
        OR: guardianOrFilters,
      },
      include: {
        user: true,
        guardianLinks: {
          include: { student: true },
        },
      },
    });

    if (guardian) {
      resolvedEntity = guardian;
      user = guardian.user;
    }
  }

  // If entity is not found in the institution at all
  if (!resolvedEntity) {
    return {
      hasAccount: false,
      isActive: false,
      status: "NOT_FOUND",
      invitationStatus: "PENDING",
      email: null,
      lastLoginAt: null,
      role: null,
      userId: null,
      entityId,
    };
  }

  // If entity exists but has no user account
  if (!user) {
    let baseStatus = "NO_ACCOUNT";
    if (entityType === "TEACHER" && !isTeachingFaculty(resolvedEntity?.designation)) {
      baseStatus = "INELIGIBLE";
    }
    if (entityType === "PARENT") {
      const verified = (resolvedEntity?.guardianLinks || []).filter((l: any) => l.isVerified);
      if (verified.length === 0) {
        baseStatus = "UNVERIFIED";
      }
    }

    return {
      hasAccount: false,
      isActive: false,
      status: baseStatus,
      invitationStatus: "PENDING",
      email: resolvedEntity?.email || null,
      lastLoginAt: null,
      role: null,
      userId: null,
      entityId: resolvedEntity?.id,
      fullName: resolvedEntity?.fullName || resolvedEntity?.name,
      rollNumber: resolvedEntity?.rollNumber,
      employeeId: resolvedEntity?.employeeId,
    };
  }

  const hasPassword = Boolean(user.passwordHash && user.passwordHash !== "UNPROVISIONED");
  const isAccountActive = Boolean(user.isActive && user.status === "ACTIVE");

  let status = "NO_ACCOUNT";
  let invitationStatus: "PENDING" | "SENT" | "FAILED" | "ACCEPTED" = "PENDING";

  if (hasPassword) {
    status = isAccountActive ? "ACTIVE" : "DISABLED";
    invitationStatus = "ACCEPTED";
  } else {
    status = "PENDING_SETUP";
    invitationStatus = await resolveInvitationStatus(user.id);
  }

  // Check role-specific constraints
  if (entityType === "TEACHER" && !isTeachingFaculty(resolvedEntity?.designation, user.role)) {
    status = "INELIGIBLE";
  } else if (entityType === "PARENT") {
    const verified = (resolvedEntity?.guardianLinks || []).filter((l: any) => l.isVerified);
    if (verified.length === 0) {
      status = "UNVERIFIED";
    }
  }

  return {
    hasAccount: true,
    isActive: isAccountActive,
    status,
    invitationStatus,
    email: user.email,
    lastLoginAt: user.lastLoginAt,
    role: user.role,
    userId: user.id,
    entityId: resolvedEntity?.id,
    fullName: user.fullName || resolvedEntity?.fullName,
    rollNumber: resolvedEntity?.rollNumber,
    employeeId: resolvedEntity?.employeeId,
  };
}

/**
 * Resend a secure, expiring password setup invitation to an existing provisioned user account.
 */
export async function resendInvitation(options: {
  institutionId: string;
  entityType: "STUDENT" | "TEACHER" | "PARENT";
  entityId: string;
  actorUserId?: string | null;
}): Promise<{
  success: boolean;
  message: string;
  previewUrl?: string | false;
  email?: string;
  userId?: string;
}> {
  const { institutionId, entityType, entityId, actorUserId } = options;

  // 1. Resolve entity status
  const statusRes = await getUserCredentialStatus(institutionId, entityType, entityId);
  if (!statusRes.userId || !statusRes.email) {
    return {
      success: false,
      message: `Cannot resend invitation: No provisioned user account found for this ${entityType.toLowerCase()}.`,
    };
  }

  // 2. Fetch institution and user
  const inst = await db.institution.findUnique({
    where: { id: institutionId },
    select: { name: true, slug: true },
  });
  const dbUser = await db.user.findUnique({
    where: { id: statusRes.userId },
    select: { passwordHash: true, fullName: true, name: true, email: true },
  });

  // 3. Generate secure token
  const setupToken = await signPasswordSetupToken({
    userId: statusRes.userId,
    email: statusRes.email,
    institutionId,
    passwordHash: dbUser?.passwordHash || null,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;

  let portalLoginUrl = `${appUrl}/login`;
  if (entityType === "STUDENT") portalLoginUrl = `${appUrl}/login`;
  if (entityType === "TEACHER") portalLoginUrl = `${appUrl}/campus/${inst?.slug || "portal"}/teacher`;
  if (entityType === "PARENT") portalLoginUrl = `${appUrl}/login`;

  // 4. Dispatch setup invitation
  const emailRes = await sendRoleCredentialInvitation(
    { email: statusRes.email, name: statusRes.fullName || dbUser?.fullName || "Member" },
    {
      setupUrl,
      institutionName: inst?.name || "Campus Administration",
      expiresIn: "24 hours",
      role: entityType,
      loginUrl: portalLoginUrl,
      username: statusRes.email || dbUser?.email || undefined,
    }
  );

  // 5. Log audit
  try {
    const auditId = crypto.randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO audit_logs (
        "id", "institutionId", "userId", "actorUserId", "action", "entityType", "entityId", "newValuesJson", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      auditId,
      institutionId,
      statusRes.userId,
      actorUserId || null,
      emailRes.success ? "INVITATION_RESENT" : "INVITATION_FAILED",
      `${entityType}_CREDENTIALS`,
      statusRes.entityId || statusRes.userId,
      JSON.stringify({
        recipient: statusRes.email,
        previewUrl: emailRes.previewUrl || undefined,
        error: emailRes.error || undefined,
      })
    );
  } catch (auditErr: any) {
    console.warn("[resendInvitation] Audit log write warning:", auditErr.message);
  }

  return {
    success: emailRes.success,
    message: emailRes.success
      ? `Invitation sent successfully to ${statusRes.email}.`
      : `Email dispatch failed: ${emailRes.error || "Unable to send email"}`,
    previewUrl: emailRes.previewUrl,
    email: statusRes.email,
    userId: statusRes.userId,
  };
}

/**
 * Reliably determine if an account currently holds an unacknowledged temporary password
 * issued or reset by an administrator, using the existing indexed audit_logs table.
 *
 * Rules:
 * - If no credential audit logs exist: user is an established account -> returns false.
 * - If latest credential action is 'CREDENTIAL_ISSUED' or 'PASSWORD_RESET': temporary password is active -> returns true.
 * - If latest credential action is 'PASSWORD_CHANGED': password has been permanently updated -> returns false.
 */
export async function isTemporaryPasswordActive(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const logs = await db.$queryRawUnsafe<Array<{ action: string }>>(
      `SELECT action FROM audit_logs 
       WHERE "userId" = $1 AND action IN ('CREDENTIAL_ISSUED', 'PASSWORD_RESET', 'PASSWORD_CHANGED')
       ORDER BY "createdAt" DESC 
       LIMIT 1`,
      userId
    );

    if (!logs || logs.length === 0) {
      return false; // Established account without temporary issuance event
    }

    const latestAction = logs[0].action;
    return latestAction === "CREDENTIAL_ISSUED" || latestAction === "PASSWORD_RESET";
  } catch (err) {
    console.warn("[CredentialService] Audit lookup warning in isTemporaryPasswordActive:", err);
    return false;
  }
}
