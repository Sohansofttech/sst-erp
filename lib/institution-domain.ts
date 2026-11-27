import "server-only";
import db from "@/lib/db";

export type InstitutionDomainResolution =
  | {
      status: "ACTIVE";
      institutionId: string;
      institutionName: string;
      institutionCode: string | null;
      institutionSlug: string;
      institutionType: string;
      logo: string | null;
    }
  | {
      status: "PENDING" | "VERIFIED" | "SUSPENDED" | "REMOVED" | "ARCHIVED" | "UNKNOWN";
      hostname: string;
    };

export async function resolveInstitutionDomain(hostname: string): Promise<InstitutionDomainResolution> {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized) return { status: "UNKNOWN", hostname: normalized };

  const domain = await db.institutionDomain.findFirst({
    where: { domain: { equals: normalized, mode: "insensitive" } },
    select: {
      id: true,
      status: true,
      institutionId: true,
      institution: {
        select: {
          id: true,
          name: true,
          code: true,
          slug: true,
          type: true,
          status: true,
          archivedAt: true,
          branding: { select: { logoUrl: true } },
        },
      },
    },
  });

  if (!domain) return { status: "UNKNOWN", hostname: normalized };
  if (domain.status === "REMOVED") return { status: "REMOVED", hostname: normalized };
  if (domain.status === "SUSPENDED") return { status: "SUSPENDED", hostname: normalized };
  if (domain.status !== "ACTIVE") return { status: domain.status === "VERIFIED" ? "VERIFIED" : "PENDING", hostname: normalized };
  if (domain.institution.status !== "ACTIVE" || domain.institution.archivedAt) {
    return {
      status: domain.institution.archivedAt || domain.institution.status === "ARCHIVED" ? "ARCHIVED" : "SUSPENDED",
      hostname: normalized,
    };
  }

  return {
    status: "ACTIVE",
    institutionId: domain.institution.id,
    institutionName: domain.institution.name,
    institutionCode: domain.institution.code,
    institutionSlug: domain.institution.slug,
    institutionType: domain.institution.type,
    logo: domain.institution.branding?.logoUrl || null,
  };
}
