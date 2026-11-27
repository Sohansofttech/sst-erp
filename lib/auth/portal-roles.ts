const PORTAL_ROLE_ACCESS: Record<string, readonly string[]> = {
  STUDENT: ["STUDENT"],
  TEACHER: ["TEACHER"],
  ADMIN: [
    "ADMIN",
    "INSTITUTION_ADMIN",
    "ADMISSIONS_OFFICER",
    "ACCOUNTANT",
    "HOSTEL_WARDEN",
    "TRANSPORT_OFFICER",
  ],
  INSTITUTION_ADMIN: [
    "ADMIN",
    "INSTITUTION_ADMIN",
    "ADMISSIONS_OFFICER",
    "ACCOUNTANT",
    "HOSTEL_WARDEN",
    "TRANSPORT_OFFICER",
  ],
  SUPER_ADMIN: ["SUPER_ADMIN"],
};

export function isKnownPortalRole(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PORTAL_ROLE_ACCESS, value.trim().toUpperCase())
  );
}

export function portalRoleAllows(portalRole: string, accountRole: string): boolean {
  const normalizedPortalRole = portalRole.trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(PORTAL_ROLE_ACCESS, normalizedPortalRole)) {
    return false;
  }
  return PORTAL_ROLE_ACCESS[normalizedPortalRole].includes(accountRole.trim().toUpperCase());
}
