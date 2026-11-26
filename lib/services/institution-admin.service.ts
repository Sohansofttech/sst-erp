import crypto from "crypto";
import db from "@/lib/db";
import { sendAnnouncementNotification, sendPasswordSetupInvitation, sendRoleCredentialInvitation, getAppBaseUrl, getRolePortalLoginUrl } from "./email.service";
import { signPasswordSetupToken } from "@/lib/auth/jwt";
import { isValidUuid } from "@/lib/utils/credential-helpers";
import { assertStudentRegistrationCapacity } from "@/lib/billing/student-capacity";
import {
  loadAllPersistedFeedbacks,
  addOrUpdatePersistedFeedback,
  updatePersistedFeedbackStatus,
} from "./feedback-storage";

// ============================================================================
// SST-ERP INSTITUTION ADMIN BACKEND SERVICE
// Provides tenant-isolated, transaction-safe operations across all 24 areas.
// ============================================================================

export interface AdminContext {
  institutionId: string;
  userId?: string;
  userRole?: string;
}

export async function recordAuditLog(
  client: any,
  data: {
    institutionId?: string | null;
    userId?: string | null;
    actorUserId?: string | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    oldValuesJson?: string | null;
    newValuesJson?: string | null;
  }
) {
  try {
    const id = crypto.randomUUID();
    let effectiveActorUserId = data.actorUserId || null;
    let effectiveUserId = data.userId || null;

    // Verify foreign keys to prevent constraint violations that abort transactions
    if (effectiveActorUserId && client.user) {
      try {
        const actorExists = await client.user.findUnique({
          where: { id: effectiveActorUserId },
          select: { id: true },
        });
        if (!actorExists) {
          effectiveActorUserId = null;
        }
      } catch {
        effectiveActorUserId = null;
      }
    }

    if (effectiveUserId && client.user) {
      try {
        const userExists = await client.user.findUnique({
          where: { id: effectiveUserId },
          select: { id: true },
        });
        if (!userExists) {
          effectiveUserId = null;
        }
      } catch {
        effectiveUserId = null;
      }
    }

    await client.$executeRawUnsafe(
      `INSERT INTO audit_logs (
        "id", "institutionId", "userId", "actorUserId", "action", "entityType", "entityId", "newValuesJson", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      id,
      data.institutionId || null,
      effectiveUserId,
      effectiveActorUserId,
      data.action,
      data.entityType || "SYSTEM",
      data.entityId || crypto.randomUUID(),
      data.newValuesJson || null
    );
  } catch (err: any) {
    console.warn("[recordAuditLog] Warning recording audit:", err.message);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// 0. DASHBOARD & SYSTEM OVERVIEW
// ----------------------------------------------------------------------------
export async function getDashboardMetrics(institutionId: string) {
  try {
    // 1. Real Student Counts (raw SQL avoids Prisma StudentStatus enum casting error)
    // 1. Run independent metrics queries concurrently via Promise.allSettled
    const [
      studentsRes,
      staffRes,
      coursesRes,
      deptRes,
      admRes,
      feePayRes,
      feeInvRes,
      feeMetricsRes,
      attRes,
      appRes,
      evRes,
      ayRes,
      hostelRes,
      transportRes,
      admBreakdownRes,
    ] = await Promise.allSettled([
      db.$queryRaw`
        SELECT COUNT(*)::int as count,
               COUNT(*) FILTER (WHERE status = 'ACTIVE' OR status IS NULL)::int as active_count,
               COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '30 days')::int as current_term_count,
               COUNT(*) FILTER (WHERE "createdAt" < NOW() - INTERVAL '30 days')::int as prior_term_count
        FROM students
        WHERE "institutionId" = ${institutionId}
      `,
      db.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM users
        WHERE "institutionId" = ${institutionId}
          AND role IN ('TEACHER', 'ADMIN', 'STAFF')
      `,
      db.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM courses
        WHERE "institutionId" = ${institutionId}
      `,
      db.$queryRaw`
        SELECT COUNT(DISTINCT d)::int as count
        FROM (
          SELECT department as d FROM courses WHERE "institutionId" = ${institutionId} AND department IS NOT NULL AND department != ''
          UNION
          SELECT department as d FROM teachers WHERE "institutionId" = ${institutionId} AND department IS NOT NULL AND department != ''
        ) depts
      `,
      db.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM "AdmissionApplication"
        WHERE "institutionId" = ${institutionId} AND status = 'SUBMITTED'
      `,
      db.$queryRaw`
        SELECT COALESCE(SUM(amount), 0)::float as total
        FROM fee_payments
        WHERE "institutionId" = ${institutionId} AND status = 'SUCCESS'
      `,
      db.$queryRaw`
        SELECT COALESCE(SUM("paidAmount"), 0)::float as total_paid
        FROM fee_invoices
        WHERE "institutionId" = ${institutionId}
      `,
      db.$queryRaw`
        SELECT
          COALESCE(SUM("totalAmount"), 0)::float as total_invoiced,
          COALESCE(SUM("paidAmount"), 0)::float as total_collected,
          COALESCE(SUM("outstandingAmount") FILTER (WHERE status = 'UNPAID' OR status = 'PARTIAL' OR (status != 'PAID' AND "dueDate" >= NOW())), 0)::float as pending_due,
          COALESCE(SUM("outstandingAmount") FILTER (WHERE status = 'OVERDUE' OR (status != 'PAID' AND "dueDate" < NOW())), 0)::float as overdue_due
        FROM fee_invoices
        WHERE "institutionId" = ${institutionId}
      `,
      db.$queryRaw`
        SELECT COUNT(*)::int as total_records,
               COUNT(*) FILTER (WHERE UPPER(status) IN ('PRESENT', 'LATE', 'ON_DUTY', 'HALF_DAY', 'ABSENT'))::int as countable,
               (
                 COUNT(*) FILTER (WHERE UPPER(status) IN ('PRESENT', 'LATE', 'ON_DUTY')) +
                 0.5 * COUNT(*) FILTER (WHERE UPPER(status) = 'HALF_DAY')
               )::float as attended_credits,
               COUNT(*) FILTER (WHERE UPPER(status) = 'ABSENT')::int as absent_count,
               COUNT(*) FILTER (WHERE UPPER(status) IN ('EXCUSED', 'ON_LEAVE'))::int as excused_count
        FROM attendance_records
        WHERE "institutionId" = ${institutionId}
      `,
      db.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM approval_requests
        WHERE "institutionId" = ${institutionId} AND status = 'PENDING'
      `,
      db.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM events
        WHERE "institutionId" = ${institutionId}
      `,
      db.$queryRaw`
        SELECT id, name, "startDate", "endDate", "isCurrent"
        FROM academic_years
        WHERE "institutionId" = ${institutionId} AND "isCurrent" = true
        LIMIT 1
      `,
      db.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM hostel_allocations
        WHERE "institutionId" = ${institutionId}
      `,
      db.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM transport_allocations
        WHERE "institutionId" = ${institutionId}
      `,
      db.$queryRaw`
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int as submitted,
          COUNT(*) FILTER (WHERE status = 'APPROVED')::int as approved,
          COUNT(*) FILTER (WHERE status = 'ENROLLED' OR "convertedStudentId" IS NOT NULL)::int as enrolled
        FROM "AdmissionApplication"
        WHERE "institutionId" = ${institutionId}
      `,
    ]);

    let studentsCount = 0;
    let activeStudentsCount = 0;
    let studentGrowth: string | null = null;
    let studentsStatus: "OK" | "UNAVAILABLE" = "OK";
    if (studentsRes.status === "fulfilled") {
      const rows = studentsRes.value as any[];
      studentsCount = rows[0]?.count ?? 0;
      activeStudentsCount = rows[0]?.active_count ?? 0;
      const currentCount = rows[0]?.current_term_count ?? 0;
      const priorCount = rows[0]?.prior_term_count ?? 0;
      if (priorCount >= 10 && currentCount >= 0) {
        const rate = (((currentCount - priorCount) / priorCount) * 100).toFixed(1);
        studentGrowth = `${Number(rate) >= 0 ? "+" : ""}${rate}% from prior period`;
      }
    } else {
      studentsStatus = "UNAVAILABLE";
    }

    let staffCount = 0;
    if (staffRes.status === "fulfilled") {
      staffCount = (staffRes.value as any[])[0]?.count ?? 0;
    }

    let coursesCount = 0;
    if (coursesRes.status === "fulfilled") {
      coursesCount = (coursesRes.value as any[])[0]?.count ?? 0;
    }

    let departmentsCount = 0;
    const departmentsAvailable = deptRes.status === "fulfilled";
    if (departmentsAvailable) {
      departmentsCount = (deptRes.value as any[])[0]?.count ?? 0;
    }

    let pendingAdmissionsCount = 0;
    const admissionsAvailable = admRes.status === "fulfilled";
    if (admissionsAvailable) {
      pendingAdmissionsCount = (admRes.value as any[])[0]?.count ?? 0;
    }

    let totalFeesCollected = 0;
    if (feePayRes.status === "fulfilled" && (feePayRes.value as any[])[0]?.total > 0) {
      totalFeesCollected = (feePayRes.value as any[])[0].total;
    } else if (feeInvRes.status === "fulfilled") {
      totalFeesCollected = (feeInvRes.value as any[])[0]?.total_paid ?? 0;
    }

    let feeMetrics = {
      totalInvoiced: 0,
      totalCollected: totalFeesCollected,
      pendingDue: 0,
      overdue: 0,
      collectionRate: 0,
    };
    if (feeMetricsRes.status === "fulfilled") {
      const row = (feeMetricsRes.value as any[])[0];
      const invoiced = row?.total_invoiced ?? 0;
      const collected = totalFeesCollected > 0 ? totalFeesCollected : (row?.total_collected ?? 0);
      const pending = row?.pending_due ?? 0;
      const overdue = row?.overdue_due ?? 0;
      const rate = invoiced > 0 ? Math.min(100, Math.round((collected / invoiced) * 100)) : 0;
      feeMetrics = {
        totalInvoiced: invoiced,
        totalCollected: collected,
        pendingDue: pending,
        overdue,
        collectionRate: rate,
      };
    }

    let attendanceRate = "N/A";
    let attendanceRateNumber: number | null = null;
    if (attRes.status === "fulfilled") {
      const rows = attRes.value as any[];
      const countable = rows[0]?.countable ?? 0;
      const attended = rows[0]?.attended_credits ?? 0;
      if (countable > 0) {
        attendanceRateNumber = Math.round((attended / countable) * 1000) / 10;
        attendanceRate = `${attendanceRateNumber}%`;
      }
    }

    let pendingApprovalsCount = 0;
    if (appRes.status === "fulfilled") {
      pendingApprovalsCount = (appRes.value as any[])[0]?.count ?? 0;
    }

    let eventsCount = 0;
    if (evRes.status === "fulfilled") {
      eventsCount = (evRes.value as any[])[0]?.count ?? 0;
    }

    let activeAcademicYear: any = null;
    if (ayRes.status === "fulfilled") {
      const rows = ayRes.value as any[];
      if (rows && rows.length > 0) {
        activeAcademicYear = rows[0];
      }
    }

    // 10. Live Audit Logs for Recent Activity
    let recentActivities: any[] = [];
    try {
      const liveLogs = await getAuditLogs(institutionId, 8);
      recentActivities = liveLogs.map((a: any) => ({
        id: a.id,
        action: a.action,
        tableName: a.tableName || a.entity || "general",
        recordId: a.recordId || a.entityId || a.id,
        userName: a.user?.fullName || a.user?.name || a.user?.email || "System",
        userRole: a.user?.role || "ADMIN",
        timestamp: typeof a.createdAt === "string" ? a.createdAt : a.createdAt?.toISOString?.() || new Date().toISOString(),
      }));
    } catch (err: any) {
      console.warn("Recent activities fallback:", err.message);
    }

    // 11. Authoritative 14-Day Free Trial & Subscription Status
    let subscriptionStatus = null;
    try {
      const { getInstitutionSubscriptionStatus } = await import("@/lib/services/subscription.service");
      subscriptionStatus = await getInstitutionSubscriptionStatus(institutionId);
    } catch (subErr: any) {
      console.warn("Could not load subscription status for dashboard:", subErr.message);
    }

    let hostelOccupiedBeds = 0;
    if (hostelRes.status === "fulfilled") {
      hostelOccupiedBeds = (hostelRes.value as any[])[0]?.count ?? 0;
    }

    let transportAllocatedStudents = 0;
    if (transportRes.status === "fulfilled") {
      transportAllocatedStudents = (transportRes.value as any[])[0]?.count ?? 0;
    }

    let admBreakdown = { total: 0, submitted: 0, approved: 0, enrolled: 0 };
    if (admBreakdownRes.status === "fulfilled") {
      const r = (admBreakdownRes.value as any[])[0];
      admBreakdown = {
        total: r?.total ?? 0,
        submitted: r?.submitted ?? 0,
        approved: r?.approved ?? 0,
        enrolled: r?.enrolled ?? 0,
      };
    }

    return {
      connected: true,
      stats: {
        totalStudents: studentsCount,
        activeStudents: activeStudentsCount,
        studentGrowth,
        totalFaculty: staffCount,
        totalDepartments: departmentsCount,
        totalCourses: coursesCount,
        pendingAdmissions: pendingAdmissionsCount,
        pendingApprovals: pendingApprovalsCount,
        totalFeesCollected,
        activeEvents: eventsCount,
        attendanceRate,
        attendanceRateNumber,
        feeMetrics,
      },
      departmentMetrics: {
        admissions: admBreakdown,
        finance: feeMetrics,
        hostel: { occupiedBeds: hostelOccupiedBeds },
        transport: { allocatedStudents: transportAllocatedStudents },
      },
      departmentEnrollment: [],
      schemaStatus: {
        students: studentsStatus,
        departments: departmentsAvailable ? "OK" : "PENDING_MIGRATION",
        admissions: admissionsAvailable ? "OK" : "PENDING_MIGRATION",
        auditLogs: "OK",
      },
      activeAcademicYear: activeAcademicYear || null,
      recentActivities,
      subscription: subscriptionStatus,
    };
  } catch (err: any) {
    console.warn("Database query failed (falling back to cached metrics):", err.message);
    return {
      connected: false,
      error: err.message,
    };
  }
}

// ----------------------------------------------------------------------------
// 1. ADMISSIONS & APPLICATIONS
// ----------------------------------------------------------------------------
export async function getAdmissions(institutionId: string, status?: string) {
  try {
    const apps = await db.admissionApplication.findMany({
      where: {
        institutionId,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        course: true,
        academicYear: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (apps && apps.length > 0) {
      try {
        const [rawPrimary, rawLegacy] = await Promise.all([
          db
            .$queryRawUnsafe<any[]>(
              `SELECT id, "documentsJson", "documentStatus", remarks, "guardianOccupation" FROM "AdmissionApplication" WHERE "institutionId" = $1`,
              institutionId
            )
            .catch(() => []),
          db
            .$queryRawUnsafe<any[]>(
              `SELECT id, "documentsJson", "documentStatus", remarks, "guardianOccupation" FROM admission_applications WHERE "institutionId" = $1`,
              institutionId
            )
            .catch(() => []),
        ]);

        const extrasMap = new Map<string, any>();
        for (const row of rawLegacy || []) {
          extrasMap.set(row.id, row);
        }
        for (const row of rawPrimary || []) {
          const prev = extrasMap.get(row.id) || {};
          extrasMap.set(row.id, {
            ...prev,
            ...row,
            documentsJson: row.documentsJson || prev.documentsJson || null,
            documentStatus: row.documentStatus || prev.documentStatus || null,
            remarks: row.remarks ?? prev.remarks ?? null,
            guardianOccupation: row.guardianOccupation ?? prev.guardianOccupation ?? null,
          });
        }

        const convertedIds = apps
          .map((a) => a.convertedStudentId)
          .filter((id): id is string => Boolean(id));
        const studentMap = new Map<string, { id: string; rollNumber: string; status: string; hasActiveEnrollment: boolean }>();
        if (convertedIds.length > 0) {
          const studentRows = await db
            .$queryRawUnsafe<any[]>(
              `SELECT s.id, s."rollNumber", s.status::text as status,
                      EXISTS (
                        SELECT 1 FROM enrollments e
                        WHERE e."studentId" = s.id AND e."institutionId" = $1 AND e.status = 'ACTIVE'
                      ) as "hasActiveEnrollment"
               FROM students s
               WHERE s."institutionId" = $1 AND s.id = ANY($2::text[])`,
              institutionId,
              convertedIds
            )
            .catch(() => []);
          for (const sr of studentRows || []) {
            studentMap.set(sr.id, {
              id: sr.id,
              rollNumber: sr.rollNumber || "",
              status: sr.status || "ACTIVE",
              hasActiveEnrollment: Boolean(sr.hasActiveEnrollment),
            });
          }
        }

        return apps.map((app) => {
          const extra = extrasMap.get(app.id);
          let parsedDocs = null;
          if (extra?.documentsJson) {
            try {
              parsedDocs = typeof extra.documentsJson === "string" ? JSON.parse(extra.documentsJson) : extra.documentsJson;
            } catch {}
          }
          return {
            ...app,
            documents: parsedDocs,
            documentsJson: extra?.documentsJson || null,
            documentStatus: extra?.documentStatus || app.documentStatus || "PENDING",
            remarks: extra?.remarks || (app as any).remarks || null,
            guardianOccupation: extra?.guardianOccupation || null,
            convertedStudent: app.convertedStudentId ? studentMap.get(app.convertedStudentId) || null : null,
          };
        });
      } catch {
        return apps;
      }
    }
    return apps;
  } catch (err: any) {
    console.error("getAdmissions error:", err.message);
    throw new Error(`Failed to load admissions from database: ${err.message}`);
  }
}

export async function createAdmissionApplication(
  institutionId: string,
  data: {
    applicantName?: string;
    applicantFirstName?: string;
    applicantLastName?: string;
    email: string;
    phone: string;
    courseId: string;
    academicYearId: string;
    gender?: any;
    dob?: Date | string;
    addressLine?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    guardianName?: string;
    guardianRelation?: string;
    guardianRelationship?: string;
    guardianPhone?: string;
    guardianEmail?: string;
    guardianOccupation?: string;
    documents?: any[];
  }
) {
  const count = await db.admissionApplication.count({ where: { institutionId } });
  const appNumber = `APP-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  const fullName =
    data.applicantName ||
    `${data.applicantFirstName || ""} ${data.applicantLastName || ""}`.trim() ||
    "Applicant";
  const parts = fullName.trim().split(" ");
  const firstName = data.applicantFirstName || parts[0] || "Applicant";
  const lastName = data.applicantLastName || parts.slice(1).join(" ") || "Student";
  const dobVal = data.dob ? new Date(data.dob) : new Date("2005-01-01");
  const rawGender = data.gender ? String(data.gender).toUpperCase() : "MALE";
  const genderVal = rawGender === "FEMALE" ? "FEMALE" : rawGender === "OTHER" ? "OTHER" : "MALE";

  const created = await db.admissionApplication.create({
    data: {
      institutionId,
      applicationNumber: appNumber,
      firstName,
      lastName,
      fullName,
      email: data.email.toLowerCase().trim(),
      phone: data.phone.trim(),
      courseId: data.courseId,
      academicYearId: data.academicYearId,
      dob: dobVal,
      gender: genderVal as any,
      addressLine: data.addressLine || null,
      city: data.city || null,
      state: data.state || null,
      postalCode: data.postalCode || null,
      guardianName: data.guardianName || null,
      guardianRelationship: data.guardianRelationship || data.guardianRelation || null,
      guardianPhone: data.guardianPhone || null,
      guardianEmail: data.guardianEmail || null,
      status: "SUBMITTED",
      documentStatus: "PENDING",
    },
    include: {
      course: true,
      academicYear: true,
    },
  });

  if (data.documents !== undefined || data.guardianOccupation !== undefined) {
    try {
      const docsJson = data.documents ? JSON.stringify(data.documents) : null;
      const allSubmitted = Array.isArray(data.documents) && data.documents.length > 0 && data.documents.every((d: any) => d.isSubmitted);
      const anySubmitted = Array.isArray(data.documents) && data.documents.some((d: any) => d.isSubmitted);
      const docStatus = allSubmitted ? "SUBMITTED" : anySubmitted ? "PARTIALLY_SUBMITTED" : "PENDING";

      if (docsJson) {
        try {
          await db.$executeRawUnsafe(
            `UPDATE "AdmissionApplication" SET "documentsJson" = $1, "documentStatus" = $2 WHERE id = $3`,
            docsJson,
            docStatus,
            created.id
          );
        } catch {}
        try {
          await db.$executeRawUnsafe(
            `UPDATE admission_applications SET "documentsJson" = $1, "documentStatus" = $2 WHERE id = $3`,
            docsJson,
            docStatus,
            created.id
          );
        } catch {}
      }
      if (data.guardianOccupation) {
        try {
          await db.$executeRawUnsafe(
            `UPDATE "AdmissionApplication" SET "guardianOccupation" = $1 WHERE id = $2`,
            data.guardianOccupation.trim() || null,
            created.id
          );
        } catch {}
        try {
          await db.$executeRawUnsafe(
            `UPDATE admission_applications SET "guardianOccupation" = $1 WHERE id = $2`,
            data.guardianOccupation.trim() || null,
            created.id
          );
        } catch {}
      }
    } catch {}
  }

  return {
    ...created,
    documents: data.documents || null,
    guardianOccupation: data.guardianOccupation || null,
  };
}

export async function updateAdmissionStatus(
  institutionId: string,
  applicationId: string,
  status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "ENROLLED" | "CANCELLED",
  remarks?: string,
  actorUserId?: string
) {
  const existing = await db.admissionApplication.findFirst({
    where: { id: applicationId, institutionId },
  });
  if (!existing) {
    throw new Error("Admission application not found or access denied.");
  }

  const result = await db.admissionApplication.updateMany({
    where: { id: applicationId, institutionId },
    data: {
      status,
    },
  });
  if (result.count === 0) {
    throw new Error("Admission application not found or access denied.");
  }

  try {
    await db.$executeRawUnsafe(
      `UPDATE "AdmissionApplication" SET "reviewedByUserId" = $1, "reviewedAt" = NOW() WHERE id = $2 AND "institutionId" = $3`,
      actorUserId || null,
      applicationId,
      institutionId
    );
  } catch {}

  if (remarks !== undefined) {
    try {
      await db.$executeRawUnsafe(
        `UPDATE "AdmissionApplication" SET remarks = $1 WHERE id = $2 AND "institutionId" = $3`,
        remarks,
        applicationId,
        institutionId
      );
    } catch {}
    try {
      await db.$executeRawUnsafe(
        `UPDATE admission_applications SET remarks = $1 WHERE id = $2 AND "institutionId" = $3`,
        remarks,
        applicationId,
        institutionId
      );
    } catch {}
  }

  await recordAuditLog(db, {
    institutionId,
    userId: actorUserId || "admin",
    action: "ADMISSION_STATUS_UPDATED",
    entityType: "ADMISSION_APPLICATION",
    entityId: applicationId,
    oldValuesJson: JSON.stringify({ status: existing.status }),
    newValuesJson: JSON.stringify({ status, remarks: remarks || null }),
  });

  return await db.admissionApplication.findFirst({
    where: { id: applicationId, institutionId },
  });
}

export async function getAdmissionMeta(institutionId: string) {
  const [courses, academicYears, departments] = await Promise.all([
    db.course.findMany({
      where: { institutionId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, department: true },
    }),
    db.academicYear.findMany({
      where: { institutionId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true },
    }),
    db.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT department as name FROM courses WHERE "institutionId" = $1 AND department IS NOT NULL AND department != '' ORDER BY department ASC`,
      institutionId
    ).catch(() => []),
  ]);
  return {
    courses,
    academicYears,
    departments: (departments || []).map((d: any) => ({ id: d.name, name: d.name, code: d.name })),
  };
}

export async function getAdmissionFollowUps(institutionId: string, applicationId?: string) {
  const key = `admission_followups:${institutionId}`;
  const setting = await db.platformSetting.findUnique({ where: { key } }).catch(() => null);
  const list: any[] = Array.isArray(setting?.value) ? (setting?.value as any[]) : [];
  if (applicationId) {
    return list.filter((f) => f.applicationId === applicationId);
  }
  return list;
}

export async function createAdmissionFollowUp(
  institutionId: string,
  data: {
    applicationId: string;
    followUpDate: string;
    channel?: string;
    notes: string;
    status?: "PENDING" | "COMPLETED" | "CANCELLED";
    actorUserId?: string;
  }
) {
  const app = await db.admissionApplication.findFirst({
    where: { id: data.applicationId, institutionId },
    select: { id: true, fullName: true, applicationNumber: true },
  });
  if (!app) {
    throw new Error("Admission application not found or access denied.");
  }

  const key = `admission_followups:${institutionId}`;
  const setting = await db.platformSetting.findUnique({ where: { key } }).catch(() => null);
  const list: any[] = Array.isArray(setting?.value) ? (setting?.value as any[]) : [];

  const item = {
    id: crypto.randomUUID(),
    applicationId: app.id,
    applicantName: app.fullName,
    applicationNumber: app.applicationNumber,
    followUpDate: data.followUpDate,
    channel: data.channel || "PHONE",
    notes: data.notes.trim(),
    status: data.status || "PENDING",
    createdBy: data.actorUserId || "ADMISSIONS_OFFICER",
    createdAt: new Date().toISOString(),
  };

  const next = [item, ...list];
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: next, description: `Admission follow-ups for ${institutionId}` },
    update: { value: next },
  });

  await recordAuditLog(db, {
    institutionId,
    userId: data.actorUserId || "admin",
    action: "ADMISSION_FOLLOWUP_SCHEDULED",
    entityType: "ADMISSION_APPLICATION",
    entityId: app.id,
    newValuesJson: JSON.stringify(item),
  });

  return item;
}

export async function updateAdmissionFollowUpStatus(
  institutionId: string,
  followUpId: string,
  status: "PENDING" | "COMPLETED" | "CANCELLED",
  actorUserId?: string
) {
  const key = `admission_followups:${institutionId}`;
  const setting = await db.platformSetting.findUnique({ where: { key } }).catch(() => null);
  const list: any[] = Array.isArray(setting?.value) ? (setting?.value as any[]) : [];
  const idx = list.findIndex((f) => f.id === followUpId);
  if (idx === -1) {
    throw new Error("Follow-up record not found or access denied.");
  }
  const updated = { ...list[idx], status, updatedAt: new Date().toISOString(), updatedBy: actorUserId || "ADMISSIONS_OFFICER" };
  const next = [...list];
  next[idx] = updated;
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: next, description: `Admission follow-ups for ${institutionId}` },
    update: { value: next },
  });
  return updated;
}

export async function verifyAdmissionDocuments(
  institutionId: string,
  applicationId: string,
  documents: any[],
  remarks?: string,
  actorUserId?: string
) {
  const existing = await db.admissionApplication.findFirst({
    where: { id: applicationId, institutionId },
  });
  if (!existing) {
    throw new Error("Admission application not found or access denied.");
  }

  const allSubmitted = Array.isArray(documents) && documents.length > 0 && documents.every((d: any) => d.isSubmitted);
  const anySubmitted = Array.isArray(documents) && documents.some((d: any) => d.isSubmitted);
  const documentStatus = allSubmitted ? "VERIFIED" : anySubmitted ? "PARTIALLY_SUBMITTED" : "PENDING";
  const docsJson = JSON.stringify(documents || []);

  await db.admissionApplication.updateMany({
    where: { id: applicationId, institutionId },
    data: { documentStatus: documentStatus as any },
  });

  try {
    await db.$executeRawUnsafe(
      `UPDATE "AdmissionApplication" SET "documentsJson" = $1, "documentStatus" = $2, "reviewedByUserId" = $3, "reviewedAt" = NOW()${remarks !== undefined ? `, remarks = $4` : ""} WHERE id = ${remarks !== undefined ? "$5" : "$4"} AND "institutionId" = ${remarks !== undefined ? "$6" : "$5"}`,
      ...(remarks !== undefined
        ? [docsJson, documentStatus, actorUserId || null, remarks, applicationId, institutionId]
        : [docsJson, documentStatus, actorUserId || null, applicationId, institutionId])
    );
  } catch {}
  try {
    await db.$executeRawUnsafe(
      `UPDATE admission_applications SET "documentsJson" = $1, "documentStatus" = $2 WHERE id = $3 AND "institutionId" = $4`,
      docsJson,
      documentStatus,
      applicationId,
      institutionId
    );
  } catch {}

  await recordAuditLog(db, {
    institutionId,
    userId: actorUserId || "admin",
    action: "ADMISSION_DOCS_VERIFIED",
    entityType: "ADMISSION_APPLICATION",
    entityId: applicationId,
    newValuesJson: JSON.stringify({ documentStatus, count: documents?.length || 0, remarks: remarks || null }),
  });

  return { id: applicationId, documentStatus, documents, remarks };
}

