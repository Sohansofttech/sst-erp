export type PortalAccessIssue = "pending" | "suspended" | "archived" | "not_found" | "failed";

export const PORTAL_ACCESS_ISSUES: readonly PortalAccessIssue[] = ["pending", "suspended", "archived", "not_found", "failed"];

export function isPortalAccessIssue(value: unknown): value is PortalAccessIssue {
  return typeof value === "string" && (PORTAL_ACCESS_ISSUES as readonly string[]).includes(value);
}

/** Returns the blocking issue for the institution's real status, or null when the portal may be opened. */
export function getPortalAccessIssue(
  institution: { status: string; archivedAt?: Date | null } | null
): PortalAccessIssue | null {
  if (!institution) return "not_found";
  if (institution.archivedAt || institution.status === "ARCHIVED") return "archived";
  if (institution.status === "SUSPENDED") return "suspended";
  if (institution.status === "PENDING") return "pending";
  if (institution.status !== "ACTIVE") return "failed";
  return null;
}

export function getPortalAccessMessage(issue: PortalAccessIssue, institutionName?: string | null): string {
  const name = institutionName ? `"${institutionName}"` : "This institution";
  switch (issue) {
    case "pending":
      return `${name} is not activated yet. Please activate it from Institution Management before opening the portal.`;
    case "suspended":
      return `${name} is currently suspended. Please reactivate it from Institution Management before opening the portal.`;
    case "archived":
      return `${name} is archived. Restore it from Institution Management before opening the portal.`;
    case "not_found":
      return "The selected institution could not be found. Please refresh the list and try again.";
    default:
      return "The institution portal could not be opened right now. Please try again, and contact support if it continues.";
  }
}
