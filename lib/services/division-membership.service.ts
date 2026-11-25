/**
 * ============================================================================
 * Service: lib/services/division-membership.service.ts
 * Description: Business logic and data access for Division Memberships with
 *              multi-tenant isolation guarantees.
 * ============================================================================
 */

import db from "@/lib/db";
import { ForbiddenError } from "@/lib/auth/session";

export interface CreateDivisionMembershipInput {
  userId: string;
  divisionId: string;
  roleId: string;
  status?: string;
}

export interface UpdateDivisionMembershipInput {
  roleId?: string;
  status?: string;
}

export interface ListDivisionMembershipsOptions {
  divisionId?: string;
  userId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * Lists division memberships scoped strictly to the verified institution.
 */
export async function listDivisionMemberships(
  institutionId: string,
  options: ListDivisionMembershipsOptions = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const whereClause: any = {
    institutionId,
  };

  if (options.divisionId) {
    whereClause.divisionId = options.divisionId;
  }

  if (options.userId) {
    whereClause.userId = options.userId;
  }

  if (options.status) {
    whereClause.status = options.status;
  }

  const [memberships, total] = await Promise.all([
    db.divisionMembership.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            status: true,
          },
        },
        division: {
          select: {
            id: true,
            code: true,
            name: true,
            slug: true,
            type: true,
            status: true,
          },
        },
        role: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.divisionMembership.count({ where: whereClause }),
  ]);

  return {
    memberships,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Creates or updates a division membership with strict 3-way tenant validation.
 */
export async function createDivisionMembership(
  institutionId: string,
  data: CreateDivisionMembershipInput
) {
  const { userId, divisionId, roleId, status = "ACTIVE" } = data;

  if (!userId || !divisionId || !roleId) {
    throw new Error("Missing required fields: userId, divisionId, and roleId are mandatory.");
  }

  // 1. Verify User belongs to this institution
  const targetUser = await db.user.findFirst({
    where: { id: userId, institutionId },
    select: { id: true, institutionId: true, email: true },
  });

  if (!targetUser) {
    throw new ForbiddenError(
      "Cross-tenant violation: User does not exist or does not belong to this institution."
    );
  }

  // 2. Verify Division belongs to this institution
  const targetDivision = await db.institutionDivision.findFirst({
    where: { id: divisionId, institutionId },
    select: { id: true, institutionId: true, name: true },
  });

  if (!targetDivision) {
    throw new ForbiddenError(
      "Cross-tenant violation: Division does not exist or does not belong to this institution."
    );
  }

  // 3. Verify Role belongs to this institution
  const targetRole = await db.role.findFirst({
    where: { id: roleId, institutionId },
    select: { id: true, institutionId: true, name: true },
  });

  if (!targetRole) {
    throw new ForbiddenError(
      "Cross-tenant violation: Role does not exist or does not belong to this institution."
    );
  }

  // Upsert membership to ensure idempotency
  const membership = await db.divisionMembership.upsert({
    where: {
      userId_divisionId_roleId: {
        userId,
        divisionId,
        roleId,
      },
    },
    create: {
      institutionId,
      userId,
      divisionId,
      roleId,
      status,
    },
    update: {
      status,
    },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
      division: { select: { id: true, name: true, code: true, type: true } },
      role: { select: { id: true, name: true, code: true } },
    },
  });

  return membership;
}

/**
 * Updates an existing division membership status or role.
 */
export async function updateDivisionMembership(
  institutionId: string,
  membershipId: string,
  data: UpdateDivisionMembershipInput
) {
  const existing = await db.divisionMembership.findFirst({
    where: { id: membershipId, institutionId },
  });

  if (!existing) {
    throw new ForbiddenError("Division membership not found in this institution.");
  }

  if (data.roleId) {
    const role = await db.role.findFirst({
      where: { id: data.roleId, institutionId },
    });
    if (!role) {
      throw new ForbiddenError("Role does not belong to this institution.");
    }
  }

  const updated = await db.divisionMembership.update({
    where: { id: membershipId },
    data: {
      ...(data.roleId ? { roleId: data.roleId } : {}),
      ...(data.status ? { status: data.status } : {}),
    },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
      division: { select: { id: true, name: true, code: true, type: true } },
      role: { select: { id: true, name: true, code: true } },
    },
  });

  return updated;
}

