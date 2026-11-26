import db from "@/lib/db";
import {
  isFullAdminRole,
  PERMISSIONS,
  resolveEffectivePermissions,
  type RoleAssignmentInput,
} from "./rbac";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveUserPermissionsFromDb(
  userId?: string | null,
  institutionId?: string | null,
  primaryRole?: string | null
): Promise<{ assignedRoles: string[]; permissions: string[] }> {
  const roleUpper = (primaryRole || "").toUpperCase();

  if (isFullAdminRole(roleUpper)) {
    return {
      assignedRoles: [roleUpper],
      permissions: [PERMISSIONS.ADMIN_ALL],
    };
  }

  const assignmentsInput: RoleAssignmentInput[] = [];

  if (userId && userId.trim().length > 0 && institutionId && UUID_REGEX.test(institutionId)) {
    try {
      const assignments = await db.userRoleAssignment.findMany({
        where: { userId, institutionId },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      for (const assignment of assignments) {
        if (!assignment.role) continue;
        assignmentsInput.push({
          roleCode: assignment.role.code,
          explicitPermissions: (assignment.role.permissions || [])
            .map((rp) => rp.permission?.code)
            .filter((c): c is string => Boolean(c)),
        });
      }
    } catch {
      console.error("[rbac] Permission lookup failed; denying access.");
      return {
        assignedRoles: roleUpper ? [roleUpper] : [],
        permissions: [],
      };
    }
  }

  return resolveEffectivePermissions(roleUpper, assignmentsInput);
}
