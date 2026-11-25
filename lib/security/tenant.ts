import { SessionUser } from "@/types";
import { ForbiddenError } from "../auth/session";

/**
 * Minimal context structure required for division-level tenant assertions.
 */
export interface DivisionContextLike {
  institutionId: string;
  isInstitutionWideAdmin?: boolean;
  permittedDivisionIds?: string[];
  activeDivisionId?: string;
}

/**
 * Enforces that a record being accessed belongs strictly to the authenticated user's institution.
 * Rule 1: Every institution must have isolated data.
 * Rule 2: A user must not access records belonging to another institution.
 */
export function assertTenant(session: SessionUser, targetInstitutionId: string): void {
  if (session.role === "SUPER_ADMIN") return; // Super admin cross-tenant bypass permitted only for system audits

  if (session.institutionId !== targetInstitutionId) {
    throw new ForbiddenError("Tenant violation: cross-institution access is strictly forbidden.");
  }
}

/**
 * Attaches institutional scope to Prisma where filters.
 */
export function scopeToTenant<T extends Record<string, any>>(
  session: SessionUser,
  whereClause: T = {} as T
): T & { institutionId: string } {
  return {
    ...whereClause,
    institutionId: session.institutionId,
  };
}

/**
 * Enforces that a division-scoped record being accessed belongs strictly to the user's authorized divisions.
 * Tier 1: Record's institutionId must match the user's institutionId (unless Super Admin).
 * Tier 2: If record has a divisionId, user must be an institution-wide admin or have explicit permission for that division.
 * Shared/unscoped resources (resourceDivisionId is null/undefined) are permitted if institution matches.
 */
export function assertDivisionTenant(
  context: DivisionContextLike,
  resourceDivisionId: string | null | undefined,
  resourceInstitutionId?: string
): void {
  // Tier 1: Root Tenant Boundary
  if (resourceInstitutionId && resourceInstitutionId !== context.institutionId) {
    throw new ForbiddenError("Cross-tenant access violation: Resource belongs to a different institution.");
  }

  // Tier 2: Division Scope (unscoped resources e.g. shared facilities are allowed)
  if (!resourceDivisionId) return;

  // Global institution admins have access to all divisions in their institution
  if (context.isInstitutionWideAdmin) return;

  const permitted = context.permittedDivisionIds || (context.activeDivisionId ? [context.activeDivisionId] : []);
  if (!permitted.includes(resourceDivisionId)) {
    throw new ForbiddenError("IDOR protection: Resource belongs to an unauthorized educational division.");
  }
}

/**
 * Attaches division scope to Prisma where filters.
 */
export function scopeToDivision<T extends Record<string, any>>(
  context: DivisionContextLike,
  whereClause: T = {} as T
): T & { institutionId: string; divisionId?: string } {
  const scoped: any = {
    ...whereClause,
    institutionId: context.institutionId,
  };

  if (!context.isInstitutionWideAdmin && context.activeDivisionId) {
    scoped.divisionId = context.activeDivisionId;
  }

  return scoped;
}