/**
 * Deletes a division membership.
 */
export async function deleteDivisionMembership(
  institutionId: string,
  membershipId: string
) {
  const existing = await db.divisionMembership.findFirst({
    where: { id: membershipId, institutionId },
  });

  if (!existing) {
    throw new ForbiddenError("Division membership not found in this institution.");
  }

  await db.divisionMembership.delete({
    where: { id: membershipId },
  });

  return { success: true, deletedId: membershipId };
}

// ----------------------------------------------------------------------------
// STAFF DIVISION ASSIGNMENTS (Multi-Division Faculty Support)
// ----------------------------------------------------------------------------

export interface AssignStaffDivisionInput {
  staffId: string;
  divisionId: string;
  designation: string;
  isPrimary?: boolean;
  status?: string;
}

export interface ListStaffDivisionAssignmentsOptions {
  staffId?: string;
  divisionId?: string;
  status?: string;
}

/**
 * Lists staff division assignments with strict institution scoping.
 */
export async function listStaffDivisionAssignments(
  institutionId: string,
  options: ListStaffDivisionAssignmentsOptions = {}
) {
  const where: any = { institutionId };
  if (options.staffId) where.staffId = options.staffId;
  if (options.divisionId) where.divisionId = options.divisionId;
  if (options.status) where.status = options.status;

  return await db.staffDivisionAssignment.findMany({
    where,
    include: {
      staff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          designation: true,
        },
      },
      division: {
        select: {
          id: true,
          name: true,
          code: true,
          type: true,
          status: true,
        },
      },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Assigns a staff member or faculty to a division with multi-tenant validation.
 */
export async function assignStaffToDivision(
  institutionId: string,
  data: AssignStaffDivisionInput
) {
  const { staffId, divisionId, designation, isPrimary = false, status = "ACTIVE" } = data;

  if (!staffId || !divisionId || !designation) {
    throw new Error("Missing required fields: staffId, divisionId, and designation are mandatory.");
  }

  // 1. Verify Staff exists and belongs to institution
  const staff = await db.staff.findFirst({
    where: { id: staffId, institutionId },
    select: { id: true, userId: true, firstName: true, lastName: true },
  });

  if (!staff) {
    throw new ForbiddenError("Staff member not found or does not belong to this institution.");
  }

  // 2. Verify Division belongs to institution
  const division = await db.institutionDivision.findFirst({
    where: { id: divisionId, institutionId },
    select: { id: true, name: true, type: true, status: true },
  });

  if (!division) {
    throw new ForbiddenError("Division not found or does not belong to this institution.");
  }

  return await db.$transaction(async (tx) => {
    // If marking as primary, unset other primary assignments for this staff
    if (isPrimary) {
      await tx.staffDivisionAssignment.updateMany({
        where: { institutionId, staffId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const assignment = await tx.staffDivisionAssignment.upsert({
      where: {
        staffId_divisionId: {
          staffId,
          divisionId,
        },
      },
      create: {
        institutionId,
        staffId,
        divisionId,
        designation: designation.trim(),
        isPrimary: Boolean(isPrimary),
        status,
      },
      update: {
        designation: designation.trim(),
        isPrimary: Boolean(isPrimary),
        status,
      },
      include: {
        staff: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        division: {
          select: { id: true, name: true, code: true, type: true },
        },
      },
    });

    return assignment;
  });
}

/**
 * Removes a staff member's division assignment.
 */
export async function removeStaffDivisionAssignment(
  institutionId: string,
  assignmentId: string
) {
  const existing = await db.staffDivisionAssignment.findFirst({
    where: { id: assignmentId, institutionId },
  });

  if (!existing) {
    throw new ForbiddenError("Staff division assignment not found in this institution.");
  }

  await db.staffDivisionAssignment.delete({
    where: { id: assignmentId },
  });

  return { success: true, deletedId: assignmentId };
}
