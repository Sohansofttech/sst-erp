/**
 * ============================================================================
 * Service: lib/services/division.service.ts
 * Description: Production-grade business logic and data access for Educational
 *              Divisions with multi-tenant isolation and safe deletion rules.
 *
 * Rules Enforced:
 * 1. Single-Institution Tenant Isolation: All operations are strictly scoped to institutionId.
 * 2. Uniqueness: Code and slug must be unique within an institution (@@unique([institutionId, code]), @@unique([institutionId, slug])).
 * 3. Division Types: MONTESSORI, SCHOOL, HIGHER_SECONDARY, COLLEGE, ACADEMY.
 * 4. Safe Deletion: Divisions containing active academic or financial records (students, enrollments,
 *    classes, invoices, staff assignments) CANNOT be hard-deleted. They must be archived.
 * 5. Atomic Default: Setting a division as default automatically unsets other defaults in a transaction.
 * ============================================================================
 */

import db from "@/lib/db";
import { DivisionType, DivisionStatus } from "@prisma/client";
import { ForbiddenError } from "@/lib/auth/session";
import {
  assertDivisionCreationCapacity,
  assertDivisionTypeEntitled,
  DivisionSubscriptionError,
} from "@/lib/billing/division-entitlements";

export interface DivisionBrandingSettings {
  brandColor?: string;
  shortName?: string;
  tagline?: string;
  affiliationNumber?: string;
  boardOrUniversity?: string;
  termSystem?: "SEMESTER" | "TERM" | "ANNUAL" | "MILESTONE";
  gradingSystem?: string;
  [key: string]: any;
}

export interface CreateDivisionInput {
  name: string;
  code?: string;
  slug?: string;
  type?: DivisionType;
  status?: DivisionStatus;
  isDefault?: boolean;
  description?: string | null;
  logoUrl?: string | null;
  academicSettings?: DivisionBrandingSettings | null;
  bypassSubscriptionCheck?: boolean;
}

export interface UpdateDivisionInput {
  name?: string;
  code?: string;
  slug?: string;
  type?: DivisionType;
  status?: DivisionStatus;
  isDefault?: boolean;
  description?: string | null;
  logoUrl?: string | null;
  academicSettings?: DivisionBrandingSettings | null;
  bypassSubscriptionCheck?: boolean;
}

export interface ListDivisionsOptions {
  status?: DivisionStatus;
  type?: DivisionType;
  search?: string;
  includeCounts?: boolean;
}

/**
 * Normalizes a string into a clean URL-friendly slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generates a clean division code from name and type.
 */
