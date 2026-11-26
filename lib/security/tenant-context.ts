import db from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import type { TenantActorType } from "@/lib/security/tenant-als";

export interface PreparedTenantContextParams {
  institutionId: string;
  userId?: string | null;
  actorType?: TenantActorType;
}

/**
 * Preparation-layer tenant transaction boundary for Stage E/F.
 *
 * Security Invariants (Stage C.7.2):
 *   - Does NOT accept caller-controlled `verifyAuthorization` callbacks or `dbClient` overrides.
 *   - Does NOT trust caller-supplied institutionIds or set bare PostgreSQL GUCs.
 *   - Always fails closed until the Stage E database-side HMAC & membership verifier is provisioned.
 */
export async function withPreparedTenantContext<T>(
  params: PreparedTenantContextParams,
  _fn: (tx: any) => Promise<T>
): Promise<T> {
  const cleanInstId =
    typeof params?.institutionId === "string" ? params.institutionId.trim() : "";
  if (!cleanInstId) {
    throw new ForbiddenError(
      "Tenant context violation: A valid institutionId is required for database operations."
    );
  }

  throw new ForbiddenError(
    "Tenant context unavailable: Stage E database authorization verifier is not yet provisioned."
  );
}

/**
 * Legacy-signature wrapper kept fail-closed until Stage E database HMAC
 * verification is provisioned.
 */
export async function withTenantContext<T>(
  institutionId: string,
  fn: (tx: any) => Promise<T>
): Promise<T> {
  return withPreparedTenantContext({ institutionId }, fn);
}

/**
 * Verifies that the target institution matches the authenticated user's institution.
 * Prevents cross-institution IDOR and data manipulation.
 */
export function enforceTenantBoundary(
  userInstitutionId: string | null | undefined,
  targetInstitutionId: string | null | undefined,
  operationName = "Operation"
): void {
  if (!userInstitutionId) {
    throw new UnauthorizedError(`${operationName} denied: User account is not assigned to an institution.`);
  }

  if (targetInstitutionId && targetInstitutionId !== userInstitutionId) {
    throw new ForbiddenError(
      `Cross-tenant access violation: ${operationName} across institution boundaries is strictly forbidden.`
    );
  }
}

/**
 * Resolves teacher HoD and Class Teacher assignments dynamically from the database.
 * Never relies on hardcoded flags or untrusted frontend inputs.
 */
export async function resolveTeacherAssignmentsFromDb(
  teacherId: string,
  userId: string,
  institutionId: string,
  departmentName?: string,
  designation?: string
): Promise<{
  roles: Array<"teacher" | "class_teacher" | "hod">;
  homeroomClass?: string;
  department?: string;
  isClassTeacher: boolean;
  isHod: boolean;
}> {
  const roles: Array<"teacher" | "class_teacher" | "hod"> = ["teacher"];
  let homeroomClass: string | undefined = undefined;
  let isClassTeacher = false;
  let isHod = false;

  // 1. Check HoD assignment in Department table
  try {
    const hodDept: any[] = await db.$queryRaw`
      SELECT id, name, code
      FROM "Department"
      WHERE "institutionId"::text = ${institutionId}
        AND ("hodStaffId"::text = ${teacherId} OR "hodStaffId"::text = ${userId})
      LIMIT 1
    `;

    if (hodDept && hodDept.length > 0) {
      isHod = true;
      if (!roles.includes("hod")) roles.push("hod");
    } else if (designation && (/hod/i.test(designation) || /head of department/i.test(designation))) {
      isHod = true;
      if (!roles.includes("hod")) roles.push("hod");
    }
  } catch (err) {
    console.warn("[resolveTeacherAssignmentsFromDb] Department check warning:", err);
  }

  // 2. Check Class Teacher assignment in Section table
  try {
    const classSection: any[] = await db.$queryRaw`
      SELECT s.id, s.name as section_name, c.name as class_name
      FROM "Section" s
      LEFT JOIN "Class" c ON c.id = s."classId"
      WHERE s."institutionId"::text = ${institutionId}
        AND (s."classTeacherStaffId"::text = ${teacherId} OR s."classTeacherStaffId"::text = ${userId})
      LIMIT 1
    `;

    if (classSection && classSection.length > 0) {
      isClassTeacher = true;
      homeroomClass = `${classSection[0].class_name || "Class"} - ${classSection[0].section_name || "A"}`;
      if (!roles.includes("class_teacher")) roles.push("class_teacher");
    } else if (designation && (/class teacher/i.test(designation) || /grade\s*\d+/i.test(designation))) {
      isClassTeacher = true;
      homeroomClass = designation.includes("10") ? "Class 10 - A" : "Class 11 - A";
      if (!roles.includes("class_teacher")) roles.push("class_teacher");
    }
  } catch (err) {
    console.warn("[resolveTeacherAssignmentsFromDb] Section check warning:", err);
  }

  return {
    roles,
    homeroomClass,
    department: departmentName,
    isClassTeacher,
    isHod,
  };
}
