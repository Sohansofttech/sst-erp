export interface InstitutionPortalRecord {
  id: string;
  name: string;
  code: string | null;
  slug: string;
  type: string;
  website?: string | null;
  domains?: Array<{
    domain: string;
    status: string;
  }>;
}

export function getInstitutionPortalIdentifier(institution: Pick<InstitutionPortalRecord, "code" | "slug">): string {
  return institution.code?.trim() || institution.slug.trim();
}

export function getInstitutionPortalUrl(institution: InstitutionPortalRecord): string {
  const configuredBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_BASE_URL;
  const baseUrl = configuredBase?.trim()
    ? configuredBase.trim().replace(/\/$/, "")
    : process.env.NODE_ENV === "production"
      ? "https://ssterp.in"
      : "http://localhost:3000";
  const identifier = getInstitutionPortalIdentifier(institution);
  return `${baseUrl}/login?${new URLSearchParams({ role: "admin", institutionCode: identifier }).toString()}`;
}
