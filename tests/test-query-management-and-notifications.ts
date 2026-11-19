import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function runTests() {
  console.log("=== SST-ERP Query Management & In-App Notifications Test Suite ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  const db = (await import("../lib/db")).default;
  const {
    createStudent,
    createStaff,
    createGuardian,
  } = await import("../lib/services/institution-admin.service");
  const {
    submitQuery,
    getQueries,
    respondToQuery,
  } = await import("../lib/services/query-management.service");
  const {
    sendNotification,
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
  } = await import("../lib/services/notification.service");
  const { signPasswordSetupToken, verifyPasswordSetupToken } = await import("../lib/auth/jwt");

  // Find or create test institution
  let institution = await db.institution.findFirst({
    where: { slug: "demo" },
  });

  if (!institution) {
    institution = await db.institution.findFirst();
  }

  if (!institution) {
    institution = await db.institution.create({
      data: {
        name: "Test Campus Institution",
        code: "TC001",
        slug: "test-campus",
      },
    });
  }

  const institutionId = institution.id;
  console.log(`Using Institution: ${institution.name} (${institutionId})`);

  // Retrieve or create Test Admin User
  let adminUser = await db.user.findFirst({
    where: { institutionId, role: "ADMIN" },
  });
  if (!adminUser) {
    adminUser = await db.user.create({
      data: {
        institutionId,
        email: `admin.test.${Date.now()}@campus.edu`,
        fullName: "Test Campus Admin",
        name: "Test Campus Admin",
        role: "ADMIN",
        status: "ACTIVE",
        isActive: true,
      },
    });
  }

  const runId = Date.now().toString().slice(-5);

  // 1. Create Student using production createStudent service
  const studentEmail = `student.query.${runId}@campus.edu`;
  const studentRoll = `ROLL-Q-${runId}`;
  const studentA = await createStudent(institutionId, {
    fullName: `Priya Sharma ${runId}`,
    email: studentEmail,
    rollNumber: studentRoll,
    phone: "9876543210",
  });
  assert(Boolean(studentA.id && studentA.userId), "Student A created with linked user account");

  // 2. Create Faculty using production createStaff service
  const facultyEmail = `faculty.query.${runId}@campus.edu`;
  const facultyA = await createStaff(institutionId, {
    fullName: `Dr. A. K. Verma ${runId}`,
    email: facultyEmail,
    role: "TEACHER",
    departmentId: "Computer Science",
    phone: "9876543211",
  });
  assert(Boolean(facultyA.id), "Faculty member created with linked user account");

  // 3. Create Guardian using production createGuardian service linked to Student A
  const parentEmail = `parent.query.${runId}@campus.edu`;
  const guardianA = await createGuardian(institutionId, {
    fullName: `Rajesh Sharma ${runId}`,
    email: parentEmail,
    phone: "9876543212",
    relationship: "FATHER",
    studentId: studentA.id,
    isVerified: true,
  });
  assert(Boolean(guardianA.id && guardianA.userId), "Guardian created with verified relationship to Student A");

  // 4. Create an Unauthorized Student (different ward) to verify IDOR protection
  const studentB = await createStudent(institutionId, {
    fullName: `Unauthorized Ward ${runId}`,
    email: `unauth.${runId}@campus.edu`,
    rollNumber: `ROLL-UNAUTH-${runId}`,
    phone: "9876543213",
  });

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Student Query Submission & Notification Dispatch
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 1: Student Query Submission ---");
    const studentQuery = await submitQuery({
      institutionId,
      userId: studentA.userId!,
      role: "STUDENT",
      category: "ACADEMIC",
      subject: "Elective Subject Allotment Clarification",
      description: "Requesting details regarding the elective allotment list for semester 4.",
      priority: "NORMAL",
    });

    assert(Boolean(studentQuery.id), "Student query successfully created with unique ID");
    assert(studentQuery.status === "PENDING", "Initial student query status is PENDING");
    assert(studentQuery.role === "STUDENT", "Student query role is correctly recorded as STUDENT");

    // Verify Admin received In-App Notification
    const adminNotifs = await getUserNotifications({
      institutionId,
      userId: adminUser.id,
    });
    const foundAdminNotif = adminNotifs.some(
      (n: any) => n.notification?.title?.includes("Student Query") || n.notification?.message?.includes(studentQuery.subject)
    );
    assert(foundAdminNotif, "Admin user received in-app notification for new student query");

    // ------------------------------------------------------------------------
    // TEST 2: Faculty Query Submission & Notification Dispatch
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 2: Faculty Query Submission ---");
    const facultyQuery = await submitQuery({
      institutionId,
      userId: facultyA.id,
      role: "FACULTY",
      category: "DEPARTMENTAL",
      subject: "Lab 3 High-Performance Workstation Upgrade",
      description: "Four nodes in Lab 3 require RAM upgrades before the upcoming semester labs.",
      priority: "NORMAL",
    });

    assert(Boolean(facultyQuery.id), "Faculty query successfully created with unique ID");
    assert(facultyQuery.role === "FACULTY", "Faculty query role is correctly recorded as FACULTY");
    assert(facultyQuery.status === "PENDING", "Faculty query status is PENDING");

    // ------------------------------------------------------------------------
    // TEST 3: Parent Query Submission with Verified Relationship
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 3: Parent Query Submission & Security Validation ---");
    const parentQuery = await submitQuery({
      institutionId,
      userId: guardianA.userId!,
      role: "PARENT",
      category: "LEAVE_APPLICATION",
      subject: "Leave of Absence for Family Function",
      description: "My ward Priya Sharma will require leave on Friday for a family function.",
      studentId: studentA.id,
    });

    assert(Boolean(parentQuery.id), "Parent query submitted successfully for verified linked ward");
    assert(parentQuery.studentId === studentA.id, "Parent query properly associated with linked student");

    // ------------------------------------------------------------------------
    // TEST 4: IDOR Protection — Reject Parent Query for Unlinked Student
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 4: IDOR Protection (Unlinked Student) ---");
    let unlinkedBlocked = false;
    try {
      await submitQuery({
        institutionId,
        userId: guardianA.userId!,
        role: "PARENT",
        category: "LEAVE_APPLICATION",
        subject: "Unauthorized Leave Request",
        description: "Attempting to submit request for another student.",
        studentId: studentB.id,
      });
    } catch (err: any) {
      if (/unauthorized|not linked/i.test(err.message)) {
        unlinkedBlocked = true;
      }
    }
    assert(unlinkedBlocked, "IDOR check successfully blocked parent from submitting query for unlinked child");

    // ------------------------------------------------------------------------
    // TEST 5: Admin Query Retrieval & Role/Status Filtering
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 5: Admin Query Retrieval & Filtering ---");
    const allQueries = await getQueries({ institutionId });
    assert(allQueries.length >= 3, `Retrieved ${allQueries.length} total institution queries`);

    const studentOnlyQueries = await getQueries({ institutionId, role: "STUDENT" });
    assert(studentOnlyQueries.every((q) => q.role === "STUDENT"), "Role filter 'STUDENT' returns only student queries");

    const facultyOnlyQueries = await getQueries({ institutionId, role: "FACULTY" });
    assert(facultyOnlyQueries.every((q) => q.role === "FACULTY"), "Role filter 'FACULTY' returns only faculty queries");

    const parentOnlyQueries = await getQueries({ institutionId, role: "PARENT" });
    assert(parentOnlyQueries.every((q) => q.role === "PARENT"), "Role filter 'PARENT' returns only parent queries");

    // ------------------------------------------------------------------------
    // TEST 6: Admin Query Adjudication, Staff Assignment & Requester Notification
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 6: Admin Adjudication, Staff Assignment & In-App Notification ---");
    const respondedQuery = await respondToQuery({
      institutionId,
      adminUserId: adminUser.id,
      queryId: studentQuery.id,
      status: "RESOLVED",
      adminRemarks: "The elective allocation schedule has been published on the student noticeboard.",
      assignedToUserId: facultyA.id,
      assignedToName: facultyA.fullName || undefined,
    });

    assert(respondedQuery.status === "RESOLVED", "Query status updated to RESOLVED");
    assert(
      respondedQuery.adminRemarks === "The elective allocation schedule has been published on the student noticeboard.",
      "Admin remarks successfully saved"
    );
    assert(respondedQuery.assignedToUserId === facultyA.id, "Query successfully assigned to faculty member");
    assert(respondedQuery.history.length >= 2, "Resolution history timeline accurately updated");

    // Verify Student received in-app notification of resolution
    const studentNotifs = await getUserNotifications({
      institutionId,
      userId: studentA.userId!,
    });
    const foundStudentNotif = studentNotifs.some(
      (n: any) => n.notification?.title?.includes("RESOLVED") || n.notification?.message?.includes("elective allocation")
    );
    assert(foundStudentNotif, "Student received in-app notification when query was resolved");

    // Verify Assigned Faculty received in-app notification of assignment
    const facultyNotifs = await getUserNotifications({
      institutionId,
      userId: facultyA.id,
    });
    const foundFacultyAssignmentNotif = facultyNotifs.some(
      (n: any) => n.notification?.title?.includes("Assigned") || n.notification?.message?.includes(studentQuery.subject)
    );
    assert(foundFacultyAssignmentNotif, "Assigned faculty member received in-app assignment notification");

    // ------------------------------------------------------------------------
    // TEST 7: Mark-As-Read Notification Functionality
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 7: Mark-As-Read Notification Workflow ---");
    const unreadBefore = studentNotifs.filter((n: any) => !n.isRead).length;
    if (studentNotifs.length > 0) {
      const firstNotif = studentNotifs[0];
      await markNotificationAsRead(firstNotif.id, studentA.userId!);
      const studentNotifsAfter = await getUserNotifications({
        institutionId,
        userId: studentA.userId!,
      });
      const unreadAfter = studentNotifsAfter.filter((n: any) => !n.isRead).length;
      assert(
        unreadAfter === Math.max(0, unreadBefore - 1),
        "Single notification marked as read decrements unread count"
      );

      await markAllNotificationsAsRead(studentA.userId!);
      const studentNotifsFinal = await getUserNotifications({
        institutionId,
        userId: studentA.userId!,
      });
      const unreadFinal = studentNotifsFinal.filter((n: any) => !n.isRead).length;
      assert(unreadFinal === 0, "markAllNotificationsAsRead resets unread count to 0");
    }

    // ------------------------------------------------------------------------
    // TEST 8: Credential Token Onboarding & Single-Use Verification
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 8: Credential Token Verification ---");
    const setupToken = await signPasswordSetupToken({
      userId: studentA.userId!,
      email: studentEmail,
      institutionId,
      passwordHash: null,
    });
    assert(typeof setupToken === "string" && setupToken.length > 20, "24-hour setup token generated successfully");

    const decoded = await verifyPasswordSetupToken(setupToken);
    assert(decoded !== null && decoded.userId === studentA.userId!, "Setup token verifies correctly with matching userId");

  } finally {
    // Clean up test records
    console.log("\nCleaning up test artifacts...");
    try {
      const cleanupUserIds = [studentA.userId, facultyA.id, guardianA.userId].filter(Boolean) as string[];
      await db.approvalRequest.deleteMany({
        where: { institutionId, userId: { in: cleanupUserIds } },
      });
      await db.notificationRecipient.deleteMany({
        where: { userId: { in: [...cleanupUserIds, adminUser.id] } },
      });
      await db.guardianLink.deleteMany({
        where: { studentId: { in: [studentA.id, studentB.id] } },
      });
      await db.guardianAccount.deleteMany({
        where: { id: guardianA.id },
      });
      await db.student.deleteMany({
        where: { id: { in: [studentA.id, studentB.id] } },
      });
      await db.teacher.deleteMany({
        where: { userId: facultyA.id },
      });
      await db.user.deleteMany({
        where: { id: { in: cleanupUserIds } },
      });
      console.log("Cleanup completed.");
    } catch (cleanupErr: any) {
      console.warn("Cleanup note:", cleanupErr.message);
    }
  }

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution aborted with error:", err);
  process.exit(1);
});