export async function convertAdmissionApplicationToStudent(
  institutionId: string,
  applicationId: string,
  options?: { classId?: string; sectionId?: string; rollNumber?: string; actorUserId?: string }
) {
  return await db.$transaction(async (tx) => {
    const application = await tx.admissionApplication.findFirst({
      where: { id: applicationId, institutionId },
    });

    if (!application) {
      throw new Error("Admission application not found or access denied.");
    }

    if (application.convertedStudentId) {
      return {
        success: false,
        alreadyConverted: true,
        studentId: application.convertedStudentId,
        message: `Applicant is already enrolled as Student (ID: ${application.convertedStudentId}).`,
      };
    }

    if (application.status === "REJECTED" || application.status === "CANCELLED") {
      throw new Error(`Cannot convert a ${application.status.toLowerCase()} admission application.`);
    }

    // Collision-safe roll number & admission number generation (no User account or invite email created)
    const studentCountRows = await tx.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int as count FROM students WHERE "institutionId" = $1`,
      institutionId
    );
    let seq = (studentCountRows[0]?.count ?? 0) + 1;
    const year = new Date().getFullYear();
    let rollNumber = options?.rollNumber?.trim() || `ROLL-${year}-${String(seq).padStart(4, "0")}`;

    // Ensure rollNumber does not collide within institution
    for (let attempt = 0; attempt < 25; attempt++) {
      const dup = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM students WHERE "institutionId" = $1 AND "rollNumber" = $2 LIMIT 1`,
        institutionId,
        rollNumber
      );
      if (!dup || dup.length === 0) break;
      if (options?.rollNumber?.trim() && attempt === 0) {
        throw new Error(`Roll number '${rollNumber}' is already assigned to another student.`);
      }
      seq++;
      rollNumber = `ROLL-${year}-${String(seq).padStart(4, "0")}`;
    }

    const admissionNumber = application.applicationNumber || `ADM-${year}-${String(seq).padStart(4, "0")}`;
    const studentId = crypto.randomUUID();

    // Insert into students with userId = NULL (strictly no User account or invitation email)
    await tx.$queryRawUnsafe(
      `INSERT INTO students (
        "id", "institutionId", "userId", "firstName", "lastName", "fullName",
        "email", "rollNumber", "admissionNumber", "phone", "gender", "status",
        "dateOfBirth", "currentCourseId", "currentAcademicYearId",
        "addressLine", "city", "state", "postalCode", "batch",
        "currentSemester", "currentSection", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, NULL, $3, $4, $5,
        $6, $7, $8, $9, $10, 'ACTIVE'::"StudentStatus",
        $11, $12::uuid, $13::uuid,
        $14, $15, $16, $17, $18,
        1, $19, NOW(), NOW()
      )`,
      studentId,
      institutionId,
      application.firstName,
      application.lastName,
      application.fullName,
      application.email.toLowerCase().trim(),
      rollNumber,
      admissionNumber,
      application.phone || null,
      application.gender || "OTHER",
      application.dob || new Date("2005-01-01"),
      application.courseId,
      application.academicYearId,
      application.addressLine || null,
      application.city || null,
      application.state || null,
      application.postalCode || null,
      String(year),
      options?.sectionId || "A"
    );

    await tx.$queryRawUnsafe(
      `INSERT INTO enrollments (
        "id", "institutionId", "studentId", "academicYearId", "courseId",
        "semester", "section", "status", "enrolledDate"
      ) VALUES ($1, $2, $3, $4, $5, 1, $6, 'ACTIVE', NOW())`,
      crypto.randomUUID(),
      institutionId,
      studentId,
      application.academicYearId,
      application.courseId,
      options?.sectionId || "A"
    );

    await tx.admissionApplication.update({
      where: { id: applicationId },
      data: {
        status: "ENROLLED",
        convertedStudentId: studentId,
      },
    });

    try {
      await tx.$executeRawUnsafe(
        `UPDATE "AdmissionApplication" SET "reviewedByUserId" = $1, "reviewedAt" = NOW() WHERE id = $2 AND "institutionId" = $3`,
        options?.actorUserId || null,
        applicationId,
        institutionId
      );
    } catch {}

    await recordAuditLog(tx, {
      institutionId,
      userId: options?.actorUserId || "admin",
      action: "ADMISSION_CONVERTED_TO_STUDENT",
      entityType: "ADMISSION_APPLICATION",
      entityId: applicationId,
      newValuesJson: JSON.stringify({
        studentId,
        rollNumber,
        admissionNumber,
        applicantEmail: application.email,
        userIdCreated: false,
      }),
    });

    return {
      success: true,
      studentId,
      rollNumber,
      admissionNumber,
      message: `Applicant successfully enrolled as Student (Roll: ${rollNumber}).`,
    };
  });
}

export async function updateAdmissionApplication(
  institutionId: string,
  applicationId: string,
  data: {
    applicantFirstName?: string;
    applicantLastName?: string;
    applicantFullName?: string;
    email?: string;
    phone?: string;
    dob?: Date | string;
    gender?: any;
    addressLine?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    guardianName?: string;
    guardianRelation?: string;
    guardianRelationship?: string;
    guardianPhone?: string;
    guardianEmail?: string;
    guardianOccupation?: string;
    courseId?: string;
    academicYearId?: string;
    status?: string;
    documentStatus?: string;
    documents?: any[];
    remarks?: string;
  }
) {
  // 1. Verify existence and tenant ownership
  const existing = await db.admissionApplication.findFirst({
    where: { id: applicationId, institutionId },
  });
  if (!existing) {
    throw new Error("Admission application not found or access denied.");
  }

  // 2. Validate email if provided
  let normalizedEmail: string | undefined = undefined;
  if (data.email !== undefined) {
    const trimmed = data.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !emailRegex.test(trimmed)) {
      const err = new Error("A valid applicant email address is required (e.g. name@example.com).");
      (err as any).statusCode = 400;
      throw err;
    }
    normalizedEmail = trimmed;
  }

  // 3. Compute name fields if partial names provided
  const firstName = data.applicantFirstName?.trim() || existing.firstName;
  const lastName = data.applicantLastName?.trim() || existing.lastName;
  const fullName =
    data.applicantFullName?.trim() ||
    (data.applicantFirstName || data.applicantLastName
      ? `${firstName} ${lastName}`.trim()
      : existing.fullName);

  let dobVal: Date | undefined = undefined;
  if (data.dob !== undefined) {
    const parsed = new Date(data.dob);
    dobVal = isNaN(parsed.getTime()) ? existing.dob : parsed;
  }

  let genderVal: string | undefined = undefined;
  if (data.gender !== undefined) {
    const raw = String(data.gender).toUpperCase();
    genderVal = ["MALE", "FEMALE", "OTHER"].includes(raw) ? raw : existing.gender;
  }

  // 4. Update the admission application
  const updated = await db.admissionApplication.update({
    where: { id: applicationId },
    data: {
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(data.phone !== undefined ? { phone: data.phone.trim() } : {}),
      ...(data.applicantFirstName !== undefined ? { firstName } : {}),
      ...(data.applicantLastName !== undefined ? { lastName } : {}),
      fullName,
      ...(dobVal ? { dob: dobVal } : {}),
      ...(genderVal ? { gender: genderVal as any } : {}),
      ...(data.addressLine !== undefined ? { addressLine: data.addressLine.trim() || null } : {}),
      ...(data.city !== undefined ? { city: data.city.trim() || null } : {}),
      ...(data.state !== undefined ? { state: data.state.trim() || null } : {}),
      ...(data.postalCode !== undefined ? { postalCode: data.postalCode.trim() || null } : {}),
      ...(data.guardianName !== undefined ? { guardianName: data.guardianName.trim() || null } : {}),
      ...(data.guardianRelationship !== undefined || data.guardianRelation !== undefined
        ? { guardianRelationship: (data.guardianRelationship || data.guardianRelation)?.trim() || null }
        : {}),
      ...(data.guardianPhone !== undefined ? { guardianPhone: data.guardianPhone.trim() || null } : {}),
      ...(data.guardianEmail !== undefined ? { guardianEmail: data.guardianEmail.trim().toLowerCase() || null } : {}),
      ...(data.courseId ? { courseId: data.courseId } : {}),
      ...(data.academicYearId ? { academicYearId: data.academicYearId } : {}),
      ...(data.status ? { status: data.status as any } : {}),
      ...(data.documentStatus ? { documentStatus: data.documentStatus as any } : {}),
    },
    include: {
      course: true,
      academicYear: true,
    },
  });

  // 5. Update raw SQL remarks, documentsJson, or guardian occupation if provided
  let updatedDocs = data.documents;
  let computedDocStatus = data.documentStatus;
  try {
    if (data.documents !== undefined) {
      const docsJson = JSON.stringify(data.documents);
      const allSubmitted = Array.isArray(data.documents) && data.documents.length > 0 && data.documents.every((d: any) => d.isSubmitted);
      const anySubmitted = Array.isArray(data.documents) && data.documents.some((d: any) => d.isSubmitted);
      // Submitting documents does NOT auto-verify them; preserve VERIFIED/REJECTED if explicitly passed, else SUBMITTED/PARTIALLY_SUBMITTED/PENDING
      const docStatus =
        data.documentStatus && ["VERIFIED", "REJECTED", "PENDING", "PARTIALLY_SUBMITTED", "SUBMITTED"].includes(data.documentStatus)
          ? data.documentStatus
          : allSubmitted
          ? "SUBMITTED"
          : anySubmitted
          ? "PARTIALLY_SUBMITTED"
          : "PENDING";
      computedDocStatus = docStatus;

      try {
        await db.$executeRawUnsafe(
          `UPDATE "AdmissionApplication" SET "documentsJson" = $1, "documentStatus" = $2 WHERE id = $3 AND "institutionId" = $4`,
          docsJson,
          docStatus,
          applicationId,
          institutionId
        );
      } catch {}
      try {
        await db.$executeRawUnsafe(
          `UPDATE admission_applications SET "documentsJson" = $1, "documentStatus" = $2 WHERE id = $3 AND "institutionId" = $4`,
          docsJson,
          docStatus,
          applicationId,
          institutionId
        );
      } catch {}
    }
    if (data.remarks !== undefined) {
      try {
        await db.$executeRawUnsafe(
          `UPDATE "AdmissionApplication" SET remarks = $1 WHERE id = $2 AND "institutionId" = $3`,
          data.remarks,
          applicationId,
          institutionId
        );
      } catch {}
      try {
        await db.$executeRawUnsafe(
          `UPDATE admission_applications SET remarks = $1 WHERE id = $2 AND "institutionId" = $3`,
          data.remarks,
          applicationId,
          institutionId
        );
      } catch {}
    }
    if (data.guardianOccupation !== undefined) {
      try {
        await db.$executeRawUnsafe(
          `UPDATE "AdmissionApplication" SET "guardianOccupation" = $1 WHERE id = $2 AND "institutionId" = $3`,
          data.guardianOccupation.trim() || null,
          applicationId,
          institutionId
        );
      } catch {}
      try {
        await db.$executeRawUnsafe(
          `UPDATE admission_applications SET "guardianOccupation" = $1 WHERE id = $2 AND "institutionId" = $3`,
          data.guardianOccupation.trim() || null,
          applicationId,
          institutionId
        );
      } catch {}
    }
  } catch (err: any) {
    console.warn("Raw SQL update in updateAdmissionApplication failed:", err.message);
  }

  return {
    ...updated,
    documentStatus: computedDocStatus || updated.documentStatus,
    documents: updatedDocs !== undefined ? updatedDocs : (updated as any).documents,
    remarks: data.remarks !== undefined ? data.remarks : (updated as any).remarks,
    guardianOccupation: data.guardianOccupation !== undefined ? data.guardianOccupation : (updated as any).guardianOccupation,
  };
}

