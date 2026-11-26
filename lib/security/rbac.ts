export const DEPARTMENTAL_ROLES = [
  "ADMISSIONS_OFFICER",
  "ACCOUNTANT",
  "HOSTEL_WARDEN",
  "TRANSPORT_OFFICER",
] as const;

export type DepartmentalRole = (typeof DEPARTMENTAL_ROLES)[number];

export const FULL_ADMIN_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "INSTITUTION_ADMIN",
] as const;

export const RESERVED_PRIVILEGED_ROLE_CODES = new Set<string>(FULL_ADMIN_ROLES);

export const ADMIN_PORTAL_ROLES = [
  ...FULL_ADMIN_ROLES,
  ...DEPARTMENTAL_ROLES,
] as const;

export const PERMISSIONS = {
  ADMIN_ALL: "admin:all",
  ADMISSIONS_READ: "admissions:read",
  ADMISSIONS_WRITE: "admissions:write",
  ADMISSIONS_APPROVE: "admissions:approve",
  FEES_READ: "fees:read",
  FEES_WRITE: "fees:write",
  FEES_CONCESSION: "fees:concession",
  FEES_REFUND: "fees:refund",
  REPORTS_FINANCE: "reports:finance",
  HOSTEL_READ: "hostel:read",
  HOSTEL_WRITE: "hostel:write",
  TRANSPORT_READ: "transport:read",
  TRANSPORT_WRITE: "transport:write",
  STUDENTS_READ: "students:read",
} as const;

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [PERMISSIONS.ADMIN_ALL],
  ADMIN: [PERMISSIONS.ADMIN_ALL],
  INSTITUTION_ADMIN: [PERMISSIONS.ADMIN_ALL],
  ADMISSIONS_OFFICER: [
    PERMISSIONS.ADMISSIONS_READ,
    PERMISSIONS.ADMISSIONS_WRITE,
    PERMISSIONS.ADMISSIONS_APPROVE,
    PERMISSIONS.STUDENTS_READ,
  ],
  ACCOUNTANT: [
    PERMISSIONS.FEES_READ,
    PERMISSIONS.FEES_WRITE,
    PERMISSIONS.FEES_CONCESSION,
    PERMISSIONS.FEES_REFUND,
    PERMISSIONS.REPORTS_FINANCE,
    PERMISSIONS.STUDENTS_READ,
  ],
  HOSTEL_WARDEN: [
    PERMISSIONS.HOSTEL_READ,
    PERMISSIONS.HOSTEL_WRITE,
    PERMISSIONS.STUDENTS_READ,
  ],
  TRANSPORT_OFFICER: [
    PERMISSIONS.TRANSPORT_READ,
    PERMISSIONS.TRANSPORT_WRITE,
    PERMISSIONS.STUDENTS_READ,
  ],
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Institution Admin",
  INSTITUTION_ADMIN: "Institution Admin",
  ADMISSIONS_OFFICER: "Admissions Officer",
  ACCOUNTANT: "Accountant",
  HOSTEL_WARDEN: "Hostel Warden",
  TRANSPORT_OFFICER: "Transport Officer",
  TEACHER: "Faculty / Teacher",
  STUDENT: "Student",
  PARENT: "Parent / Guardian",
};

export function isDepartmentalRole(role?: string | null): boolean {
  const upper = (role || "").toUpperCase();
  return (DEPARTMENTAL_ROLES as readonly string[]).includes(upper);
}

export function isFullAdminRole(role?: string | null): boolean {
  const upper = (role || "").toUpperCase();
  return (FULL_ADMIN_ROLES as readonly string[]).includes(upper);
}

export function isAdminPortalRole(role?: string | null): boolean {
  const upper = (role || "").toUpperCase();
  return (ADMIN_PORTAL_ROLES as readonly string[]).includes(upper);
}

export function getRoleLandingRoute(role?: string | null): string {
  const upper = (role || "").toUpperCase();
  switch (upper) {
    case "ADMISSIONS_OFFICER":
      return "/admin/admissions";
    case "ACCOUNTANT":
      return "/admin/fees";
    case "HOSTEL_WARDEN":
      return "/admin/hostel";
    case "TRANSPORT_OFFICER":
      return "/admin/transport";
    case "SUPER_ADMIN":
      return "/super-admin";
    case "ADMIN":
    case "INSTITUTION_ADMIN":
    default:
      return "/admin";
  }
}

