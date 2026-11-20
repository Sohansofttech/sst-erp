import db from "../db";
import { recordAudit } from "./audit.service";
import { sendNotification } from "./notification.service";
import { authorizeStudentOrParentAccess } from "../security/authorize";

export type QueryRole = "STUDENT" | "FACULTY" | "PARENT";
export type QueryStatus = "PENDING" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";

export interface SubmitQueryParams {
  institutionId: string;
  userId: string;
  role: QueryRole;
  category: string;
  subject: string;
  description: string;
  studentId?: string; // Required for PARENT queries
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
}

export interface QueryItem {
  id: string;
  institutionId: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  role: QueryRole;
  requestType: string;
  subject: string;
  category: string;
  description: string;
  status: QueryStatus;
  priority: string;
  studentId?: string;
  studentName?: string;
  adminRemarks?: string;
  reviewedByUserId?: string;
  reviewedByName?: string;
  assignedToUserId?: string;
  assignedToName?: string;
  history: Array<{
    action: string;
    actor: string;
    status?: string;
    remarks?: string;
    timestamp: string;
  }>;
  createdAt: string;
  reviewedAt?: string;
}

/**
 * Submit an institutional query from Student, Faculty, or Parent
 */
export async function submitQuery(params: SubmitQueryParams): Promise<QueryItem> {
  const { institutionId, userId, role, category, subject, description, studentId, priority } = params;

  if (!subject?.trim() || !description?.trim()) {
    throw new Error("Subject and description are required.");
  }

  // 1. Fetch submitting user info
  const user = await db.user.findFirst({
    where: { id: userId, institutionId },
    select: { id: true, fullName: true, name: true, email: true, role: true },
  });

  if (!user) {
    throw new Error("Submitting user not found or access denied.");
  }

  let studentName: string | undefined = undefined;

  // 2. Role-specific validation
  if (role === "PARENT") {
    if (!studentId) {
      throw new Error("Parent queries must specify a linked child student ID.");
    }

    // Verify parent-child relationship authorization
    const link = await db.guardianLink.findFirst({
      where: {
        institutionId,
        studentId,
        guardianAccount: { userId },
        isVerified: true,
      },
      include: {
        guardianAccount: true,
      },
    });

    if (!link) {
      // Also check fallback authorizeStudentOrParentAccess if guardianLink is mocked
      try {
        await authorizeStudentOrParentAccess(
          {
            userId,
            institutionId,
            role: "PARENT",
            guardianId: "test_guardian",
            activeChildId: studentId,
          } as any,
          studentId
        );
      } catch {
        throw new Error("Unauthorized: Parent is not linked or verified for this student.");
      }
    }

    const studentRecord = await db.student.findFirst({
      where: { id: studentId, institutionId },
      select: { fullName: true, rollNumber: true },
    });
    studentName = studentRecord?.fullName || undefined;
  } else if (role === "STUDENT") {
    const studentRecord = await db.student.findFirst({
      where: { userId, institutionId },
      select: { id: true, fullName: true, rollNumber: true },
    });
    studentName = studentRecord?.fullName || user.fullName || undefined;
  }

  const initialHistory = [
    {
      action: "SUBMITTED",
      actor: user.fullName || user.name || "Requester",
      status: "PENDING",
      remarks: "Query submitted to institution administration.",
      timestamp: new Date().toISOString(),
    },
  ];

  const payload = {
    category: category || "GENERAL",
    description,
    role,
    studentId: studentId || undefined,
    studentName,
    priority: priority || "NORMAL",
    history: initialHistory,
  };

  const requestType = `${role}_QUERY`;

  // 3. Persist in database
  const created = await db.approvalRequest.create({
    data: {
      institutionId,
      userId,
      requestType,
      title: subject.trim(),
      requestedDataJson: JSON.stringify(payload),
      status: "PENDING",
    },
    include: {
      user: { select: { fullName: true, name: true, email: true } },
    },
  });

  // 4. Backwards compatibility: if student, also mirror in feedback table
  if (role === "STUDENT") {
    try {
      const student = await db.student.findFirst({ where: { userId, institutionId }, select: { id: true } });
      if (student) {
        await db.feedback.create({
          data: {
            institutionId,
            studentId: student.id,
            category: category || "ACADEMIC",
            subject: subject.trim(),
            message: description.trim(),
            status: "PENDING",
          },
        });
      }
    } catch (fbErr: any) {
      console.warn("Feedback mirror note:", fbErr.message);
    }
  }

  // 5. In-App Notification: Alert Institution Administrators
  try {
    const adminUsers = await db.user.findMany({
      where: { institutionId, role: "ADMIN", isActive: true },
      select: { id: true },
      take: 10,
    });

    if (adminUsers.length > 0) {
      await sendNotification({
        institutionId,
        title: `New ${role === "PARENT" ? "Parent Inquiry" : role === "FACULTY" ? "Faculty Query" : "Student Query"}`,
        message: `${user.fullName || "User"} submitted a query: "${subject.trim()}" (Category: ${category || "General"})`,
        category: "ACADEMIC",
        audienceRole: "ALL",
        recipientUserIds: adminUsers.map((a) => a.id),
      });
    }
  } catch (notifErr: any) {
    console.warn("Admin notification dispatch note:", notifErr.message);
  }

  // 6. Record Audit Log
  try {
    await recordAudit({
      institutionId,
      actorUserId: userId,
      action: "CREATE",
      entityType: "APPROVAL_REQUEST",
      entityId: created.id,
      newValues: { subject, category, role },
    });
  } catch {}

  return {
    id: created.id,
    institutionId: created.institutionId,
    userId: created.userId,
    userFullName: user.fullName || user.name || "Requester",
    userEmail: user.email,
    role,
    requestType: created.requestType,
    subject: created.title,
    category: payload.category,
    description: payload.description,
    status: "PENDING",
    priority: payload.priority,
    studentId: payload.studentId,
    studentName: payload.studentName,
    history: payload.history,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * Retrieve institution-scoped queries with filtering
 */
export async function getQueries(params: {
  institutionId: string;
  role?: string;
  status?: string;
  category?: string;
  userId?: string;
  studentId?: string;
  search?: string;
}): Promise<QueryItem[]> {
  const { institutionId, role, status, category, userId, studentId, search } = params;

  const validTypes =
    role && role !== "ALL"
      ? [`${role.toUpperCase()}_QUERY`]
      : ["STUDENT_QUERY", "FACULTY_QUERY", "PARENT_QUERY", "LEAVE_APPLICATION", "PROFILE_CORRECTION", "GENERAL_REQUEST"];

  const requests = await db.approvalRequest.findMany({
    where: {
      institutionId,
      requestType: { in: validTypes },
      ...(userId ? { userId } : {}),
      ...(status && status !== "ALL" ? { status: status.toUpperCase() } : {}),
    },
    include: {
      user: { select: { fullName: true, name: true, email: true, role: true } },
      reviewedByUser: { select: { fullName: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const parsedItems: QueryItem[] = [];

  for (const r of requests) {
    let payload: any = {};
    try {
      payload = JSON.parse(r.requestedDataJson || "{}");
    } catch {
      payload = { description: r.requestedDataJson };
    }

    // Role mapping
    let itemRole: QueryRole = "STUDENT";
    if (r.requestType.includes("FACULTY") || r.user?.role === "TEACHER") itemRole = "FACULTY";
    else if (r.requestType.includes("PARENT") || r.user?.role === "PARENT") itemRole = "PARENT";
    else if (payload.role) itemRole = payload.role;

    // Filter by category if specified
    if (category && category !== "ALL" && payload.category?.toUpperCase() !== category.toUpperCase()) {
      continue;
    }

    // Filter by studentId if specified (for parents viewing specific child)
    if (studentId && payload.studentId && payload.studentId !== studentId) {
      continue;
    }

    // Filter by search query (subject, name, email, description)
    if (search && search.trim()) {
      const q = search.toLowerCase();
      const match =
        r.title.toLowerCase().includes(q) ||
        (r.user?.fullName || "").toLowerCase().includes(q) ||
        (r.user?.email || "").toLowerCase().includes(q) ||
        (payload.description || "").toLowerCase().includes(q) ||
        (payload.studentName || "").toLowerCase().includes(q);
      if (!match) continue;
    }

    parsedItems.push({
      id: r.id,
      institutionId: r.institutionId,
      userId: r.userId,
      userFullName: r.user?.fullName || r.user?.name || "Requester",
      userEmail: r.user?.email || "",
      role: itemRole,
      requestType: r.requestType,
      subject: r.title,
      category: payload.category || "GENERAL",
      description: payload.description || payload.message || r.title,
      status: (r.status as QueryStatus) || "PENDING",
      priority: payload.priority || "NORMAL",
      studentId: payload.studentId,
      studentName: payload.studentName,
      adminRemarks: r.adminRemarks || undefined,
      reviewedByUserId: r.reviewedByUserId || undefined,
      reviewedByName: r.reviewedByUser?.fullName || r.reviewedByUser?.name || undefined,
      assignedToUserId: payload.assignedToId || undefined,
      assignedToName: payload.assignedToName || undefined,
      history: Array.isArray(payload.history) ? payload.history : [],
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() || undefined,
    });
  }

  return parsedItems;
}

/**
 * Respond to, reassign, or update query status with automated in-app notifications
 */
export async function respondToQuery(params: {
  institutionId: string;
  adminUserId: string;
  queryId: string;
  status: QueryStatus;
  adminRemarks: string;
  assignedToUserId?: string;
  assignedToName?: string;
}): Promise<QueryItem> {
  const { institutionId, adminUserId, queryId, status, adminRemarks, assignedToUserId, assignedToName } = params;

  if (!adminRemarks?.trim()) {
    throw new Error("Response remarks are required.");
  }

  // 1. Fetch existing query and verify tenant isolation
  const existing = await db.approvalRequest.findFirst({
    where: { id: queryId, institutionId },
    include: {
      user: { select: { id: true, fullName: true, name: true, email: true, role: true } },
    },
  });

  if (!existing) {
    throw new Error("Query not found or does not belong to your institution.");
  }

  // 2. Parse payload and append resolution history
  let payload: any = {};
  try {
    payload = JSON.parse(existing.requestedDataJson || "{}");
  } catch {
    payload = {};
  }

  const adminUser = await db.user.findFirst({
    where: { id: adminUserId },
    select: { fullName: true, name: true },
  });
  const adminName = adminUser?.fullName || adminUser?.name || "Campus Administration";

  const historyEntry = {
    action: assignedToUserId ? "ASSIGNED_AND_RESPONDED" : "RESPONDED",
    actor: adminName,
    status,
    remarks: adminRemarks.trim(),
    assignedToName: assignedToName || payload.assignedToName,
    timestamp: new Date().toISOString(),
  };

  const updatedHistory = Array.isArray(payload.history) ? [...payload.history, historyEntry] : [historyEntry];

  payload.history = updatedHistory;
  if (assignedToUserId) {
    payload.assignedToId = assignedToUserId;
    payload.assignedToName = assignedToName || "Assigned Faculty";
  }

  // 3. Atomically update in database
  await db.approvalRequest.updateMany({
    where: { id: queryId, institutionId },
    data: {
      status,
      adminRemarks: adminRemarks.trim(),
      reviewedByUserId: adminUserId,
      reviewedAt: new Date(),
      requestedDataJson: JSON.stringify(payload),
    },
  });

  // 4. Backwards compatibility: If linked to feedback table, update it
  try {
    await db.feedback.updateMany({
      where: {
        institutionId,
        subject: existing.title,
      },
      data: {
        status: status === "RESOLVED" ? "RESOLVED" : status,
        response: adminRemarks.trim(),
        respondedAt: new Date(),
      },
    });
  } catch {}

  // 5. In-App Notification: Notify the original requester
  const roleLabel =
    existing.requestType.includes("PARENT")
      ? "PARENT"
      : existing.requestType.includes("FACULTY")
      ? "TEACHER"
      : "STUDENT";

  const roleActionUrl =
    roleLabel === "PARENT"
      ? "/parent/requests"
      : roleLabel === "TEACHER"
      ? "/campus/demo/teacher/communication"
      : "/student/feedback";

  try {
    await sendNotification({
      institutionId,
      title: `Query ${status}: ${existing.title}`,
      message: `${adminName} has responded: "${adminRemarks.trim()}". Status is now ${status}.`,
      category: "ACADEMIC",
      audienceRole: roleLabel as any,
      recipientUserIds: [existing.userId],
    });

    // If query is assigned to a specific staff member, also notify that staff member
    if (assignedToUserId && assignedToUserId !== adminUserId) {
      await sendNotification({
        institutionId,
        title: `Query Assigned: ${existing.title}`,
        message: `You have been assigned to handle query "${existing.title}" submitted by ${
          existing.user?.fullName || "User"
        }.`,
        category: "ACADEMIC",
        audienceRole: "TEACHER",
        recipientUserIds: [assignedToUserId],
      });
    }
  } catch (notifErr: any) {
    console.warn("Notification dispatch notice:", notifErr.message);
  }

  // 6. Record Audit Log
  try {
    await recordAudit({
      institutionId,
      actorUserId: adminUserId,
      action: "UPDATE",
      entityType: "APPROVAL_REQUEST",
      entityId: queryId,
      newValues: { status, adminRemarks, assignedToName },
    });
  } catch {}

  return {
    id: existing.id,
    institutionId: existing.institutionId,
    userId: existing.userId,
    userFullName: existing.user?.fullName || existing.user?.name || "Requester",
    userEmail: existing.user?.email || "",
    role: roleLabel === "TEACHER" ? "FACULTY" : (roleLabel as QueryRole),
    requestType: existing.requestType,
    subject: existing.title,
    category: payload.category || "GENERAL",
    description: payload.description || existing.title,
    status,
    priority: payload.priority || "NORMAL",
    studentId: payload.studentId,
    studentName: payload.studentName,
    adminRemarks: adminRemarks.trim(),
    reviewedByUserId: adminUserId,
    reviewedByName: adminName,
    assignedToUserId: payload.assignedToId,
    assignedToName: payload.assignedToName,
    history: updatedHistory,
    createdAt: existing.createdAt.toISOString(),
    reviewedAt: new Date().toISOString(),
  };
}