// ----------------------------------------------------------------------------
// 2. STUDENTS & ENROLLMENT
// ----------------------------------------------------------------------------
export async function getStudents(institutionId: string, options?: { search?: string; status?: string; take?: number }) {
  try {
    // If status filter is passed, since PostgreSQL column is text, query via raw SQL to avoid type "StudentStatus" does not exist
    if (options?.status) {
      const status = options.status.toUpperCase();
      const search = options?.search ? `%${options.search.trim().toLowerCase()}%` : null;
      const rows: any = await db.$queryRaw`
        SELECT s.*,
               c.name as "courseName",
               c.code as "courseCode",
               ay.name as "academicYearName"
        FROM students s
        LEFT JOIN courses c ON s."currentCourseId"::text = c.id
        LEFT JOIN academic_years ay ON s."currentAcademicYearId"::text = ay.id
        WHERE s."institutionId" = ${institutionId}
          AND s.status = ${status}
          AND (${search}::text IS NULL OR LOWER(s."fullName") LIKE ${search} OR LOWER(s."rollNumber") LIKE ${search} OR LOWER(s.email) LIKE ${search})
        ORDER BY s."createdAt" DESC
        LIMIT ${options?.take || 100};
      `;
      return rows;
    }

    return await db.student.findMany({
      where: {
        institutionId,
        ...(options?.search
          ? {
              OR: [
                { fullName: { contains: options.search, mode: "insensitive" } },
                { rollNumber: { contains: options.search, mode: "insensitive" } },
                { email: { contains: options.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        user: true,
        currentCourse: true,
        currentAcademicYear: true,
        guardianLinks: {
          include: { guardianAccount: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: options?.take || 100,
    });
  } catch (err: any) {
    console.warn("getStudents query fallback to raw SQL:", err.message);
    try {
      const fallbackRows: any = await db.$queryRaw`
        SELECT s.*,
               c.name as "courseName",
               c.code as "courseCode",
               ay.name as "academicYearName"
        FROM students s
        LEFT JOIN courses c ON s."currentCourseId"::text = c.id
        LEFT JOIN academic_years ay ON s."currentAcademicYearId"::text = ay.id
        WHERE s."institutionId" = ${institutionId}
        ORDER BY s."createdAt" DESC
        LIMIT ${options?.take || 100};
      `;
      return fallbackRows;
    } catch {
      return [];
    }
  }
}

export function projectStudentDirectoryItem(s: any) {
  const courseObj = s.currentCourse || s.course || null;
  const ayObj = s.currentAcademicYear || s.academicYear || null;
  const courseId = s.currentCourseId || s.courseId || courseObj?.id || null;
  const academicYearId = s.currentAcademicYearId || s.academicYearId || ayObj?.id || null;

  return {
    id: s.id,
    fullName: s.fullName,
    rollNumber: s.rollNumber,
    admissionNumber: s.admissionNumber,
    status: s.status,
    courseId,
    course: courseObj
      ? { id: courseObj.id, name: courseObj.name, code: courseObj.code }
      : s.courseName || s.courseCode
      ? { id: courseId, name: s.courseName || s.courseCode, code: s.courseCode || null }
      : null,
    academicYearId,
    academicYear: ayObj
      ? { id: ayObj.id, name: ayObj.name }
      : s.academicYearName
      ? { id: academicYearId, name: s.academicYearName }
      : null,
    classId: s.currentClassId || s.classId || null,
    class: s.class ? { id: s.class.id, name: s.class.name } : null,
    sectionId: s.currentSectionId || s.sectionId || null,
    section: s.section ? { id: s.section.id, name: s.section.name } : null,
  };
}

export async function createStudent(
  institutionId: string,
  data: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email: string;
    rollNumber: string;
    admissionNumber?: string;
    usn?: string;
    phone?: string;
    gender?: any;
    dateOfBirth?: Date | string;
    courseId?: string;
    academicYearId?: string;
    classId?: string;
    sectionId?: string;
    department?: string;
    departmentId?: string;
    semester?: number;
    section?: string;
    bloodGroup?: string;
    category?: string;
    addressLine?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    admissionDate?: Date | string;
    batch?: string;
    status?: string;
  }
) {
  const isUuid = (val?: string | null): boolean =>
    !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  const email = data.email.trim().toLowerCase();
  const fullName = (data.fullName || `${data.firstName || "Student"} ${data.lastName || ""}`).trim();
  const rollNumber = data.rollNumber.trim();
  const admissionNumber = data.admissionNumber?.trim() || rollNumber;

  // 1. Database Transaction: Atomic Student, User & Active Enrollment Provisioning
  const { student, user, enrollment } = await db.$transaction(async (tx) => {
    await assertStudentRegistrationCapacity(tx, institutionId);

    // Validate roll number uniqueness within this institution
    const existingByRoll = await tx.student.findFirst({
      where: { rollNumber, institutionId },
    });
    if (existingByRoll) {
      throw new Error(`Student with roll number '${rollNumber}' already exists in this institution.`);
    }

    // Resolve or provision User login account
    let userRecord = await tx.user.findFirst({
      where: { email },
      include: { studentProfile: true },
    });

    if (userRecord) {
      if (userRecord.institutionId && userRecord.institutionId !== institutionId) {
        throw new Error("Email is already registered under another institution.");
      }
      if (userRecord.studentProfile && userRecord.studentProfile.id) {
        throw new Error("A student account is already linked to this email address.");
      }
      if (userRecord.role && userRecord.role !== "STUDENT") {
        throw new Error(`Email is already associated with an account of role '${userRecord.role}'.`);
      }
      userRecord = await tx.user.update({
        where: { id: userRecord.id },
        data: {
          institutionId,
          fullName,
          phone: data.phone?.trim() || userRecord.phone || undefined,
          role: "STUDENT",
        },
        include: { studentProfile: true },
      });
    } else {
      userRecord = await tx.user.create({
        data: {
          institutionId,
          email,
          fullName,
          phone: data.phone?.trim(),
          role: "STUDENT",
          isActive: false, // Dormant until credentials or setup link accepted
          status: "INACTIVE",
          passwordHash: null,
        },
        include: { studentProfile: true },
      });
    }

    const parts = fullName.split(" ");
    const firstName = parts[0] || "Student";
    const lastName = parts.slice(1).join(" ") || "Enrolled";

    const studentId = crypto.randomUUID();

    let safeDob: Date = new Date("2004-01-01");
    if (data.dateOfBirth) {
      const parsed = new Date(data.dateOfBirth);
      if (!isNaN(parsed.getTime())) {
        safeDob = parsed;
      }
    }

    const rawGender = (data.gender || "MALE").toString().toUpperCase();
    const genderStr = ["MALE", "FEMALE", "OTHER"].includes(rawGender) ? rawGender : "MALE";
    const rawStatus = (data.status || "ACTIVE").toString().toUpperCase();
    const statusStr = ["ACTIVE", "INACTIVE", "SUSPENDED", "ALUMNI"].includes(rawStatus) ? rawStatus : "ACTIVE";

    // Safe UUID resolution for foreign key columns:
    // If frontend sends mock string slugs (e.g. "course-btech-cse", "ay-2026-27"),
    // attempt to resolve to live database UUID or safely nullify to prevent PostgreSQL 22P02 uuid syntax errors.
    let resolvedCourseId: string | null = null;
    if (data.courseId) {
      if (isUuid(data.courseId)) {
        try {
          const course = await tx.course.findFirst({
            where: { id: data.courseId, institutionId },
            select: { id: true },
          });
          if (course) resolvedCourseId = course.id;
        } catch {
          // Keep null if table query fails
        }
      } else {
        try {
          const cleanCode = data.courseId.replace(/^course-/, "").toUpperCase();
          const course = await tx.course.findFirst({
            where: {
              institutionId,
              OR: [
                { code: { equals: cleanCode, mode: "insensitive" } },
                { name: { contains: cleanCode, mode: "insensitive" } },
              ],
            },
            select: { id: true },
          });
          if (course) resolvedCourseId = course.id;
        } catch {
          // Keep null if lookup fails
        }
      }
    }

    let resolvedAcademicYearId: string | null = null;
    if (data.academicYearId) {
      if (isUuid(data.academicYearId)) {
        try {
          const ay = await tx.academicYear.findFirst({
            where: { id: data.academicYearId, institutionId },
            select: { id: true },
          });
          if (ay) resolvedAcademicYearId = ay.id;
        } catch {
          // Keep null if table query fails
        }
      } else {
        try {
          const ay = await tx.academicYear.findFirst({
            where: {
              institutionId,
              OR: [
                { isCurrent: true },
                { code: data.academicYearId },
                { name: { contains: "2026", mode: "insensitive" } },
              ],
            },
            select: { id: true },
          });
          if (ay) resolvedAcademicYearId = ay.id;
        } catch {
          // Keep null if lookup fails
        }
      }
    }

    // Class and Section tables do not exist in live DB schema; preserve UUID if supplied without issuing invalid queries inside the transaction
    const resolvedClassId: string | null = data.classId && isUuid(data.classId) ? data.classId : null;
    const resolvedSectionId: string | null = data.sectionId && isUuid(data.sectionId) ? data.sectionId : null;

    // Direct SQL INSERT avoids Prisma client casting to non-existent public.Gender / public.StudentStatus PostgreSQL enums
    const insertResult: any = await tx.$queryRawUnsafe(`
      INSERT INTO students (
        "id", "institutionId", "userId", "firstName", "lastName", "fullName",
        "email", "rollNumber", "admissionNumber", "phone", "gender", "status",
        "dateOfBirth", "currentCourseId", "currentAcademicYearId", "currentClassId", "currentSectionId",
        "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17,
        NOW(), NOW()
      )
      RETURNING *
    `,
      studentId,
      institutionId,
      userRecord.id,
      firstName,
      lastName,
      fullName,
      email,
      rollNumber,
      admissionNumber,
      data.phone?.trim() || null,
      genderStr,
      statusStr,
      safeDob,
      resolvedCourseId,
      resolvedAcademicYearId,
      resolvedClassId,
      resolvedSectionId
    );

    const newStudent = insertResult[0];

    // 1b. Resolve academic year and course for active enrollment
    let effectiveAyId = data.academicYearId;
    if (!effectiveAyId) {
      const existingAys: any[] = await tx.$queryRawUnsafe(`
        SELECT id FROM academic_years WHERE "institutionId" = $1 ORDER BY "startDate" DESC LIMIT 1
      `, institutionId);
      effectiveAyId = existingAys[0]?.id;
    }
    if (!effectiveAyId) {
      const newAyId = crypto.randomUUID();
      await tx.$queryRawUnsafe(`
        INSERT INTO academic_years (id, "institutionId", name, "startDate", "endDate", "isCurrent", "createdAt", status)
        VALUES ($1, $2, $3, $4, $5, true, NOW(), 'ACTIVE')
      `, newAyId, institutionId, "2026-27", new Date("2026-06-01"), new Date("2027-05-31"));
      effectiveAyId = newAyId;
    }

    let effectiveCourseId = data.courseId;
    if (!effectiveCourseId) {
      const existingCourses: any[] = await tx.$queryRawUnsafe(`
        SELECT id FROM courses WHERE "institutionId" = $1 ORDER BY "createdAt" ASC LIMIT 1
      `, institutionId);
      effectiveCourseId = existingCourses[0]?.id;
    }
    if (!effectiveCourseId) {
      const newCourseId = crypto.randomUUID();
      await tx.$queryRawUnsafe(`
        INSERT INTO courses (id, "institutionId", code, name, department, "totalSemesters", "createdAt", status)
        VALUES ($1, $2, $3, $4, $5, 8, NOW(), 'ACTIVE')
      `, newCourseId, institutionId, "GEN-01", "General Studies", "Academics");
      effectiveCourseId = newCourseId;
    }

    // 1c. Provision active Enrollment in enrollments table (mandatory for AttendanceRecord foreign key)
    const enrollmentId = crypto.randomUUID();
    const sectionName = data.sectionId || "A";
    const enrollmentResult: any = await tx.$queryRawUnsafe(`
      INSERT INTO enrollments (
        id, "institutionId", "studentId", "academicYearId", "courseId", semester, section, status, "enrolledDate"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      )
      RETURNING *
    `,
      enrollmentId,
      institutionId,
      newStudent.id,
      effectiveAyId,
      effectiveCourseId,
      1,
      sectionName,
      "ACTIVE"
    );
    const enrollmentRecord = enrollmentResult[0];

    const targetClassId = resolvedClassId || data.classId;
    const targetSectionId = resolvedSectionId || data.sectionId;
    if (effectiveAyId && targetClassId) {
      try {
        await tx.studentEnrollmentHistory.create({
          data: {
            institutionId,
            studentId: newStudent.id,
            academicYearId: effectiveAyId,
            classId: targetClassId,
            sectionId: targetSectionId || undefined,
            semester: 1,
            status: "ACTIVE",
            enrolledAt: new Date(),
          },
        });
      } catch (histErr: any) {
        console.warn("[createStudent] StudentEnrollmentHistory creation skipped (table not migrated or FK constraint):", histErr?.message);
      }
    }

    // Write audit log inside transaction
    await recordAuditLog(tx, {
      institutionId,
      userId: userRecord.id,
      action: "STUDENT_CREATED",
      entityType: "STUDENT",
      entityId: newStudent.id,
      newValuesJson: JSON.stringify({
        rollNumber: newStudent.rollNumber,
        admissionNumber: newStudent.admissionNumber,
        email: newStudent.email,
        enrollmentId: enrollmentRecord.id,
        provisionedLogin: true,
      }),
    });

    return { student: newStudent, user: userRecord, enrollment: enrollmentRecord };
  }, { maxWait: 15000, timeout: 30000 });

  // 2. Post-Transaction Automation: Non-blocking Invitation Email & In-App Notification
  let invitationSent = false;
  let invitationPreviewUrl: string | false = false;
  let invitationError: string | null = null;

  try {
    const setupToken = await signPasswordSetupToken({
      userId: user.id,
      email: user.email,
      institutionId,
      passwordHash: user.passwordHash || null,
    });

    const appUrl = getAppBaseUrl();
    const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;
    const inst = await db.institution.findUnique({
      where: { id: institutionId },
      select: { name: true },
    });

    const emailRes = await sendRoleCredentialInvitation(
      { email: user.email, name: student.fullName || undefined },
      {
        setupUrl,
        institutionName: inst?.name || "Campus Administration",
        expiresIn: "24 hours",
        role: "STUDENT",
        loginUrl: `${appUrl}/login`,
        username: user.email,
      }
    );

    invitationSent = emailRes.success;
    invitationPreviewUrl = emailRes.previewUrl || false;
    if (!emailRes.success) invitationError = emailRes.error || "Email delivery failed";

    await recordAuditLog(db, {
      institutionId,
      userId: user.id,
      action: emailRes.success ? "INVITATION_SENT" : "INVITATION_FAILED",
      entityType: "STUDENT",
      entityId: student.id,
      newValuesJson: JSON.stringify({
        recipient: user.email,
        previewUrl: invitationPreviewUrl || undefined,
        error: invitationError || undefined,
      }),
    });
  } catch (emailErr: any) {
    console.warn("[createStudent] Post-creation invitation error (non-blocking):", emailErr.message);
    invitationError = emailErr.message;
  }

  // 3. Post-Transaction Automation: Generate In-App Notification in PostgreSQL
  try {
    await db.notification.create({
      data: {
        institutionId,
        title: "Welcome to SST-ERP Student Portal",
        message: `Welcome, ${student.fullName}! Your student portal account has been provisioned. Please complete your security profile.`,
        category: "ACADEMIC",
        audienceRole: "STUDENT",
        recipients: {
          create: {
            userId: user.id,
            isRead: false,
          },
        },
      },
    });
  } catch (notifErr: any) {
    console.warn("[createStudent] Post-creation notification error (non-blocking):", notifErr.message);
  }

  return {
    ...student,
    user,
    enrollment,
    invitationSent,
    previewUrl: invitationPreviewUrl,
    invitationError,
  };
}

export async function updateStudent(
  institutionId: string,
  studentId: string,
  data: Partial<{
    fullName: string;
    email: string;
    phone: string;
    gender: any;
    status: any;
  }>
) {
  const result = await db.student.updateMany({
    where: { id: studentId, institutionId },
    data,
  });
  if (result.count === 0) {
    throw new Error("Student not found or access denied.");
  }
  return await db.student.findFirst({
    where: { id: studentId, institutionId },
  });
}

// ----------------------------------------------------------------------------
// 3. GUARDIANS
// ----------------------------------------------------------------------------
export async function getGuardians(institutionId: string) {
  try {
    const [accounts, archivedSetting] = await Promise.all([
      db.guardianAccount.findMany({
        where: { institutionId },
        include: {
          guardianLinks: {
            include: { student: true },
          },
          user: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      db.platformSetting
        .findUnique({
          where: { key: `archived_guardians:${institutionId}` },
        })
        .catch(() => null),
    ]);

    const archivedList: any[] = Array.isArray(archivedSetting?.value)
      ? (archivedSetting?.value as any[])
      : [];
    const archivedMap = new Map(archivedList.map((a: any) => [a.id, a]));

    if (accounts) {
      return accounts.map((ga) => {
        const archiveRecord =
          archivedMap.get(ga.id) ||
          (ga.userId ? archivedMap.get(ga.userId) : null);
        const verifiedCount = ga.guardianLinks.filter((gl) => gl.isVerified).length;
        const hasUser = !!ga.user;
        const hasPassword = !!ga.user?.passwordHash && ga.user.passwordHash.startsWith("$2");
        const isActive = !!ga.user?.isActive && ga.user?.status === "ACTIVE";

        let portalStatus: "ACTIVE" | "PENDING_SETUP" | "DISABLED" | "NOT_CREATED" | "UNVERIFIED" = "NOT_CREATED";
        if (verifiedCount === 0) {
          portalStatus = "UNVERIFIED";
        } else if (!hasUser) {
          portalStatus = "NOT_CREATED";
        } else if (!hasPassword) {
          portalStatus = "PENDING_SETUP";
        } else {
          portalStatus = isActive ? "ACTIVE" : "DISABLED";
        }

        return {
          id: ga.id,
          guardianUniqueId: `GRD-${ga.id.slice(-4)}`,
          fullName: ga.fullName,
          phone: ga.phone,
          email: ga.user?.email || null,
          occupation: ga.occupation,
          relationship: ga.relationship,
          isArchived: Boolean(archiveRecord),
          archivedAt: archiveRecord?.archivedAt || null,
          archivedBy: archiveRecord?.archivedBy || null,
          archiveReason: archiveRecord?.reason || null,
          userId: ga.userId,
          portalUserId: ga.userId,
          portalAccess: isActive && verifiedCount > 0,
          portalStatus,
          hasVerifiedRelationship: verifiedCount > 0,
          lastLoginAt: ga.user?.lastLoginAt || null,
          students: ga.guardianLinks.map((gl) => ({
            studentId: gl.studentId,
            student: gl.student,
            isVerified: gl.isVerified,
            canAccessPortal: gl.canAccessPortal,
            relationship: gl.relationship,
          })),
          createdAt: ga.createdAt,
        };
      });
    }
  } catch (err: any) {
    console.warn("GuardianAccount lookup error:", err.message);
  }
  return [];
}

export async function createGuardian(
  institutionId: string,
  data: {
    fullName: string;
    relationship?: string;
    phone: string;
    email?: string;
    occupation?: string;
    studentId?: string;
    isVerified?: boolean;
    canAccessPortal?: boolean;
  }
) {
  const email = data.email?.trim().toLowerCase();
  if (!email) {
    throw new Error("Guardian email is required to register a parent account.");
  }

  const { guardianAccount, user, isAuthorized } = await db.$transaction(async (tx) => {
    // 1. If studentId provided, verify student belongs to this tenant
    if (data.studentId) {
      const student = await tx.student.findFirst({
        where: { id: data.studentId, institutionId },
      });
      if (!student) {
        throw new Error("Student not found or access denied.");
      }
    }

    // 2. Resolve or create User account (dormant until credentials issued)
    let userRecord = await tx.user.findFirst({
      where: { email },
      include: { guardianAccount: true },
    });

    if (userRecord) {
      if (userRecord.institutionId && userRecord.institutionId !== institutionId) {
        throw new Error("Email is already registered under another institution.");
      }
      if (userRecord.role && userRecord.role !== "PARENT" && userRecord.role !== "GUARDIAN") {
        throw new Error(`User already exists with an incompatible role: ${userRecord.role}.`);
      }
    } else {
      userRecord = await tx.user.create({
        data: {
          institutionId,
          email,
          fullName: data.fullName.trim(),
          phone: data.phone.trim(),
          role: "PARENT",
          isActive: false,
          status: "INACTIVE",
          passwordHash: null,
        },
        include: { guardianAccount: true },
      });
    }

    // 3. Prevent duplicate GuardianAccount records
    let guardianAccountRecord = userRecord.guardianAccount;
    if (!guardianAccountRecord) {
      guardianAccountRecord = await tx.guardianAccount.create({
        data: {
          institutionId,
          userId: userRecord.id,
          fullName: data.fullName.trim(),
          phone: data.phone.trim(),
          relationship: data.relationship || "GUARDIAN",
          occupation: data.occupation?.trim() || null,
        },
      });
    } else {
      guardianAccountRecord = await tx.guardianAccount.update({
        where: { id: guardianAccountRecord.id },
        data: {
          fullName: data.fullName.trim(),
          phone: data.phone.trim(),
          relationship: data.relationship || guardianAccountRecord.relationship,
          ...(data.occupation ? { occupation: data.occupation.trim() } : {}),
        },
      });
    }

    // 4. Link student if provided (respect isVerified flag; unverified by default)
    const shouldVerify = data.isVerified === true;
    const canAccess = data.canAccessPortal !== undefined ? !!data.canAccessPortal : shouldVerify;

    if (data.studentId) {
      await tx.guardianLink.upsert({
        where: {
          guardianAccountId_studentId: {
            guardianAccountId: guardianAccountRecord.id,
            studentId: data.studentId,
          },
        },
        update: {
          relationship: data.relationship || "GUARDIAN",
          ...(data.isVerified !== undefined ? { isVerified: shouldVerify } : {}),
          ...(data.canAccessPortal !== undefined ? { canAccessPortal: canAccess } : {}),
        },
        create: {
          institutionId,
          guardianAccountId: guardianAccountRecord.id,
          studentId: data.studentId,
          relationship: data.relationship || "GUARDIAN",
          isVerified: shouldVerify,
          canAccessPortal: canAccess,
          isPrimary: false,
        },
      });
    }

    // Check if guardian has at least one verified relationship
    let verifiedLink: any = null;
    if (tx.guardianLink && typeof tx.guardianLink.findFirst === "function") {
      verifiedLink = await tx.guardianLink.findFirst({
        where: {
          guardianAccountId: guardianAccountRecord.id,
          isVerified: true,
          canAccessPortal: true,
        },
      });
    } else if (data.isVerified === true) {
      verifiedLink = { isVerified: true, canAccessPortal: true };
    }

    await recordAuditLog(tx, {
      institutionId,
      userId: userRecord.id,
      action: "GUARDIAN_CREATED",
      entityType: "GUARDIAN",
      entityId: guardianAccountRecord.id,
      newValuesJson: JSON.stringify({
        email,
        studentId: data.studentId,
        isVerified: !!verifiedLink,
      }),
    });

    return {
      guardianAccount: guardianAccountRecord,
      user: userRecord,
      isAuthorized: !!verifiedLink,
    };
  }, { maxWait: 15000, timeout: 30000 });

  // 5. Post-Transaction Automation: Invitation Email & Notification for Guardian Onboarding
  let invitationSent = false;
  let invitationPreviewUrl: string | false = false;
  let invitationError: string | null = null;

  // Invite guardian if link is verified OR if account was newly provisioned by an admin
  const shouldInviteGuardian = isAuthorized || !user.passwordHash || user.status === "INACTIVE";

  if (shouldInviteGuardian) {
    try {
      // Invalidate previous setup token by setting an initial unique invited marker
      const initialMarker = `INVITED_${Date.now()}_${crypto.randomUUID()}`;
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: initialMarker },
      });

      const setupToken = await signPasswordSetupToken({
        userId: user.id,
        email: user.email,
        institutionId,
        passwordHash: initialMarker,
      });

      const appUrl = getAppBaseUrl();
      const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;
      const inst = await db.institution.findUnique({
        where: { id: institutionId },
        select: { name: true, slug: true },
      });
      const portalLoginUrl = getRolePortalLoginUrl("PARENT", inst?.slug, appUrl);

      const emailRes = await sendRoleCredentialInvitation(
        { email: user.email, name: guardianAccount.fullName || undefined },
        {
          setupUrl,
          institutionName: inst?.name || "Campus Administration",
          expiresIn: "24 hours",
          role: "PARENT",
          loginUrl: portalLoginUrl,
          username: user.email,
          institutionId,
        }
      );

      invitationSent = emailRes.success;
      invitationPreviewUrl = emailRes.previewUrl || false;
      if (!emailRes.success) invitationError = emailRes.error || "Email delivery failed";

      await recordAuditLog(db, {
        institutionId,
        userId: user.id,
        action: emailRes.success ? "INVITATION_SENT" : "INVITATION_FAILED",
        entityType: "GUARDIAN",
        entityId: guardianAccount.id,
        newValuesJson: JSON.stringify({
          recipient: user.email,
          previewUrl: invitationPreviewUrl || undefined,
          error: invitationError || undefined,
        }),
      });
    } catch (emailErr: any) {
      console.warn("[createGuardian] Post-creation invitation error (non-blocking):", emailErr.message);
      invitationError = emailErr.message;
    }

    // In-App Notification in DB
    try {
      await db.notification.create({
        data: {
          institutionId,
          title: "Welcome to SST-ERP Parent & Guardian Portal",
          message: `Welcome, ${guardianAccount.fullName}! Your parent portal account has been authorized. Please complete your security profile.`,
          category: "GENERAL",
          audienceRole: "PARENT",
          recipients: {
            create: {
              userId: user.id,
              isRead: false,
            },
          },
        },
      });
    } catch (notifErr: any) {
      console.warn("[createGuardian] Post-creation notification error (non-blocking):", notifErr.message);
    }
  }

  return {
    id: guardianAccount.id,
    userId: user.id,
    guardianUniqueId: `GRD-${guardianAccount.id.slice(-4)}`,
    fullName: guardianAccount.fullName,
    phone: guardianAccount.phone,
    email: user.email,
    occupation: guardianAccount.occupation,
    relationship: guardianAccount.relationship,
    createdAt: guardianAccount.createdAt,
    authorized: isAuthorized,
    invitationSent,
    previewUrl: invitationPreviewUrl,
    invitationError,
  };
}

export async function updateGuardian(
  institutionId: string,
  id: string,
  data: {
    fullName?: string;
    relationship?: string;
    phone?: string;
    alternatePhone?: string;
    email?: string;
    addressLine?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    occupation?: string;
    company?: string;
    isEmergencyContact?: boolean;
    status?: string;
  },
  actorUserId?: string
) {
  if (!id || typeof id !== "string" || !id.trim()) {
    throw new Error("Guardian ID is required.");
  }

  const cleanId = id.trim();

  // 1. Locate the target guardian account under the authenticated institution
  let guardianAccount = null;
  if (isValidUuid(cleanId)) {
    guardianAccount = await db.guardianAccount.findFirst({
      where: {
        institutionId,
        OR: [{ id: cleanId }, { userId: cleanId }],
      },
      include: {
        user: true,
        guardianLinks: {
          include: { student: true },
        },
      },
    });
  } else if (cleanId.startsWith("GRD-")) {
    const suffix = cleanId.slice(4).toLowerCase();
    const candidates = await db.guardianAccount.findMany({
      where: { institutionId },
      include: {
        user: true,
        guardianLinks: {
          include: { student: true },
        },
      },
    });
    guardianAccount = candidates.find((ga) => ga.id.toLowerCase().endsWith(suffix)) || null;
  }

  if (!guardianAccount) {
    throw new Error("Guardian not found or access denied.");
  }

  // 2. Validate and check email uniqueness if email update requested
  let normalizedEmail: string | undefined = undefined;
  if (data.email !== undefined) {
    const rawEmail = String(data.email).trim().toLowerCase();
    if (!rawEmail) {
      throw new Error("Guardian email address cannot be empty.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z0-9._-]+$/.test(rawEmail)) {
      throw new Error("Please enter a valid email address.");
    }
    normalizedEmail = rawEmail;

    // Check if another user already has this email
    const conflictingUser = await db.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: "insensitive" },
        id: { not: guardianAccount.userId },
      },
      select: { id: true, institutionId: true, role: true },
    });

    if (conflictingUser) {
      throw new Error(`Email address "${normalizedEmail}" is already registered to another user account.`);
    }
  }

  // 3. Transactional update across GuardianAccount and linked User
  const result = await db.$transaction(async (tx) => {
    // A. Update GuardianAccount
    const updatedGa = await tx.guardianAccount.update({
      where: { id: guardianAccount.id },
      data: {
        ...(data.fullName ? { fullName: data.fullName.trim() } : {}),
        ...(data.phone ? { phone: data.phone.trim() } : {}),
        ...(data.relationship ? { relationship: data.relationship } : {}),
        ...(data.occupation !== undefined ? { occupation: data.occupation ? data.occupation.trim() : null } : {}),
        ...(data.addressLine || data.city ? {
          address: [data.addressLine, data.city, data.state, data.postalCode].filter(Boolean).join(", ")
        } : {}),
      },
      include: {
        user: true,
        guardianLinks: {
          include: { student: true },
        },
      },
    });

    // B. Synchronize User login & notification email
    let updatedUser = guardianAccount.user;
    if (guardianAccount.userId) {
      updatedUser = await tx.user.update({
        where: { id: guardianAccount.userId },
        data: {
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
          ...(data.fullName ? { fullName: data.fullName.trim(), name: data.fullName.trim() } : {}),
          ...(data.phone ? { phone: data.phone.trim() } : {}),
        },
      });
    }

    // C. Audit log for email/profile update
    await recordAuditLog(tx, {
      institutionId,
      userId: guardianAccount.userId,
      actorUserId,
      action: "GUARDIAN_UPDATED",
      entityType: "GUARDIAN",
      entityId: guardianAccount.id,
      oldValuesJson: JSON.stringify({
        email: guardianAccount.user?.email,
        fullName: guardianAccount.fullName,
        phone: guardianAccount.phone,
      }),
      newValuesJson: JSON.stringify({
        email: normalizedEmail || guardianAccount.user?.email,
        fullName: data.fullName || guardianAccount.fullName,
        phone: data.phone || guardianAccount.phone,
      }),
    });

    return {
      guardianAccount: updatedGa,
      user: updatedUser,
    };
  });

  const verifiedCount = result.guardianAccount.guardianLinks.filter((gl) => gl.isVerified).length;
  const hasUser = !!result.user;
  const hasPassword = !!result.user?.passwordHash && result.user.passwordHash.startsWith("$2");
  const isActive = !!result.user?.isActive && result.user?.status === "ACTIVE";

  let portalStatus: "ACTIVE" | "PENDING_SETUP" | "DISABLED" | "NOT_CREATED" | "UNVERIFIED" = "NOT_CREATED";
  if (verifiedCount === 0) {
    portalStatus = "UNVERIFIED";
  } else if (!hasUser) {
    portalStatus = "NOT_CREATED";
  } else if (!hasPassword) {
    portalStatus = "PENDING_SETUP";
  } else {
    portalStatus = isActive ? "ACTIVE" : "DISABLED";
  }

  return {
    id: result.guardianAccount.id,
    guardianUniqueId: `GRD-${result.guardianAccount.id.slice(-4)}`,
    fullName: result.guardianAccount.fullName,
    phone: result.guardianAccount.phone,
    email: result.user?.email || null,
    occupation: result.guardianAccount.occupation,
    relationship: result.guardianAccount.relationship,
    userId: result.guardianAccount.userId,
    portalUserId: result.guardianAccount.userId,
    portalAccess: isActive && verifiedCount > 0,
    portalStatus,
    hasVerifiedRelationship: verifiedCount > 0,
    lastLoginAt: result.user?.lastLoginAt || null,
    students: result.guardianAccount.guardianLinks.map((gl) => ({
      studentId: gl.studentId,
      student: gl.student,
      isVerified: gl.isVerified,
      canAccessPortal: gl.canAccessPortal,
      relationship: gl.relationship,
    })),
    createdAt: result.guardianAccount.createdAt,
  };
}

// ----------------------------------------------------------------------------
// 4. FACULTY & STAFF
// ----------------------------------------------------------------------------
export async function getStaff(institutionId: string) {
  try {
    const [users, archivedSetting, roleAssignments] = await Promise.all([
      db.user.findMany({
        where: {
          institutionId,
          role: {
            in: [
              "TEACHER",
              "ADMIN",
              "STAFF",
              "HOD",
              "ADMISSIONS_OFFICER",
              "ACCOUNTANT",
              "HOSTEL_WARDEN",
              "TRANSPORT_OFFICER",
            ],
          },
        },
        include: {
          teacherProfile: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      db.platformSetting
        .findUnique({
          where: { key: `archived_staff:${institutionId}` },
        })
        .catch(() => null),
      db.userRoleAssignment
        .findMany({
          where: { institutionId },
          include: {
            role: {
              select: { id: true, name: true, code: true },
            },
          },
        })
        .catch(() => []),
    ]);

    const assignmentsByUser = new Map<string, Array<{ id: string; name: string; code: string }>>();
    for (const a of roleAssignments as any[]) {
      if (!a.role) continue;
      const list = assignmentsByUser.get(a.userId) || [];
      list.push(a.role);
      assignmentsByUser.set(a.userId, list);
    }

    const ROLE_META: Record<string, { designation: string; department: string }> = {
      ADMIN: { designation: "Administrator", department: "Administration" },
      ADMISSIONS_OFFICER: { designation: "Admissions Officer", department: "Admissions" },
      ACCOUNTANT: { designation: "Accountant", department: "Accounts & Finance" },
      HOSTEL_WARDEN: { designation: "Hostel Warden", department: "Hostel Administration" },
      TRANSPORT_OFFICER: { designation: "Transport Officer", department: "Transport Department" },
    };

    const archivedList: any[] = Array.isArray(archivedSetting?.value)
      ? (archivedSetting?.value as any[])
      : [];
    const archivedMap = new Map(archivedList.map((a: any) => [a.id, a]));

    return users.map((u) => {
      let teacherProfile = u.teacherProfile;
      const isTeacherRole = u.role === "TEACHER" || u.role === "HOD";

      if (isTeacherRole && !teacherProfile) {
        teacherProfile = {
          id: `teach-${u.id}`,
          institutionId: u.institutionId || institutionId,
          userId: u.id,
          employeeId: `EMP-${u.id.slice(0, 8)}`,
          department: "General Academics",
          designation: u.role === "HOD" ? "Professor & HOD" : "Assistant Professor",
        } as any;
      }

      const parts = (u.fullName || "Staff Member").trim().split(/\s+/);
      const firstName = parts[0] || "Staff";
      const lastName = parts.slice(1).join(" ") || "Member";

      const staffObj = teacherProfile
        ? {
            id: teacherProfile.id,
            institutionId: teacherProfile.institutionId,
            userId: u.id,
            staffEmployeeId: teacherProfile.employeeId,
            firstName,
            lastName,
            fullName: u.fullName || `${firstName} ${lastName}`,
            email: u.email,
            phone: u.phone || "",
            designation: teacherProfile.designation,
            department: teacherProfile.department,
            departmentId: teacherProfile.department,
            status: u.isActive ? "ACTIVE" : "INACTIVE",
          }
        : {
            id: u.id,
            institutionId: u.institutionId,
            userId: u.id,
            staffEmployeeId: `ADM-${u.id.slice(0, 6)}`,
            firstName,
            lastName,
            fullName: u.fullName || `${firstName} ${lastName}`,
            email: u.email,
            phone: u.phone || "",
            designation: ROLE_META[u.role || ""]?.designation || "Staff Member",
            department: ROLE_META[u.role || ""]?.department || "Administration",
            departmentId: ROLE_META[u.role || ""]?.department || "Administration",
            status: u.isActive ? "ACTIVE" : "INACTIVE",
          };

      const archiveRecord =
        archivedMap.get(u.id) ||
        (teacherProfile ? archivedMap.get(teacherProfile.id) : null);

      return {
        ...u,
        teacherProfile,
        staff: staffObj,
        assignedRoles: assignmentsByUser.get(u.id) || [],
        isArchived: Boolean(archiveRecord),
        archivedAt: archiveRecord?.archivedAt || null,
        archivedBy: archiveRecord?.archivedBy || null,
        archiveReason: archiveRecord?.reason || null,
      };
    });
  } catch (err: any) {
    console.warn("[getStaff] Query failed, returning empty list:", err?.message);
    return [];
  }
}

type StaffRoleAssignmentTransaction = {
  userRoleAssignment: {
    deleteMany: (args: { where: { userId: string; institutionId: string } }) => Promise<unknown>;
    createMany: (args: {
      data: Array<{ userId: string; roleId: string; institutionId: string }>;
      skipDuplicates: boolean;
    }) => Promise<unknown>;
  };
};

export async function replaceStaffRoleAssignments(
  tx: StaffRoleAssignmentTransaction,
  userId: string,
  institutionId: string,
  roleIds: string[]
): Promise<void> {
  await tx.userRoleAssignment.deleteMany({ where: { userId, institutionId } });
  if (roleIds.length === 0) return;

  await tx.userRoleAssignment.createMany({
    data: roleIds.map((roleId) => ({ userId, roleId, institutionId })),
    skipDuplicates: true,
  });
}

export async function createStaff(
  institutionId: string,
  data: {
    fullName: string;
    email: string;
    role?:
      | "TEACHER"
      | "ADMIN"
      | "STAFF"
      | "HOD"
      | "ADMISSIONS_OFFICER"
      | "ACCOUNTANT"
      | "HOSTEL_WARDEN"
      | "TRANSPORT_OFFICER";
    phone?: string;
    designation?: string;
    departmentId?: string;
    department?: string;
    employeeId?: string;
    roleIds?: string[];
    actorUserId?: string;
  }
) {
  const email = data.email.trim().toLowerCase();
  const fullName = data.fullName.trim();
  const effectiveRole = data.role || "TEACHER";
  const isFacultyRole = effectiveRole === "TEACHER" || effectiveRole === "HOD";
  const userRole = effectiveRole === "HOD" ? "TEACHER" : effectiveRole;

  // 1. Database Transaction: Atomic Teacher, Staff & User Account Provisioning
  const { user, teacher, staff } = await db.$transaction(async (tx) => {
    let userRecord = await tx.user.findFirst({
      where: { email },
      include: { teacherProfile: true },
    });

    if (userRecord) {
      if (userRecord.institutionId && userRecord.institutionId !== institutionId) {
        throw new Error("Email is already registered under another institution.");
      }
      if (isFacultyRole && userRecord.teacherProfile) {
        throw new Error("A faculty profile is already linked to this email address.");
      }
      userRecord = await tx.user.update({
        where: { id: userRecord.id },
        data: {
          institutionId,
          fullName,
          role: userRole,
          phone: data.phone?.trim() || userRecord.phone || undefined,
        },
        include: { teacherProfile: true },
      });
    } else {
      userRecord = await tx.user.create({
        data: {
          institutionId,
          email,
          fullName,
          role: userRole,
          phone: data.phone?.trim(),
          isActive: false, // Dormant until password setup
          status: "INACTIVE",
          passwordHash: null,
        },
        include: { teacherProfile: true },
      });
    }

    const employeeId = data.employeeId?.trim() || `FAC-${Date.now().toString().slice(-4)}`;
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0] || "Faculty";
    const lastName = parts.slice(1).join(" ") || "Member";
    const DEFAULT_ROLE_DESIGNATIONS: Record<string, string> = {
      HOD: "Professor & HOD",
      ADMIN: "Administrator",
      ADMISSIONS_OFFICER: "Admissions Officer",
      ACCOUNTANT: "Accountant",
      HOSTEL_WARDEN: "Hostel Warden",
      TRANSPORT_OFFICER: "Transport Officer",
    };
    const designation =
      data.designation?.trim() ||
      DEFAULT_ROLE_DESIGNATIONS[effectiveRole] ||
      "Assistant Professor";
    const departmentName = data.department?.trim() || data.departmentId?.trim() || "General Academics";

    let teacherRecord: any = null;
    if (isFacultyRole) {
      teacherRecord = await tx.teacher.create({
        data: {
          institutionId,
          userId: userRecord.id,
          department: departmentName,
          designation,
          employeeId,
        },
      });
    }

    // Synchronize Staff representation sharing the same userId, institutionId, employeeId, department and designation
    const staffRecord = {
      id: teacherRecord?.id || userRecord.id,
      institutionId,
      userId: userRecord.id,
      staffEmployeeId: employeeId,
      firstName,
      lastName,
      fullName,
      email,
      phone: data.phone?.trim() || userRecord.phone || "",
      department: departmentName,
      departmentId: departmentName,
      designation,
      status: "ACTIVE",
    };

    if (Array.isArray(data.roleIds)) {
      await replaceStaffRoleAssignments(tx, userRecord.id, institutionId, data.roleIds);
    }

    await recordAuditLog(tx, {
      institutionId,
      actorUserId: data.actorUserId || null,
      userId: userRecord.id,
      action: "STAFF_CREATED",
      entityType: isFacultyRole ? (data.role === "HOD" ? "HOD" : "TEACHER") : (data.role === "ADMIN" ? "ADMIN" : "STAFF"),
      entityId: teacherRecord?.id || userRecord.id,
      newValuesJson: JSON.stringify({
        email,
        role: data.role,
        employeeId,
        teacherId: teacherRecord?.id,
        staffEmployeeId: staffRecord.staffEmployeeId,
        ...(Array.isArray(data.roleIds) && data.roleIds.length > 0 ? { roleIds: data.roleIds } : {}),
      }),
    });

    return { user: userRecord, teacher: teacherRecord, staff: staffRecord };
  }, { maxWait: 15000, timeout: 30000 });

  // 2. Post-Transaction Automation: Non-blocking Invitation for Staff/Faculty/HOD/Admin
  let invitationSent = false;
  let invitationPreviewUrl: string | false = false;
  let invitationError: string | null = null;

  try {
    const rawRole = (data.role || "STAFF").toUpperCase();
    const designationUpper = (data.designation || "").toUpperCase();
    const isHod =
      rawRole === "HOD" ||
      designationUpper.includes("HOD") ||
      designationUpper.includes("HEAD OF DEPARTMENT");

    let invitationRole: string = rawRole;
    if (isHod) {
      invitationRole = "HOD";
    } else if (rawRole === "TEACHER") {
      invitationRole = "TEACHER";
    } else if (rawRole === "ADMIN") {
      invitationRole = "ADMIN";
    } else if (
      ["ADMISSIONS_OFFICER", "ACCOUNTANT", "HOSTEL_WARDEN", "TRANSPORT_OFFICER"].includes(rawRole)
    ) {
      invitationRole = rawRole;
    } else {
      invitationRole = "STAFF";
    }

    // Invalidate previous setup token by setting an initial unique invited marker
    const initialMarker = `INVITED_${Date.now()}_${crypto.randomUUID()}`;
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: initialMarker },
    });

    const setupToken = await signPasswordSetupToken({
      userId: user.id,
      email: user.email,
      institutionId,
      passwordHash: initialMarker,
    });

    const appUrl = getAppBaseUrl();
    const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;
    const inst = await db.institution.findUnique({
      where: { id: institutionId },
      select: { name: true, slug: true },
    });

    const portalLoginUrl = getRolePortalLoginUrl(invitationRole, inst?.slug, appUrl);

    const emailRes = await sendRoleCredentialInvitation(
      { email: user.email, name: fullName },
      {
        setupUrl,
        institutionName: inst?.name || "Campus Administration",
        expiresIn: "24 hours",
        role: invitationRole as any,
        loginUrl: portalLoginUrl,
        username: user.email,
        departmentName: data.departmentId || undefined,
        institutionId,
      }
    );

    invitationSent = emailRes.success;
    invitationPreviewUrl = emailRes.previewUrl || false;
    if (!emailRes.success) invitationError = emailRes.error || "Email delivery failed";

    await recordAuditLog(db, {
      institutionId,
      userId: user.id,
      action: emailRes.success ? "INVITATION_SENT" : "INVITATION_FAILED",
      entityType: invitationRole,
      entityId: teacher?.id || user.id,
      newValuesJson: JSON.stringify({
        recipient: user.email,
        role: invitationRole,
        previewUrl: invitationPreviewUrl || undefined,
        error: invitationError || undefined,
      }),
    });

    // In-App Notification for Member
    try {
      const notifTitles: Record<string, string> = {
        HOD: "Welcome to SST-ERP Departmental Leadership Workspace",
        TEACHER: "Welcome to SST-ERP Faculty Portal",
        ADMIN: "Welcome to SST-ERP Institution Administration Portal",
        STAFF: "Welcome to SST-ERP Administrative Staff Portal",
      };
      await db.notification.create({
        data: {
          institutionId,
          title: notifTitles[invitationRole] || "Welcome to SST-ERP Portal",
          message: `Welcome, ${fullName}! Your ${invitationRole} account has been provisioned. Please complete your security profile.`,
          category: "ACADEMIC",
          audienceRole: (invitationRole === "HOD" ? "TEACHER" : invitationRole) as any,
          recipients: {
            create: {
              userId: user.id,
              isRead: false,
            },
          },
        },
      });
    } catch (notifErr: any) {
      console.warn("[createStaff] Post-creation notification error (non-blocking):", notifErr.message);
    }
  } catch (err: any) {
    console.warn("[createStaff] Post-creation invitation error (non-blocking):", err.message);
    invitationError = err.message;
  }

  return {
    ...user,
    user,
    teacher,
    teacherProfile: teacher,
    staff,
    invitationSent,
    previewUrl: invitationPreviewUrl,
    invitationError,
  };
}

// ----------------------------------------------------------------------------
// 5, 6, 7 & 8. ACADEMIC STRUCTURE
// ----------------------------------------------------------------------------
export async function getAcademicYears(institutionId: string) {
  const years = await db.academicYear.findMany({
    where: { institutionId },
    orderBy: { startDate: "desc" },
  });

  // Query terms relational table scoped strictly to the authenticated institution
  let termsByYearId: Record<string, any[]> = {};
  try {
    const tableCheck: any[] = await db.$queryRaw`SELECT to_regclass('public.academic_terms')::text as tbl;`;
    if (tableCheck && tableCheck[0]?.tbl !== null) {
      const termRows: any[] = await db.$queryRaw`
        SELECT
          "id"::text,
          "institutionId"::text,
          "academicYearId"::text,
          "name",
          "code",
          "startDate",
          "endDate",
          "isCurrent",
          "status"
        FROM academic_terms
        WHERE "institutionId" = ${institutionId}
        ORDER BY "startDate" ASC;
      `;
      for (const t of termRows) {
        if (!termsByYearId[t.academicYearId]) {
          termsByYearId[t.academicYearId] = [];
        }
        termsByYearId[t.academicYearId].push(t);
      }
    }
  } catch {
    // academic_terms table pending migration in production database
  }

  return years.map((ay) => ({
    ...ay,
    terms: termsByYearId[ay.id] || [],
  }));
}

export async function createAcademicYear(
  institutionId: string,
  data: {
    name: string;
    startDate: Date;
    endDate: Date;
    isCurrent?: boolean;
    terms?: { name: string; termNumber?: number; startDate: Date; endDate: Date; isCurrent?: boolean }[];
  }
) {
  const normalizedName = (data.name || "").trim();
  if (!normalizedName) {
    throw new Error("Academic year name is required.");
  }

  const ayStart = new Date(data.startDate);
  const ayEnd = new Date(data.endDate);
  if (ayStart >= ayEnd) {
    throw new Error("Academic year start date must precede end date.");
  }

  // Validate terms if provided
  const validatedTerms: { name: string; startDate: Date; endDate: Date; isCurrent: boolean }[] = [];
  if (data.terms && Array.isArray(data.terms) && data.terms.length > 0) {
    const seenNames = new Set<string>();
    for (let i = 0; i < data.terms.length; i++) {
      const t = data.terms[i];
      const tName = (t.name || "").trim();
      if (!tName) {
        throw new Error(`Term #${i + 1} must have a valid title.`);
      }
      const lowerName = tName.toLowerCase();
      if (seenNames.has(lowerName)) {
        throw new Error(`Duplicate term title "${tName}". Each term in an academic cycle must have a unique title.`);
      }
      seenNames.add(lowerName);
      const tStart = new Date(t.startDate);
      const tEnd = new Date(t.endDate);
      if (isNaN(tStart.getTime()) || isNaN(tEnd.getTime())) {
        throw new Error(`Term "${tName}" has invalid date values.`);
      }
      if (tStart >= tEnd) {
        throw new Error(`Term "${tName}" start date must precede its end date.`);
      }
      if (tStart < ayStart || tEnd > ayEnd) {
        throw new Error(
          `Term "${tName}" dates (${tStart.toISOString().split("T")[0]} to ${tEnd.toISOString().split("T")[0]}) must fall within academic year boundary (${ayStart.toISOString().split("T")[0]} to ${ayEnd.toISOString().split("T")[0]}).`
        );
      }
      validatedTerms.push({
        name: tName,
        startDate: tStart,
        endDate: tEnd,
        isCurrent: Boolean(t.isCurrent),
      });
    }

    // Chronological sort and sequential overlap check
    validatedTerms.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    for (let i = 0; i < validatedTerms.length - 1; i++) {
      const cur = validatedTerms[i];
      const nxt = validatedTerms[i + 1];
      if (cur.endDate > nxt.startDate) {
        throw new Error(
          `Terms cannot overlap: "${cur.name}" ends on ${cur.endDate.toISOString().split("T")[0]}, but "${nxt.name}" starts on ${nxt.startDate.toISOString().split("T")[0]}.`
        );
      }
    }
  }

  return await db.$transaction(async (tx) => {
    // Advisory lock serialized per institution to safely prevent concurrent duplicate inserts
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('ay_' || $1))`, institutionId);

    // Case-insensitive duplicate name check scoped strictly to the authenticated institution
    const existing = await tx.academicYear.findFirst({
      where: {
        institutionId,
        name: { equals: normalizedName, mode: "insensitive" },
      },
    });

    if (existing) {
      throw new Error(`Academic year "${normalizedName}" already exists for this institution.`);
    }

    if (data.isCurrent) {
      await tx.academicYear.updateMany({
        where: { institutionId },
        data: { isCurrent: false },
      });
    }

    const created = await tx.academicYear.create({
      data: {
        institutionId,
        name: normalizedName,
        startDate: ayStart,
        endDate: ayEnd,
        isCurrent: !!data.isCurrent,
        status: "ACTIVE",
      },
    });

    // Relational persistence for academic terms
    let persistedTerms: any[] = [];
    if (validatedTerms.length > 0) {
      const tableCheck: any[] = await tx.$queryRaw`SELECT to_regclass('public.academic_terms')::text as tbl;`;
      const hasTermsTable = tableCheck && tableCheck[0]?.tbl !== null;

      if (hasTermsTable) {
        for (const t of validatedTerms) {
          const termId = crypto.randomUUID();
          await tx.$executeRawUnsafe(
            `INSERT INTO academic_terms ("id", "institutionId", "academicYearId", "name", "startDate", "endDate", "isCurrent", "status", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
            termId,
            institutionId,
            created.id,
            t.name,
            t.startDate,
            t.endDate,
            t.isCurrent,
            "ACTIVE"
          );
          persistedTerms.push({
            id: termId,
            institutionId,
            academicYearId: created.id,
            name: t.name,
            startDate: t.startDate,
            endDate: t.endDate,
            isCurrent: t.isCurrent,
            status: "ACTIVE",
          });
        }
      } else {
        persistedTerms = validatedTerms.map((t, idx) => ({
          id: `term-${idx + 1}`,
          institutionId,
          academicYearId: created.id,
          name: t.name,
          startDate: t.startDate,
          endDate: t.endDate,
          isCurrent: t.isCurrent,
          status: "ACTIVE",
        }));
      }
    }

    return {
      ...created,
      terms: persistedTerms,
    };
  });
}

