import db from "../db";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "PAYMENT_VERIFIED"
  | "PROFILE_CORRECTION_REQUESTED"
  | "APPROVAL_ACTION"
  | "INVITATION_SENT"
  | "INVITATION_RESENT"
  | "PASSWORD_RESET"
  | string;

export type AuditEntityType =
  | "ATTENDANCE"
  | "MARKS"
  | "FEE_PAYMENT"
  | "STUDENT_PROFILE"
  | "APPROVAL_REQUEST"
  | "RESOURCE_BOOKING"
  | "STUDENT"
  | "TEACHER"
  | "GUARDIAN"
  | "ADMIN_CREDENTIALS"
  | string;

export interface CreateAuditLogParams {
  institutionId: string;
  actorUserId?: string | null;
  userId?: string | null;
  action: AuditAction;
  entityType?: AuditEntityType;
  entity?: string; // backwards compatibility alias for entityType
  entityId: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any; // backwards compatibility alias for newValues
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Reusable Academic ERP / Institution Audit Service
 * Rule 6: Important changes to attendance, marks, fees, queries and student records must be auditable.
 * Maps strictly to the physical PostgreSQL `audit_logs` table.
 */
export async function recordAudit(params: CreateAuditLogParams) {
  try {
    const resolvedEntityType = params.entityType || params.entity || "GENERAL";
    const resolvedNewValues =
      params.newValues !== undefined
        ? typeof params.newValues === "string"
          ? params.newValues
          : JSON.stringify(params.newValues)
        : params.metadata !== undefined
        ? typeof params.metadata === "string"
          ? params.metadata
          : JSON.stringify(params.metadata)
        : null;

    const resolvedOldValues =
      params.oldValues !== undefined
        ? typeof params.oldValues === "string"
          ? params.oldValues
          : JSON.stringify(params.oldValues)
        : null;

    return await db.auditLog.create({
      data: {
        institutionId: params.institutionId,
        actorUserId: params.actorUserId || null,
        userId: params.userId || params.actorUserId || null,
        action: params.action,
        entityType: resolvedEntityType,
        entityId: params.entityId,
        oldValuesJson: resolvedOldValues,
        newValuesJson: resolvedNewValues,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    });
  } catch (err: any) {
    console.error("Failed to record audit log:", err);
    // Don't crash main operation if audit insert fails, but log error
  }
}

/**
 * Retrieve institution-scoped audit logs with pagination
 */
export async function getInstitutionAuditLogs(institutionId: string, limit = 50) {
  return await db.auditLog.findMany({
    where: { institutionId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actorUser: {
        select: {
          id: true,
          fullName: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

/**
 * Retrieve audit logs for a specific entity
 */
export async function getAuditLogsForEntity(
  institutionId: string,
  entityType: string,
  entityId: string
) {
  return await db.auditLog.findMany({
    where: {
      institutionId,
      entityType,
      entityId,
    },
    orderBy: { createdAt: "desc" },
  });
}

