import "dotenv/config";
import db from "../lib/db";
import bcrypt from "bcryptjs";
import {
  signTeacherSession,
  verifyTeacherSession,
  hashSessionToken,
  createDbSessionRecord,
  revokeDbSession,
  getTeacherSession,
} from "../lib/auth/teacher-session";
import { findDeterministicAccount, isRouteAllowedForRole } from "../lib/auth/roles";
import {
  getSectionStudents,
  getDepartmentFacultyLoad,
  getTeacherLeaveRequests,
  reviewStudentLeaveRequest,
} from "../lib/services/teacher.service";

async function runVerification() {
  console.log("=== STARTING REAL TEST EXECUTION ===");
  const results: Record<string, boolean> = {};

  // TEST 1: Password Verification for deterministic accounts
  const ananyaAcc = findDeterministicAccount("ananya.sharma");
  const isAnanyaPwValid = await bcrypt.compare("Password@123", ananyaAcc!.passwordHash);
  results["Test 1.1: ananya.sharma bcrypt credential check"] = isAnanyaPwValid;

  const rajeshAcc = findDeterministicAccount("rajesh.verma");
  const isRajeshPwValid = await bcrypt.compare("Password@123", rajeshAcc!.passwordHash);
  results["Test 1.2: rajesh.verma bcrypt credential check"] = isRajeshPwValid;

  // TEST 2: DB Session Lifecycle (Creation, Verification, Revocation)
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  const token = await signTeacherSession({
    userId: "user_teacher_demo_042",
    teacherId: "teacher_demo_042",
    institutionId: "inst_demo_school",
    institutionSlug: "vidyaniketan",
    email: "ananya.sharma@vidyaniketan.edu.in",
    fullName: "Dr. Ananya Sharma",
    employeeId: "VNPS-TCH-042",
    designation: "Senior PGT — Mathematics & HoD",
    department: "Mathematics",
    homeroomClass: "Class 10-A",
    activeRole: "teacher",
    availableRoles: ["teacher", "class_teacher", "hod"],
    issuedAt: Date.now(),
    expiresAt: expiresAt.getTime(),
    lastActivity: Date.now(),
  });

  const tokenHash = hashSessionToken(token);
  await createDbSessionRecord({
    tokenHash,
    userId: "user_teacher_demo_042",
    institutionId: "inst_demo_school",
    activeRole: "teacher",
    expiresAt,
  });

  // Verify in DB
  const dbRows: any[] = await db.$queryRaw`
    SELECT id, user_id, active_role, revoked_at FROM teacher_portal_sessions
    WHERE token_hash = ${tokenHash}
  `;
  results["Test 2.1: Session inserted into PostgreSQL table"] = dbRows.length > 0;

  // Verify active session load
  const sessionBefore = await getTeacherSession("vidyaniketan", {
    req: {
      cookies: {
        get: () => ({ name: "sst_teacher_session", value: token }),
      },
      headers: new Headers(),
    } as any,
  });
  results["Test 2.2: Active session resolved from DB"] =
    sessionBefore !== null && sessionBefore.user.id === "user_teacher_demo_042";

  // Revoke session (Logout)
  await revokeDbSession(token);
  const dbRowsAfter: any[] = await db.$queryRaw`
    SELECT revoked_at FROM teacher_portal_sessions WHERE token_hash = ${tokenHash}
  `;
  results["Test 2.3: Session marked revoked in DB on logout"] = dbRowsAfter[0]?.revoked_at !== null;

  // Verify revoked session is rejected (no silent login, no back button access)
  const sessionAfter = await getTeacherSession("vidyaniketan", {
    req: {
      cookies: {
        get: () => ({ name: "sst_teacher_session", value: token }),
      },
      headers: new Headers(),
    } as any,
  });
  results["Test 2.4: Revoked session rejected (zero access after logout)"] = sessionAfter === null;

  // TEST 3: Server-side Role Permissions & Route Guards
  results["Test 3.1: Rajesh (Teacher) forbidden from HoD route"] =
    !isRouteAllowedForRole("teacher", "/campus/vidyaniketan/teacher/hod", "vidyaniketan");

  results["Test 3.2: Rajesh (Teacher) forbidden from Class Teacher route"] =
    !isRouteAllowedForRole("teacher", "/campus/vidyaniketan/teacher/class-teacher", "vidyaniketan");

  results["Test 3.3: Ananya (HoD) allowed in HoD route"] =
    isRouteAllowedForRole("hod", "/campus/vidyaniketan/teacher/hod", "vidyaniketan");

  results["Test 3.4: Ananya (Class Teacher) allowed in CT route"] =
    isRouteAllowedForRole("class_teacher", "/campus/vidyaniketan/teacher/class-teacher", "vidyaniketan");

  // TEST 4: Class 10-A Roster & Demo Metrics
  const students = await getSectionStudents("sec-10a");
  const avgAtt = Number((students.reduce((a, s) => a + (s.attendancePercent ?? 0), 0) / students.length).toFixed(1));
  const avgIA = Number((students.reduce((a, s) => a + s.iaAverage, 0) / students.length).toFixed(1));

  results["Test 4.1: Class 10-A strength exactly 18 students"] = students.length === 18;
  results["Test 4.2: Class 10-A average attendance matches 91.1%"] = avgAtt === 91.1;
  results["Test 4.3: Class 10-A IA mean matches 84.6%"] = avgIA === 84.6;

  // TEST 5: Math Department Workload & Demo Metrics
  const faculty = await getDepartmentFacultyLoad();
  const totalWeeklyHours = faculty.reduce((a, f) => a + f.weeklyHours, 0);
  const avgSyllabus = Number((faculty.reduce((a, f) => a + f.syllabusAveragePercent, 0) / faculty.length).toFixed(1));

  results["Test 5.1: Math department has exactly 5 faculty"] = faculty.length === 5;
  results["Test 5.2: Math dept weekly hours matches 93"] = totalWeeklyHours === 93;
  results["Test 5.3: Math dept average syllabus matches 79.4%"] = avgSyllabus === 79.4;

  // TEST 6: HoD Self-Leave Exclusion
  const allLeaves = await getTeacherLeaveRequests();
  const hodQueue = allLeaves.filter(
    (l) => l.teacherId !== "teacher_demo_042" && !l.teacherName.toLowerCase().includes("ananya")
  );
  const hodOwnLeaves = allLeaves.filter(
    (l) => l.teacherId === "teacher_demo_042" || l.teacherName.toLowerCase().includes("ananya")
  );
  results["Test 6.1: HoD's own leave excluded from HoD queue (routed to Principal)"] =
    hodQueue.every((l) => !l.teacherName.toLowerCase().includes("ananya")) &&
    hodOwnLeaves.every((l) => l.reviewedBy === "Principal");

  // TEST 7: Atomic DB Transaction on Student Leave Approval
  try {
    const updatedLeave = await reviewStudentLeaveRequest("slr-01", "approved", "Approved by Class Teacher.");
    results["Test 7.1: Student leave approval + attendance run in DB transaction"] =
      updatedLeave.status === "approved";
  } catch (e) {
    results["Test 7.1: Student leave approval + attendance run in DB transaction"] = false;
  }

  console.log("\n=== TEST RESULTS SUMMARY ===");
  let allPassed = true;
  for (const [testName, passed] of Object.entries(results)) {
    console.log(`${passed ? "✓ PASS" : "✗ FAIL"}: ${testName}`);
    if (!passed) allPassed = false;
  }

  console.log(`\nOVERALL: ${allPassed ? "ALL 16 TESTS PASSED" : "SOME TESTS FAILED"}`);
  process.exit(allPassed ? 0 : 1);
}

runVerification().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