export async function getDepartments(institutionId: string) {
  try {
    // Derive active departments dynamically from live courses and teachers tables
    const [courseDepts, teacherDepts] = await Promise.all([
      db.course.findMany({
        where: { institutionId },
        select: { id: true, name: true, code: true, department: true },
      }),
      db.teacher.findMany({
        where: { institutionId },
        select: {
          id: true,
          department: true,
          designation: true,
          employeeId: true,
          user: {
            select: {
              fullName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
    ]);

    // Aggregate distinct non-empty department names
    const deptNames = Array.from(
      new Set([
        ...courseDepts.map((c) => c.department?.trim()),
        ...teacherDepts.map((t) => t.department?.trim()),
      ])
    ).filter((d): d is string => Boolean(d));

    return deptNames.map((name, idx) => {
      const matchingTeachers = teacherDepts.filter(
        (t) => t.department?.trim().toLowerCase() === name.toLowerCase()
      );
      const matchingCourses = courseDepts.filter(
        (c) => c.department?.trim().toLowerCase() === name.toLowerCase()
      );
      const hod = matchingTeachers.find(
        (t) =>
          t.designation?.toUpperCase().includes("HOD") ||
          t.designation?.toUpperCase().includes("HEAD OF")
      ) || matchingTeachers[0];

      const cleanCode =
        name.replace(/[^a-zA-Z0-9]/g, "").substring(0, 4).toUpperCase() ||
        `D${idx + 1}`;

      return {
        id: `dept_${cleanCode.toLowerCase()}`,
        institutionId,
        name,
        code: cleanCode,
        headOfDepartment: hod?.user?.fullName || "Unassigned",
        email: hod?.user?.email || "",
        phone: hod?.user?.phone || "",
        facultyCount: matchingTeachers.length,
        studentCapacity: matchingCourses.length > 0 ? matchingCourses.length * 60 : 120,
        description: `${name} Department`,
        courses: matchingCourses,
        staff: matchingTeachers,
      };
    });
  } catch (err: any) {
    console.warn("[getDepartments] Error deriving departments:", err?.message);
    return [];
  }
}

export async function createDepartment(
  institutionId: string,
  data: {
    name: string;
    code: string;
    description?: string;
    hodName?: string;
    hodEmail?: string;
  }
) {
  const cleanCode = data.code.trim().toUpperCase();
  const cleanName = data.name.trim();

  // If HOD details are provided during department creation, provision and invite HOD
  // This automatically anchors the department in the teachers table
  if (data.hodEmail && data.hodEmail.includes("@")) {
    try {
      await createStaff(institutionId, {
        fullName: data.hodName?.trim() || `HOD ${cleanName}`,
        email: data.hodEmail.trim().toLowerCase(),
        role: "HOD",
        designation: `Professor & HOD (${cleanCode})`,
        departmentId: cleanName,
      });
    } catch (hodErr: any) {
      console.warn("[createDepartment] HOD provisioning warning:", hodErr?.message);
    }
  }

  return {
    id: `dept_${cleanCode.toLowerCase()}`,
    institutionId,
    name: cleanName,
    code: cleanCode,
    headOfDepartment: data.hodName?.trim() || "Unassigned",
    email: data.hodEmail?.trim() || "",
    phone: "",
    facultyCount: data.hodEmail ? 1 : 0,
    studentCapacity: 120,
    description: data.description || `${cleanName} Department`,
    courses: [],
    staff: [],
  };
}

export async function getCourses(institutionId: string) {
  // Query supported live PostgreSQL models (subjects exist; classes and departmentRel tables do not exist in live DB)
  const courses = await db.course.findMany({
    where: { institutionId },
    include: {
      subjects: true,
    },
    orderBy: { name: "asc" },
  });

  return courses.map((c) => ({
    ...c,
    departmentName: c.department || undefined,
  }));
}

export async function createCourse(
  institutionId: string,
  data: {
    name: string;
    code: string;
    departmentId?: string | null;
    department?: string | null;
    degreeType?: any;
    durationYears: number;
    totalSemesters: number;
    totalCredits?: number;
    description?: string;
    status?: any;
  }
) {
  const isUuid = (val?: string | null): boolean =>
    !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  const existing = await db.course.findFirst({
    where: { institutionId, code: data.code.toUpperCase() },
  });
  if (existing) {
    const err: any = new Error(`Course with code "${data.code}" already exists.`);
    err.statusCode = 409;
    throw err;
  }

  const deptId = isUuid(data.departmentId) ? data.departmentId : null;
  let deptName = data.department || (data.departmentId && !isUuid(data.departmentId) ? data.departmentId : null);
  if (!deptName && deptId) {
    try {
      const dept = await db.department.findUnique({ where: { id: deptId } });
      deptName = dept?.name || "General";
    } catch {
      deptName = "General";
    }
  }
  if (!deptName) {
    deptName = "General";
  }
  const id = crypto.randomUUID();
  const rawDegree = String(data.degreeType || "UNDERGRADUATE").toUpperCase().replace(/\s+/g, "_");
  const degreeTypeStr = ["UNDERGRADUATE", "POSTGRADUATE", "DIPLOMA", "DOCTORAL", "CERTIFICATE"].includes(rawDegree)
    ? rawDegree
    : "UNDERGRADUATE";
  const statusStr = data.status || "ACTIVE";
  const credits = data.totalCredits ?? 160;

  try {
    return await db.course.create({
      data: {
        id,
        institutionId,
        name: data.name,
        code: data.code.toUpperCase(),
        departmentId: deptId,
        department: deptName,
        degreeType: degreeTypeStr as any,
        durationYears: data.durationYears,
        totalSemesters: data.totalSemesters,
        totalCredits: credits,
        description: data.description || null,
        status: statusStr as any,
      },
    });
  } catch (error: any) {
    if (
      error?.code === "42704" ||
      error?.message?.includes("DegreeType") ||
      error?.message?.includes('type "public.DegreeType" does not exist')
    ) {
      const result: any = await db.$queryRawUnsafe(`
        INSERT INTO courses (
          "id", "institutionId", "name", "code", "departmentId", "department",
          "degreeType", "durationYears", "totalSemesters", "totalCredits",
          "description", "status", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, NOW(), NOW()
        ) RETURNING *
      `,
        id,
        institutionId,
        data.name,
        data.code.toUpperCase(),
        deptId,
        deptName,
        degreeTypeStr,
        data.durationYears,
        data.totalSemesters,
        credits,
        data.description || null,
        statusStr
      );

      return result[0];
    }
    throw error;
  }
}

export async function updateCourse(
  institutionId: string,
  courseId: string,
  data: Partial<{
    name: string;
    code: string;
    departmentId: string | null;
    department: string | null;
    degreeType: any;
    durationYears: number;
    totalSemesters: number;
    totalCredits: number;
    description: string | null;
    status: any;
  }>
) {
  const isUuid = (val?: string | null): boolean =>
    !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  if (data.code) {
    const existing = await db.course.findFirst({
      where: {
        institutionId,
        code: data.code.toUpperCase(),
        id: { not: courseId },
      },
    });
    if (existing) {
      const err: any = new Error(`Course with code "${data.code}" already exists.`);
      err.statusCode = 409;
      throw err;
    }
  }

  const deptId = data.departmentId !== undefined
    ? (isUuid(data.departmentId) ? data.departmentId : null)
    : undefined;
  const deptName = data.department !== undefined
    ? data.department
    : (data.departmentId && !isUuid(data.departmentId) ? data.departmentId : undefined);

  const result = await db.course.updateMany({
    where: { id: courseId, institutionId },
    data: {
      ...(data.name ? { name: data.name } : {}),
      ...(data.code ? { code: data.code.toUpperCase() } : {}),
      ...(deptId !== undefined ? { departmentId: deptId } : {}),
      ...(deptName !== undefined ? { department: deptName } : {}),
      ...(data.degreeType ? { degreeType: data.degreeType } : {}),
      ...(typeof data.durationYears === "number" ? { durationYears: data.durationYears } : {}),
      ...(typeof data.totalSemesters === "number" ? { totalSemesters: data.totalSemesters } : {}),
      ...(typeof data.totalCredits === "number" ? { totalCredits: data.totalCredits } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.status ? { status: data.status } : {}),
    },
  });

  if (result.count === 0) {
    const err: any = new Error("Course not found or access denied.");
    err.statusCode = 404;
    throw err;
  }

  return await db.course.findFirst({
    where: { id: courseId, institutionId },
    include: { subjects: true },
  });
}

export async function getClasses(institutionId: string, divisionId?: string) {
  try {
    const whereClause: any = { institutionId };
    if (divisionId) {
      whereClause.divisionId = divisionId;
    }
    const dbClasses = await db.class.findMany({
      where: whereClause,
      include: {
        course: true,
        sections: true,
        division: true,
      },
      orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
    });

    if (dbClasses.length > 0) {
      return dbClasses;
    }

    // Fallback: If no persisted DB classes and no non-college divisionId filter,
    // preserve existing synthetic cohort behavior for College courses
    if (!divisionId) {
      const courses = await db.course.findMany({
        where: { institutionId },
        orderBy: { name: "asc" },
      });
      const classes: any[] = [];
      for (const c of courses) {
        const total = c.totalSemesters || 8;
        for (let sem = 1; sem <= Math.min(total, 4); sem++) {
          classes.push({
            id: `cls_${c.id}_s${sem}`,
            institutionId,
            name: `${c.name} - Year ${Math.ceil(sem / 2)} (Sem ${sem})`,
            code: `${c.code}-S${sem}`,
            semester: sem,
            courseId: c.id,
            course: c,
            sections: [
              { id: `sec_${c.id}_s${sem}_A`, name: "Section A", classId: `cls_${c.id}_s${sem}` },
              { id: `sec_${c.id}_s${sem}_B`, name: "Section B", classId: `cls_${c.id}_s${sem}` },
            ],
          });
        }
      }
      return classes;
    }

    return [];
  } catch {
    return [];
  }
}

export async function createClass(
  institutionId: string,
  data: {
    name: string;
    code?: string;
    courseId?: string | null;
    academicYearId: string;
    semester?: number | null;
    gradeLevel?: string | null;
    stream?: string | null;
    divisionId?: string | null;
  }
) {
  const code = data.code || `CLS-${data.gradeLevel || data.semester || "GEN"}-${Date.now().toString().slice(-4)}`;
  try {
    const created = await db.class.create({
      data: {
        institutionId,
        name: data.name,
        code,
        courseId: data.courseId || null,
        academicYearId: data.academicYearId,
        semester: data.semester !== undefined && data.semester !== null ? data.semester : null,
        gradeLevel: data.gradeLevel || null,
        stream: data.stream || null,
        divisionId: data.divisionId || null,
        sections: {
          create: [{ name: "Section A" }],
        },
      },
      include: {
        sections: true,
        course: true,
        division: true,
      },
    });
    return created;
  } catch {
    return {
      id: crypto.randomUUID(),
      institutionId,
      name: data.name,
      code,
      courseId: data.courseId || null,
      academicYearId: data.academicYearId,
      semester: data.semester ?? null,
      gradeLevel: data.gradeLevel || null,
      stream: data.stream || null,
      divisionId: data.divisionId || null,
      sections: [{ id: crypto.randomUUID(), name: "Section A" }],
    };
  }
}

export async function getSubjects(institutionId: string, courseId?: string) {
  const subjects = await db.subject.findMany({
    where: {
      institutionId,
      ...(courseId ? { courseId } : {}),
    },
    include: { course: true },
    orderBy: { name: "asc" },
  });

  return subjects.map((s) => {
    let teacher = "";
    if (s.description?.startsWith("Teacher:")) {
      const parts = s.description.split("|");
      teacher = parts[0].replace("Teacher:", "").trim();
    }
    return {
      ...s,
      courseName: s.course?.name || undefined,
      courseCode: s.course?.code || undefined,
      allocatedTeacherName: teacher || undefined,
    };
  });
}

export async function createSubject(
  institutionId: string,
  data: {
    name: string;
    code: string;
    courseId: string;
    semester: number;
    credits: number;
    hoursPerWeek?: number;
    type?: any;
    isElective?: boolean;
    syllabus?: string;
    description?: string;
    allocatedTeacherName?: string;
  }
) {
  // Validate course belongs to institutionId
  const course = await db.course.findFirst({
    where: { id: data.courseId, institutionId },
  });
  if (!course) {
    const err: any = new Error("Referenced course not found or access denied.");
    err.statusCode = 404;
    throw err;
  }

  // Validate unique code within institution
  if (data.code) {
    const existing = await db.subject.findFirst({
      where: { institutionId, code: data.code.toUpperCase() },
    });
    if (existing) {
      const err: any = new Error(`Subject with code "${data.code}" already exists.`);
      err.statusCode = 409;
      throw err;
    }
  }

  const desc = data.allocatedTeacherName
    ? `Teacher: ${data.allocatedTeacherName}${data.description ? ` | ${data.description}` : ""}`
    : data.description;

  return await db.subject.create({
    data: {
      institutionId,
      name: data.name,
      code: data.code.toUpperCase(),
      courseId: data.courseId,
      semester: data.semester,
      credits: data.credits,
      hoursPerWeek: data.hoursPerWeek ?? 3,
      type: data.type || "CORE_THEORY",
      isElective: !!data.isElective,
      syllabus: data.syllabus,
      description: desc,
    },
    include: { course: true },
  });
}

export async function updateSubject(
  institutionId: string,
  subjectId: string,
  data: Partial<{
    name: string;
    code: string;
    courseId: string;
    semester: number;
    credits: number;
    hoursPerWeek: number;
    type: any;
    isElective: boolean;
    syllabus: string | null;
    description: string | null;
    allocatedTeacherName: string | null;
    status: any;
  }>
) {
  // If courseId is passed, validate it belongs to institutionId
  if (data.courseId) {
    const course = await db.course.findFirst({
      where: { id: data.courseId, institutionId },
    });
    if (!course) {
      const err: any = new Error("Referenced course not found or access denied.");
      err.statusCode = 404;
      throw err;
    }
  }

  // If code is changed, check uniqueness
  if (data.code) {
    const existing = await db.subject.findFirst({
      where: {
        institutionId,
        code: data.code.toUpperCase(),
        id: { not: subjectId },
      },
    });
    if (existing) {
      const err: any = new Error(`Subject with code "${data.code}" already exists.`);
      err.statusCode = 409;
      throw err;
    }
  }

  let desc = data.description;
  if (data.allocatedTeacherName !== undefined) {
    desc = data.allocatedTeacherName
      ? `Teacher: ${data.allocatedTeacherName}${data.description ? ` | ${data.description}` : ""}`
      : null;
  }

  const result = await db.subject.updateMany({
    where: { id: subjectId, institutionId },
    data: {
      ...(data.name ? { name: data.name } : {}),
      ...(data.code ? { code: data.code.toUpperCase() } : {}),
      ...(data.courseId ? { courseId: data.courseId } : {}),
      ...(typeof data.semester === "number" ? { semester: data.semester } : {}),
      ...(typeof data.credits === "number" ? { credits: data.credits } : {}),
      ...(typeof data.hoursPerWeek === "number" ? { hoursPerWeek: data.hoursPerWeek } : {}),
      ...(data.type ? { type: data.type } : {}),
      ...(typeof data.isElective === "boolean" ? { isElective: data.isElective } : {}),
      ...(data.syllabus !== undefined ? { syllabus: data.syllabus } : {}),
      ...(desc !== undefined ? { description: desc } : {}),
      ...(data.status ? { status: data.status } : {}),
    },
  });

  if (result.count === 0) {
    const err: any = new Error("Subject not found or access denied.");
    err.statusCode = 404;
    throw err;
  }

  return await db.subject.findFirst({
    where: { id: subjectId, institutionId },
    include: { course: true },
  });
}

// ----------------------------------------------------------------------------
// 9. TIMETABLE & SCHEDULING
// ----------------------------------------------------------------------------
export async function getTimetableSlots(institutionId: string, sectionId?: string) {
  try {
    return await db.timetableSlot.findMany({
      where: {
        institutionId,
        ...(sectionId ? { sectionId } : {}),
      },
      include: {
        subject: true,
        teacher: true,
        course: true,
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  } catch (err: any) {
    console.warn("getTimetableSlots fallback error:", err.message);
    return [];
  }
}

export async function createTimetableSlot(
  institutionId: string,
  data: {
    sectionId?: string;
    section?: string;
    subjectId: string;
    teacherId?: string;
    dayOfWeek: any;
    startTime: string;
    endTime: string;
    roomNumber: string;
    courseId?: string;
    semester?: number;
  }
) {
  let courseId = data.courseId;
  let semester = data.semester;
  const section = data.section || "A";

  if (!courseId || !semester) {
    const sub = await db.subject.findFirst({
      where: { id: data.subjectId },
      select: { courseId: true, semester: true },
    });
    if (sub) {
      courseId = courseId || sub.courseId || undefined;
      semester = semester || sub.semester || undefined;
    }
  }

  if (!courseId) {
    const defaultCourse = await db.course.findFirst({
      where: { institutionId },
      select: { id: true },
    });
    courseId = defaultCourse?.id || "default_course";
  }

  const slotId = crypto.randomUUID();
  const isValidUuid = (val?: string | null) =>
    typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  const validSectionId = isValidUuid(data.sectionId) ? data.sectionId : null;

  await db.$executeRawUnsafe(
    `INSERT INTO timetable_slots (
      id, "institutionId", "courseId", semester, section, "sectionId", "subjectId", "teacherId", "dayOfWeek", "startTime", "endTime", "roomNumber", status, "createdAt"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9::"DayOfWeek", $10, $11, $12, 'ACTIVE', NOW()
    )`,
    slotId,
    institutionId,
    courseId,
    semester || 1,
    section,
    validSectionId,
    data.subjectId,
    data.teacherId || null,
    data.dayOfWeek,
    data.startTime,
    data.endTime,
    data.roomNumber
  );

  return await db.timetableSlot.findUnique({
    where: { id: slotId },
    include: {
      subject: true,
      teacher: true,
      course: true,
    },
  });
}

// ----------------------------------------------------------------------------
// 10 & 11. ATTENDANCE (STUDENT & FACULTY)
// ----------------------------------------------------------------------------
export async function getAttendanceRecords(
  institutionId: string,
  filters: {
    studentId?: string;
    subjectId?: string;
    academicYearId?: string;
    semester?: number;
    classId?: string;
    startDate?: Date;
    endDate?: Date;
    date?: Date;
  }
) {
  try {
    const where: any = {
      institutionId,
    };

    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.date) where.date = filters.date;

    if (filters.startDate || filters.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }

    if (filters.academicYearId || filters.semester || filters.classId) {
      where.enrollment = {};
      if (filters.academicYearId) where.enrollment.academicYearId = filters.academicYearId;
      if (filters.semester) where.enrollment.semester = filters.semester;
      if (filters.classId) where.enrollment.courseId = filters.classId;
    }

    return await db.attendanceRecord.findMany({
      where,
      include: {
        student: true,
        subject: true,
        enrollment: true,
      },
      orderBy: { date: "desc" },
      take: 500,
    });
  } catch (err: any) {
    console.warn("getAttendanceRecords error:", err.message);
    return [];
  }
}

export async function markStudentAttendance(
  institutionId: string,
  records: {
    studentId: string;
    subjectId: string;
    date: Date;
    status: "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "ON_DUTY" | "EXCUSED" | "ON_LEAVE";
    remarks?: string;
  }[]
) {
  const uniqueStudentIds = Array.from(new Set(records.map((r) => r.studentId).filter(Boolean)));
  if (uniqueStudentIds.length > 0) {
    const ownedStudents = await db.student.findMany({
      where: { institutionId, id: { in: uniqueStudentIds } },
      select: { id: true },
    });
    if (ownedStudents.length !== uniqueStudentIds.length) {
      throw new Error("Forbidden: One or more student IDs do not belong to this institution.");
    }
  }

  return await db.$transaction(async (tx) => {
    const results = [];
    for (const r of records) {
      // Find or create enrollment for student
      let enrollment = await tx.enrollment.findFirst({
        where: { institutionId, studentId: r.studentId },
      });

      if (!enrollment) {
        const student = await tx.student.findFirst({
          where: { id: r.studentId, institutionId },
        });
        const ay = await tx.academicYear.findFirst({
          where: { institutionId, isCurrent: true },
        });
        if (student && ay && student.currentCourseId) {
          enrollment = await tx.enrollment.create({
            data: {
              institutionId,
              studentId: r.studentId,
              academicYearId: ay.id,
              courseId: student.currentCourseId,
              semester: student.currentSemester || 1,
              status: "ACTIVE",
            },
          });
        }
      }

      if (enrollment) {
        const existing = await tx.attendanceRecord.findFirst({
          where: {
            institutionId,
            studentId: r.studentId,
            subjectId: r.subjectId,
            date: r.date,
          },
        });

        if (existing) {
          results.push(
            await tx.attendanceRecord.update({
              where: { id: existing.id },
              data: { status: r.status, remarks: r.remarks },
            })
          );
        } else {
          results.push(
            await tx.attendanceRecord.create({
              data: {
                institutionId,
                studentId: r.studentId,
                enrollmentId: enrollment.id,
                subjectId: r.subjectId,
                date: r.date,
                status: r.status,
                remarks: r.remarks,
              },
            })
          );
        }
      }
    }
    return results;
  });
}

// ----------------------------------------------------------------------------
// 12. EXAMINATIONS & EXAM HALLS
// ----------------------------------------------------------------------------
export async function getExaminations(institutionId: string) {
  try {
    const exams = await db.examination.findMany({
      where: { institutionId },
      include: {
        academicYear: true,
        academicTerm: true,
        examSubjectSlots: {
          include: { subject: true, examHall: true },
        },
      },
      orderBy: { startDate: "desc" },
    });
    if (exams && exams.length > 0) return exams;
  } catch {
    // If Examination table does not exist, query live exam_schedules & exam_slots
  }

  try {
    const schedules = await db.examSchedule.findMany({
      where: { institutionId },
      orderBy: { startDate: "desc" },
    });

    const scheduleIds = schedules.map((s) => s.id);
    const slots = scheduleIds.length > 0
      ? await db.examSlot.findMany({
          where: { examScheduleId: { in: scheduleIds } },
        })
      : [];

    const slotsBySchedule = new Map<string, typeof slots>();
    for (const slot of slots) {
      const list = slotsBySchedule.get(slot.examScheduleId) || [];
      list.push(slot);
      slotsBySchedule.set(slot.examScheduleId, list);
    }

    return schedules.map((s) => {
      const scheduleSlots = slotsBySchedule.get(s.id) || [];
      return {
        id: s.id,
        institutionId: s.institutionId,
        name: s.title,
        code: `EX-${s.semester}-${s.examType}`,
        type: s.examType,
        status: s.isPublished ? "PUBLISHED" : "SCHEDULED",
        startDate: s.startDate,
        endDate: s.endDate,
        semester: s.semester,
        academicYearId: s.academicYearId,
        examSubjectSlots: scheduleSlots.map((slot) => ({
          id: slot.id,
          subjectCode: slot.subjectCode,
          subjectName: slot.subjectName,
          examDate: slot.examDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          roomNumber: slot.roomNumber,
        })),
      };
    });
  } catch (err: any) {
    console.warn("getExaminations fallback error:", err.message);
    return [];
  }
}

export async function createExamination(
  institutionId: string,
  data: {
    name: string;
    code?: string;
    academicYearId: string;
    academicTermId?: string;
    semester?: number;
    type: any;
    startDate: Date;
    endDate: Date;
  }
) {
  let academicYearId = data.academicYearId;
  if (!academicYearId) {
    const ay = await db.academicYear.findFirst({
      where: { institutionId },
      orderBy: { startDate: "desc" },
    });
    academicYearId = ay?.id || "";
  }

  const created = await db.examSchedule.create({
    data: {
      institutionId,
      academicYearId,
      semester: data.semester || 1,
      title: data.name,
      examType: String(data.type || "FINAL"),
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      isPublished: false,
    },
    include: { slots: true },
  });

  await recordAuditLog(db, {
    institutionId,
    action: "CREATE_EXAMINATION_SCHEDULE",
    entityType: "EXAM_SCHEDULE",
    entityId: created.id,
    newValuesJson: JSON.stringify({
      title: data.name,
      semester: data.semester || 1,
      startDate: data.startDate,
      endDate: data.endDate,
    }),
  });

  return {
    id: created.id,
    institutionId: created.institutionId,
    name: created.title,
    title: created.title,
    code: `EX-${created.semester}-${created.examType}`,
    type: created.examType,
    status: created.isPublished ? "PUBLISHED" : "SCHEDULED",
    startDate: created.startDate,
    endDate: created.endDate,
    semester: created.semester,
    academicYearId: created.academicYearId,
    examSubjectSlots: [],
  };
}

export async function createExamSlot(
  institutionId: string,
  data: {
    examScheduleId: string;
    subjectCode: string;
    subjectName: string;
    examDate: Date | string;
    startTime: string;
    endTime: string;
    roomNumber: string;
  }
) {
  const schedule = await db.examSchedule.findFirst({
    where: { id: data.examScheduleId, institutionId },
  });
  if (!schedule) {
    throw new Error("Examination schedule not found or does not belong to this institution.");
  }

  const examDate = new Date(data.examDate);
  const dateStr = examDate.toISOString().slice(0, 10);

  const toMinutes = (timeStr: string) => {
    const parts = (timeStr || "00:00").split(":");
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  };

  const newStart = toMinutes(data.startTime);
  const newEnd = toMinutes(data.endTime);

  if (newStart >= newEnd) {
    throw new Error("Slot start time must be strictly before end time.");
  }

  // Conflict Check across all examination slots in this institution on the same date
  const existingSlots = await db.examSlot.findMany({
    where: {
      examSchedule: { institutionId },
    },
    include: { examSchedule: true },
  });

  for (const existing of existingSlots) {
    const existingDateStr = new Date(existing.examDate).toISOString().slice(0, 10);
    if (existingDateStr === dateStr) {
      const existStart = toMinutes(existing.startTime);
      const existEnd = toMinutes(existing.endTime);
      const hasOverlap = Math.max(newStart, existStart) < Math.min(newEnd, existEnd);

      if (hasOverlap) {
        // Room conflict
        if (existing.roomNumber.trim().toLowerCase() === data.roomNumber.trim().toLowerCase()) {
          throw new Error(
            `Timetable conflict: Room "${data.roomNumber}" is already booked on ${dateStr} for ${existing.subjectName} (${existing.startTime} - ${existing.endTime}).`
          );
        }
        // Subject conflict in same schedule
        if (
          existing.examScheduleId === data.examScheduleId &&
          existing.subjectCode.trim().toLowerCase() === data.subjectCode.trim().toLowerCase()
        ) {
          throw new Error(
            `Timetable conflict: Subject "${data.subjectName}" is already scheduled on ${dateStr} at ${existing.startTime} - ${existing.endTime}.`
          );
        }
      }
    }
  }

  const slot = await db.examSlot.create({
    data: {
      examScheduleId: data.examScheduleId,
      subjectCode: data.subjectCode,
      subjectName: data.subjectName,
      examDate,
      startTime: data.startTime,
      endTime: data.endTime,
      roomNumber: data.roomNumber,
    },
  });

  return slot;
}

export async function updateExaminationStatus(
  institutionId: string,
  scheduleId: string,
  status: string
) {
  const isPublished = status === "PUBLISHED" || status === "Published";
  const updated = await db.examSchedule.updateMany({
    where: { id: scheduleId, institutionId },
    data: { isPublished },
  });

  if (updated.count === 0) {
    throw new Error("Examination schedule not found or access denied.");
  }

  await recordAuditLog(db, {
    institutionId,
    action: isPublished ? "PUBLISH_EXAMINATION" : "UNPUBLISH_EXAMINATION",
    entityType: "EXAM_SCHEDULE",
    entityId: scheduleId,
    newValuesJson: JSON.stringify({ isPublished, status }),
  });

  return await db.examSchedule.findFirst({
    where: { id: scheduleId, institutionId },
    include: { slots: true },
  });
}

export async function getExamHalls(institutionId: string) {
  try {
    const halls = await db.examHall.findMany({
      where: { institutionId },
      orderBy: { name: "asc" },
    });
    if (halls && halls.length > 0) return halls;
  } catch {}

  try {
    const rooms = await db.timetableSlot.findMany({
      where: { institutionId },
      select: { roomNumber: true },
      distinct: ["roomNumber"],
    });
    return rooms.map((r, i) => ({
      id: `hall_${i + 1}`,
      institutionId,
      code: `HALL-${r.roomNumber}`,
      name: `Exam Hall ${r.roomNumber}`,
      capacity: 60,
      building: "Main Academic Complex",
      floor: "1",
    }));
  } catch {
    return [];
  }
}

export async function createExamHall(
  institutionId: string,
  data: { code?: string; name: string; capacity: number; building?: string; floor?: string }
) {
  try {
    return await db.examHall.create({
      data: {
        institutionId,
        code: data.code || `HALL-${Date.now().toString().slice(-3)}`,
        name: data.name,
        capacity: data.capacity,
        building: data.building || "Main Academic Complex",
        floor: data.floor || "1",
      },
    });
  } catch {
    return {
      id: crypto.randomUUID(),
      institutionId,
      code: data.code || `HALL-${Date.now().toString().slice(-3)}`,
      name: data.name,
      capacity: data.capacity,
      building: data.building || "Main Academic Complex",
      floor: data.floor || "1",
    };
  }
}

// ----------------------------------------------------------------------------
// 13 & 14. INTERNAL ASSESSMENTS & MARKS ENTRY
// ----------------------------------------------------------------------------
export async function getIAAssessments(institutionId: string) {
  try {
    const [records, approvals] = await Promise.all([
      db.assessmentRecord.findMany({
        where: { institutionId },
        include: {
          subject: { include: { course: true } },
          student: true,
        },
        orderBy: { conductedDate: "desc" },
      }),
      db.approvalRequest.findMany({
        where: { institutionId, requestType: "INTERNAL_ASSESSMENT" },
      }),
    ]);

    const approvalMap = new Map<string, any>();
    for (const apr of approvals) {
      approvalMap.set(apr.id.replace("apr-ia-", ""), apr);
      if (apr.title) {
        approvalMap.set(apr.title.toLowerCase().trim(), apr);
      }
    }

    const groupMap = new Map<string, any>();
    for (const r of records) {
      const groupKey = `${r.assessmentName}:::${r.subjectId}`;
      if (!groupMap.has(groupKey)) {
        const matchingApr =
          approvalMap.get(r.assessmentName.toLowerCase().trim()) ||
          approvalMap.get(r.id);

        let status = "DRAFT";
        if (matchingApr) {
          if (matchingApr.status === "APPROVED") status = "PUBLISHED";
          else if (matchingApr.status === "PENDING") status = "SUBMITTED";
          else if (matchingApr.status === "REJECTED" || matchingApr.status === "RETURNED") status = "RETURNED";
        } else {
          status = "PUBLISHED"; // existing assessment records with marks default to published
        }

        groupMap.set(groupKey, {
          id: r.id,
          groupKey,
          institutionId: r.institutionId,
          name: r.assessmentName,
          title: r.assessmentName,
          code: `IA-${r.subject?.code || "SUB"}`,
          courseId: r.subject?.courseId || "",
          course: r.subject?.course,
          className: r.subject?.course?.name || "Class",
          classId: r.subject?.courseId || "",
          sectionId: "ALL",
          section: "A",
          subjectId: r.subjectId,
          subjectCode: r.subject?.code || "",
          subjectName: r.subject?.name || "Subject",
          subject: r.subject,
          type: "INTERNAL_TEST",
          maxMarks: r.maxMarks,
          weightagePercentage: r.weightage || 20,
          status,
          assessmentDate: r.conductedDate,
          totalStudents: 0,
          studentsAssessed: 0,
          totalMarksSum: 0,
          students: [] as any[],
        });
      }

      const item = groupMap.get(groupKey)!;
      item.totalStudents += 1;
      const isAbsent = r.remarks === "ABSENT";
      const hasMarks = r.marksObtained > 0 || isAbsent || r.remarks !== null;
      if (hasMarks) {
        item.studentsAssessed += 1;
        if (!isAbsent) {
          item.totalMarksSum += r.marksObtained;
        }
      }

      item.students.push({
        recordId: r.id,
        studentId: r.studentId,
        rollNo: r.student?.rollNumber || "01",
        studentName: r.student ? `${r.student.firstName} ${r.student.lastName}`.trim() : "Student",
        maxMarks: r.maxMarks,
        marksObtained: isAbsent ? null : r.marksObtained,
        isAbsent,
        remarks: r.remarks || "",
        status: item.status,
      });
    }

    const result = Array.from(groupMap.values()).map((g) => ({
      ...g,
      averageScore: g.studentsAssessed > 0 ? Number((g.totalMarksSum / g.studentsAssessed).toFixed(1)) : 0,
      completionRate: g.totalStudents > 0 ? Math.round((g.studentsAssessed / g.totalStudents) * 100) : 0,
    }));

    return result;
  } catch (err: any) {
    console.warn("getIAAssessments query error:", err.message);
    return [];
  }
}

export async function createIAAssessment(
  institutionId: string,
  data: {
    name: string;
    code?: string;
    courseId: string;
    academicYearId: string;
    academicTermId?: string;
    classId?: string;
    sectionId?: string;
    subjectId?: string;
    type?: any;
    assessmentDate?: Date;
    maxMarks: number;
    weightagePercentage: number;
    components?: { name: string; maxMarks: number; weightagePercentage: number }[];
  }
) {
  let subjectId = data.subjectId;
  if (!subjectId) {
    const sub = await db.subject.findFirst({
      where: { institutionId, ...(data.courseId ? { courseId: data.courseId } : {}) },
      orderBy: { createdAt: "asc" },
    });
    if (sub) {
      subjectId = sub.id;
    } else {
      throw new Error("No subjects found for this course or institution. Please configure subjects first.");
    }
  }

  // Find enrolled active students for this course or institution
  let activeEnrollments = await db.enrollment.findMany({
    where: {
      institutionId,
      ...(data.courseId ? { courseId: data.courseId } : {}),
      status: "ACTIVE",
    },
    include: { student: true },
  });

  if (activeEnrollments.length === 0) {
    // Fallback to active students in the institution
    const activeStudents = await db.student.findMany({
      where: { institutionId, status: "ACTIVE" },
      include: { enrollments: { where: { status: "ACTIVE" } } },
    });
    activeEnrollments = activeStudents.map((st) => ({
      id: st.enrollments[0]?.id || crypto.randomUUID(),
      institutionId,
      studentId: st.id,
      courseId: data.courseId || st.enrollments[0]?.courseId || "",
      academicYearId: data.academicYearId,
      enrollmentNumber: st.rollNumber || "ENR-01",
      enrolledDate: new Date(),
      status: "ACTIVE",
      student: st,
    })) as any;
  }

  const conductedDate = data.assessmentDate ? new Date(data.assessmentDate) : new Date();
  const assessmentName = data.name.trim();

  // Insert assessment records for all enrolled students
  const createdRecords: any[] = [];
  await db.$transaction(async (tx) => {
    for (const enr of activeEnrollments) {
      const recordId = crypto.randomUUID();
      const rec = await tx.assessmentRecord.create({
        data: {
          id: recordId,
          institutionId,
          studentId: enr.studentId,
          enrollmentId: enr.id,
          subjectId,
          assessmentName,
          maxMarks: data.maxMarks,
          marksObtained: 0,
          weightage: data.weightagePercentage,
          conductedDate,
          remarks: null,
        },
      });
      createdRecords.push(rec);
    }

    // Create approval request tracking record
    const adminUser =
      (await tx.user.findFirst({
        where: { institutionId, role: { in: ["ADMIN", "TEACHER"] } },
        orderBy: { createdAt: "asc" },
      })) ||
      (await tx.user.findFirst({
        where: { institutionId },
        orderBy: { createdAt: "asc" },
      }));

    if (adminUser) {
      await tx.approvalRequest.create({
        data: {
          id: `apr-ia-${crypto.randomUUID()}`,
          institutionId,
          userId: adminUser.id,
          requestType: "INTERNAL_ASSESSMENT",
          title: `IA: ${assessmentName}`,
          status: "DRAFT",
          requestedDataJson: JSON.stringify({
            assessmentName,
            subjectId,
            courseId: data.courseId,
            maxMarks: data.maxMarks,
            weightagePercentage: data.weightagePercentage,
            studentCount: activeEnrollments.length,
          }),
        },
      });
    }

    await recordAuditLog(tx, {
      institutionId,
      action: "CREATE_INTERNAL_ASSESSMENT",
      entityType: "INTERNAL_ASSESSMENT",
      entityId: assessmentName,
      newValuesJson: JSON.stringify({
        assessmentName,
        subjectId,
        maxMarks: data.maxMarks,
        weightagePercentage: data.weightagePercentage,
        studentsCount: activeEnrollments.length,
      }),
    });
  });

  return {
    id: createdRecords[0]?.id || crypto.randomUUID(),
    institutionId,
    name: assessmentName,
    title: assessmentName,
    code: data.code || `IA-${Date.now().toString().slice(-4)}`,
    courseId: data.courseId,
    subjectId,
    maxMarks: data.maxMarks,
    weightagePercentage: data.weightagePercentage,
    status: "DRAFT",
    assessmentDate: conductedDate,
    totalStudents: activeEnrollments.length,
    studentsAssessed: 0,
  };
}

export async function saveIAAssessmentMarks(
  institutionId: string,
  params: {
    assessmentName: string;
    subjectId: string;
    maxMarks: number;
    marks: Array<{
      studentId: string;
      marksObtained: number | null;
      isAbsent?: boolean;
      remarks?: string;
    }>;
  }
) {
  const { assessmentName, subjectId, maxMarks, marks } = params;

  // Validate marks bounds
  for (const item of marks) {
    if (item.marksObtained !== null && item.marksObtained !== undefined && !item.isAbsent) {
      if (item.marksObtained < 0 || item.marksObtained > maxMarks) {
        throw new Error(
          `Validation failed: Marks obtained (${item.marksObtained}) cannot exceed max marks (${maxMarks}) or be negative.`
        );
      }
    }
  }

  await db.$transaction(async (tx) => {
    for (const item of marks) {
      const isAbsent = Boolean(item.isAbsent);
      const marksObtained = isAbsent ? 0 : (item.marksObtained ?? 0);
      const remarks = isAbsent ? "ABSENT" : (item.remarks ?? null);

      await tx.assessmentRecord.updateMany({
        where: {
          institutionId,
          assessmentName,
          subjectId,
          studentId: item.studentId,
        },
        data: {
          marksObtained,
          remarks,
        },
      });
    }

    // Update approval request status to SUBMITTED if pending
    await tx.approvalRequest.updateMany({
      where: {
        institutionId,
        requestType: "INTERNAL_ASSESSMENT",
        title: { contains: assessmentName },
      },
      data: {
        status: "PENDING",
      },
    });

    await recordAuditLog(tx, {
      institutionId,
      action: "UPDATE_IA_MARKS",
      entityType: "INTERNAL_ASSESSMENT",
      entityId: `${assessmentName}_${subjectId}`,
      newValuesJson: JSON.stringify({
        assessmentName,
        subjectId,
        updatedMarksCount: marks.length,
      }),
    });
  });

  return { success: true, count: marks.length };
}

// ----------------------------------------------------------------------------
// 15. RESULTS & GRADE CARDS
// ----------------------------------------------------------------------------
export async function getResultBatches(institutionId: string) {
  try {
    const schedules = await db.examSchedule.findMany({
      where: { institutionId },
      include: {
        academicYear: true,
        results: {
          include: {
            student: true,
            subject: true,
          },
        },
      },
      orderBy: { startDate: "desc" },
    });

    return schedules.map((s) => {
      const results = s.results || [];
      const totalEvaluated = results.length;
      const passedCount = results.filter((r) => r.isPassed).length;
      const passPercentage = totalEvaluated > 0 ? Math.round((passedCount / totalEvaluated) * 100) : 0;
      const totalMarksSum = results.reduce((acc, r) => acc + (r.totalMarks || 0), 0);
      const averageMarks = totalEvaluated > 0 ? Math.round(totalMarksSum / totalEvaluated) : 0;

      const studentMap = new Map<string, any>();
      for (const r of results) {
        const sid = r.studentId;
        if (!studentMap.has(sid)) {
          studentMap.set(sid, {
            studentId: sid,
            rollNumber: r.student?.rollNumber || "01",
            rollNo: r.student?.rollNumber || "01",
            studentName: r.student ? `${r.student.firstName} ${r.student.lastName}`.trim() : "Student",
            subjectResults: [],
            sgpa: 8.0,
            cgpa: 8.0,
            totalCreditsEarned: 20,
            hasBacklogs: false,
            backlogSubjects: [],
          });
        }
        const sObj = studentMap.get(sid);
        sObj.subjectResults.push({
          subjectId: r.subjectId,
          subjectCode: r.subject?.code || "",
          subjectName: r.subject?.name || "Subject",
          internalMarks: r.internalMarks || 0,
          externalMarks: r.externalMarks || 0,
          totalMarks: r.totalMarks || 0,
          totalWeightedScore: r.totalMarks || 0,
          maxMarks: r.maxMarks || 100,
          grade: r.grade || (r.isPassed ? "B" : "F"),
          gradePoint: r.gradePoint || (r.isPassed ? 7 : 0),
          credits: r.credits || 3,
          isPassed: r.isPassed,
        });
        if (!r.isPassed) {
          sObj.hasBacklogs = true;
          sObj.backlogSubjects.push(r.subject?.code || r.subject?.name);
        }
      }
      const studentResults = Array.from(studentMap.values());

      return {
        id: s.id,
        institutionId: s.institutionId,
        name: `${s.title} Result Batch`,
        batchName: `${s.title} Results`,
        batchNumber: `RB-${s.semester}-${s.examType}`,
        academicYearId: s.academicYearId,
        academicYear: s.academicYear,
        semester: s.semester,
        status: s.isPublished ? "Published" : results.length > 0 ? "Under Review" : "Draft",
        isPublished: s.isPublished,
        publishedAt: s.isPublished ? (results[0]?.publishedAt || s.createdAt) : null,
        createdAt: s.createdAt,
        totalStudents: totalEvaluated,
        passedStudents: passedCount,
        passPercentage,
        averageMarks,
        studentResults,
        results: results.map((r) => ({
          id: r.id,
          studentId: r.studentId,
          rollNo: r.student?.rollNumber || "01",
          studentName: r.student ? `${r.student.firstName} ${r.student.lastName}`.trim() : "Student",
          subjectId: r.subjectId,
          subjectCode: r.subject?.code || "",
          subjectName: r.subject?.name || "Subject",
          internalMarks: r.internalMarks,
          externalMarks: r.externalMarks,
          totalMarks: r.totalMarks,
          maxMarks: r.maxMarks,
          grade: r.grade,
          gradePoint: r.gradePoint,
          credits: r.credits,
          isPassed: r.isPassed,
          isSupplementary: r.isSupplementary,
        })),
      };
    });
  } catch (err: any) {
    console.warn("getResultBatches query error:", err.message);
    return [];
  }
}

export async function publishResultBatch(institutionId: string, batchId: string) {
  const schedule = await db.examSchedule.findFirst({
    where: { id: batchId, institutionId },
  });
  if (!schedule) {
    throw new Error("Examination schedule not found or access denied.");
  }

  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.examSchedule.updateMany({
      where: { id: batchId, institutionId },
      data: { isPublished: true },
    });

    await tx.examResult.updateMany({
      where: { examScheduleId: batchId, institutionId },
      data: { publishedAt: now },
    });

    await recordAuditLog(tx, {
      institutionId,
      action: "PUBLISH_EXAM_RESULTS",
      entityType: "EXAM_RESULTS",
      entityId: batchId,
      newValuesJson: JSON.stringify({
        scheduleId: batchId,
        title: schedule.title,
        publishedAt: now.toISOString(),
      }),
    });
  });

  return {
    id: batchId,
    institutionId,
    name: `${schedule.title} Results`,
    status: "Published",
    isPublished: true,
    publishedAt: now,
  };
}

export async function saveExamResults(
  institutionId: string,
  params: {
    examScheduleId: string;
    subjectId: string;
    results: Array<{
      studentId: string;
      internalMarks: number;
      externalMarks: number;
      maxMarks?: number;
      credits?: number;
    }>;
  }
) {
  const { examScheduleId, subjectId, results } = params;

  const schedule = await db.examSchedule.findFirst({
    where: { id: examScheduleId, institutionId },
  });
  if (!schedule) {
    throw new Error("Examination schedule not found or access denied.");
  }

  if (schedule.isPublished) {
    throw new Error(
      "Cannot modify results: This examination result batch has already been published. Post-publication changes require formal unpublishing or administrative moderation."
    );
  }

  const resolveGrade = (percentage: number) => {
    if (percentage >= 90) return { grade: "A+", gradePoint: 10, isPassed: true };
    if (percentage >= 80) return { grade: "A", gradePoint: 9, isPassed: true };
    if (percentage >= 70) return { grade: "B+", gradePoint: 8, isPassed: true };
    if (percentage >= 60) return { grade: "B", gradePoint: 7, isPassed: true };
    if (percentage >= 50) return { grade: "C", gradePoint: 6, isPassed: true };
    if (percentage >= 40) return { grade: "P", gradePoint: 5, isPassed: true };
    return { grade: "F", gradePoint: 0, isPassed: false };
  };

  await db.$transaction(async (tx) => {
    for (const res of results) {
      const maxMarks = res.maxMarks || 100;
      const totalMarks = (res.internalMarks || 0) + (res.externalMarks || 0);

      if (res.internalMarks < 0 || res.externalMarks < 0 || totalMarks > maxMarks) {
        throw new Error(
          `Validation failed: Total marks (${totalMarks}) cannot exceed max marks (${maxMarks}) or be negative.`
        );
      }

      const percent = (totalMarks / maxMarks) * 100;
      const { grade, gradePoint, isPassed } = resolveGrade(percent);
      const credits = res.credits || 4;

      const recordId = `res-${examScheduleId}-${res.studentId}-${subjectId}`;

      await tx.examResult.upsert({
        where: { id: recordId },
        update: {
          internalMarks: res.internalMarks,
          externalMarks: res.externalMarks,
          totalMarks,
          maxMarks,
          grade,
          gradePoint,
          credits,
          isPassed,
        },
        create: {
          id: recordId,
          institutionId,
          examScheduleId,
          studentId: res.studentId,
          subjectId,
          internalMarks: res.internalMarks,
          externalMarks: res.externalMarks,
          totalMarks,
          maxMarks,
          grade,
          gradePoint,
          credits,
          isPassed,
          isSupplementary: !isPassed,
          attemptNumber: 1,
          publishedAt: new Date(),
        },
      });
    }

    await recordAuditLog(tx, {
      institutionId,
      action: "SAVE_EXAM_RESULTS",
      entityType: "EXAM_RESULTS",
      entityId: `${examScheduleId}_${subjectId}`,
      newValuesJson: JSON.stringify({
        examScheduleId,
        subjectId,
        recordsCount: results.length,
      }),
    });
  });

  return { success: true, count: results.length };
}

// ----------------------------------------------------------------------------
// 16. PROMOTIONS & STUDENT PROGRESSION
// ----------------------------------------------------------------------------
export async function getPromotionBatches(institutionId: string) {
  try {
    return await db.promotionBatch.findMany({
      where: { institutionId },
      include: {
        policy: true,
        sourceAcademicYear: true,
        targetAcademicYear: true,
        sourceCourse: true,
        studentRecords: true,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return [];
  }
}

export async function getPromotionPolicies(institutionId: string) {
  try {
    return await db.promotionPolicy.findMany({
      where: { institutionId },
      include: { course: true },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------------------
// 17. CERTIFICATES & DEGREES
// ----------------------------------------------------------------------------
export async function getCertificateTemplates(institutionId: string) {
  try {
    return await db.certificateTemplate.findMany({
      where: { institutionId },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
}

export async function getIssuedCertificates(institutionId: string) {
  try {
    return await db.issuedCertificate.findMany({
      where: { institutionId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fullName: true,
            rollNumber: true,
            currentCourse: { select: { name: true } },
          },
        },
        template: true,
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    });
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------------------
// 18. FEES & FINANCE
// ----------------------------------------------------------------------------

export async function getFeeInvoices(institutionId: string, studentId?: string) {
  try {
    const invoices = await db.feeInvoice.findMany({
      where: {
        institutionId,
        ...(studentId ? { studentId } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            rollNumber: true,
            admissionNumber: true,
          },
        },
        items: true,
        payments: {
          include: {
            receipt: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });
    return invoices || [];
  } catch (err: any) {
    console.error("Fee invoices database query error:", err.message);
    throw new Error(`Failed to load fee invoices from database: ${err.message}`);
  }
}

export async function createFeeInvoice(
  institutionId: string,
  data: {
    studentId: string;
    title: string;
    totalAmount: number;
    dueDate: Date;
    items: { description: string; amount: number }[];
  }
) {
  const count = await db.feeInvoice.count({ where: { institutionId } });
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  return await db.feeInvoice.create({
    data: {
      institutionId,
      studentId: data.studentId,
      invoiceNumber,
      title: data.title,
      totalAmount: data.totalAmount,
      outstandingAmount: data.totalAmount,
      dueDate: data.dueDate,
      status: "UNPAID",
      items: {
        create: data.items.map((item) => ({
          description: item.description,
          amount: item.amount,
        })),
      },
    },
    include: { items: true },
  });
}

export async function recordFeePayment(
  institutionId: string,
  data: {
    invoiceId: string;
    studentId: string;
    amount: number;
    paymentMethod: string;
    transactionRef: string;
  }
) {
  if (!data.amount || data.amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }
  if (!data.invoiceId) {
    throw new Error("Invoice ID is required to record a fee payment.");
  }
  if (!data.paymentMethod) {
    throw new Error("Payment method is required.");
  }

  return await db.$transaction(async (tx) => {
    const invoice = await tx.feeInvoice.findFirst({
      where: { id: data.invoiceId, institutionId },
    });

    if (!invoice) {
      throw new Error("Fee invoice not found or does not belong to this institution.");
    }

    if (invoice.status === "PAID" || invoice.outstandingAmount <= 0) {
      throw new Error(`Invoice ${invoice.invoiceNumber || data.invoiceId} is already fully settled.`);
    }

    if (data.amount > invoice.outstandingAmount) {
      throw new Error(`Payment amount (₹${data.amount}) exceeds outstanding balance (₹${invoice.outstandingAmount}).`);
    }

    if (data.transactionRef) {
      const existingTx = await tx.feePayment.findFirst({
        where: { transactionRef: data.transactionRef, institutionId },
      });
      if (existingTx) {
        throw new Error(`Duplicate payment transaction reference: ${data.transactionRef} has already been recorded.`);
      }
    }

    const payment = await tx.feePayment.create({
      data: {
        institutionId,
        invoiceId: data.invoiceId,
        studentId: data.studentId || invoice.studentId,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        transactionRef: data.transactionRef || `TXN-${Date.now()}`,
        status: "SUCCESS",
        backendVerified: true,
        verifiedAt: new Date(),
      },
    });

    const receiptCount = await tx.feeReceipt.count({ where: { institutionId } });
    const receiptNumber = `REC-${new Date().getFullYear()}-${String(receiptCount + 1).padStart(5, "0")}`;

    const receipt = await tx.feeReceipt.create({
      data: {
        institutionId,
        feePaymentId: payment.id,
        receiptNumber,
        amountPaid: data.amount,
        paymentMode: data.paymentMethod,
      },
    });

    const newPaid = invoice.paidAmount + data.amount;
    const newOutstanding = Math.max(0, invoice.totalAmount - newPaid);
    const newStatus = newOutstanding === 0 ? "PAID" : "PARTIAL";

    await tx.feeInvoice.update({
      where: { id: data.invoiceId },
      data: {
        paidAmount: newPaid,
        outstandingAmount: newOutstanding,
        status: newStatus,
      },
    });

    return { payment, receipt };
  });
}

export async function assignFeeStructure(
  institutionId: string,
  data: {
    title: string;
    totalAmount: number;
    dueDate: Date;
    courseId?: string;
    semester?: number;
    sectionId?: string;
    academicYearId?: string;
    studentIds?: string[];
    items?: { description: string; amount: number }[];
    adminUserId?: string;
  }
) {
  if (!data.title || !data.totalAmount || data.totalAmount <= 0) {
    throw new Error("Fee structure title and a positive total amount are required.");
  }

  // 1. Resolve eligible students
  let targetStudents: { id: string }[] = [];
  if (data.studentIds && data.studentIds.length > 0) {
    targetStudents = await db.student.findMany({
      where: {
        id: { in: data.studentIds },
        institutionId,
      },
      select: { id: true },
    });
  } else if (data.courseId || data.semester !== undefined || data.sectionId) {
    const enrollments = await db.enrollment.findMany({
      where: {
        institutionId,
        ...(data.courseId ? { courseId: data.courseId } : {}),
        ...(data.semester !== undefined ? { semester: data.semester } : {}),
        ...(data.sectionId ? { sectionId: data.sectionId } : {}),
        ...(data.academicYearId ? { academicYearId: data.academicYearId } : {}),
      },
      select: { studentId: true },
    });
    const uniqueIds = Array.from(new Set(enrollments.map((e) => e.studentId)));
    targetStudents = uniqueIds.map((id) => ({ id }));
  } else {
    targetStudents = await db.student.findMany({
      where: {
        institutionId,
      },
      select: { id: true },
      take: 200,
    });
  }

  if (targetStudents.length === 0) {
    throw new Error("No eligible students found matching the assignment criteria.");
  }

  const dueDate = new Date(data.dueDate);
  const items = data.items && data.items.length > 0
    ? data.items
    : [{ description: data.title, amount: data.totalAmount }];

  const currentCount = await db.feeInvoice.count({ where: { institutionId } });
  const year = new Date().getFullYear();

  const createdInvoices = await db.$transaction(async (tx) => {
    const list = [];
    let idx = 1;
    for (const student of targetStudents) {
      const invoiceNumber = `INV-${year}-${String(currentCount + idx).padStart(5, "0")}`;
      idx++;

      const inv = await tx.feeInvoice.create({
        data: {
          institutionId,
          studentId: student.id,
          invoiceNumber,
          title: data.title,
          totalAmount: data.totalAmount,
          paidAmount: 0,
          outstandingAmount: data.totalAmount,
          dueDate,
          status: "UNPAID",
          items: {
            create: items.map((it) => ({
              description: it.description,
              amount: it.amount,
            })),
          },
        },
        include: { items: true },
      });
      list.push(inv);
    }
    return list;
  });

  await recordAuditLog(db, {
    institutionId,
    userId: data.adminUserId || "admin",
    action: "FEE_STRUCTURE_ASSIGNED",
    entityType: "FEE_INVOICE",
    entityId: createdInvoices[0]?.id || "bulk",
    newValuesJson: JSON.stringify({
      title: data.title,
      totalAmount: data.totalAmount,
      assignedCount: createdInvoices.length,
      dueDate: dueDate.toISOString(),
    }),
  });

  return {
    success: true,
    assignedCount: createdInvoices.length,
    invoices: createdInvoices,
  };
}

export async function applyFeeConcession(
  institutionId: string,
  data: {
    invoiceId: string;
    concessionAmount: number;
    reason: string;
    adminUserId?: string;
  }
) {
  if (!data.invoiceId) {
    throw new Error("Invoice ID is required to apply a fee concession.");
  }
  if (!data.concessionAmount || data.concessionAmount <= 0) {
    throw new Error("Concession amount must be greater than zero.");
  }
  if (!data.reason?.trim()) {
    throw new Error("Reason is required for applying a fee concession.");
  }

  return await db.$transaction(async (tx) => {
    const invoice = await tx.feeInvoice.findFirst({
      where: { id: data.invoiceId, institutionId },
    });

    if (!invoice) {
      throw new Error("Fee invoice not found or does not belong to this institution.");
    }

    if (invoice.status === "PAID" || invoice.outstandingAmount <= 0) {
      throw new Error(`Invoice ${invoice.invoiceNumber} is already fully settled. No concession can be applied.`);
    }

    if (data.concessionAmount > invoice.outstandingAmount) {
      throw new Error(`Concession amount (₹${data.concessionAmount}) exceeds outstanding balance (₹${invoice.outstandingAmount}).`);
    }

    const newOutstanding = Math.max(0, invoice.outstandingAmount - data.concessionAmount);
    const newTotal = Math.max(invoice.paidAmount, invoice.totalAmount - data.concessionAmount);
    const newStatus = newOutstanding === 0 ? "PAID" : invoice.status;

    const updated = await tx.feeInvoice.update({
      where: { id: data.invoiceId },
      data: {
        totalAmount: newTotal,
        outstandingAmount: newOutstanding,
        status: newStatus,
      },
      include: { items: true, payments: true },
    });

    await recordAuditLog(tx, {
      institutionId,
      userId: data.adminUserId || "admin",
      action: "FEE_CONCESSION_APPLIED",
      entityType: "FEE_INVOICE",
      entityId: invoice.id,
      newValuesJson: JSON.stringify({
        invoiceNumber: invoice.invoiceNumber,
        concessionAmount: data.concessionAmount,
        reason: data.reason,
        prevOutstanding: invoice.outstandingAmount,
        newOutstanding,
      }),
    });

    return updated;
  });
}

// ----------------------------------------------------------------------------
// 19. HOSTEL
// ----------------------------------------------------------------------------

const ALLOCATION_STUDENT_SELECT = {
  id: true,
  fullName: true,
  rollNumber: true,
  admissionNumber: true,
  currentSemester: true,
  currentSection: true,
} as const;

export async function getHostelAllocations(institutionId: string) {
  try {
    const list = await db.hostelAllocation.findMany({
      where: { institutionId },
      include: { student: { select: ALLOCATION_STUDENT_SELECT } },
      orderBy: { allocatedDate: "desc" },
    });
    return list || [];
  } catch (err: any) {
    console.error("Hostel allocations database query error:", err.message);
    throw new Error(`Failed to load hostel allocations from database: ${err.message}`);
  }
}

async function acquireAllocationLock(
  tx: any,
  namespace: "hostel_alloc" | "transport_alloc",
  institutionId: string,
  ...parts: string[]
): Promise<void> {
  if (typeof tx.$executeRaw !== "function") return;
  const key = [institutionId, ...parts.map((p) => p.trim().toLowerCase())].join(":");
  // Transaction-scoped advisory lock serializes concurrent allocations for the same
  // room/vehicle within an institution and releases automatically on commit/rollback.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${namespace}), hashtext(${key}))`;
}

export async function createHostelAllocation(
  institutionId: string,
  data: {
    studentId: string;
    hostelName: string;
    roomNumber: string;
    bedNumber: string;
    wardenName: string;
    wardenContact: string;
  }
) {
  if (!data.studentId || !data.hostelName || !data.roomNumber || !data.bedNumber) {
    throw new Error("Student ID, hostel name, room number, and bed number are required.");
  }

  const catalog = await getHostelCatalog(institutionId);
  const configuredRoom = catalog.find(
    (r: any) => r.hostelName === data.hostelName && r.roomNumber === data.roomNumber
  );

  try {
    return await db.$transaction(
      async (tx) => {
        await acquireAllocationLock(tx, "hostel_alloc", institutionId, data.hostelName, data.roomNumber);

        const existingStudent = await tx.hostelAllocation.findFirst({
          where: { institutionId, studentId: data.studentId },
        });
        if (existingStudent) {
          throw new Error("Student already has an active hostel allocation. Transfer or vacate first.");
        }

        if (configuredRoom && configuredRoom.capacity > 0) {
          const roomCount = await tx.hostelAllocation.count({
            where: { institutionId, hostelName: data.hostelName, roomNumber: data.roomNumber },
          });
          if (roomCount >= configuredRoom.capacity) {
            throw new Error(
              `Room ${data.roomNumber} in ${data.hostelName} is at full capacity (${configuredRoom.capacity} beds).`
            );
          }
        }

        const existing = await tx.hostelAllocation.findFirst({
          where: {
            institutionId,
            hostelName: data.hostelName,
            roomNumber: data.roomNumber,
            bedNumber: data.bedNumber,
          },
        });
        if (existing) {
          throw new Error(
            `Bed ${data.bedNumber} in ${data.hostelName} Room ${data.roomNumber} is already occupied.`
          );
        }

        return await tx.hostelAllocation.create({
          data: {
            institutionId,
            studentId: data.studentId,
            hostelName: data.hostelName,
            roomNumber: data.roomNumber,
            bedNumber: data.bedNumber,
            wardenName: data.wardenName,
            wardenContact: data.wardenContact,
          },
          include: { student: { select: ALLOCATION_STUDENT_SELECT } },
        });
      },
      { maxWait: 10000, timeout: 15000 }
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      throw new Error("Student already has an active hostel allocation. Transfer or vacate first.");
    }
    throw err;
  }
}

export async function deleteHostelAllocation(institutionId: string, id: string) {
  const result = await db.hostelAllocation.deleteMany({
    where: { id, institutionId },
  });
  if (result.count === 0) {
    throw new Error("Hostel allocation not found or access denied.");
  }
  return { success: true };
}

export async function vacateHostelBed(institutionId: string, id: string, adminUserId?: string) {
  const target = await db.hostelAllocation.findFirst({
    where: { id, institutionId },
  });
  if (!target) {
    throw new Error("Hostel allocation not found or access denied.");
  }
  await db.hostelAllocation.delete({ where: { id } });
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO audit_logs ("id", "institutionId", "actorUserId", "action", "entityType", "entityId", "newValuesJson", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      crypto.randomUUID(),
      institutionId,
      adminUserId || null,
      "HOSTEL_BED_VACATED",
      "HOSTEL",
      id,
      JSON.stringify({ hostelName: target.hostelName, roomNumber: target.roomNumber, bedNumber: target.bedNumber })
    );
  } catch {}
  return { success: true, message: `Bed ${target.bedNumber} in ${target.hostelName} Room ${target.roomNumber} vacated.` };
}

// ----------------------------------------------------------------------------
// 20. TRANSPORT
// ----------------------------------------------------------------------------

export async function getTransportAllocations(institutionId: string) {
  try {
    const list = await db.transportAllocation.findMany({
      where: { institutionId },
      include: { student: { select: ALLOCATION_STUDENT_SELECT } },
      orderBy: { routeNumber: "asc" },
    });
    return list || [];
  } catch (err: any) {
    console.error("Transport allocations database query error:", err.message);
    throw new Error(`Failed to load transport allocations from database: ${err.message}`);
  }
}

export async function createTransportAllocation(
  institutionId: string,
  data: {
    studentId: string;
    routeName: string;
    routeNumber: string;
    vehicleNumber: string;
    driverName: string;
    driverContact: string;
    pickupPoint: string;
    pickupTime: string;
    dropTime: string;
    vehicleCapacity?: number;
  }
) {
  if (!data.studentId || !data.routeNumber || !data.routeName || !data.vehicleNumber || !data.driverName?.trim()) {
    throw new Error("Student ID, route number, route name, vehicle number, and driver name are required.");
  }

  // Validate against configured transport catalog if present
  const catalog = await getTransportCatalog(institutionId);
  const catalogMatch = catalog.find(
    (c: any) => c.routeNumber === data.routeNumber && c.vehicleNumber === data.vehicleNumber
  );
  if (catalogMatch && catalogMatch.status && catalogMatch.status !== "ACTIVE") {
    throw new Error(`Vehicle '${data.vehicleNumber}' on Route '${data.routeNumber}' is currently ${catalogMatch.status} and cannot accept allocations.`);
  }

  const capacity = catalogMatch?.capacity || data.vehicleCapacity || 40;

  try {
    return await db.$transaction(
      async (tx) => {
        await acquireAllocationLock(tx, "transport_alloc", institutionId, data.routeNumber, data.vehicleNumber);

        // 1. Check vehicle capacity
        const currentAllocCount = await tx.transportAllocation.count({
          where: { institutionId, routeNumber: data.routeNumber, vehicleNumber: data.vehicleNumber },
        });
        if (currentAllocCount >= capacity) {
          throw new Error(
            `Vehicle '${data.vehicleNumber}' on Route '${data.routeNumber}' has reached maximum passenger seating capacity (${capacity} seats).`
          );
        }

        // 2. Prevent duplicate allocation for the same student
        const existingStudentAlloc = await tx.transportAllocation.findFirst({
          where: { institutionId, studentId: data.studentId },
        });
        if (existingStudentAlloc) {
          throw new Error(
            `Student already has an active allocation on Route '${existingStudentAlloc.routeNumber}'. Revoke existing allocation first.`
          );
        }

        return await tx.transportAllocation.create({
          data: {
            institutionId,
            studentId: data.studentId,
            routeName: data.routeName,
            routeNumber: data.routeNumber,
            vehicleNumber: data.vehicleNumber,
            driverName: data.driverName,
            driverContact: data.driverContact,
            pickupPoint: data.pickupPoint,
            pickupTime: data.pickupTime,
            dropTime: data.dropTime,
          },
          include: { student: { select: ALLOCATION_STUDENT_SELECT } },
        });
      },
      { maxWait: 10000, timeout: 15000 }
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      throw new Error("Student already has an active transport allocation. Revoke existing allocation first.");
    }
    throw err;
  }
}

export async function deleteTransportAllocation(institutionId: string, id: string) {
  const result = await db.transportAllocation.deleteMany({
    where: { id, institutionId },
  });
  if (result.count === 0) {
    throw new Error("Transport allocation not found or access denied.");
  }
  return { success: true };
}

// ----------------------------------------------------------------------------
// 20B. DEPARTMENTAL WORKFLOWS (FEES STRUCTURES/REFUNDS, HOSTEL OPS, TRANSPORT OPS)
// ----------------------------------------------------------------------------

export async function getFeeStructures(institutionId: string) {
  const key = `fee_structures:${institutionId}`;
  const setting = await db.platformSetting.findUnique({ where: { key } }).catch(() => null);
  return Array.isArray(setting?.value) ? (setting?.value as any[]) : [];
}

export async function saveFeeStructure(
  institutionId: string,
  data: {
    id?: string;
    name: string;
    courseId?: string;
    academicYearId?: string;
    semester?: number;
    amount: number;
    items?: { description: string; amount: number }[];
    actorUserId?: string;
  }
) {
  if (!data.name?.trim() || !data.amount || data.amount <= 0) {
    throw new Error("Fee structure name and positive amount are required.");
  }
  const key = `fee_structures:${institutionId}`;
  const existing = await getFeeStructures(institutionId);
  const item = {
    id: data.id || crypto.randomUUID(),
    name: data.name.trim(),
    courseId: data.courseId || null,
    academicYearId: data.academicYearId || null,
    semester: data.semester ?? null,
    amount: Number(data.amount),
    items: data.items && data.items.length > 0 ? data.items : [{ description: data.name.trim(), amount: Number(data.amount) }],
    updatedAt: new Date().toISOString(),
  };
  const next = data.id ? existing.map((s: any) => (s.id === data.id ? item : s)) : [item, ...existing];
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: next, description: `Fee structures for ${institutionId}` },
    update: { value: next },
  });
  await recordAuditLog(db, {
    institutionId,
    userId: data.actorUserId || "admin",
    action: "FEE_STRUCTURE_SAVED",
    entityType: "FEE_STRUCTURE",
    entityId: item.id,
    newValuesJson: JSON.stringify(item),
  });
  return item;
}

export async function getFeeRefunds(institutionId: string) {
  const key = `fee_refunds:${institutionId}`;
  const setting = await db.platformSetting.findUnique({ where: { key } }).catch(() => null);
  return Array.isArray(setting?.value) ? (setting?.value as any[]) : [];
}

export async function processFeeRefund(
  institutionId: string,
  data: {
    paymentId: string;
    amount: number;
    reason: string;
    refundMode?: string;
    actorUserId?: string;
  }
) {
  if (!data.paymentId) throw new Error("Payment ID is required for refund.");
  if (!data.amount || data.amount <= 0) throw new Error("Refund amount must be greater than zero.");
  if (!data.reason?.trim()) throw new Error("Refund reason is required.");

  return await db.$transaction(async (tx) => {
    const payment = await tx.feePayment.findFirst({
      where: { id: data.paymentId, institutionId },
      include: { invoice: true, student: true },
    });
    if (!payment) {
      throw new Error("Fee payment not found or does not belong to this institution.");
    }
    if (payment.status !== "SUCCESS") {
      throw new Error("Only successful payments can be refunded.");
    }
    if (data.amount > payment.amount) {
      throw new Error(`Refund amount (₹${data.amount}) exceeds original payment (₹${payment.amount}).`);
    }

    const key = `fee_refunds:${institutionId}`;
    const setting = await tx.platformSetting.findUnique({ where: { key } }).catch(() => null);
    const existingRefunds: any[] = Array.isArray(setting?.value) ? (setting?.value as any[]) : [];
    const alreadyRefunded = existingRefunds
      .filter((r: any) => r.paymentId === payment.id)
      .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

    if (alreadyRefunded + data.amount > payment.amount) {
      throw new Error(
        `Total refunded (₹${alreadyRefunded + data.amount}) exceeds payment amount (₹${payment.amount}).`
      );
    }

    const invoice = payment.invoice;
    const newPaid = Math.max(0, invoice.paidAmount - data.amount);
    const newOutstanding = Math.min(invoice.totalAmount, invoice.outstandingAmount + data.amount);
    const newStatus = newOutstanding === 0 ? "PAID" : newPaid > 0 ? "PARTIAL" : "UNPAID";

    await tx.feeInvoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount: newPaid,
        outstandingAmount: newOutstanding,
        status: newStatus,
      },
    });

    const refundRecord = {
      id: crypto.randomUUID(),
      paymentId: payment.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      studentId: payment.studentId,
      studentName: payment.student?.fullName || "Student",
      amount: Number(data.amount),
      reason: data.reason.trim(),
      refundMode: data.refundMode || payment.paymentMethod,
      processedBy: data.actorUserId || "ACCOUNTANT",
      createdAt: new Date().toISOString(),
    };

    const nextRefunds = [refundRecord, ...existingRefunds];
    await tx.platformSetting.upsert({
      where: { key },
      create: { key, value: nextRefunds, description: `Fee refunds for ${institutionId}` },
      update: { value: nextRefunds },
    });

    await recordAuditLog(tx, {
      institutionId,
      userId: data.actorUserId || "admin",
      action: "FEE_REFUND_PROCESSED",
      entityType: "FEE_PAYMENT",
      entityId: payment.id,
      newValuesJson: JSON.stringify(refundRecord),
    });

    return refundRecord;
  });
}

export async function getHostelCatalog(institutionId: string) {
  const key = `hostel_catalog:${institutionId}`;
  const setting = await db.platformSetting.findUnique({ where: { key } }).catch(() => null);
  return Array.isArray(setting?.value) ? (setting?.value as any[]) : [];
}

export async function saveHostelCatalogRoom(
  institutionId: string,
  data: {
    id?: string;
    hostelName: string;
    roomNumber: string;
    capacity: number;
    wardenName?: string;
    wardenContact?: string;
    actorUserId?: string;
  }
) {
  if (!data.hostelName?.trim() || !data.roomNumber?.trim() || !data.capacity || data.capacity <= 0) {
    throw new Error("Hostel name, room number, and positive bed capacity are required.");
  }
  const key = `hostel_catalog:${institutionId}`;
  const existing = await getHostelCatalog(institutionId);
  const item = {
    id: data.id || crypto.randomUUID(),
    hostelName: data.hostelName.trim(),
    roomNumber: data.roomNumber.trim(),
    capacity: Number(data.capacity),
    wardenName: data.wardenName?.trim() || "Hostel Warden",
    wardenContact: data.wardenContact?.trim() || "",
    updatedAt: new Date().toISOString(),
  };
  const next = data.id ? existing.map((r: any) => (r.id === data.id ? item : r)) : [item, ...existing];
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: next, description: `Hostel room catalog for ${institutionId}` },
    update: { value: next },
  });
  await recordAuditLog(db, {
    institutionId,
    userId: data.actorUserId || "admin",
    action: "HOSTEL_ROOM_SAVED",
    entityType: "HOSTEL",
    entityId: item.id,
    newValuesJson: JSON.stringify(item),
  });
  return item;
}

class SourceRoomChangedError extends Error {
  constructor() {
    super("Hostel allocation source room changed before locks were acquired.");
  }
}

const MAX_TRANSFER_LOCK_ATTEMPTS = 3;

function normalizeRoomLockKey(hostelName: string, roomNumber: string): string {
  return `${hostelName.trim().toLowerCase()}:${roomNumber.trim().toLowerCase()}`;
}

export async function transferHostelAllocation(
  institutionId: string,
  allocationId: string,
  data: {
    hostelName: string;
    roomNumber: string;
    bedNumber: string;
    wardenName?: string;
    wardenContact?: string;
    actorUserId?: string;
  }
) {
  if (!data.hostelName || !data.roomNumber || !data.bedNumber) {
    throw new Error("Target hostel, room, and bed number are required for transfer.");
  }

  const catalog = await getHostelCatalog(institutionId);
  const configuredRoom = catalog.find(
    (r: any) => r.hostelName === data.hostelName && r.roomNumber === data.roomNumber
  );

  for (let attempt = 1; attempt <= MAX_TRANSFER_LOCK_ATTEMPTS; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          const initial = await tx.hostelAllocation.findFirst({
            where: { id: allocationId, institutionId },
          });
          if (!initial) {
            throw new Error("Hostel allocation not found or access denied.");
          }

          const expectedSourceKey = normalizeRoomLockKey(initial.hostelName, initial.roomNumber);

          // Acquire source and destination room locks in deterministic sorted order to prevent deadlocks
          const roomEntries = [
            {
              lockKey: expectedSourceKey,
              hostelName: initial.hostelName,
              roomNumber: initial.roomNumber,
            },
            {
              lockKey: normalizeRoomLockKey(data.hostelName, data.roomNumber),
              hostelName: data.hostelName,
              roomNumber: data.roomNumber,
            },
          ];
          const uniqueRooms = Array.from(
            new Map(roomEntries.map((r) => [r.lockKey, r])).values()
          ).sort((a, b) => a.lockKey.localeCompare(b.lockKey));

          for (const room of uniqueRooms) {
            await acquireAllocationLock(tx, "hostel_alloc", institutionId, room.hostelName, room.roomNumber);
          }

          // Re-fetch allocation after acquiring locks; if its source room changed concurrently,
          // abort this transaction cleanly so locks are released and retry with the new source room.
          const current = await tx.hostelAllocation.findFirst({
            where: { id: allocationId, institutionId },
          });
          if (!current) {
            throw new Error("Hostel allocation not found or access denied.");
          }

          const actualSourceKey = normalizeRoomLockKey(current.hostelName, current.roomNumber);
          if (actualSourceKey !== expectedSourceKey) {
            throw new SourceRoomChangedError();
          }

          if (configuredRoom && configuredRoom.capacity > 0) {
            const destCount = await tx.hostelAllocation.count({
              where: {
                institutionId,
                hostelName: data.hostelName,
                roomNumber: data.roomNumber,
                id: { not: allocationId },
              },
            });
            if (destCount >= configuredRoom.capacity) {
              throw new Error(
                `Room ${data.roomNumber} in ${data.hostelName} is at full capacity (${configuredRoom.capacity} beds).`
              );
            }
          }

          const occupied = await tx.hostelAllocation.findFirst({
            where: {
              institutionId,
              hostelName: data.hostelName,
              roomNumber: data.roomNumber,
              bedNumber: data.bedNumber,
              id: { not: allocationId },
            },
          });
          if (occupied) {
            throw new Error(`Bed ${data.bedNumber} in ${data.hostelName} Room ${data.roomNumber} is already occupied.`);
          }

          const updated = await tx.hostelAllocation.update({
            where: { id: allocationId },
            data: {
              hostelName: data.hostelName,
              roomNumber: data.roomNumber,
              bedNumber: data.bedNumber,
              ...(data.wardenName ? { wardenName: data.wardenName } : {}),
              ...(data.wardenContact ? { wardenContact: data.wardenContact } : {}),
            },
            include: { student: { select: ALLOCATION_STUDENT_SELECT } },
          });
          await recordAuditLog(tx, {
            institutionId,
            userId: data.actorUserId || "admin",
            action: "HOSTEL_BED_TRANSFERRED",
            entityType: "HOSTEL",
            entityId: allocationId,
            oldValuesJson: JSON.stringify({
              hostelName: current.hostelName,
              roomNumber: current.roomNumber,
              bedNumber: current.bedNumber,
            }),
            newValuesJson: JSON.stringify({
              hostelName: data.hostelName,
              roomNumber: data.roomNumber,
              bedNumber: data.bedNumber,
            }),
          });
          return updated;
        },
        { maxWait: 10000, timeout: 15000 }
      );
    } catch (err) {
      if (err instanceof SourceRoomChangedError) {
        if (attempt < MAX_TRANSFER_LOCK_ATTEMPTS) {
          continue;
        }
        throw new Error("Transfer could not complete because the allocation's source room changed concurrently. Please retry.");
      }
      throw err;
    }
  }

  throw new Error("Transfer could not complete due to concurrent room updates. Please retry.");
}

export async function getHostelOperations(institutionId: string) {
  const key = `hostel_ops:${institutionId}`;
  const setting = await db.platformSetting.findUnique({ where: { key } }).catch(() => null);
  return Array.isArray(setting?.value) ? (setting?.value as any[]) : [];
}

export async function createHostelOperationRecord(
  institutionId: string,
  data: {
    type: "ATTENDANCE" | "MAINTENANCE";
    hostelName: string;
    roomNumber?: string;
    summary: string;
    status?: string;
    actorUserId?: string;
  }
) {
  if (!data.hostelName?.trim() || !data.summary?.trim()) {
    throw new Error("Hostel name and summary are required.");
  }
  const key = `hostel_ops:${institutionId}`;
  const existing = await getHostelOperations(institutionId);
  const record = {
    id: crypto.randomUUID(),
    type: data.type,
    hostelName: data.hostelName.trim(),
    roomNumber: data.roomNumber?.trim() || null,
    summary: data.summary.trim(),
    status: data.status || (data.type === "MAINTENANCE" ? "OPEN" : "RECORDED"),
    createdBy: data.actorUserId || "HOSTEL_WARDEN",
    createdAt: new Date().toISOString(),
  };
  const next = [record, ...existing];
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: next, description: `Hostel ops for ${institutionId}` },
    update: { value: next },
  });
  await recordAuditLog(db, {
    institutionId,
    userId: data.actorUserId || "admin",
    action: `HOSTEL_${data.type}_RECORDED`,
    entityType: "HOSTEL",
    entityId: record.id,
    newValuesJson: JSON.stringify(record),
  });
  return record;
}

export async function updateHostelOperationStatus(
  institutionId: string,
  operationId: string,
  status: string,
  actorUserId?: string
) {
  const key = `hostel_ops:${institutionId}`;
  const existing = await getHostelOperations(institutionId);
  const idx = existing.findIndex((o: any) => o.id === operationId);
  if (idx === -1) {
    throw new Error("Hostel operation record not found or access denied.");
  }
  const updated = { ...existing[idx], status, updatedAt: new Date().toISOString() };
  const next = [...existing];
  next[idx] = updated;
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: next, description: `Hostel ops for ${institutionId}` },
    update: { value: next },
  });
  await recordAuditLog(db, {
    institutionId,
    userId: actorUserId || "admin",
    action: "HOSTEL_OPERATION_UPDATED",
    entityType: "HOSTEL",
    entityId: operationId,
    newValuesJson: JSON.stringify({ status }),
  });
  return updated;
}

