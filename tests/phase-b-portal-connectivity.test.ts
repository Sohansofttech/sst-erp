import assert from "node:assert";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import db from "../lib/db";
import { signToken, computePasswordSignature } from "../lib/auth/jwt";
import { SessionUser } from "../types";
import { GET as getExaminations } from "../app/api/student/examinations/route";
import { GET as getAssessments } from "../app/api/student/internal-assessments/route";
import { GET as getStudentLeave, POST as postStudentLeave } from "../app/api/student/leave/route";
import { GET as getParentRequests, POST as postParentRequests } from "../app/api/parent/requests/route";
import {
  getStudentLeaveRequests,
  reviewStudentLeaveRequest,
  createAnnouncement,
} from "../lib/services/teacher.service";
import { createDbSessionRecord, signTeacherSession } from "../lib/auth/teacher-session";

async function runPhaseBPortalConnectivityTests() {
  console.log("==================================================================");
  console.log("PHASE B — PORTAL CONNECTIVITY & AUTHORIZATION REMEDIATION TESTS");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  const cleanupIds = {
    users: [] as string[],
    guardians: [] as string[],
    guardianLinks: [] as string[],
    approvalRequests: [] as string[],
    attendanceRecords: [] as string[],
    assessmentRecords: [] as string[],
    notifications: [] as string[],
    sessions: [] as string[],
  };

  try {
    const runId = Date.now().toString().slice(-6);

    // 1. Resolve Institution Alpha with Teacher and Active Student
    const instAlpha = await db.institution.findFirst({
      where: {
        teachers: { some: { user: { isActive: true } } },
        students: { some: { user: { isActive: true } } },
      },
      include: {
        teachers: { where: { user: { isActive: true } }, include: { user: true }, take: 1 },
        students: { where: { user: { isActive: true } }, include: { user: true, enrollments: true }, take: 1 },
      },
    });

    assert.ok(instAlpha, "Must find Institution Alpha with teachers and active students");
    const teacherAlpha = instAlpha.teachers[0];
    const studentA = instAlpha.students[0];
    const userStudentA = studentA.user;
    assert.ok(teacherAlpha && studentA && userStudentA, "Teacher and student must exist in Alpha");

    console.log(`Institution Alpha: ${instAlpha.name} (${instAlpha.id})`);
    console.log(`  Student Alpha: ${studentA.firstName} ${studentA.lastName} (${studentA.id})`);
    console.log(`  Teacher Alpha: ${teacherAlpha.user.fullName || teacherAlpha.user.name} (${teacherAlpha.id})`);

    // 2. Resolve Institution Beta with distinct Active Student
    const instBeta = await db.institution.findFirst({
      where: {
        id: { not: instAlpha.id },
        students: { some: { user: { isActive: true } } },
      },
      include: {
        students: { where: { user: { isActive: true } }, include: { user: true }, take: 1 },
      },
    });

    assert.ok(instBeta, "Must find Institution Beta with student");
    const studentB = instBeta.students[0];
    const userStudentB = studentB.user;
    assert.ok(studentB && userStudentB, "Student must exist in Beta");

    console.log(`Institution Beta: ${instBeta.name} (${instBeta.id})`);
    console.log(`  Student Beta: ${studentB.firstName} ${studentB.lastName} (${studentB.id})\n`);

    const defaultPasswordHash = "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789";
    const passwordSig = computePasswordSignature(defaultPasswordHash);

    // Helper: Create a real parent user in DB
    async function createTestParentUser(institutionId: string, emailPrefix: string) {
      const u = await db.user.create({
        data: {
          id: crypto.randomUUID(),
          email: `${emailPrefix}-${runId}-${crypto.randomUUID().slice(0, 4)}@test.com`,
          name: `Test ${emailPrefix}`,
          fullName: `Test ${emailPrefix}`,
          role: "PARENT",
          institutionId,
          passwordHash: defaultPasswordHash,
          isActive: true,
          status: "ACTIVE",
        },
      });
      cleanupIds.users.push(u.id);
      return u;
    }

    // Helper: Create Session Token
    async function createToken(u: any, extra: Partial<SessionUser> = {}) {
      const payload: SessionUser = {
        userId: u.id,
        email: u.email,
        fullName: u.fullName || u.name,
        role: u.role,
        institutionId: u.institutionId,
        institutionName: "Test Institution",
        passwordSig,
        ...extra,
      };
      return await signToken(payload);
    }

    // Setup Parent A in Alpha linked to Student A
    const userParentA = await createTestParentUser(instAlpha.id, "parent-alpha");
    const guardianAccountA = await db.guardianAccount.create({
      data: {
        id: crypto.randomUUID(),
        institutionId: instAlpha.id,
        userId: userParentA.id,
        fullName: "Alpha Parent Guardian",
        phone: "+91 99999 11111",
        relationship: "FATHER",
      },
    });
    cleanupIds.guardians.push(guardianAccountA.id);

    const guardianLinkA = await db.guardianLink.create({
      data: {
        id: crypto.randomUUID(),
        institutionId: instAlpha.id,
        guardianAccountId: guardianAccountA.id,
        studentId: studentA.id,
        relationship: "FATHER",
        isVerified: true,
        canAccessPortal: true,
        isPrimary: true,
      },
    });
    cleanupIds.guardianLinks.push(guardianLinkA.id);

    // Setup Parent B in Beta linked to Student B
    const userParentB = await createTestParentUser(instBeta.id, "parent-beta");
    const guardianAccountB = await db.guardianAccount.create({
      data: {
        id: crypto.randomUUID(),
        institutionId: instBeta.id,
        userId: userParentB.id,
        fullName: "Beta Parent Guardian",
        phone: "+91 88888 22222",
        relationship: "MOTHER",
      },
    });
    cleanupIds.guardians.push(guardianAccountB.id);

    const guardianLinkB = await db.guardianLink.create({
      data: {
        id: crypto.randomUUID(),
        institutionId: instBeta.id,
        guardianAccountId: guardianAccountB.id,
        studentId: studentB.id,
        relationship: "MOTHER",
        isVerified: true,
        canAccessPortal: true,
        isPrimary: true,
      },
    });
    cleanupIds.guardianLinks.push(guardianLinkB.id);

    // Setup Teacher Session in DB for Teacher Alpha
    const teacherSessionToken = await signTeacherSession({
      userId: teacherAlpha.userId,
      teacherId: teacherAlpha.id,
      institutionId: instAlpha.id,
      institutionSlug: instAlpha.slug || instAlpha.code || "inst-slug",
      email: teacherAlpha.user.email,
      fullName: teacherAlpha.user.fullName || "Faculty Member",
      employeeId: teacherAlpha.employeeId,
      designation: teacherAlpha.designation,
      department: teacherAlpha.department,
      activeRole: "teacher",
      availableRoles: ["teacher"],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86400_000,
      lastActivity: Date.now(),
    });
    const teacherSessionHash = crypto.createHash("sha256").update(teacherSessionToken).digest("hex");
    const teacherSessionId = `tsess-${crypto.randomUUID()}`;
    cleanupIds.sessions.push(teacherSessionId);

    await createDbSessionRecord({
      id: teacherSessionId,
      tokenHash: teacherSessionHash,
      userId: teacherAlpha.userId,
      institutionId: instAlpha.id,
      activeRole: "teacher",
      expiresAt: new Date(Date.now() + 86400_000),
    });

    process.env.TEST_TEACHER_SESSION_TOKEN = teacherSessionToken;

    // JWT Tokens
    const studentUserSig = computePasswordSignature(userStudentA.passwordHash || defaultPasswordHash);
    const studentAToken = await signToken({
      userId: userStudentA.id,
      email: userStudentA.email,
      fullName: userStudentA.fullName || userStudentA.name || "Student",
      role: "STUDENT",
      institutionId: instAlpha.id,
      institutionName: instAlpha.name,
      studentId: studentA.id,
      passwordSig: studentUserSig,
    });

    const parentAToken = await createToken(userParentA, {
      guardianId: guardianAccountA.id,
      activeChildId: studentA.id,
    });

    const parentBToken = await createToken(userParentB, {
      guardianId: guardianAccountB.id,
      activeChildId: studentB.id,
    });

    // =========================================================================
    // TEST B1: Parent Results Authorization (Fix 403)
    // =========================================================================
    console.log("--- [B1] Parent Results Authorization ---");
    {
      // B1.1: Parent A requests results for linked child Student A -> Must return 200 (not 403!)
      const req = new NextRequest(`http://localhost:3000/api/student/examinations?studentId=${studentA.id}`, {
        headers: { authorization: `Bearer ${parentAToken}` },
      });
      const res = await getExaminations(req);
      assert.strictEqual(res.status, 200, `Parent accessing linked child results must return 200. Got: ${res.status}`);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      console.log("PASS B1.1: Parent accessing linked child examination results returns 200 OK.");
      passed++;

      // B1.2: Parent A requests results for unlinked Student B in Beta -> Must return 403 Forbidden
      const unauthReq = new NextRequest(`http://localhost:3000/api/student/examinations?studentId=${studentB.id}`, {
        headers: { authorization: `Bearer ${parentAToken}` },
      });
      const unauthRes = await getExaminations(unauthReq);
      assert.strictEqual(unauthRes.status, 403, `Parent accessing unlinked/cross-tenant child must return 403. Got: ${unauthRes.status}`);
      console.log("PASS B1.2: Cross-institution parent examination access strictly blocked with 403 Forbidden.");
      passed++;
    }

    // =========================================================================
    // TEST B2: Student Leave Workflow
    // =========================================================================
    console.log("\n--- [B2] Student Leave Workflow ---");
    let studentLeaveReqId = "";
    {
      // B2.1: Student A submits leave request via POST /api/student/leave
      const req = new NextRequest("http://localhost:3000/api/student/leave", {
        method: "POST",
        headers: {
          authorization: `Bearer ${studentAToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          studentId: studentA.id,
          fromDate: "2026-12-01",
          toDate: "2026-12-03",
          leaveType: "Medical",
          reason: "Fever and doctor advised rest",
        }),
      });
      const res = await postStudentLeave(req);
      const data = await res.json();
      if (res.status !== 200) {
        console.error("Student leave submission failed:", res.status, data);
      }
      assert.strictEqual(res.status, 200, `Student leave submission must return 200. Got: ${res.status}`);
      assert.strictEqual(data.success, true);
      assert.ok(data.data.id, "Must return created approval request ID");
      studentLeaveReqId = data.data.id;
      cleanupIds.approvalRequests.push(studentLeaveReqId);

      // Verify recorded in approval_requests with requestType: STUDENT_LEAVE
      const dbRecord = await db.approvalRequest.findUnique({ where: { id: studentLeaveReqId } });
      assert.ok(dbRecord, "Record must exist in approval_requests table");
      assert.strictEqual(dbRecord.requestType, "STUDENT_LEAVE", "requestType must be STUDENT_LEAVE");
      assert.strictEqual(dbRecord.status, "PENDING", "Status must be PENDING");
      assert.strictEqual(dbRecord.institutionId, instAlpha.id, "Must be bounded to Alpha");
      console.log("PASS B2.1: Student leave submitted and persisted to approval_requests with requestType STUDENT_LEAVE.");
      passed++;

      // B2.2: Student A queries leave requests via GET /api/student/leave
      const getReq = new NextRequest(`http://localhost:3000/api/student/leave?studentId=${studentA.id}`, {
        headers: { authorization: `Bearer ${studentAToken}` },
      });
      const getRes = await getStudentLeave(getReq);
      assert.strictEqual(getRes.status, 200);
      const getData = await getRes.json();
      assert.strictEqual(getData.success, true);
      const found = getData.data.find((item: any) => item.id === studentLeaveReqId);
      assert.ok(found, "Student must see their submitted leave request");
      assert.strictEqual(found.status, "pending");
      console.log("PASS B2.2: Student leave request visible to student with status pending.");
      passed++;

      // B2.3: Inverted date range (fromDate > toDate) must be rejected with 400
      const invReq = new NextRequest("http://localhost:3000/api/student/leave", {
        method: "POST",
        headers: {
          authorization: `Bearer ${studentAToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          studentId: studentA.id,
          fromDate: "2026-12-05",
          toDate: "2026-12-01",
          leaveType: "Medical",
          reason: "Invalid dates test",
        }),
      });
      const invRes = await postStudentLeave(invReq);
      assert.strictEqual(invRes.status, 400, "Inverted date range must return 400");
      console.log("PASS B2.3: Inverted leave date range rejected with 400 Bad Request.");
      passed++;

      // B2.4: IDOR Protection: Student A cannot submit leave for Student B
      const idorReq = new NextRequest("http://localhost:3000/api/student/leave", {
        method: "POST",
        headers: {
          authorization: `Bearer ${studentAToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          studentId: studentB.id,
          fromDate: "2026-12-01",
          toDate: "2026-12-02",
          leaveType: "Medical",
          reason: "IDOR test",
        }),
      });
      const idorRes = await postStudentLeave(idorReq);
      assert.strictEqual(idorRes.status, 403, "Student attempting IDOR on another student must return 403");
      console.log("PASS B2.4: IDOR attempt on another student rejected with 403 Forbidden.");
      passed++;
    }

    // =========================================================================
    // TEST B3: Parent Leave Workflow
    // =========================================================================
    console.log("\n--- [B3] Parent Leave Workflow ---");
    let parentLeaveReqId = "";
    {
      // B3.1: Parent A submits leave for linked Student A via POST /api/parent/requests
      const req = new NextRequest("http://localhost:3000/api/parent/requests", {
        method: "POST",
        headers: {
          authorization: `Bearer ${parentAToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          studentId: studentA.id,
          requestType: "LEAVE_APPLICATION",
          title: "Medical Leave for AlphaChild",
          message: "AlphaChild has high fever and will miss school for two days",
          fromDate: "2026-12-04",
          toDate: "2026-12-05",
        }),
      });
      const res = await postParentRequests(req);
      assert.strictEqual(res.status, 200, `Parent leave submission must return 200. Got: ${res.status}`);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.data.id, "Must return created request ID");
      parentLeaveReqId = data.data.id;
      cleanupIds.approvalRequests.push(parentLeaveReqId);

      // Verify persisted to approval_requests with requestType: STUDENT_LEAVE
      const dbReq = await db.approvalRequest.findUnique({ where: { id: parentLeaveReqId } });
      assert.ok(dbReq, "Must exist in approval_requests");
      assert.strictEqual(dbReq.requestType, "STUDENT_LEAVE", "Parent leave must be stored as STUDENT_LEAVE");
      assert.strictEqual(dbReq.status, "PENDING", "Must be PENDING");
      console.log("PASS B3.1: Parent-submitted leave routes directly to approval_requests with requestType STUDENT_LEAVE.");
      passed++;

      // B3.2: Parent A queries requests via GET /api/parent/requests
      const getReq = new NextRequest(`http://localhost:3000/api/parent/requests?studentId=${studentA.id}`, {
        headers: { authorization: `Bearer ${parentAToken}` },
      });
      const getRes = await getParentRequests(getReq);
      assert.strictEqual(getRes.status, 200);
      const getData = await getRes.json();
      assert.strictEqual(getData.success, true);
      const found = getData.data.find((item: any) => item.id === parentLeaveReqId);
      assert.ok(found, "Parent must see their submitted leave in request history");
      assert.strictEqual(found.status, "PENDING");
      console.log("PASS B3.2: Parent sees leave request with live status PENDING.");
      passed++;

      // B3.3: Cross-tenant / unlinked parent attempt to submit leave for Student B
      const crossReq = new NextRequest("http://localhost:3000/api/parent/requests", {
        method: "POST",
        headers: {
          authorization: `Bearer ${parentAToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          studentId: studentB.id,
          requestType: "LEAVE_APPLICATION",
          title: "Cross-tenant unauthorized leave",
          message: "Should be blocked",
        }),
      });
      const crossRes = await postParentRequests(crossReq);
      assert.strictEqual(crossRes.status, 403, "Parent cannot submit leave for unlinked student");
      console.log("PASS B3.3: Cross-tenant and unlinked parent leave submission blocked with 403 Forbidden.");
      passed++;
    }

    // =========================================================================
    // TEST B4: Teacher Leave Review & Attendance Hardening
    // =========================================================================
    console.log("\n--- [B4] Teacher Leave Review & Attendance Hardening ---");
    {
      // B4.1: Teacher sees pending leaves (both student-submitted and parent-submitted)
      const pendingLeaves = await getStudentLeaveRequests("pending");
      const foundStudentLeave = pendingLeaves.find((l) => l.id === studentLeaveReqId);
      const foundParentLeave = pendingLeaves.find((l) => l.id === parentLeaveReqId);
      assert.ok(foundStudentLeave, "Teacher must see student-submitted leave in pending list");
      assert.ok(foundParentLeave, "Teacher must see parent-submitted leave in pending list");
      console.log("PASS B4.1: Teacher views both student-submitted and parent-submitted leave requests.");
      passed++;

      // Setup 3 attendance records for Student A:
      // Day 1: 2026-12-01 (ABSENT) - in studentLeave range
      // Day 2: 2026-12-02 (ABSENT) - in studentLeave range
      // Day 3: 2026-12-10 (ABSENT) - outside range
      const sampleSubject = await db.subject.findFirst({ where: { institutionId: instAlpha.id } }) || await db.subject.findFirst();
      let enrollmentA = (studentA as any).enrollments?.[0] ||
        await db.enrollment.findFirst({ where: { studentId: studentA.id } });

      if (!enrollmentA) {
        const defaultCourse = await db.course.findFirst({ where: { institutionId: instAlpha.id } }) || await db.course.findFirst();
        const defaultAy = await db.academicYear.findFirst({ where: { institutionId: instAlpha.id } }) || await db.academicYear.findFirst();
        const newEnrId = crypto.randomUUID();
        enrollmentA = await db.enrollment.create({
          data: {
            id: newEnrId,
            institutionId: instAlpha.id,
            studentId: studentA.id,
            courseId: defaultCourse?.id || "course-default",
            academicYearId: defaultAy?.id || "ay-default",
            semester: 1,
            section: "A",
            status: "ACTIVE",
          },
        });
      }

      const att1 = await db.attendanceRecord.create({
        data: {
          id: crypto.randomUUID(),
          institutionId: instAlpha.id,
          studentId: studentA.id,
          enrollmentId: enrollmentA.id,
          subjectId: sampleSubject!.id,
          date: new Date("2026-12-01T10:00:00Z"),
          status: "ABSENT",
        },
      });
      const att2 = await db.attendanceRecord.create({
        data: {
          id: crypto.randomUUID(),
          institutionId: instAlpha.id,
          studentId: studentA.id,
          enrollmentId: enrollmentA.id,
          subjectId: sampleSubject!.id,
          date: new Date("2026-12-02T10:00:00Z"),
          status: "ABSENT",
        },
      });
      const att3 = await db.attendanceRecord.create({
        data: {
          id: crypto.randomUUID(),
          institutionId: instAlpha.id,
          studentId: studentA.id,
          enrollmentId: enrollmentA.id,
          subjectId: sampleSubject!.id,
          date: new Date("2026-12-10T10:00:00Z"),
          status: "ABSENT",
        },
      });
      cleanupIds.attendanceRecords.push(att1.id, att2.id, att3.id);

      // B4.2: Teacher approves student leave request
      const reviewRes = await reviewStudentLeaveRequest(
        studentLeaveReqId,
        "approved",
        "Approved by Class Teacher"
      );
      assert.strictEqual(reviewRes.status, "approved");

      // Verify approval_requests status updated to APPROVED
      const updatedApproval = await db.approvalRequest.findUnique({ where: { id: studentLeaveReqId } });
      assert.strictEqual(updatedApproval?.status, "APPROVED");

      // Verify attendance records within range [2026-12-01, 2026-12-03] updated to PRESENT
      const updatedAtt1 = await db.attendanceRecord.findUnique({ where: { id: att1.id } });
      const updatedAtt2 = await db.attendanceRecord.findUnique({ where: { id: att2.id } });
      const updatedAtt3 = await db.attendanceRecord.findUnique({ where: { id: att3.id } });

      assert.strictEqual(updatedAtt1?.status, "PRESENT", "Day 1 (in range) must be updated to PRESENT");
      assert.ok(updatedAtt1?.remarks?.includes("On-Duty / Leave Approved"));
      assert.strictEqual(updatedAtt2?.status, "PRESENT", "Day 2 (in range) must be updated to PRESENT");
      assert.strictEqual(updatedAtt3?.status, "ABSENT", "Day 3 (outside range) must remain ABSENT");
      console.log("PASS B4.2: Teacher approved student leave; attendance strictly updated within date range.");
      passed++;

      // B4.3: Teacher rejects parent leave request
      const rejectRes = await reviewStudentLeaveRequest(
        parentLeaveReqId,
        "rejected",
        "Rejected due to exam on that day"
      );
      assert.strictEqual(rejectRes.status, "rejected");

      const rejectedApproval = await db.approvalRequest.findUnique({ where: { id: parentLeaveReqId } });
      assert.strictEqual(rejectedApproval?.status, "REJECTED");
      console.log("PASS B4.3: Teacher rejected parent leave; status updated to REJECTED.");
      passed++;

      // B4.4: IDOR Protection: Cannot review request from another institution
      const crossInstLeave = await db.approvalRequest.create({
        data: {
          id: crypto.randomUUID(),
          institutionId: instBeta.id,
          userId: userStudentB.id,
          requestType: "STUDENT_LEAVE",
          title: "Beta leave",
          status: "PENDING",
          requestedDataJson: JSON.stringify({
            studentId: studentB.id,
            fromDate: "2026-12-01",
            toDate: "2026-12-02",
            reason: "Beta reason",
          }),
        },
      });
      cleanupIds.approvalRequests.push(crossInstLeave.id);

      try {
        await reviewStudentLeaveRequest(crossInstLeave.id, "approved");
        assert.fail("Should have rejected cross-institution leave review");
      } catch (err: any) {
        assert.ok(
          err.message.includes("not found in this institution") || err.message.includes("Tenant violation"),
          `Expected cross-institution rejection. Got: ${err.message}`
        );
        console.log("PASS B4.4: Teacher cross-institution leave review blocked with tenant error.");
        passed++;
      }
    }

    // =========================================================================
    // TEST B5: Internal Assessments — Published Only
    // =========================================================================
    console.log("\n--- [B5] Internal Assessments (Published Only) ---");
    {
      const sampleSubject = await db.subject.findFirst({ where: { institutionId: instAlpha.id } });
      const subjId = sampleSubject?.id || crypto.randomUUID();
      const enrollmentA = (studentA as any).enrollments?.[0] || await db.enrollment.findFirst({ where: { studentId: studentA.id } });
      assert.ok(enrollmentA, "Student A enrollment must exist");

      // Assessment 1: Draft (unpublished)
      const draftIa = await db.assessmentRecord.create({
        data: {
          id: crypto.randomUUID(),
          institution: { connect: { id: instAlpha.id } },
          student: { connect: { id: studentA.id } },
          enrollment: { connect: { id: enrollmentA.id } },
          subject: { connect: { id: subjId } },
          assessmentName: `Draft Quiz-${runId}`,
          marksObtained: 18,
          maxMarks: 25,
          weightage: 10,
          remarks: "DRAFT Internal Assessment",
          conductedDate: new Date(),
        },
      });
      cleanupIds.assessmentRecords.push(draftIa.id);

      // Assessment 2: Published (has an APPROVED approval_requests entry)
      const pubIa = await db.assessmentRecord.create({
        data: {
          id: crypto.randomUUID(),
          institution: { connect: { id: instAlpha.id } },
          student: { connect: { id: studentA.id } },
          enrollment: { connect: { id: enrollmentA.id } },
          subject: { connect: { id: subjId } },
          assessmentName: `Midterm IA-${runId}`,
          marksObtained: 23,
          maxMarks: 25,
          weightage: 10,
          remarks: "Approved and finalized",
          conductedDate: new Date(),
        },
      });
      cleanupIds.assessmentRecords.push(pubIa.id);

      const pubApproval = await db.approvalRequest.create({
        data: {
          id: crypto.randomUUID(),
          institutionId: instAlpha.id,
          userId: teacherAlpha.userId,
          requestType: "INTERNAL_ASSESSMENT",
          title: `Midterm IA-${runId}`,
          status: "APPROVED",
          requestedDataJson: JSON.stringify({
            assessmentId: pubIa.id,
            assessmentName: `Midterm IA-${runId}`,
          }),
        },
      });
      cleanupIds.approvalRequests.push(pubApproval.id);

      // Query GET /api/student/internal-assessments for Student A
      const req = new NextRequest(`http://localhost:3000/api/student/internal-assessments?studentId=${studentA.id}`, {
        headers: { authorization: `Bearer ${studentAToken}` },
      });
      const res = await getAssessments(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Find assessments in response
      const allReturnedIas = data.data.assessments || [];

      const hasDraft = allReturnedIas.some((ia: any) => ia.id === draftIa.id);
      const hasPublished = allReturnedIas.some((ia: any) => ia.id === pubIa.id);

      assert.strictEqual(hasDraft, false, "Draft assessment MUST NOT appear in student assessment response");
      assert.strictEqual(hasPublished, true, "Published assessment MUST appear in student assessment response");
      console.log("PASS B5.1: Database-level filtering successfully hides draft IAs and shows published IAs.");
      passed++;
    }

    // =========================================================================
    // TEST B6: Teacher Announcements to Students and Parents
    // =========================================================================
    console.log("\n--- [B6] Teacher Announcements to Students and Parents ---");
    {
      const ann = await createAnnouncement({
        title: `School Sports Day Announcement-${runId}`,
        content: "Annual sports day will be held on December 15. All students and parents are invited.",
        audience: "Class & Parents",
      });
      assert.ok(ann.id, "Announcement must return created ID");
      cleanupIds.notifications.push(ann.id);

      // Query notification recipients for this announcement
      const recipients = await db.notificationRecipient.findMany({
        where: { notificationId: ann.id },
      });

      const recipientUserIds = new Set(recipients.map((r) => r.userId));

      // 1. Must include teacher author
      assert.ok(recipientUserIds.has(teacherAlpha.userId), "Must include teacher author");
      // 2. Must include target student
      assert.ok(recipientUserIds.has(userStudentA.id), "Must include target student");
      // 3. Must include linked parent
      assert.ok(recipientUserIds.has(userParentA.id), "Must include linked parent");

      // 4. Must NOT include Beta student or Beta parent (tenant isolation)
      assert.strictEqual(recipientUserIds.has(userStudentB.id), false, "Beta student must NOT receive Alpha announcement");
      assert.strictEqual(recipientUserIds.has(userParentB.id), false, "Beta parent must NOT receive Alpha announcement");

      console.log("PASS B6.1: Teacher announcement created notificationRecipient records for author, students, and linked parents with tenant isolation.");
      passed++;
    }

    // =========================================================================
    // TEST B7: Multi-Tenant & Cross-Institution Authorization Summary
    // =========================================================================
    console.log("\n--- [B7] Cross-Institution Authorization Verification ---");
    {
      // Parent B cannot view Student A results
      const res1 = await getExaminations(
        new NextRequest(`http://localhost:3000/api/student/examinations?studentId=${studentA.id}`, {
          headers: { authorization: `Bearer ${parentBToken}` },
        })
      );
      assert.strictEqual(res1.status, 403);

      // Parent B cannot view Student A leave
      const res2 = await getStudentLeave(
        new NextRequest(`http://localhost:3000/api/student/leave?studentId=${studentA.id}`, {
          headers: { authorization: `Bearer ${parentBToken}` },
        })
      );
      assert.strictEqual(res2.status, 403);

      console.log("PASS B7.1: Cross-institution access strictly blocked with 403 Forbidden across examinations and leave.");
      passed++;
    }

  } catch (err: any) {
    console.error("\nTEST FAILED WITH ERROR:", err);
    failed++;
  } finally {
    console.log("\n--- Cleaning up temporary test records ---");
    if (cleanupIds.sessions.length > 0) {
      await db.teacherPortalSession.deleteMany({ where: { id: { in: cleanupIds.sessions } } }).catch(() => {});
    }
    if (cleanupIds.notifications.length > 0) {
      await db.notificationRecipient.deleteMany({ where: { notificationId: { in: cleanupIds.notifications } } }).catch(() => {});
      await db.notification.deleteMany({ where: { id: { in: cleanupIds.notifications } } }).catch(() => {});
    }
    if (cleanupIds.assessmentRecords.length > 0) {
      await db.assessmentRecord.deleteMany({ where: { id: { in: cleanupIds.assessmentRecords } } }).catch(() => {});
    }
    if (cleanupIds.attendanceRecords.length > 0) {
      await db.attendanceRecord.deleteMany({ where: { id: { in: cleanupIds.attendanceRecords } } }).catch(() => {});
    }
    if (cleanupIds.approvalRequests.length > 0) {
      await db.approvalRequest.deleteMany({ where: { id: { in: cleanupIds.approvalRequests } } }).catch(() => {});
    }
    if (cleanupIds.guardianLinks.length > 0) {
      await db.guardianLink.deleteMany({ where: { id: { in: cleanupIds.guardianLinks } } }).catch(() => {});
    }
    if (cleanupIds.guardians.length > 0) {
      await db.guardianAccount.deleteMany({ where: { id: { in: cleanupIds.guardians } } }).catch(() => {});
    }
    if (cleanupIds.users.length > 0) {
      await db.user.deleteMany({ where: { id: { in: cleanupIds.users } } }).catch(() => {});
    }
    console.log("Cleanup completed.");
  }

  console.log("\n==================================================================");
  console.log(`PHASE B TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhaseBPortalConnectivityTests()
  .catch((e) => {
    console.error("Unhandled error in test runner:", e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