export function getDefaultPermissionsForRole(role?: string | null): string[] {
  const upper = (role || "").toUpperCase();
  return [...(DEFAULT_ROLE_PERMISSIONS[upper] || [])];
}

export interface RoleAssignmentInput {
  roleCode: string;
  explicitPermissions: string[];
}

/**
 * Deterministic, pure permission resolution across primary role and tenant-assigned roles:
 * - Full-admin system roles always retain `admin:all`.
 * - Tenant-defined roles can NEVER grant `admin:all` or escalate to privileged system roles.
 * - If no UserRoleAssignment rows exist, falls back to primary departmental role defaults.
 * - If UserRoleAssignment rows exist, each assigned role with explicit RolePermission rows
 *   uses ONLY those explicit permissions (allowing admins to restrict defaults); an assigned
 *   departmental role with 0 RolePermission rows falls back to its own departmental defaults.
 */
export function resolveEffectivePermissions(
  primaryRole?: string | null,
  assignments: RoleAssignmentInput[] = []
): { assignedRoles: string[]; permissions: string[] } {
  const roleUpper = (primaryRole || "").toUpperCase();
  if (isFullAdminRole(roleUpper)) {
    return {
      assignedRoles: [roleUpper],
      permissions: [PERMISSIONS.ADMIN_ALL],
    };
  }

  const roleSet = new Set<string>(roleUpper ? [roleUpper] : []);
  const permSet = new Set<string>();

  if (assignments.length === 0) {
    for (const p of getDefaultPermissionsForRole(roleUpper)) {
      if (p !== PERMISSIONS.ADMIN_ALL) permSet.add(p);
    }
  } else {
    for (const a of assignments) {
      const code = (a.roleCode || "").toUpperCase();
      // Never allow a tenant-defined role matching a reserved system code to grant admin:all
      if (!code || RESERVED_PRIVILEGED_ROLE_CODES.has(code)) {
        continue;
      }
      roleSet.add(code);
      if (a.explicitPermissions.length > 0) {
        for (const p of a.explicitPermissions) {
          if (p && p !== PERMISSIONS.ADMIN_ALL) {
            permSet.add(p);
          }
        }
      } else if (isDepartmentalRole(code)) {
        for (const p of getDefaultPermissionsForRole(code)) {
          if (p !== PERMISSIONS.ADMIN_ALL) permSet.add(p);
        }
      }
    }
  }

  return {
    assignedRoles: Array.from(roleSet),
    permissions: Array.from(permSet),
  };
}

export function hasPermission(
  userPermissions: string[],
  requiredPermission?: string,
  userRole?: string | null
): boolean {
  if (isFullAdminRole(userRole) || userPermissions.includes(PERMISSIONS.ADMIN_ALL)) {
    return true;
  }
  if (!requiredPermission) {
    return false;
  }
  return userPermissions.includes(requiredPermission);
}

/**
 * UI-level navigation helper (server APIs always enforce authorization independently).
 */
export function canAccessAdminPage(
  role?: string | null,
  permissions: string[] = [],
  pathname = ""
): boolean {
  if (isFullAdminRole(role) || permissions.includes(PERMISSIONS.ADMIN_ALL)) {
    return true;
  }
  if (!isDepartmentalRole(role)) {
    return false;
  }
  if (pathname === "/admin/login") {
    return true;
  }
  if (pathname.startsWith("/admin/admissions")) {
    return hasPermission(permissions, PERMISSIONS.ADMISSIONS_READ, role);
  }
  if (pathname.startsWith("/admin/fees")) {
    return hasPermission(permissions, PERMISSIONS.FEES_READ, role);
  }
  if (pathname.startsWith("/admin/hostel")) {
    return hasPermission(permissions, PERMISSIONS.HOSTEL_READ, role);
  }
  if (pathname.startsWith("/admin/transport")) {
    return hasPermission(permissions, PERMISSIONS.TRANSPORT_READ, role);
  }
  if (pathname === "/admin/students" || pathname.startsWith("/admin/students/")) {
    return hasPermission(permissions, PERMISSIONS.STUDENTS_READ, role);
  }
  return false;
}