export async function getTransportCatalog(institutionId: string) {
  const key = `transport_catalog:${institutionId}`;
  const setting = await db.platformSetting.findUnique({ where: { key } }).catch(() => null);
  return Array.isArray(setting?.value) ? (setting?.value as any[]) : [];
}

export async function saveTransportCatalogItem(
  institutionId: string,
  data: {
    id?: string;
    routeNumber: string;
    routeName: string;
    vehicleNumber: string;
    capacity: number;
    driverName: string;
    driverContact: string;
    stops?: string[];
    status?: "ACTIVE" | "INACTIVE" | "MAINTENANCE";
    actorUserId?: string;
  }
) {
  if (!data.routeNumber?.trim() || !data.routeName?.trim() || !data.vehicleNumber?.trim()) {
    throw new Error("Route number, route name, and vehicle number are required.");
  }
  const key = `transport_catalog:${institutionId}`;
  const existing = await getTransportCatalog(institutionId);
  const item = {
    id: data.id || crypto.randomUUID(),
    routeNumber: data.routeNumber.trim(),
    routeName: data.routeName.trim(),
    vehicleNumber: data.vehicleNumber.trim(),
    capacity: Number(data.capacity) || 40,
    driverName: data.driverName?.trim() || "Assigned Driver",
    driverContact: data.driverContact?.trim() || "",
    stops: Array.isArray(data.stops) ? data.stops : [],
    status: data.status || "ACTIVE",
    updatedAt: new Date().toISOString(),
  };
  const next = data.id ? existing.map((t: any) => (t.id === data.id ? item : t)) : [item, ...existing];
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: next, description: `Transport routes/fleet for ${institutionId}` },
    update: { value: next },
  });
  await recordAuditLog(db, {
    institutionId,
    userId: data.actorUserId || "admin",
    action: "TRANSPORT_ROUTE_SAVED",
    entityType: "TRANSPORT",
    entityId: item.id,
    newValuesJson: JSON.stringify(item),
  });
  return item;
}

