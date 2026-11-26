import "server-only";
import db from "@/lib/db";

export type OtpPortalRole = "STUDENT" | "TEACHER" | "ADMIN" | "SUPER_ADMIN";

export type OtpLoginAccount = {
  id: string;
  email: string;
  fullName: string | null;
  passwordHash: string | null;
  role: OtpPortalRole;
  institutionId: string | null;
  institutionName: string | null;
  institutionSlug: string | null;
  institutionCode: string | null;
  institutionStatus: string | null;
  institutionIsActive: boolean | null;
};

export class OtpAccountError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "OtpAccountError";
  }
}

const portalRoles = new Set<OtpPortalRole>(["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"]);

export function isOtpPortalRole(value: unknown): value is OtpPortalRole {
  return typeof value === "string" && portalRoles.has(value.toUpperCase() as OtpPortalRole);
}

export async function findOtpLoginAccount(
  mobile: string,
  role: OtpPortalRole,
  institutionCode?: string
): Promise<OtpLoginAccount | null> {
  const phoneDigitsWithCountryCode = `91${mobile}`;
  const accounts = await db.$queryRaw<Array<{
    id: string;
    email: string;
    fullName: string | null;
    passwordHash: string | null;
    role: string | null;
    platformRole: string;
    status: string;
    isActive: boolean;
    institutionId: string | null;
    institutionName: string | null;
    institutionSlug: string | null;
    institutionCode: string | null;
    institutionStatus: string | null;
    institutionIsActive: boolean | null;
  }>>`
    SELECT
      u.id::text AS id,
      u.email,
      u."fullName",
      u."passwordHash",
      u.role,
      u."platformRole"::text AS "platformRole",
      u.status::text AS status,
      u."isActive",
      u."institutionId"::text AS "institutionId",
      COALESCE(i.name, pi.name) AS "institutionName",
      COALESCE(i.slug, pi.slug) AS "institutionSlug",
      pi.code AS "institutionCode",
      COALESCE(i.status::text, pi.status::text) AS "institutionStatus",
      COALESCE(pi."isActive", i.status IN ('ACTIVE', 'PENDING')) AS "institutionIsActive"
    FROM "users" u
    LEFT JOIN "Institution" i ON i.id::text = u."institutionId"::text
    LEFT JOIN "institutions" pi ON pi.id::text = u."institutionId"::text
    WHERE regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g')
      IN (${mobile}, ${phoneDigitsWithCountryCode})
  `;

  const matchingAccounts = accounts.filter((account) => {
    const accountRole = (account.role || (account.platformRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : "")).toUpperCase();
    return accountRole === role;
  });
  if (matchingAccounts.length === 0) {
    if (accounts.length === 0) {
      // No account exists for this mobile – allow registration flow
      return null;
    }
    throw new OtpAccountError("This mobile number does not belong to the selected portal.", 403);
  }

  const code = institutionCode?.trim().toLowerCase();
  const scopedAccounts = code
    ? matchingAccounts.filter((account) =>
        [account.institutionCode, account.institutionSlug, account.institutionId]
          .some((value) => value?.toLowerCase() === code)
      )
    : matchingAccounts;

  if (scopedAccounts.length > 1) {
    throw new OtpAccountError("More than one account matches this mobile number. Enter the institution code.", 400);
  }
  if (scopedAccounts.length === 0) {
    throw new OtpAccountError("This mobile number does not belong to the selected institution.", 403);
  }

  const account = scopedAccounts[0];
  if (!account.isActive || account.status !== "ACTIVE") {
    throw new OtpAccountError("This account is inactive.", 403);
  }
  if (
    account.institutionStatus === "SUSPENDED" ||
    account.institutionStatus === "ARCHIVED" ||
    (account.institutionIsActive === false &&
      account.institutionStatus !== "ACTIVE" &&
      account.institutionStatus !== "PENDING")
  ) {
    throw new OtpAccountError("This institution is not currently operational.", 403);
  }

  if (role === "ADMIN") {
    const isLegacyInstitution =
      account.institutionId === "inst_apex" ||
      account.institutionId?.startsWith("inst_") ||
      account.id === "user_apex_admin";
    if (!account.institutionId || !account.institutionName) {
      throw new OtpAccountError("Administrator institution association is missing.", 403);
    }
    if (!isLegacyInstitution && !code) {
      throw new OtpAccountError("College Code is required for this institution.", 400);
    }
  }

  return {
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    passwordHash: account.passwordHash,
    role,
    institutionId: account.institutionId,
    institutionName: account.institutionName,
    institutionSlug: account.institutionSlug,
    institutionCode: account.institutionCode,
    institutionStatus: account.institutionStatus,
    institutionIsActive: account.institutionIsActive,
  };
}
