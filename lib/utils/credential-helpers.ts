/**
 * SST-ERP Credential Management Client Helpers
 * Pure utilities safe for client and server execution (no Node.js crypto/db dependencies).
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

/**
 * Determine if a staff designation represents teaching faculty eligible for TEACHER portal access.
 */
export function isTeachingFacultyTitle(designation?: string, assignedRoleName?: string): boolean {
  if (!designation) {
    if (assignedRoleName) {
      const roleLower = assignedRoleName.toLowerCase();
      if (roleLower.includes("faculty") || roleLower.includes("teacher")) return true;
    }
    return false;
  }

  const desLower = designation.toLowerCase().trim();

  // Non-teaching patterns take precedence
  for (const pattern of NON_TEACHING_PATTERNS) {
    if (pattern.test(desLower)) return false;
  }

  // Teaching patterns check
  for (const pattern of TEACHING_PATTERNS) {
    if (pattern.test(desLower)) return true;
  }

  if (assignedRoleName) {
    const roleLower = assignedRoleName.toLowerCase();
    if (roleLower.includes("faculty") || roleLower.includes("teacher")) return true;
  }

  return false;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a value is a valid 36-character UUID string.
 * Prevents PostgreSQL @db.Uuid column conversion errors in Prisma queries.
 */
export function isValidUuid(val: any): boolean {
  return typeof val === "string" && UUID_REGEX.test(val.trim());
}

export type PortalAccountStatus = "ACTIVE" | "PENDING_SETUP" | "DISABLED" | "NOT_CREATED" | "INELIGIBLE" | "UNVERIFIED";

export type InvitationStatus = "PENDING" | "SENT" | "FAILED" | "ACCEPTED";

export function getPortalStatusBadgeConfig(status: PortalAccountStatus): {
  label: string;
  variant: "success" | "error" | "warning" | "neutral" | "navy";
  description: string;
} {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Portal Active",
        variant: "success",
        description: "User has an active portal account and can log in.",
      };
    case "PENDING_SETUP":
      return {
        label: "Pending Setup",
        variant: "warning",
        description: "Account provisioned and invitation sent. Awaiting password setup by user.",
      };
    case "DISABLED":
      return {
        label: "Access Disabled",
        variant: "error",
        description: "Portal access is currently suspended by an administrator.",
      };
    case "INELIGIBLE":
      return {
        label: "Ineligible",
        variant: "neutral",
        description: "Non-teaching staff are not eligible for faculty portal access.",
      };
    case "UNVERIFIED":
      return {
        label: "Verification Needed",
        variant: "warning",
        description: "Requires at least one verified student relationship before portal access can be issued.",
      };
    case "NOT_CREATED":
    default:
      return {
        label: "No Account",
        variant: "neutral",
        description: "Portal credentials have not yet been generated.",
      };
  }
}

export function getInvitationStatusBadgeConfig(status: InvitationStatus): {
  label: string;
  variant: "success" | "error" | "warning" | "neutral" | "navy";
  description: string;
} {
  switch (status) {
    case "ACCEPTED":
      return {
        label: "Accepted",
        variant: "success",
        description: "User has accepted the invitation and created their password.",
      };
    case "SENT":
      return {
        label: "Invitation Sent",
        variant: "navy",
        description: "Setup invitation email has been dispatched with a 24-hour setup link.",
      };
    case "FAILED":
      return {
        label: "Delivery Failed",
        variant: "error",
        description: "Email delivery failed. Resend invitation is available.",
      };
    case "PENDING":
    default:
      return {
        label: "Pending Dispatch",
        variant: "warning",
        description: "Invitation is pending delivery.",
      };
  }
}