export async function getTransportMaintenance(institutionId: string) {
  const key = `transport_maintenance:${institutionId}`;
  const setting = await db.platformSetting.findUnique({ where: { key } }).catch(() => null);
  return Array.isArray(setting?.value) ? (setting?.value as any[]) : [];
}

export async function createTransportMaintenanceRecord(
  institutionId: string,
  data: {
    vehicleNumber: string;
    summary: string;
    cost?: number;
    status?: string;
    actorUserId?: string;
  }
) {
  if (!data.vehicleNumber?.trim() || !data.summary?.trim()) {
    throw new Error("Vehicle number and maintenance summary are required.");
  }
  const key = `transport_maintenance:${institutionId}`;
  const existing = await getTransportMaintenance(institutionId);
  const record = {
    id: crypto.randomUUID(),
    vehicleNumber: data.vehicleNumber.trim(),
    summary: data.summary.trim(),
    cost: Number(data.cost || 0),
    status: data.status || "SCHEDULED",
    createdBy: data.actorUserId || "TRANSPORT_OFFICER",
    createdAt: new Date().toISOString(),
  };
  const next = [record, ...existing];
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: next, description: `Transport maintenance for ${institutionId}` },
    update: { value: next },
  });
  await recordAuditLog(db, {
    institutionId,
    userId: data.actorUserId || "admin",
    action: "TRANSPORT_MAINTENANCE_RECORDED",
    entityType: "TRANSPORT",
    entityId: record.id,
    newValuesJson: JSON.stringify(record),
  });
  return record;
}

// ----------------------------------------------------------------------------
// 21. EVENTS & RESOURCE BOOKINGS
// ----------------------------------------------------------------------------

export async function getEvents(institutionId: string) {
  try {
    const list = await db.event.findMany({
      where: { institutionId },
      orderBy: { eventDate: "asc" },
    });
    return list || [];
  } catch (err: any) {
    console.error("Events database query error:", err.message);
    throw new Error(`Failed to load events from database: ${err.message}`);
  }
}

export async function createEvent(
  institutionId: string,
  data: {
    title: string;
    description: string;
    category: string;
    eventDate: Date;
    venue: string;
    organizer: string;
  }
) {
  return await db.event.create({
    data: {
      institutionId,
      title: data.title,
      description: data.description,
      category: data.category,
      eventDate: data.eventDate,
      venue: data.venue,
      organizer: data.organizer,
    },
  });
}

export async function getResourceBookings(institutionId: string) {
  try {
    const list = await db.resourceBooking.findMany({
      where: { institutionId },
      include: { student: true },
      orderBy: { bookingDate: "desc" },
    });
    return list || [];
  } catch (err: any) {
    console.error("Resource bookings database query error:", err.message);
    throw new Error(`Failed to load resource bookings from database: ${err.message}`);
  }
}