export function generateDivisionCode(name: string, type: DivisionType): string {
  const prefixMap: Record<DivisionType, string> = {
    MONTESSORI: "MONT",
    SCHOOL: "SCH",
    HIGHER_SECONDARY: "HSEC",
    COLLEGE: "COL",
    ACADEMY: "ACAD",
  };
  const prefix = prefixMap[type] || "DIV";
  const nameClean = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase();
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${nameClean || "WING"}-${rand}`;
}

/**
 * Validates division branding and academic settings.
 */
export function validateAcademicSettings(settings: any): DivisionBrandingSettings {
  if (!settings || typeof settings !== "object") return {};

  const clean: DivisionBrandingSettings = {};

  if (typeof settings.brandColor === "string") {
    const color = settings.brandColor.trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      clean.brandColor = color;
    }
  }

  if (typeof settings.shortName === "string") {
    clean.shortName = settings.shortName.trim().slice(0, 50);
  }

  if (typeof settings.tagline === "string") {
    clean.tagline = settings.tagline.trim().slice(0, 160);
  }

  if (typeof settings.affiliationNumber === "string") {
    clean.affiliationNumber = settings.affiliationNumber.trim().slice(0, 80);
  }

  if (typeof settings.boardOrUniversity === "string") {
    clean.boardOrUniversity = settings.boardOrUniversity.trim().slice(0, 100);
  }

  if (["SEMESTER", "TERM", "ANNUAL", "MILESTONE"].includes(settings.termSystem)) {
    clean.termSystem = settings.termSystem;
  }

  if (typeof settings.gradingSystem === "string") {
    clean.gradingSystem = settings.gradingSystem.trim().slice(0, 50);
  }

  return clean;
}

/**
 * Lists divisions belonging to the verified institution.
 */
export async function listDivisions(
  institutionId: string,
  options: ListDivisionsOptions = {}
) {
  const where: any = {
    institutionId,
  };

  if (options.status) {
    where.status = options.status;
  }

  if (options.type) {
    where.type = options.type;
  }

  if (options.search && options.search.trim() !== "") {
    const s = options.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { code: { contains: s, mode: "insensitive" } },
      { slug: { contains: s, mode: "insensitive" } },
    ];
  }

  const divisions = await db.institutionDivision.findMany({
    where,
    include: options.includeCounts
      ? {
          _count: {
            select: {
              classes: true,
              students: true,
              enrollments: true,
              feeInvoices: true,
              staffAssignments: true,
              memberships: true,
            },
          },
        }
      : undefined,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return divisions;
}

/**
 * Retrieves a single division by ID, scoped to institution.
 */
export async function getDivisionById(institutionId: string, divisionId: string) {
  const division = await db.institutionDivision.findFirst({
    where: {
      id: divisionId,
      institutionId,
    },
    include: {
      _count: {
        select: {
          classes: true,
          students: true,
          enrollments: true,
          feeInvoices: true,
          staffAssignments: true,
          memberships: true,
          departments: true,
          courses: true,
        },
      },
    },
  });

  if (!division) {
    throw new ForbiddenError("Division not found in this institution.");
  }

  return division;
}

/**
 * Creates a new educational division within the verified institution.
 */
export async function createDivision(
  institutionId: string,
  input: CreateDivisionInput
) {
  const name = input.name?.trim();
  if (!name || name.length < 2) {
    throw new Error("Division name is required and must be at least 2 characters long.");
  }

  // Verify parent institution exists
  const inst = await db.institution.findUnique({
    where: { id: institutionId },
    select: { id: true, name: true, code: true, slug: true },
  });

  if (!inst) {
    throw new ForbiddenError("Institution not found.");
  }

  const type = input.type || DivisionType.COLLEGE;
  if (!Object.values(DivisionType).includes(type)) {
    throw new Error(`Invalid division type: ${type}. Allowed types: ${Object.values(DivisionType).join(", ")}`);
  }

  // Generate or sanitize code
  let code = input.code?.trim().toUpperCase();
  if (!code) {
    code = generateDivisionCode(name, type);
  }

  // Check code uniqueness within institution
  const existingCode = await db.institutionDivision.findFirst({
    where: { institutionId, code },
  });
  if (existingCode) {
    throw new Error(`A division with code "${code}" already exists in this institution.`);
  }

  // Generate or sanitize slug
  let slug = input.slug ? slugify(input.slug) : slugify(name);
  if (!slug) {
    slug = slugify(`${inst.slug || "inst"}-${name}`);
  }

  // Check slug uniqueness within institution
  const existingSlug = await db.institutionDivision.findFirst({
    where: { institutionId, slug },
  });
  if (existingSlug) {
    // Append unique suffix to prevent collision
    const randSuffix = Math.floor(100 + Math.random() * 900);
    slug = `${slug}-${randSuffix}`;
  }

  const status = input.status || DivisionStatus.ACTIVE;
  const isDefault = Boolean(input.isDefault);
  const cleanSettings = input.academicSettings ? validateAcademicSettings(input.academicSettings) : null;

  return await db.$transaction(async (tx) => {
    // Enforce subscription division limits and division type entitlements
    if (!input.bypassSubscriptionCheck) {
      await assertDivisionCreationCapacity(tx, institutionId, type);
    }

    // If setting as default, unset existing default
    if (isDefault) {
      await tx.institutionDivision.updateMany({
        where: { institutionId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const created = await tx.institutionDivision.create({
      data: {
        institutionId,
        name,
        code,
        slug,
        type,
        status,
        isDefault,
        description: input.description?.trim() || null,
        logoUrl: input.logoUrl?.trim() || null,
        academicSettings: cleanSettings ? (cleanSettings as any) : undefined,
      },
      include: {
        _count: {
          select: {
            classes: true,
            students: true,
            enrollments: true,
          },
        },
      },
    });

    return created;
  });
}

/**
 * Updates an existing division details, type, branding, or status.
 */
export async function updateDivision(
  institutionId: string,
  divisionId: string,
  input: UpdateDivisionInput
) {
  const existing = await db.institutionDivision.findFirst({
    where: { id: divisionId, institutionId },
  });

  if (!existing) {
    throw new ForbiddenError("Division not found in this institution.");
  }

  const updateData: any = {};

  if (input.name !== undefined) {
    const trimmedName = input.name.trim();
    if (trimmedName.length < 2) {
      throw new Error("Division name must be at least 2 characters long.");
    }
    updateData.name = trimmedName;
  }

  if (input.code !== undefined) {
    const trimmedCode = input.code.trim().toUpperCase();
    if (!trimmedCode) {
      throw new Error("Division code cannot be empty.");
    }
    if (trimmedCode !== existing.code) {
      const codeConflict = await db.institutionDivision.findFirst({
        where: { institutionId, code: trimmedCode, NOT: { id: divisionId } },
      });
      if (codeConflict) {
        throw new Error(`A division with code "${trimmedCode}" already exists in this institution.`);
      }
      updateData.code = trimmedCode;
    }
  }

  if (input.slug !== undefined) {
    const cleanSlug = slugify(input.slug);
    if (!cleanSlug) {
      throw new Error("Division slug cannot be empty.");
    }
    if (cleanSlug !== existing.slug) {
      const slugConflict = await db.institutionDivision.findFirst({
        where: { institutionId, slug: cleanSlug, NOT: { id: divisionId } },
      });
      if (slugConflict) {
        throw new Error(`A division with slug "${cleanSlug}" already exists in this institution.`);
      }
      updateData.slug = cleanSlug;
    }
  }

  if (input.type !== undefined) {
    if (!Object.values(DivisionType).includes(input.type)) {
      throw new Error(`Invalid division type: ${input.type}`);
    }
    if (input.type !== existing.type && !input.bypassSubscriptionCheck) {
      await assertDivisionTypeEntitled(db, institutionId, input.type);
    }
    updateData.type = input.type;
  }

  if (input.status !== undefined) {
    if (!Object.values(DivisionStatus).includes(input.status)) {
      throw new Error(`Invalid division status: ${input.status}`);
    }
    updateData.status = input.status;
  }

  if (input.description !== undefined) {
    updateData.description = input.description ? input.description.trim() : null;
  }

  if (input.logoUrl !== undefined) {
    updateData.logoUrl = input.logoUrl ? input.logoUrl.trim() : null;
  }

  if (input.academicSettings !== undefined) {
    updateData.academicSettings = input.academicSettings
      ? (validateAcademicSettings(input.academicSettings) as any)
      : null;
  }

  const isDefault = input.isDefault;

  return await db.$transaction(async (tx) => {
    if (isDefault === true && !existing.isDefault) {
      // Unset other defaults
      await tx.institutionDivision.updateMany({
        where: { institutionId, isDefault: true, NOT: { id: divisionId } },
        data: { isDefault: false },
      });
      updateData.isDefault = true;
    } else if (isDefault === false && existing.isDefault) {
      updateData.isDefault = false;
    }

    const updated = await tx.institutionDivision.update({
      where: { id: divisionId },
      data: updateData,
      include: {
        _count: {
          select: {
            classes: true,
            students: true,
            enrollments: true,
            feeInvoices: true,
          },
        },
      },
    });

    return updated;
  });
}

/**
 * Safely deletes or archives an educational division.
 * Enforces Safe Deletion Rules:
 * - If division has linked students, enrollments, fee invoices, classes, departments, or staff assignments:
 *   HARD DELETION IS BLOCKED. Division must be archived instead.
 * - Only completely empty divisions with 0 historical/operational records may be hard-deleted.
 */
export async function deleteDivision(
  institutionId: string,
  divisionId: string,
  options: { forceArchive?: boolean } = {}
) {
  const existing = await db.institutionDivision.findFirst({
    where: { id: divisionId, institutionId },
    include: {
      _count: {
        select: {
          students: true,
          enrollments: true,
          feeInvoices: true,
          classes: true,
          departments: true,
          courses: true,
          staffAssignments: true,
          memberships: true,
          enrollmentHistories: true,
        },
      },
    },
  });

  if (!existing) {
    throw new ForbiddenError("Division not found in this institution.");
  }

  const counts = existing._count;
  const totalRecords =
    counts.students +
    counts.enrollments +
    counts.feeInvoices +
    counts.classes +
    counts.departments +
    counts.courses +
    counts.staffAssignments +
    counts.memberships +
    counts.enrollmentHistories;

  if (totalRecords > 0) {
    if (options.forceArchive || existing.status === DivisionStatus.ACTIVE) {
      // Safe archival
      const archived = await db.institutionDivision.update({
        where: { id: divisionId },
        data: {
          status: DivisionStatus.ARCHIVED,
          isDefault: false,
        },
      });

      return {
        action: "ARCHIVED",
        message: `Division has been archived safely. It contains ${totalRecords} linked records (${counts.students} students, ${counts.enrollments} enrollments, ${counts.feeInvoices} invoices) and cannot be permanently deleted.`,
        division: archived,
      };
    }

    throw new Error(
      `Cannot permanently delete division: It contains ${totalRecords} linked records (${counts.students} students, ${counts.enrollments} enrollments, ${counts.feeInvoices} invoices, ${counts.classes} classes). To decommission this division, archive it instead.`
    );
  }

  // Division is completely empty: hard deletion is safe
  await db.institutionDivision.delete({
    where: { id: divisionId },
  });

  return {
    action: "DELETED",
    message: "Division had no linked records and was deleted successfully.",
    deletedId: divisionId,
  };
}
