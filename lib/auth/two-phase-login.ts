import { ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { withTenantContext } from "@/lib/security/tenant-context";

export interface PreTenantInstitutionRecord {
  id: string;
  name: string;
  slug: string | null;
  code: string | null;
  status: string;
  isActive: boolean;
}

export interface PreTenantUserRecord {
  id: string;
  email: string;
  phone: string | null;
  passwordHash: string | null;
  role: string | null;
  platformRole: string | null;
  isActive: boolean;
  status: string;
  institutionId: string | null;
  fullName: string | null;
}

export interface TwoPhaseAuthClient {
  institution: {
    findFirst: (args: any) => Promise<PreTenantInstitutionRecord | null>;
  };
  user: {
    findFirst: (args: any) => Promise<PreTenantUserRecord | null>;
  };
  platformSetting: {
    findUnique: (args: any) => Promise<{ value: unknown } | null>;
  };
}

/**
 * Phase 1: Resolves optional institution code and user identity on the isolated
 * pre-tenant auth client (`erp_auth_login`), enforcing strict tenant matching
 * so a client-supplied institutionCode can never override user.institutionId.
 */
export async function resolvePreTenantLoginIdentity(
  authClient: TwoPhaseAuthClient,
  params: { email: string; institutionCode?: string }
): Promise<{
  user: PreTenantUserRecord;
  requestedInstitution: PreTenantInstitutionRecord | null;
  resolvedInstitutionId: string | null;
}> {
  const email = params.email.trim();
  const trimmedCode = typeof params.institutionCode === "string" ? params.institutionCode.trim() : "";

  let requestedInstitution: PreTenantInstitutionRecord | null = null;
  if (trimmedCode) {
    requestedInstitution = await authClient.institution.findFirst({
      where: {
        OR: [
          { code: { equals: trimmedCode, mode: "insensitive" } },
          { id: { equals: trimmedCode, mode: "insensitive" } },
          { slug: { equals: trimmedCode, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, slug: true, code: true, status: true, isActive: true },
    });
    if (!requestedInstitution) {
      throw new UnauthorizedError("Invalid College Code / Institution Code or institution not found.");
    }
  }

  const user = await authClient.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(requestedInstitution ? { institutionId: requestedInstitution.id } : {}),
    },
    select: {
      id: true,
      email: true,
      phone: true,
      passwordHash: true,
      role: true,
      platformRole: true,
      isActive: true,
      status: true,
      institutionId: true,
      fullName: true,
    },
  });

  if (!user || !user.isActive || user.status !== "ACTIVE") {
    throw new UnauthorizedError("Account is inactive, suspended, or archived.");
  }

  // Never trust client-supplied institutionId over the verified user.institutionId
  if (requestedInstitution && user.institutionId !== requestedInstitution.id) {
    throw new ForbiddenError("Access denied: Account does not belong to this institution.");
  }

  // Archived account check
  if (user.institutionId) {
    const roleUpper = (user.role || "").toUpperCase();
    const archivedKey =
      roleUpper === "TEACHER"
        ? `archived_staff:${user.institutionId}`
        : roleUpper === "PARENT" || roleUpper === "GUARDIAN"
        ? `archived_guardians:${user.institutionId}`
        : `archived_students:${user.institutionId}`;

    const setting = await authClient.platformSetting
      .findUnique({ where: { key: archivedKey } })
      .catch(() => null);
    if (setting?.value && Array.isArray(setting.value)) {
      const isArchived = (setting.value as any[]).some(
        (a: any) => a?.id === user.id || a?.userId === user.id
      );
      if (isArchived) {
        throw new ForbiddenError("Account has been archived. Access denied.");
      }
    }
  }

  return {
    user,
    requestedInstitution,
    resolvedInstitutionId: user.institutionId,
  };
}

/**
 * Phase 2: Executes institution-scoped login reads/writes (RBAC, portal links,
 * session creation, lastLoginAt) strictly inside `withTenantContext`.
 */
export async function executeInstitutionLoginPhase<T>(
  institutionId: string,
  fn: (tx: any) => Promise<T>,
  runner: typeof withTenantContext = withTenantContext
): Promise<T> {
  if (!institutionId || institutionId.trim() === "") {
    throw new ForbiddenError("Institution context is required for tenant login operations.");
  }
  return runner(institutionId, fn);
}