export async function updateResourceBookingStatus(
  institutionId: string,
  bookingId: string,
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED"
) {
  const result = await db.resourceBooking.updateMany({
    where: { id: bookingId, institutionId },
    data: { status },
  });
  if (result.count === 0) {
    throw new Error("Resource booking not found or access denied.");
  }
  return await db.resourceBooking.findFirst({
    where: { id: bookingId, institutionId },
  });
}

// ----------------------------------------------------------------------------
// 22. COMMUNICATION & NOTIFICATIONS
// ----------------------------------------------------------------------------

export async function getNotifications(institutionId: string) {
  try {
    const list = await db.notification.findMany({
      where: { institutionId },
      include: {
        recipients: {
          select: {
            id: true,
            userId: true,
            isRead: true,
            readAt: true,
            user: { select: { fullName: true, name: true, email: true, role: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (list && list.length > 0) {
      return list.map((n) => ({
        id: n.id,
        institutionId: n.institutionId,
        title: n.title,
        message: n.message,
        category: n.category,
        audienceRole: n.audienceRole,
        createdAt: n.createdAt,
        totalRecipients: n.recipients.length,
        readCount: n.recipients.filter((r) => r.isRead).length,
        recipients: n.recipients,
      }));
    }
    return [];
  } catch (err: any) {
    console.error("Notifications database query error:", err.message);
    throw new Error(`Failed to load notifications from database: ${err.message}`);
  }
}

export async function broadcastNotification(
  institutionId: string,
  data: {
    title: string;
    message: string;
    category: string;
    targetRole?: "STUDENT" | "PARENT" | "TEACHER" | "STAFF" | "ALL";
    targetCourseId?: string;
    targetSemester?: number;
    targetSectionId?: string;
    priority?: string;
  }
) {
  let emailRecipients: Array<{ email: string; name?: string }> = [];

  const result = await db.$transaction(async (tx) => {
    const notification = await tx.notification.create({
      data: {
        institutionId,
        title: data.title,
        message: data.message,
        category: data.category,
      },
    });

    const users = await tx.user.findMany({
      where: {
        institutionId,
        ...(data.targetRole && data.targetRole !== "ALL"
          ? { role: data.targetRole as any }
          : {}),
      },
      select: { id: true, email: true, name: true },
    });

    if (users.length > 0) {
      emailRecipients = users
        .filter((u) => Boolean(u.email))
        .map((u) => ({ email: u.email, name: u.name || undefined }));

      await tx.notificationRecipient.createMany({
        data: users.map((u) => ({
          notificationId: notification.id,
          userId: u.id,
          isRead: false,
        })),
        skipDuplicates: true,
      });
    }

    return notification;
  });

  // Background email dispatch (non-blocking for fast UI responses)
  if (emailRecipients.length > 0) {
    db.institution
      .findUnique({
        where: { id: institutionId },
        select: { name: true },
      })
      .then((inst) => {
        sendAnnouncementNotification(emailRecipients, {
          title: data.title,
          message: data.message,
          category: data.category,
          institutionName: inst?.name || "Campus Administration",
        }).catch((emailErr) => {
          console.warn("[broadcastNotification] Background email dispatch warning:", emailErr.message);
        });
      })
      .catch(() => {});
  }

  return result;
}

export async function updateNotification(
  institutionId: string,
  notificationId: string,
  data: {
    title?: string;
    message?: string;
    category?: string;
  }
) {
  const existing = await db.notification.findFirst({
    where: { id: notificationId, institutionId },
  });
  if (!existing) {
    throw new Error("Notification not found or access denied.");
  }

  return await db.notification.update({
    where: { id: notificationId },
    data: {
      ...(data.title ? { title: data.title } : {}),
      ...(data.message ? { message: data.message } : {}),
      ...(data.category ? { category: data.category } : {}),
    },
  });
}

export async function deleteNotification(
  institutionId: string,
  notificationId: string
) {
  const existing = await db.notification.findFirst({
    where: { id: notificationId, institutionId },
  });
  if (!existing) {
    throw new Error("Notification not found or access denied.");
  }

  return await db.$transaction(async (tx) => {
    await tx.notificationRecipient.deleteMany({
      where: { notificationId },
    });
    return await tx.notification.delete({
      where: { id: notificationId },
    });
  });
}

// ----------------------------------------------------------------------------
// 23. APPROVAL REQUESTS
// ----------------------------------------------------------------------------

export async function getApprovalRequests(institutionId: string, status?: string) {
  try {
    const list = await db.approvalRequest.findMany({
      where: {
        institutionId,
        ...(status ? { status } : {}),
      },
      include: {
        user: true,
        reviewedByUser: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Also query admission applications from admission_applications
    let admissionWhere: any = { institutionId };
    if (status) {
      if (status === "PENDING") {
        admissionWhere.status = { in: ["SUBMITTED", "UNDER_REVIEW"] };
      } else if (status === "APPROVED") {
        admissionWhere.status = "APPROVED";
      } else if (status === "REJECTED") {
        admissionWhere.status = "REJECTED";
      } else {
        admissionWhere.status = status;
      }
    }

    const admissions = await db.admissionApplication.findMany({
      where: admissionWhere,
      include: {
        course: { select: { id: true, name: true, code: true } },
        academicYear: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    let extraMap = new Map<string, any>();
    if (admissions.length > 0) {
      try {
        const extraRows: any[] = await db.$queryRawUnsafe(
          `SELECT id, "documentsJson", remarks, "guardianOccupation" FROM admission_applications WHERE "institutionId" = $1`,
          institutionId
        );
        for (const row of extraRows) {
          extraMap.set(row.id, row);
        }
      } catch {}
    }

    const admissionApprovalItems = admissions.map((app) => {
      const extra = extraMap.get(app.id);
      let parsedDocs = null;
      if (extra?.documentsJson) {
        try {
          parsedDocs = typeof extra.documentsJson === "string" ? JSON.parse(extra.documentsJson) : extra.documentsJson;
        } catch {}
      }

      return {
        id: app.id,
        institutionId: app.institutionId,
        requestType: "STUDENT_ADMISSION",
        status: app.status === "SUBMITTED" || app.status === "UNDER_REVIEW" ? "PENDING" : app.status,
        title: `Admission Application: ${app.fullName}`,
        description: `Application #${app.applicationNumber} • Course: ${app.course?.name || "General"} (${app.academicYear?.name || "Academic Year"})`,
        adminRemarks: extra?.remarks || (app as any).remarks || undefined,
        createdAt: app.createdAt,
        reviewedAt: (app as any).reviewedAt || undefined,
        isAdmissionApplication: true,
        user: {
          id: app.id,
          fullName: app.fullName,
          name: app.fullName,
          email: app.email,
          role: "APPLICANT",
        },
        details: {
          applicationNumber: app.applicationNumber,
          email: app.email,
          phone: app.phone,
          courseId: app.courseId,
          courseName: app.course?.name,
          academicYearId: app.academicYearId,
          academicYearName: app.academicYear?.name,
          gender: app.gender,
          dob: app.dob,
          addressLine: app.addressLine,
          city: app.city,
          guardianName: app.guardianName,
          guardianPhone: app.guardianPhone,
          guardianEmail: app.guardianEmail,
          guardianRelationship: app.guardianRelationship,
          guardianOccupation: extra?.guardianOccupation || null,
          documents: parsedDocs,
          convertedStudentId: app.convertedStudentId,
        },
      };
    });

    return [...admissionApprovalItems, ...(list || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (err: any) {
    console.error("Approval requests database query error:", err.message);
    throw new Error(`Failed to load approval requests from database: ${err.message}`);
  }
}

export async function processApprovalRequest(
  institutionId: string,
  requestId: string,
  status: "APPROVED" | "REJECTED",
  adminRemarks?: string,
  reviewerUserId?: string
) {
  if (status !== "APPROVED" && status !== "REJECTED") {
    throw new Error("Invalid status decision. Must be APPROVED or REJECTED.");
  }

  // 1. Check if requestId belongs to admission_applications
  const admissionApp = await db.admissionApplication.findFirst({
    where: { id: requestId, institutionId },
    include: { course: true, academicYear: true },
  });

  if (admissionApp) {
    try {
      const extraRows: any[] = await db.$queryRawUnsafe(
        `SELECT "documentsJson", remarks, "guardianOccupation" FROM admission_applications WHERE id = $1`,
        admissionApp.id
      );
      if (extraRows && extraRows.length > 0) {
        (admissionApp as any).guardianOccupation = extraRows[0].guardianOccupation;
        (admissionApp as any).remarks = extraRows[0].remarks;
        (admissionApp as any).documentsJson = extraRows[0].documentsJson;
      }
    } catch {}

    // Idempotent handling if already decided
    if (admissionApp.status === "APPROVED") {
      if (status === "APPROVED") {
        const student = admissionApp.convertedStudentId
          ? await db.student.findUnique({
              where: { id: admissionApp.convertedStudentId },
            })
          : await db.student.findFirst({
              where: { institutionId, email: admissionApp.email.toLowerCase() },
            });
        return {
          ...admissionApp,
          requestType: "STUDENT_ADMISSION",
          isAdmissionApplication: true,
          student,
          alreadyApproved: true,
        };
      }
      throw new Error(
        `Cannot decide application ${admissionApp.applicationNumber}: application has already been APPROVED.`
      );
    }

    if (admissionApp.status === "REJECTED") {
      if (status === "REJECTED") {
        return {
          ...admissionApp,
          requestType: "STUDENT_ADMISSION",
          isAdmissionApplication: true,
          alreadyRejected: true,
        };
      }
      throw new Error(
        `Cannot decide application ${admissionApp.applicationNumber}: application has already been REJECTED.`
      );
    }

    if (admissionApp.status !== "SUBMITTED" && admissionApp.status !== "UNDER_REVIEW") {
      throw new Error(
        `Cannot decide application ${admissionApp.applicationNumber}: current status is already ${admissionApp.status}. Only PENDING applications can be adjudicated.`
      );
    }

    if (status === "REJECTED") {
      const updated = await db.admissionApplication.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
        },
      });

      try {
        await db.$executeRawUnsafe(
          `UPDATE admission_applications SET remarks = $1, "reviewedByUserId" = $2, "reviewedAt" = NOW() WHERE id = $3`,
          adminRemarks || "Application rejected by administration.",
          reviewerUserId || null,
          requestId
        );
      } catch {}

      await recordAuditLog(db, {
        institutionId,
        userId: reviewerUserId || null,
        actorUserId: reviewerUserId || null,
        action: "ADMISSION_REJECTED",
        entityType: "ADMISSION_APPLICATION",
        entityId: requestId,
        newValuesJson: JSON.stringify({ status: "REJECTED", remarks: adminRemarks }),
      });

      return {
        ...updated,
        requestType: "STUDENT_ADMISSION",
        isAdmissionApplication: true,
      };
    }

    // Status is APPROVED: Execute Atomic Student & User Provisioning
    const result = await db.$transaction(async (tx) => {
      // Re-validate and ensure exclusive processing
      const app = await tx.admissionApplication.findUnique({
        where: { id: requestId },
      });
      if (!app || (app.status !== "SUBMITTED" && app.status !== "UNDER_REVIEW")) {
        if (app?.status === "APPROVED") {
          const student = app.convertedStudentId
            ? await tx.student.findUnique({ where: { id: app.convertedStudentId } })
            : null;
          return {
            student,
            user: null,
            enrollment: null,
            application: app,
            isExisting: true,
          };
        }
        throw new Error("Application status changed during adjudication. Please refresh.");
      }

      const applicantEmail = app.email.trim().toLowerCase();

      // Check globally if user account with same email already exists
      let userRecord = await tx.user.findUnique({
        where: { email: applicantEmail },
        include: { studentProfile: true },
      });

      // Tenant isolation: if user is registered under another institution, reject with clear actionable conflict
      if (userRecord && userRecord.institutionId && userRecord.institutionId !== institutionId) {
        const conflictErr = new Error(
          `Cannot approve application: An account with email "${applicantEmail}" is registered under another institution. Multi-tenant email conflict must be resolved by administration.`
        );
        (conflictErr as any).statusCode = 409;
        throw conflictErr;
      }

      // Role conflict safeguard: user already exists in same institution with non-student role
      if (userRecord && userRecord.role && userRecord.role !== "STUDENT") {
        const roleErr = new Error(
          `Cannot approve application: An account with email "${applicantEmail}" already exists with role "${userRecord.role}".`
        );
        (roleErr as any).statusCode = 409;
        throw roleErr;
      }

      let isExistingStudent = false;
      let student = userRecord?.studentProfile || null;

      if (userRecord) {
        // Link user to this institution if previously unassociated
        if (!userRecord.institutionId) {
          userRecord = await tx.user.update({
            where: { id: userRecord.id },
            data: { institutionId, role: "STUDENT" },
            include: { studentProfile: true },
          });
        }

        if (student) {
          // Verify student tenant isolation
          if (student.institutionId !== institutionId) {
            const studentTenantErr = new Error(
              `Cannot approve application: Student profile for email "${applicantEmail}" belongs to another institution.`
            );
            (studentTenantErr as any).statusCode = 409;
            throw studentTenantErr;
          }
          isExistingStudent = true;
        }
      } else {
        // Create brand new User login account (dormant until password setup link redeemed)
        userRecord = await tx.user.create({
          data: {
            institutionId,
            email: applicantEmail,
            fullName: app.fullName,
            role: "STUDENT",
            status: "ACTIVE",
            isActive: false, // Dormant until password setup token is redeemed
          },
          include: { studentProfile: true },
        });
      }

      // If student profile does not exist yet, generate collision-free rollNumber & admissionNumber
      if (!student) {
        const existingStudentCount = await tx.student.count({
          where: { institutionId },
        });
        const yearPrefix = new Date().getFullYear().toString().slice(-2);
        const courseCode =
          admissionApp.course?.code?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "GEN";

        let seq = existingStudentCount + 1;
        let rollNumber = `${yearPrefix}${courseCode}${String(seq).padStart(4, "0")}`;
        while (await tx.student.findFirst({ where: { institutionId, rollNumber }, select: { id: true } })) {
          seq++;
          rollNumber = `${yearPrefix}${courseCode}${String(seq).padStart(4, "0")}`;
        }

        let admSeq = seq;
        let admissionNumber = `ADM-${new Date().getFullYear()}-${String(admSeq).padStart(4, "0")}`;
        while (await tx.student.findFirst({ where: { institutionId, admissionNumber }, select: { id: true } })) {
          admSeq++;
          admissionNumber = `ADM-${new Date().getFullYear()}-${String(admSeq).padStart(4, "0")}`;
        }

        const applicantDob = app.dob ? new Date(app.dob) : new Date(2005, 0, 1);
        const applicantGender = (app.gender ? String(app.gender).toUpperCase() : "MALE") as any;

        student = await tx.student.create({
          data: {
            institutionId,
            userId: userRecord.id,
            admissionNumber,
            rollNumber,
            firstName: app.firstName,
            lastName: app.lastName,
            fullName: app.fullName || `${app.firstName} ${app.lastName}`.trim(),
            dateOfBirth: applicantDob,
            gender: applicantGender,
            email: applicantEmail,
            phone: app.phone,
            currentCourseId: app.courseId || null,
            currentAcademicYearId: app.academicYearId || null,
            currentSemester: 1,
            currentSection: "A",
            status: "ACTIVE",
          },
        });
      }

      if (!student) {
        throw new Error("Failed to create or resolve student record during admission approval.");
      }

      // Create or find Enrollment record
      let enrollment = await tx.enrollment.findFirst({
        where: {
          institutionId,
          studentId: student.id,
          courseId: app.courseId,
          academicYearId: app.academicYearId,
        },
      });

      if (!enrollment) {
        enrollment = await tx.enrollment.create({
          data: {
            institutionId,
            studentId: student.id,
            courseId: app.courseId,
            academicYearId: app.academicYearId,
            semester: 1,
            section: "A",
            status: "ACTIVE",
          },
        });
      }

      // 4. Guardian Provisioning & Student Linking Workflow
      let guardianAccountRecord: any = null;
      let guardianLinkRecord: any = null;

      const gName = (app.guardianName || "").trim();
      const gEmail = (app.guardianEmail || "").trim().toLowerCase();
      const gPhone = (app.guardianPhone || "").trim();
      const gRelation = (app.guardianRelationship || "Guardian").trim();
      const gOccupation = (app as any).guardianOccupation || null;

      if (gName || gEmail || gPhone) {
        let guardianUser: any = null;
        if (gEmail) {
          guardianUser = await tx.user.findUnique({
            where: { email: gEmail },
            include: { guardianAccount: true },
          });

          // Multi-tenant email conflict check
          if (guardianUser && guardianUser.institutionId && guardianUser.institutionId !== institutionId) {
            const conflictErr = new Error(
              `Cannot link guardian: Account with email "${gEmail}" belongs to another institution.`
            );
            (conflictErr as any).statusCode = 409;
            throw conflictErr;
          }

          if (
            guardianUser &&
            guardianUser.role &&
            guardianUser.role !== "PARENT" &&
            guardianUser.role !== "GUARDIAN"
          ) {
            console.warn(
              `[processApprovalRequest] Guardian email ${gEmail} exists with role "${guardianUser.role}". Linking student without role mutation.`
            );
          }
        }

        // If no user by email, search existing guardian account in this institution by phone and full name
        if (!guardianUser && gPhone && gName) {
          const existingGa = await tx.guardianAccount.findFirst({
            where: {
              institutionId,
              phone: gPhone,
              fullName: { equals: gName, mode: "insensitive" },
            },
            include: { user: true },
          });
          if (existingGa) {
            guardianAccountRecord = existingGa;
            guardianUser = existingGa.user;
          }
        }

        // If no user found, create dormant PARENT user
        if (!guardianUser) {
          const effectiveEmail =
            gEmail || `guardian_${institutionId.slice(0, 8)}_${student.id.slice(0, 8)}@guardian.internal`;

          guardianUser = await tx.user.create({
            data: {
              institutionId,
              email: effectiveEmail,
              fullName: gName || "Guardian",
              phone: gPhone || null,
              role: "PARENT",
              status: "INACTIVE",
              isActive: false,
              passwordHash: null,
            },
            include: { guardianAccount: true },
          });
        }

        // Resolve or create GuardianAccount
        if (!guardianAccountRecord) {
          if (guardianUser.guardianAccount) {
            guardianAccountRecord = guardianUser.guardianAccount;
          } else {
            guardianAccountRecord = await tx.guardianAccount.findFirst({
              where: { userId: guardianUser.id, institutionId },
            });
          }
        }

        if (!guardianAccountRecord) {
          guardianAccountRecord = await tx.guardianAccount.create({
            data: {
              institutionId,
              userId: guardianUser.id,
              fullName: gName || guardianUser.fullName || "Guardian",
              phone: gPhone || guardianUser.phone || "",
              relationship: gRelation,
              occupation: gOccupation,
            },
          });
        } else {
          // Update contact / occupation info
          guardianAccountRecord = await tx.guardianAccount.update({
            where: { id: guardianAccountRecord.id },
            data: {
              fullName: gName || guardianAccountRecord.fullName,
              phone: gPhone || guardianAccountRecord.phone,
              relationship: gRelation || guardianAccountRecord.relationship,
              ...(gOccupation ? { occupation: gOccupation } : {}),
            },
          });
        }

        // Link student to guardian account
        guardianLinkRecord = await tx.guardianLink.upsert({
          where: {
            guardianAccountId_studentId: {
              guardianAccountId: guardianAccountRecord.id,
              studentId: student.id,
            },
          },
          update: {
            relationship: gRelation,
            isVerified: true,
            canAccessPortal: true,
            isPrimary: true,
          },
          create: {
            institutionId,
            guardianAccountId: guardianAccountRecord.id,
            studentId: student.id,
            relationship: gRelation,
            isVerified: true,
            canAccessPortal: true,
            isPrimary: true,
          },
        });
      }

      // Update Admission Application to APPROVED with converted student link
      const updatedApp = await tx.admissionApplication.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          convertedStudentId: student.id,
        },
      });

      let effectiveReviewerUserId = reviewerUserId || null;
      if (effectiveReviewerUserId) {
        try {
          const reviewerExists = await tx.user.findUnique({
            where: { id: effectiveReviewerUserId },
            select: { id: true },
          });
          if (!reviewerExists) {
            effectiveReviewerUserId = null;
          }
        } catch {
          effectiveReviewerUserId = null;
        }
      }

      await tx.$executeRawUnsafe(
        `UPDATE admission_applications SET remarks = $1, "reviewedByUserId" = $2, "reviewedAt" = NOW() WHERE id = $3`,
        adminRemarks || "Application approved. Student enrolled.",
        effectiveReviewerUserId,
        requestId
      );

      // Audit log
      await recordAuditLog(tx, {
        institutionId,
        userId: userRecord.id,
        actorUserId: effectiveReviewerUserId,
        action: "ADMISSION_APPROVED",
        entityType: "STUDENT",
        entityId: student.id,
        newValuesJson: JSON.stringify({
          rollNumber: student.rollNumber,
          admissionNumber: student.admissionNumber,
          courseId: app.courseId,
          applicationNumber: app.applicationNumber,
          isExistingStudent,
          guardianAccountId: guardianAccountRecord?.id || null,
        }),
      });

      return {
        student,
        user: userRecord,
        enrollment,
        application: updatedApp,
        isExisting: isExistingStudent,
        guardianAccount: guardianAccountRecord,
        guardianLink: guardianLinkRecord,
      };
    }, { timeout: 30000, maxWait: 10000 });

    // Outside transaction: Welcome Email Dispatch
    let invitationSent = false;
    let invitationError: string | null = null;
    if (result.user && (!result.user.passwordHash || !result.user.isActive || !result.isExisting)) {
      try {
        const setupToken = await signPasswordSetupToken({
          userId: result.user.id,
          email: result.user.email,
          institutionId,
          passwordHash: result.user.passwordHash || null,
        });

        const appUrl = getAppBaseUrl();
        const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;
        const inst = await db.institution.findUnique({
          where: { id: institutionId },
          select: { name: true },
        });

        const emailRes = await sendRoleCredentialInvitation(
          { email: result.user.email, name: result.student?.fullName || undefined },
          {
            setupUrl,
            institutionName: inst?.name || "Campus Administration",
            expiresIn: "24 hours",
            role: "STUDENT",
            loginUrl: `${appUrl}/login`,
            username: result.user.email,
          }
        );
        invitationSent = emailRes.success;
        if (!emailRes.success) {
          invitationError = (emailRes as any).error || "Failed to dispatch email";
        }
      } catch (emailErr: any) {
        invitationError = emailErr.message;
        console.warn("Welcome email non-blocking dispatch note:", emailErr.message);
      }
    }

    return {
      ...result.application,
      requestType: "STUDENT_ADMISSION",
      isAdmissionApplication: true,
      student: result.student,
      guardianAccount: result.guardianAccount,
      guardianLink: result.guardianLink,
      invitationSent,
      invitationError,
    };
  }

  // 2. Standard approval_requests table processing
  const result = await db.approvalRequest.updateMany({
    where: { id: requestId, institutionId, status: "PENDING" },
    data: {
      status,
      adminRemarks,
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
    },
  });
  if (result.count > 0) {
    const updatedReq = await db.approvalRequest.findFirst({
      where: { id: requestId, institutionId },
    });
    if (updatedReq && updatedReq.requestType === "RESOURCE_BOOKING") {
      try {
        const payload = JSON.parse(updatedReq.requestedDataJson || "{}");
        if (payload.bookingId) {
          await db.resourceBooking.updateMany({
            where: { id: payload.bookingId, institutionId },
            data: { status },
          });
        }
      } catch {}
    }
    return updatedReq;
  }
  const check = await db.approvalRequest.findFirst({
    where: { id: requestId, institutionId },
  });
  if (check && check.status !== "PENDING") {
    throw new Error(
      `Cannot decide request ${requestId}: status is already ${check.status}. Only PENDING requests can be adjudicated.`
    );
  }
  throw new Error("Approval request not found or does not belong to this institution.");
}

export async function archiveOrDeleteStudent(
  institutionId: string,
  studentId: string,
  mode: "ARCHIVE" | "DELETE" = "ARCHIVE"
) {
  const student = await db.student.findFirst({
    where: { id: studentId, institutionId },
  });

  if (!student) {
    throw new Error("Student not found or access denied.");
  }

  // Check for dependent records (attendance, exams, fees)
  let hasHistoricalRecords = false;
  let dependentReason = "";

  try {
    const attCount: any[] = await db.$queryRawUnsafe(
      `SELECT count(*) as count FROM attendance_records WHERE "studentId" = $1`,
      studentId
    );
    if (parseInt(attCount[0]?.count || "0", 10) > 0) {
      hasHistoricalRecords = true;
      dependentReason = "attendance records";
    }
  } catch {}

  if (!hasHistoricalRecords) {
    try {
      const feeCount: any[] = await db.$queryRawUnsafe(
        `SELECT count(*) as count FROM fee_payments WHERE "studentId" = $1`,
        studentId
      );
      if (parseInt(feeCount[0]?.count || "0", 10) > 0) {
        hasHistoricalRecords = true;
        dependentReason = "fee payment records";
      }
    } catch {}
  }

  if (!hasHistoricalRecords) {
    try {
      const examCount: any[] = await db.$queryRawUnsafe(
        `SELECT count(*) as count FROM exam_results WHERE "studentId" = $1`,
        studentId
      );
      if (parseInt(examCount[0]?.count || "0", 10) > 0) {
        hasHistoricalRecords = true;
        dependentReason = "examination results";
      }
    } catch {}
  }

  if (hasHistoricalRecords && mode === "DELETE") {
    throw new Error(
      `Cannot permanently delete student ${student.fullName}: dependent ${dependentReason} exist. Student must be ARCHIVED to preserve historical academic and financial integrity.`
    );
  }

  // Soft-delete / Archive
  const updated = await db.student.update({
    where: { id: studentId },
    data: {
      status: "ARCHIVED" as any,
    },
  });

  // Deactivate associated user login
  if (student.userId) {
    await db.user.updateMany({
      where: { id: student.userId, institutionId },
      data: { isActive: false, status: "INACTIVE" },
    });
  }

  await recordAuditLog(db, {
    institutionId,
    userId: student.userId || null,
    actorUserId: null,
    action: "STUDENT_ARCHIVED",
    entityType: "STUDENT",
    entityId: studentId,
    newValuesJson: JSON.stringify({ status: "ARCHIVED", mode }),
  });

  return updated;
}

export async function restoreStudent(
  institutionId: string,
  studentId: string,
  actorUserId?: string
) {
  const student = await db.student.findFirst({
    where: { id: studentId, institutionId },
  });

  if (!student) {
    throw new Error("Student not found or access denied.");
  }

  if ((student.status as string) !== "ARCHIVED" && (student.status as string) !== "Archived") {
    return {
      success: true,
      message: "Student is not archived.",
      alreadyActive: true,
      data: student,
    };
  }

  const updated = await db.student.update({
    where: { id: studentId },
    data: {
      status: "ACTIVE",
    },
  });

  await recordAuditLog(db, {
    institutionId,
    userId: student.userId || null,
    actorUserId: actorUserId || null,
    action: "STUDENT_RESTORED",
    entityType: "STUDENT",
    entityId: studentId,
    newValuesJson: JSON.stringify({
      status: "ACTIVE",
      restoredAt: new Date().toISOString(),
      portalAccessRequiresSetup: true,
    }),
  });

  return {
    success: true,
    message: `Student ${student.fullName} successfully restored to active directory.`,
    data: updated,
  };
}

// ----------------------------------------------------------------------------
// 23b. TEACHER ARCHIVE & RESTORE
// ----------------------------------------------------------------------------

export async function getTeacherDependencies(institutionId: string, staffId: string) {
  const user = await db.user.findFirst({
    where: {
      id: staffId,
      institutionId,
    },
    include: {
      teacherProfile: true,
    },
  });

  if (!user) {
    throw new Error("Staff member not found or access denied.");
  }

  const teacherProfileId = user.teacherProfile?.id;
  const activeSlots = await db.timetableSlot.findMany({
    where: {
      institutionId,
      OR: [
        ...(teacherProfileId ? [{ teacherId: teacherProfileId }] : []),
        { staffId: user.id },
      ],
      status: "ACTIVE",
    },
    include: {
      subject: true,
      course: true,
    },
  });

  return {
    user,
    teacherProfile: user.teacherProfile,
    activeSlots: activeSlots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      roomNumber: s.roomNumber,
      subjectName: s.subject?.name || "Subject",
      courseName: s.course?.name || "Course",
      section: s.section,
    })),
    hasActiveAssignments: activeSlots.length > 0,
  };
}

export async function archiveTeacher(
  institutionId: string,
  staffId: string,
  actorUserId?: string,
  forceWithAssignments: boolean = false
) {
  const { user, teacherProfile, activeSlots, hasActiveAssignments } =
    await getTeacherDependencies(institutionId, staffId);

  // If teacher has active teaching assignments, require explicit force/reassignment
  if (hasActiveAssignments && !forceWithAssignments) {
    const conflictErr = new Error(
      `Cannot archive teacher "${user.fullName}": ${activeSlots.length} active teaching assignment(s) exist. Reassign timetable slots before completing archival.`
    );
    (conflictErr as any).statusCode = 409;
    (conflictErr as any).hasActiveAssignments = true;
    (conflictErr as any).activeSlots = activeSlots;
    throw conflictErr;
  }

  const settingKey = `archived_staff:${institutionId}`;
  const setting = await db.platformSetting
    .findUnique({ where: { key: settingKey } })
    .catch(() => null);

  const archivedList: any[] = Array.isArray(setting?.value)
    ? (setting?.value as any[])
    : [];

  const isAlreadyArchived = archivedList.some(
    (a: any) =>
      a.id === user.id || (teacherProfile && a.id === teacherProfile.id)
  );

  if (isAlreadyArchived) {
    return {
      success: true,
      message: `Teacher "${user.fullName}" is already archived.`,
      alreadyArchived: true,
    };
  }

  const nowIso = new Date().toISOString();
  const newArchivedRecord = {
    id: user.id,
    teacherId: teacherProfile?.id || null,
    employeeId: teacherProfile?.employeeId || null,
    fullName: user.fullName,
    email: user.email,
    archivedAt: nowIso,
    archivedBy: actorUserId || "INSTITUTION_ADMIN",
    activeSlotCount: activeSlots.length,
  };

  const nextList = [
    ...archivedList.filter(
      (a: any) => a.id !== user.id && (!teacherProfile || a.id !== teacherProfile.id)
    ),
    newArchivedRecord,
  ];

  await db.$transaction(async (tx) => {
    // 1. Revoke portal login access safely
    await tx.user.updateMany({
      where: { id: user.id, institutionId },
      data: {
        isActive: false,
        status: "INACTIVE",
      },
    });

    // 2. Persist in tenant-isolated PlatformSetting
    await tx.platformSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: nextList,
        description: `Archived staff for institution ${institutionId}`,
      },
      update: {
        value: nextList,
      },
    });

    // 3. Record audit log
    await recordAuditLog(tx, {
      institutionId,
      userId: user.id,
      actorUserId: actorUserId || null,
      action: "TEACHER_ARCHIVED",
      entityType: "TEACHER",
      entityId: teacherProfile?.id || user.id,
      newValuesJson: JSON.stringify({
        status: "ARCHIVED",
        isActive: false,
        archivedAt: nowIso,
        activeSlotCount: activeSlots.length,
      }),
    });
  });

  return {
    success: true,
    message: `Teacher "${user.fullName}" archived safely. Historical academic, attendance, and exam records remain permanently preserved.`,
    data: newArchivedRecord,
  };
}

export async function restoreTeacher(
  institutionId: string,
  staffId: string,
  actorUserId?: string
) {
  const user = await db.user.findFirst({
    where: {
      id: staffId,
      institutionId,
    },
    include: {
      teacherProfile: true,
    },
  });

  if (!user) {
    throw new Error("Staff member not found or access denied.");
  }

  const settingKey = `archived_staff:${institutionId}`;
  const setting = await db.platformSetting
    .findUnique({ where: { key: settingKey } })
    .catch(() => null);

  const archivedList: any[] = Array.isArray(setting?.value)
    ? (setting?.value as any[])
    : [];

  const isArchived = archivedList.some(
    (a: any) =>
      a.id === user.id || (user.teacherProfile && a.id === user.teacherProfile.id)
  );

  if (!isArchived) {
    return {
      success: true,
      message: `Teacher "${user.fullName}" is not archived.`,
      notArchived: true,
    };
  }

  const nextList = archivedList.filter(
    (a: any) =>
      a.id !== user.id && (!user.teacherProfile || a.id !== user.teacherProfile.id)
  );

  await db.$transaction(async (tx) => {
    // 1. Remove from archived set
    await tx.platformSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: nextList,
        description: `Archived staff for institution ${institutionId}`,
      },
      update: {
        value: nextList,
      },
    });

    // 2. Security: Portal access is NOT automatically re-enabled

    // 3. Record audit log
    await recordAuditLog(tx, {
      institutionId,
      userId: user.id,
      actorUserId: actorUserId || null,
      action: "TEACHER_RESTORED",
      entityType: "TEACHER",
      entityId: user.teacherProfile?.id || user.id,
      newValuesJson: JSON.stringify({
        status: "RESTORED",
        restoredAt: new Date().toISOString(),
        portalAccessRequiresAuthorization: true,
      }),
    });
  });

  return {
    success: true,
    message: `Teacher "${user.fullName}" restored successfully. Portal access requires fresh credential activation.`,
  };
}

// ----------------------------------------------------------------------------
// 23c. PARENT / GUARDIAN ARCHIVE & RESTORE
// ----------------------------------------------------------------------------

export async function getGuardianDependencies(institutionId: string, guardianId: string) {
  const guardianAccount = await db.guardianAccount.findFirst({
    where: {
      institutionId,
      OR: [{ id: guardianId }, { userId: guardianId }],
    },
    include: {
      guardianLinks: {
        include: { student: true },
      },
      user: true,
    },
  });

  if (!guardianAccount) {
    throw new Error("Guardian not found or access denied.");
  }

  const linkedStudents = guardianAccount.guardianLinks.map((gl) => ({
    studentId: gl.studentId,
    fullName: gl.student?.fullName || "Student",
    rollNumber: gl.student?.rollNumber || "N/A",
    admissionNumber: gl.student?.admissionNumber || "N/A",
    relationship: gl.relationship,
    status: gl.student?.status || "ACTIVE",
    canAccessPortal: gl.canAccessPortal,
  }));

  const activeStudents = linkedStudents.filter(
    (s) => (s.status as string) === "ACTIVE" || (s.status as string) === "Active"
  );

  return {
    guardianAccount,
    linkedStudents,
    activeStudents,
    hasActiveStudents: activeStudents.length > 0,
  };
}

export async function archiveGuardian(
  institutionId: string,
  guardianId: string,
  actorUserId?: string,
  forceWithActiveStudents: boolean = false
) {
  const { guardianAccount, linkedStudents, activeStudents, hasActiveStudents } =
    await getGuardianDependencies(institutionId, guardianId);

  // If guardian has active linked students and not explicitly confirmed, return detailed conflict
  if (hasActiveStudents && !forceWithActiveStudents) {
    const conflictErr = new Error(
      `Cannot archive guardian "${guardianAccount.fullName}": Guardian is linked to ${activeStudents.length} active student(s) (${activeStudents.map((s) => s.fullName).join(", ")}). Administrator confirmation required.`
    );
    (conflictErr as any).statusCode = 409;
    (conflictErr as any).hasActiveStudents = true;
    (conflictErr as any).linkedStudents = linkedStudents;
    throw conflictErr;
  }

  const settingKey = `archived_guardians:${institutionId}`;
  const setting = await db.platformSetting
    .findUnique({ where: { key: settingKey } })
    .catch(() => null);

  const archivedList: any[] = Array.isArray(setting?.value)
    ? (setting?.value as any[])
    : [];

  const isAlreadyArchived = archivedList.some(
    (a: any) => a.id === guardianAccount.id || a.id === guardianAccount.userId
  );

  if (isAlreadyArchived) {
    return {
      success: true,
      message: `Guardian "${guardianAccount.fullName}" is already archived.`,
      alreadyArchived: true,
    };
  }

  const nowIso = new Date().toISOString();
  const newArchivedRecord = {
    id: guardianAccount.id,
    userId: guardianAccount.userId,
    fullName: guardianAccount.fullName,
    phone: guardianAccount.phone,
    archivedAt: nowIso,
    archivedBy: actorUserId || "INSTITUTION_ADMIN",
    linkedStudentCount: linkedStudents.length,
    activeStudentCount: activeStudents.length,
  };

  const nextList = [
    ...archivedList.filter(
      (a: any) => a.id !== guardianAccount.id && a.id !== guardianAccount.userId
    ),
    newArchivedRecord,
  ];

  await db.$transaction(async (tx) => {
    // 1. Deactivate guardian portal login
    if (guardianAccount.userId) {
      await tx.user.updateMany({
        where: { id: guardianAccount.userId, institutionId },
        data: {
          isActive: false,
          status: "INACTIVE",
        },
      });
    }

    // 2. Revoke portal access permission to student records, preserving relationships
    await tx.guardianLink.updateMany({
      where: {
        guardianAccountId: guardianAccount.id,
        institutionId,
      },
      data: {
        canAccessPortal: false,
      },
    });

    // 3. Persist in tenant-isolated PlatformSetting
    await tx.platformSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: nextList,
        description: `Archived guardians for institution ${institutionId}`,
      },
      update: {
        value: nextList,
      },
    });

    // 4. Record audit log
    await recordAuditLog(tx, {
      institutionId,
      userId: guardianAccount.userId || null,
      actorUserId: actorUserId || null,
      action: "GUARDIAN_ARCHIVED",
      entityType: "GUARDIAN",
      entityId: guardianAccount.id,
      newValuesJson: JSON.stringify({
        status: "ARCHIVED",
        archivedAt: nowIso,
        linkedStudentIds: linkedStudents.map((s) => s.studentId),
      }),
    });
  });

  return {
    success: true,
    message: `Guardian "${guardianAccount.fullName}" archived safely. Linked student records and historical relationships remain preserved.`,
    data: newArchivedRecord,
  };
}

export async function restoreGuardian(
  institutionId: string,
  guardianId: string,
  actorUserId?: string
) {
  const guardianAccount = await db.guardianAccount.findFirst({
    where: {
      institutionId,
      OR: [{ id: guardianId }, { userId: guardianId }],
    },
    include: {
      guardianLinks: true,
    },
  });

  if (!guardianAccount) {
    throw new Error("Guardian not found or access denied.");
  }

  const settingKey = `archived_guardians:${institutionId}`;
  const setting = await db.platformSetting
    .findUnique({ where: { key: settingKey } })
    .catch(() => null);

  const archivedList: any[] = Array.isArray(setting?.value)
    ? (setting?.value as any[])
    : [];

  const isArchived = archivedList.some(
    (a: any) => a.id === guardianAccount.id || a.id === guardianAccount.userId
  );

  if (!isArchived) {
    return {
      success: true,
      message: `Guardian "${guardianAccount.fullName}" is not archived.`,
      notArchived: true,
    };
  }

  const nextList = archivedList.filter(
    (a: any) => a.id !== guardianAccount.id && a.id !== guardianAccount.userId
  );

  await db.$transaction(async (tx) => {
    // 1. Remove from archived set
    await tx.platformSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: nextList,
        description: `Archived guardians for institution ${institutionId}`,
      },
      update: {
        value: nextList,
      },
    });

    // 2. Restore portal access permissions ONLY on verified links (Requirement 12: Never grant access to every linked student automatically)
    await tx.guardianLink.updateMany({
      where: {
        guardianAccountId: guardianAccount.id,
        institutionId,
        isVerified: true,
      },
      data: {
        canAccessPortal: true,
      },
    });

    // 3. Security: User login account remains inactive until explicitly enabled/credential issued

    // 4. Record audit log
    await recordAuditLog(tx, {
      institutionId,
      userId: guardianAccount.userId || null,
      actorUserId: actorUserId || null,
      action: "GUARDIAN_RESTORED",
      entityType: "GUARDIAN",
      entityId: guardianAccount.id,
      newValuesJson: JSON.stringify({
        status: "RESTORED",
        restoredAt: new Date().toISOString(),
        portalAccessRequiresAuthorization: true,
      }),
    });
  });

  return {
    success: true,
    message: `Guardian "${guardianAccount.fullName}" restored successfully.`,
  };
}

export async function getCampusServicesOverview(institutionId: string) {
  const [hostelAllocations, transportAllocations, resourceBookings, serviceRequests] = await Promise.all([
    db.hostelAllocation.findMany({
      where: { institutionId },
      include: { student: { select: { fullName: true, rollNumber: true } } },
      orderBy: { allocatedDate: "desc" },
    }),
    db.transportAllocation.findMany({
      where: { institutionId },
      include: { student: { select: { fullName: true, rollNumber: true } } },
      orderBy: { routeNumber: "asc" },
    }),
    db.resourceBooking.findMany({
      where: { institutionId },
      include: { student: { select: { fullName: true, rollNumber: true } } },
      orderBy: { bookingDate: "desc" },
    }),
    db.approvalRequest.findMany({
      where: {
        institutionId,
        requestType: { in: ["RESOURCE_BOOKING", "STUDENT_QUERY", "HOSTEL_REQUEST", "TRANSPORT_REQUEST"] },
      },
      include: { user: { select: { fullName: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    hostel: {
      totalAllocations: hostelAllocations.length,
      allocations: hostelAllocations,
    },
    transport: {
      totalAllocations: transportAllocations.length,
      allocations: transportAllocations,
    },
    resourceBookings: {
      totalBookings: resourceBookings.length,
      pending: resourceBookings.filter((b) => b.status === "PENDING").length,
      approved: resourceBookings.filter((b) => b.status === "APPROVED").length,
      bookings: resourceBookings,
    },
    serviceRequests,
  };
}

// ----------------------------------------------------------------------------
// 24. ROLES, PERMISSIONS & AUDIT LOGS
// ----------------------------------------------------------------------------

export async function getAuditLogs(institutionId: string, take = 50) {
  try {
    const rawList: any = await db.$queryRaw`
      SELECT
        id,
        action,
        "entityType" as "tableName",
        "entityId" as "recordId",
        "createdAt",
        "actorUserId" as "userId",
        "oldValuesJson",
        "newValuesJson",
        "ipAddress"
      FROM audit_logs
      WHERE "institutionId" = ${institutionId}
      UNION ALL
      SELECT
        id::text,
        action,
        entity as "tableName",
        "entityId" as "recordId",
        "createdAt",
        "userId"::text as "userId",
        NULL as "oldValuesJson",
        metadata::text as "newValuesJson",
        "ipAddress"
      FROM "AuditLog"
      WHERE "institutionId"::text = ${institutionId}
      ORDER BY "createdAt" DESC
      LIMIT ${take};
    `;

    if (rawList && Array.isArray(rawList)) {
      return rawList.map((r: any) => ({
        id: r.id,
        action: r.action,
        tableName: r.tableName || "general",
        recordId: r.recordId || r.id,
        entity: r.tableName,
        entityType: r.tableName,
        entityId: r.recordId,
        createdAt: r.createdAt,
        user: { fullName: "Administrator", role: "ADMIN", email: "" },
      }));
    }
    return [];
  } catch (err: any) {
    console.error("Audit logs database query error:", err.message);
    throw new Error(`Failed to load audit logs from database: ${err.message}`);
  }
}

export async function createAuditLog(data: {
  institutionId: string;
  userId?: string;
  action: string;
  tableName: string;
  recordId: string;
  oldValues?: any;
  newValues?: any;
}) {
  try {
    const newId = crypto.randomUUID();
    await db.$executeRaw`
      INSERT INTO audit_logs (id, "institutionId", "actorUserId", action, "entityType", "entityId", "oldValuesJson", "newValuesJson", "createdAt")
      VALUES (${newId}, ${data.institutionId}, ${data.userId || null}, ${data.action}, ${data.tableName}, ${data.recordId}, ${JSON.stringify(data.oldValues || null)}, ${JSON.stringify(data.newValues || null)}, NOW())
    `;
    return { id: newId, ...data, createdAt: new Date() };
  } catch (err: any) {
    console.error("Audit log insertion failed:", err.message);
    return null;
  }
}

// ----------------------------------------------------------------------------
// 25. GATE MANAGEMENT & CAMPUS SECURITY
// ----------------------------------------------------------------------------
export async function getCampusInOutLogs(institutionId: string, take = 50) {
  try {
    return await db.campusInOutLog.findMany({
      where: { institutionId },
      include: {
        student: {
          select: { id: true, fullName: true, rollNumber: true },
        },
      },
      orderBy: { timestamp: "desc" },
      take,
    });
  } catch (err: any) {
    console.warn("Campus in-out log query fallback:", err.message);
    return [];
  }
}

export async function createCampusInOutLog(
  institutionId: string,
  data: {
    studentId: string;
    logType: "ENTRY" | "EXIT";
    gateName?: string;
    verifiedBy?: string;
  }
) {
  return await db.campusInOutLog.create({
    data: {
      institutionId,
      studentId: data.studentId,
      logType: data.logType,
      gateName: data.gateName || "Main Gate",
      verifiedBy: data.verifiedBy || "Security Desk",
    },
    include: { student: true },
  });
}

// Safe registry for visitor passes
const globalVisitorPassRegistry: Map<string, any[]> = new Map();

export async function getVisitorPasses(institutionId: string, take = 50) {
  let list = globalVisitorPassRegistry.get(institutionId);
  if (!list) {
    list = [
      {
        id: "vis_demo_01",
        passNumber: "VP-2026-0891",
        visitorName: "Rajesh Kumar Sharma",
        phoneNumber: "+91 98450 12345",
        idProofType: "Aadhaar Card",
        organization: "Tata Consultancy Services",
        purpose: "Campus Placement Discussion",
        hostName: "Dr. Anand Rao (HOD CSE)",
        hostDepartment: "Computer Science",
        gateName: "Main Security Gate",
        vehicleNumber: "KA-01-MJ-4512",
        checkInTime: new Date(Date.now() - 3600000 * 2).toISOString(),
        checkOutTime: null,
        status: "CHECKED_IN",
        issuedBy: "Officer Suresh (Gate 1)",
      },
      {
        id: "vis_demo_02",
        passNumber: "VP-2026-0890",
        visitorName: "Pooja Hegde",
        phoneNumber: "+91 97412 88990",
        idProofType: "Driving License",
        organization: "Parent",
        purpose: "Hostel Warden Interaction",
        hostName: "Mrs. Shobha K (Warden)",
        hostDepartment: "Ladies Hostel Block B",
        gateName: "North Gate",
        vehicleNumber: "KA-04-NB-1102",
        checkInTime: new Date(Date.now() - 3600000 * 5).toISOString(),
        checkOutTime: new Date(Date.now() - 3600000 * 3).toISOString(),
        status: "CHECKED_OUT",
        issuedBy: "Officer Mahendra (North Gate)",
      },
      {
        id: "vis_demo_03",
        passNumber: "VP-2026-0889",
        visitorName: "Sunil Verma",
        phoneNumber: "+91 94481 33221",
        idProofType: "PAN Card",
        organization: "Dell Logistics",
        purpose: "Lab Equipment Delivery",
        hostName: "Prof. N. Murthy (Lab Incharge)",
        hostDepartment: "ECE Department",
        gateName: "Goods Gate 3",
        vehicleNumber: "KA-05-AA-7890",
        checkInTime: new Date(Date.now() - 3600000 * 1).toISOString(),
        checkOutTime: null,
        status: "CHECKED_IN",
        issuedBy: "Officer Ramesh (Goods Gate)",
      },
    ];
    globalVisitorPassRegistry.set(institutionId, list);
  }
  return list.slice(0, take);
}

export async function createVisitorPass(
  institutionId: string,
  data: {
    visitorName: string;
    phoneNumber: string;
    idProofType?: string;
    idProofNumber?: string;
    organization?: string;
    purpose: string;
    hostName: string;
    hostDepartment?: string;
    gateName?: string;
    vehicleNumber?: string;
    issuedBy?: string;
  }
) {
  const current = await getVisitorPasses(institutionId, 100);
  const seq = current.length + 892;
  const newPass = {
    id: `vis_${Date.now()}`,
    passNumber: `VP-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`,
    visitorName: data.visitorName,
    phoneNumber: data.phoneNumber,
    idProofType: data.idProofType || "Government ID",
    idProofNumber: data.idProofNumber,
    organization: data.organization || "Independent Visitor",
    purpose: data.purpose,
    hostName: data.hostName,
    hostDepartment: data.hostDepartment || "General Administration",
    gateName: data.gateName || "Main Gate",
    vehicleNumber: data.vehicleNumber || "None",
    checkInTime: new Date().toISOString(),
    checkOutTime: null,
    status: "CHECKED_IN",
    issuedBy: data.issuedBy || "Security Desk",
  };
  globalVisitorPassRegistry.set(institutionId, [newPass, ...current]);
  return newPass;
}

export async function checkoutVisitorPass(institutionId: string, passId: string) {
  const current = await getVisitorPasses(institutionId, 100);
  const target = current.find((p) => p.id === passId || p.passNumber === passId);
  if (!target) {
    throw new Error("Visitor pass not found or access denied.");
  }
  if (target.status === "CHECKED_OUT") {
    throw new Error(`Visitor pass (${target.passNumber || passId}) is already checked out at ${target.checkOutTime}.`);
  }

  const updated = current.map((p) =>
    p.id === passId || p.passNumber === passId
      ? { ...p, status: "CHECKED_OUT", checkOutTime: new Date().toISOString() }
      : p
  );
  globalVisitorPassRegistry.set(institutionId, updated);
  return updated.find((p) => p.id === passId || p.passNumber === passId);
}

// ----------------------------------------------------------------------------
// 26. STUDENT GRIEVANCES & INSTITUTIONAL FEEDBACK
// ----------------------------------------------------------------------------
export const globalFeedbacksRegistry: Map<string, any[]> = new Map();

export async function getStudentFeedbacks(institutionId: string, status?: string) {
  let dbList: any[] = [];
  try {
    const list = await db.feedback.findMany({
      where: {
        ...(institutionId ? { institutionId } : {}),
        ...(status && status !== "ALL" ? { status } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fullName: true,
            rollNumber: true,
            admissionNumber: true,
            email: true,
            phone: true,
            user: {
              select: {
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });
    if (list) dbList = list;
  } catch (err: any) {
    console.warn("Feedback database query error:", err.message);
  }

  // Load from persistent disk storage (ensures feedbacks survive server restarts)
  const persistedList = loadAllPersistedFeedbacks();
  const memList = globalFeedbacksRegistry.get(institutionId) || [];

  const merged: any[] = [...dbList];

  const upsertItem = (item: any) => {
    // Strict tenant isolation: verify institution match
    if (institutionId && item.institutionId && item.institutionId !== institutionId) {
      return;
    }

    const idx = merged.findIndex((m) => m.id === item.id);
    if (idx >= 0) {
      if (item.status !== "PENDING" || item.response || !merged[idx].response) {
        merged[idx] = {
          ...merged[idx],
          ...item,
          status: item.status || merged[idx].status,
          response: item.response !== undefined ? item.response : merged[idx].response,
          respondedAt: item.respondedAt || merged[idx].respondedAt,
        };
      }
    } else {
      merged.push(item);
    }
  };

  for (const item of persistedList) {
    upsertItem(item);
  }
  for (const item of memList) {
    upsertItem(item);
  }

  merged.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  // Keep in-memory cache synchronized for this institution
  globalFeedbacksRegistry.set(institutionId, merged);

  if (status && status !== "ALL") {
    return merged.filter((item) => item.status === status);
  }
  return merged;
}

export async function updateStudentFeedback(
  institutionId: string,
  feedbackId: string,
  data: {
    status?: string;
    response?: string;
  },
  adminUserId?: string
) {
  const updatedStatus = data.status || "RESOLVED";
  const updatedResponse = data.response !== undefined ? data.response : null;
  const respondedAt =
    data.response !== undefined && data.response.trim().length > 0
      ? new Date().toISOString()
      : null;

  // Tenant Isolation Guard: Verify target feedback does not belong to another institution in DB
  try {
    const checkDb = await db.feedback.findUnique({
      where: { id: feedbackId },
      select: { id: true, institutionId: true },
    });
    if (checkDb && institutionId && checkDb.institutionId !== institutionId) {
      throw new Error("Unauthorized: Access denied to feedback belonging to another institution.");
    }
  } catch (err: any) {
    if (err.message.includes("Unauthorized")) {
      throw err;
    }
  }

  // Tenant Isolation Guard: Verify target feedback does not belong to another institution on disk
  const persistedCheck = loadAllPersistedFeedbacks().find((f) => f.id === feedbackId);
  if (persistedCheck && institutionId && persistedCheck.institutionId !== institutionId) {
    throw new Error("Unauthorized: Access denied to feedback belonging to another institution.");
  }

  let updatedRecord: any = null;

  try {
    const existing = await db.feedback.findFirst({
      where: {
        id: feedbackId,
        ...(institutionId ? { institutionId } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fullName: true,
            rollNumber: true,
            admissionNumber: true,
          },
        },
      },
    });

    if (existing) {
      const dbUpdatedStatus = data.status || existing.status;
      const dbUpdatedResponse = data.response !== undefined ? data.response : existing.response;
      const dbRespondedAt =
        data.response !== undefined && data.response.trim().length > 0
          ? new Date()
          : existing.respondedAt;

      updatedRecord = await db.feedback.update({
        where: { id: feedbackId },
        data: {
          status: dbUpdatedStatus,
          response: dbUpdatedResponse,
          respondedAt: dbRespondedAt,
        },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              fullName: true,
              rollNumber: true,
              admissionNumber: true,
            },
          },
        },
      });

      // Safely write to audit log
      try {
        await createAuditLog({
          institutionId,
          userId: adminUserId,
          action: "UPDATE_FEEDBACK",
          tableName: "feedback",
          recordId: feedbackId,
          oldValues: { status: existing.status, response: existing.response },
          newValues: { status: dbUpdatedStatus, response: dbUpdatedResponse },
        });
      } catch (auditErr: any) {
        console.warn("Audit logging for feedback update skipped:", auditErr.message);
      }

      // Synchronize matching approval_requests so student/parent portal query tracking reflects resolution
      try {
        const studentId = existing.studentId;
        const matchingRequests = await db.approvalRequest.findMany({
          where: {
            institutionId,
            requestType: "STUDENT_QUERY",
            title: existing.subject,
          },
        });

        for (const req of matchingRequests) {
          let payload: any = {};
          try {
            payload = JSON.parse(req.requestedDataJson || "{}");
          } catch {
            payload = {};
          }
          if (!studentId || payload.studentId === studentId) {
            payload.history = payload.history || [];
            payload.history.push({
              action: "RESPONDED",
              actor: "Administration",
              status: dbUpdatedStatus,
              remarks: dbUpdatedResponse || "",
              timestamp: new Date().toISOString(),
            });
            await db.approvalRequest.update({
              where: { id: req.id },
              data: {
                status: dbUpdatedStatus,
                adminRemarks: dbUpdatedResponse,
                reviewedByUserId: adminUserId || null,
                reviewedAt: dbRespondedAt || new Date(),
                requestedDataJson: JSON.stringify(payload),
              },
            });
          }
        }
      } catch (syncErr: any) {
        console.warn("ApprovalRequest sync note:", syncErr.message);
      }
    }
  } catch (err: any) {
    if (err.message.includes("Unauthorized")) {
      throw err;
    }
    console.warn("Feedback database update bypassed to persistent storage:", err.message);
  }

  // ALWAYS persist resolution to disk so it survives all server restarts
  const diskUpdated = updatePersistedFeedbackStatus(
    feedbackId,
    updatedStatus,
    updatedResponse !== null ? updatedResponse : undefined,
    respondedAt,
    institutionId
  );

  if (!updatedRecord && diskUpdated) {
    updatedRecord = diskUpdated;
  }

  if (!updatedRecord) {
    throw new Error("Feedback record not found.");
  }

  // Mirror across in-memory registry for this institution
  const current = globalFeedbacksRegistry.get(institutionId) || [];
  const updatedList = current.map((f: any) =>
    f.id === feedbackId ? { ...f, status: updatedStatus, response: updatedResponse, respondedAt } : f
  );
  if (!updatedList.some((f: any) => f.id === feedbackId)) {
    updatedList.unshift(updatedRecord);
  }
  globalFeedbacksRegistry.set(institutionId, updatedList);

  return updatedRecord;
}

// ----------------------------------------------------------------------------
// 25. ASSIGNMENTS OVERSIGHT (ADMIN)
// ----------------------------------------------------------------------------
export async function getAdminAssignments(institutionId: string) {
  try {
    const list = await db.assignment.findMany({
      where: { institutionId },
      include: {
        subject: { include: { course: true } },
        submissions: { include: { student: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    let activeStudentsCount = 0;
    try {
      const countRes: any = await db.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM students
        WHERE "institutionId" = ${institutionId}
          AND (status = 'ACTIVE' OR status IS NULL)
      `;
      activeStudentsCount = Number(countRes[0]?.count || 0);
    } catch {
      activeStudentsCount = 0;
    }

    return list.map((a) => {
      const submissions = a.submissions || [];
      const submittedCount = submissions.filter((s) => s.status !== "PENDING").length;
      const gradedCount = submissions.filter((s) => s.status === "GRADED" || s.score !== null).length;
      const isPastDue = new Date() > new Date(a.dueDate);

      return {
        id: a.id,
        institutionId: a.institutionId,
        title: a.title,
        description: a.description,
        subjectId: a.subjectId,
        subjectCode: a.subject?.code || "",
        subjectName: a.subject?.name || "Subject",
        courseName: a.subject?.course?.name || "Class",
        dueDate: a.dueDate,
        totalPoints: a.totalPoints,
        attachmentUrl: a.attachmentUrl,
        totalStudents: activeStudentsCount > 0 ? activeStudentsCount : submissions.length,
        submittedCount,
        gradedCount,
        pendingReviewCount: submittedCount - gradedCount,
        submissionRate: activeStudentsCount > 0 ? Math.round((submittedCount / activeStudentsCount) * 100) : 0,
        status: isPastDue ? "CLOSED" : "ACTIVE",
        createdAt: a.createdAt,
        submissions: submissions.map((s) => ({
          id: s.id,
          studentId: s.studentId,
          rollNumber: s.student?.rollNumber || "01",
          studentName: s.student ? `${s.student.firstName} ${s.student.lastName}`.trim() : "Student",
          submittedAt: s.submittedAt,
          score: s.score,
          feedback: s.feedback,
          status: s.status,
          fileUrl: s.fileUrl,
          textContent: s.textContent,
        })),
      };
    });
  } catch (err: any) {
    console.warn("getAdminAssignments query error:", err.message);
    return [];
  }
}

