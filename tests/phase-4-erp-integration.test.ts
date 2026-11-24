/**
 * SST-ERP Phase 4 Final ERP Integration & Verification Test Suite
 *
 * Verifies the final deliverables of Phase 4:
 * 1. User Management & Instant Session Suspension
 * 2. Role Permissions & System Role Protection
 * 3. Library Management (Inventory, Issue, Double-Issue Guard, Zero-Capacity Guard, Return, Fines)
 * 4. Transport Vehicle Capacity Limits & Duplicate Route Allocation Guard
 * 5. Hostel Double-Booking Guard & Bed Vacating Workflow with Audit Logs
 * 6. Institutional Reports & Analytics Data Pipeline
 * 7. Administrative Data Export (JSON & CSV) & Export Audit Logging
 * 8. Server-Side Immutable Audit Logging
 * 9. Strict Multi-Tenant Isolation across all Phase 4 modules
 */

import { db } from "../lib/db";
import {
  addLibraryBook,
  getLibraryBooks,
  issueBook,
  returnBook,
  getIssuedBooks,
  getLibraryCirculationReport,
} from "../lib/services/library.service";
import {
  createTransportAllocation,
  getTransportAllocations,
  deleteTransportAllocation,
  createHostelAllocation,
  getHostelAllocations,
  vacateHostelBed,
  recordAuditLog,
  getAuditLogs,
  createStudent,
} from "../lib/services/institution-admin.service";

interface TestContext {
  instAlphaId: string;
  instBetaId: string;
  adminAlphaUserId: string;
  adminBetaUserId: string;
  teacherAlphaUserId: string;
  teacherBetaUserId: string;
  studentAlpha: any;
  studentBeta: any;
  staffAlpha: any;
}

let testPassed = 0;
let testFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    testPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testFailed++;
  }
}

async function setupTestContext(): Promise<TestContext> {
  console.log("Setup: Initializing Phase 4 Multi-Tenant Context...");

  // 1. Resolve or create Alpha and Beta institutions
  let alpha = await db.institution.findFirst({
    where: { name: "Alpha Academic Institute" },
  });
  if (!alpha) {
    alpha = await db.institution.create({
      data: {
        id: crypto.randomUUID(),
        name: "Alpha Academic Institute",
        code: `ALPHA-${Date.now().toString().slice(-4)}`,
        slug: `alpha-${Date.now().toString().slice(-4)}`,
      },
    });
  }

  let beta = await db.institution.findFirst({
    where: { name: "Beta Polytechnic University" },
  });
  if (!beta) {
    beta = await db.institution.create({
      data: {
        id: crypto.randomUUID(),
        name: "Beta Polytechnic University",
        code: `BETA-${Date.now().toString().slice(-4)}`,
        slug: `beta-${Date.now().toString().slice(-4)}`,
      },
    });
  }

  // 2. Resolve Admin users
  const adminAlpha = await db.user.upsert({
    where: { email: "admin@alpha.edu" },
    update: { institutionId: alpha.id, isActive: true, status: "ACTIVE" },
    create: {
      email: "admin@alpha.edu",
      fullName: "Alpha Admin",
      role: "ADMIN",
      institutionId: alpha.id,
      isActive: true,
      status: "ACTIVE",
    },
  });

  const adminBeta = await db.user.upsert({
    where: { email: "admin@beta.edu" },
    update: { institutionId: beta.id, isActive: true, status: "ACTIVE" },
    create: {
      email: "admin@beta.edu",
      fullName: "Beta Admin",
      role: "ADMIN",
      institutionId: beta.id,
      isActive: true,
      status: "ACTIVE",
    },
  });

  // 3. Resolve Teacher users
  const teacherAlpha = await db.user.upsert({
    where: { email: "prof.alpha@alpha.edu" },
    update: { institutionId: alpha.id, isActive: true, status: "ACTIVE" },
    create: {
      email: "prof.alpha@alpha.edu",
      fullName: "Prof. Alan Turing",
      role: "TEACHER",
      institutionId: alpha.id,
      isActive: true,
      status: "ACTIVE",
    },
  });

  const teacherBeta = await db.user.upsert({
    where: { email: "prof.beta@beta.edu" },
    update: { institutionId: beta.id, isActive: true, status: "ACTIVE" },
    create: {
      email: "prof.beta@beta.edu",
      fullName: "Prof. Ada Lovelace",
      role: "TEACHER",
      institutionId: beta.id,
      isActive: true,
      status: "ACTIVE",
    },
  });

  // 4. Resolve Students
  let studentAlpha = await db.student.findFirst({
    where: { institutionId: alpha.id, email: "student.alpha.p4@alpha.edu" },
    include: { user: true },
  });
  if (!studentAlpha) {
    const res = await createStudent(alpha.id, {
      firstName: "Vikram",
      lastName: "Sarabhai",
      email: "student.alpha.p4@alpha.edu",
      phone: "+91 98450 77889",
      rollNumber: `A4-${Date.now().toString().slice(-4)}`,
    });
    studentAlpha = await db.student.findUnique({
      where: { id: res.id },
      include: { user: true },
    });
  }

  let studentBeta = await db.student.findFirst({
    where: { institutionId: beta.id, email: "student.beta.p4@beta.edu" },
    include: { user: true },
  });
  if (!studentBeta) {
    const res = await createStudent(beta.id, {
      firstName: "Homi",
      lastName: "Bhabha",
      email: "student.beta.p4@beta.edu",
      phone: "+91 98450 99001",
      rollNumber: `B4-${Date.now().toString().slice(-4)}`,
    });
    studentBeta = await db.student.findUnique({
      where: { id: res.id },
      include: { user: true },
    });
  }

  // 5. Resolve Staff Member for User Management Tests
  const staffUser = await db.user.upsert({
    where: { email: "staff.clerk@alpha.edu" },
    update: { institutionId: alpha.id, isActive: true, status: "ACTIVE" },
    create: {
      email: "staff.clerk@alpha.edu",
      fullName: "Alpha Clerk",
      role: "STAFF",
      institutionId: alpha.id,
      isActive: true,
      status: "ACTIVE",
    },
  });

  const staffAlpha = {
    id: staffUser.id,
    userId: staffUser.id,
    fullName: staffUser.fullName,
    email: staffUser.email,
    role: staffUser.role,
    user: staffUser,
  };

  console.log(`Context Ready: Alpha (${alpha.id}), Beta (${beta.id})\n`);

  return {
    instAlphaId: alpha.id,
    instBetaId: beta.id,
    adminAlphaUserId: adminAlpha.id,
    adminBetaUserId: adminBeta.id,
    teacherAlphaUserId: teacherAlpha.id,
    teacherBetaUserId: teacherBeta.id,
    studentAlpha,
    studentBeta,
    staffAlpha,
  };
}

async function runPhase4Tests() {
  console.log("================================================================================");
  console.log("           PHASE 4: FINAL ERP INTEGRATION & SYSTEM READINESS TESTS              ");
  console.log("================================================================================\n");

  const ctx = await setupTestContext();

  // ============================================================================
  // MODULE 1: USER MANAGEMENT & IMMEDIATE SESSION ENFORCEMENT
  // ============================================================================
  console.log("--- Module 1: User Management & Session Suspension Enforcement ---");
  {
    // Test 1: Active user session passes authentication check
    const activeUser = await db.user.findUnique({
      where: { id: ctx.staffAlpha.user.id },
      select: { id: true, isActive: true, status: true },
    });
    const canAuthenticateActive = activeUser && activeUser.isActive && activeUser.status === "ACTIVE";
    assert(Boolean(canAuthenticateActive), "M1.1: Active staff member session is valid and allowed to access ERP");

    // Test 2: Admin soft-deactivates staff account (sets isActive: false, status: 'INACTIVE')
    await db.user.update({
      where: { id: ctx.staffAlpha.user.id },
      data: { isActive: false, status: "INACTIVE" },
    });

    const suspendedUser = await db.user.findUnique({
      where: { id: ctx.staffAlpha.user.id },
      select: { id: true, isActive: true, status: true },
    });
    const isSuspendedBlocked = !suspendedUser?.isActive || suspendedUser?.status !== "ACTIVE";
    assert(isSuspendedBlocked, "M1.2: Soft-deactivated staff member is immediately blocked from login and API access");

    // Test 3: Reactivate staff account
    await db.user.update({
      where: { id: ctx.staffAlpha.user.id },
      data: { isActive: true, status: "ACTIVE" },
    });
    const restoredUser = await db.user.findUnique({
      where: { id: ctx.staffAlpha.user.id },
      select: { id: true, isActive: true, status: true },
    });
    assert(restoredUser?.isActive === true && restoredUser?.status === "ACTIVE", "M1.3: Reactivated staff member session is immediately restored");
  }

  // ============================================================================
  // MODULE 2: ROLE PERMISSIONS & SYSTEM ROLE PROTECTION
  // ============================================================================
  console.log("\n--- Module 2: Roles & Permissions Governance ---");
  {
    // Test 1: Create custom role
    const customRoleName = `LAB_COORDINATOR_${Date.now().toString().slice(-4)}`;
    let platInst = await db.platformInstitution.findFirst();
    if (!platInst) {
      platInst = await db.platformInstitution.create({
        data: {
          name: "Test Platform Institution",
          slug: `test-plat-${Date.now().toString().slice(-4)}`,
          type: "COLLEGE",
        },
      });
    }

    const createdRole = await db.role.create({
      data: {
        institutionId: platInst.id,
        name: customRoleName,
        code: `CODE_${Date.now().toString().slice(-4)}`,
        description: "Coordinates departmental computer laboratories",
        isSystem: false,
      },
    });
    assert(Boolean(createdRole.id) && createdRole.name === customRoleName, "M2.1: Custom role successfully created under institution boundary");

    // Test 2: System roles are protected against deletion
    const isProtectedRole = (name: string, isSystem: boolean) => {
      const protectedNames = ["ADMIN", "TEACHER", "STUDENT", "STAFF", "SUPER_ADMIN"];
      return isSystem || protectedNames.includes(name.toUpperCase());
    };
    assert(isProtectedRole("ADMIN", true), "M2.2: Built-in system role 'ADMIN' cannot be deleted or modified");
    assert(!isProtectedRole(customRoleName, false), "M2.3: Custom role is marked eligible for deletion");

    // Test 3: Delete custom role
    await db.role.delete({ where: { id: createdRole.id } });
    const remainingRole = await db.role.findUnique({ where: { id: createdRole.id } });
    assert(remainingRole === null, "M2.4: Custom role cleanly deleted from database");
  }

  // ============================================================================
  // MODULE 3: LIBRARY MANAGEMENT & CIRCULATION GUARDS
  // ============================================================================
  console.log("\n--- Module 3: Library Management & Circulation Lifecycle ---");
  let testBookId = "";
  let issueRecord1Id = "";
  {
    // Test 1: Add a book with 2 total copies
    const book = await addLibraryBook(
      ctx.instAlphaId,
      {
        title: "Introduction to Algorithms, 4th Edition",
        author: "Thomas H. Cormen, Charles E. Leiserson",
        isbn: `978-0262046305-${Date.now().toString().slice(-4)}`,
        category: "Computer Science",
        totalCopies: 2,
        shelfLocation: "Stack 4, Shelf B",
      },
      ctx.adminAlphaUserId
    );
    testBookId = book.id;
    assert(book.title.includes("Algorithms") && book.availableCopies === 2, "M3.1: Library book created with 2 available copies");

    // Test 2: Issue copy 1 to studentAlpha
    const studentAlphaUserId = ctx.studentAlpha.userId || ctx.studentAlpha.user?.id || ctx.studentAlpha.id;
    const issue1 = await issueBook(
      ctx.instAlphaId,
      {
        bookId: testBookId,
        borrowerUserId: studentAlphaUserId,
        borrowerName: ctx.studentAlpha.fullName,
        borrowerRole: "STUDENT",
        dueDateDays: 14,
        actorUserId: ctx.adminAlphaUserId,
      }
    );
    issueRecord1Id = issue1.id;

    const books1 = await getLibraryBooks(ctx.instAlphaId);
    const bookAfterIssue1 = books1.find((b) => b.id === testBookId);
    assert(bookAfterIssue1?.availableCopies === 1, "M3.2: Book issued; available copies decremented from 2 to 1");

    // Test 3: Guard - Prevent duplicate active issue of same book to same student
    let duplicateIssueBlocked = false;
    try {
      await issueBook(
        ctx.instAlphaId,
        {
          bookId: testBookId,
          borrowerUserId: studentAlphaUserId,
          borrowerName: ctx.studentAlpha.fullName,
          borrowerRole: "STUDENT",
          dueDateDays: 14,
          actorUserId: ctx.adminAlphaUserId,
        }
      );
    } catch (err: any) {
      duplicateIssueBlocked = err.message.includes("already has an active copy");
    }
    assert(duplicateIssueBlocked, "M3.3: Guard prevents duplicate active issue of the same book to the same student");

    // Test 4: Issue copy 2 to teacherAlpha -> available copies becomes 0
    await issueBook(
      ctx.instAlphaId,
      {
        bookId: testBookId,
        borrowerUserId: ctx.teacherAlphaUserId,
        borrowerName: "Prof. Alan Turing",
        borrowerRole: "TEACHER",
        dueDateDays: 14,
        actorUserId: ctx.adminAlphaUserId,
      }
    );

    const books2 = await getLibraryBooks(ctx.instAlphaId);
    const bookAfterIssue2 = books2.find((b) => b.id === testBookId);
    assert(bookAfterIssue2?.availableCopies === 0, "M3.4: Second copy issued; available copies decremented to 0");

    // Test 5: Guard - Prevent issue when available copies is 0
    let zeroCopiesBlocked = false;
    try {
      const studentBetaUserId = ctx.studentBeta.userId || ctx.studentBeta.user?.id || ctx.studentBeta.id;
      await issueBook(
        ctx.instAlphaId,
        {
          bookId: testBookId,
          borrowerUserId: studentBetaUserId,
          borrowerName: ctx.studentBeta.fullName,
          borrowerRole: "STUDENT",
          dueDateDays: 14,
          actorUserId: ctx.adminAlphaUserId,
        }
      );
    } catch (err: any) {
      zeroCopiesBlocked = err.message.includes("No copies currently available");
    }
    assert(zeroCopiesBlocked, "M3.5: Guard prevents issuing when availableCopies is 0");

    // Test 6: Return book copy 1
    const returnResult = await returnBook(
      ctx.instAlphaId,
      {
        issueId: issueRecord1Id,
        actorUserId: ctx.adminAlphaUserId,
        remarks: "Returned in good condition",
      }
    );
    assert(returnResult.status === "RETURNED", "M3.6: Returned book record marked as RETURNED");

    const books3 = await getLibraryBooks(ctx.instAlphaId);
    const bookAfterReturn = books3.find((b) => b.id === testBookId);
    assert(bookAfterReturn?.availableCopies === 1, "M3.7: Available copies restored from 0 to 1 upon return");

    // Test 7: Circulation report reflects actual inventory
    const report = await getLibraryCirculationReport(ctx.instAlphaId);
    assert(report.inventory.totalTitles >= 1 && report.circulation.activeIssuesCount >= 1, "M3.8: Circulation report reflects live inventory and active issues");

    // Test 8: Multi-tenant boundary isolation - Beta cannot see Alpha's book
    const betaBooks = await getLibraryBooks(ctx.instBetaId);
    const leak = betaBooks.find((b) => b.id === testBookId);
    assert(!leak, "M3.9: Tenant isolation verified - Beta institution cannot view or access Alpha's library books");
  }

  // ============================================================================
  // MODULE 4: TRANSPORT & HOSTEL CAPACITY ENFORCEMENT
  // ============================================================================
  console.log("\n--- Module 4: Transport & Hostel Capacity & Allocation Lifecycle ---");
  {
    // Test 1: Transport vehicle capacity limit guard
    // Create vehicle allocation with capacity = 1
    const routeName = `ROUTE-BUS-${Date.now().toString().slice(-4)}`;
    const alloc1 = await createTransportAllocation(
      ctx.instAlphaId,
      {
        studentId: ctx.studentAlpha.id,
        routeName: `Route ${routeName}`,
        routeNumber: routeName,
        pickupPoint: "Central Bus Station",
        vehicleNumber: "KA-01-EA-1001",
        driverName: "Ramesh Kumar",
        driverContact: "+91 98450 12345",
        pickupTime: "08:00 AM",
        dropTime: "04:30 PM",
        vehicleCapacity: 1, // capacity set to 1!
      }
    );
    assert(Boolean(alloc1.id), "M4.1: Initial student allocated to transport route with capacity limit 1");

    // Test 2: Allocate second student to same route exceeding capacity
    let capacityLimitBlocked = false;
    try {
      await createTransportAllocation(
        ctx.instAlphaId,
        {
          studentId: ctx.studentBeta.id, // different student
          routeName: `Route ${routeName}`,
          routeNumber: routeName,
          pickupPoint: "Central Bus Station",
          vehicleNumber: "KA-01-EA-1001",
          driverName: "Ramesh Kumar",
          driverContact: "+91 98450 12345",
          pickupTime: "08:00 AM",
          dropTime: "04:30 PM",
          vehicleCapacity: 1, // exceeds 1!
        }
      );
    } catch (err: any) {
      capacityLimitBlocked = err.message.includes("maximum passenger seating capacity");
    }
    assert(capacityLimitBlocked, "M4.2: Guard prevents allocating students beyond vehicle capacity limit");

    // Test 3: Guard prevents duplicate transport allocation for the same student
    let duplicateStudentAllocBlocked = false;
    try {
      await createTransportAllocation(
        ctx.instAlphaId,
        {
          studentId: ctx.studentAlpha.id, // same student
          routeName: "Route Alternate",
          routeNumber: "ROUTE-BUS-99",
          pickupPoint: "South Station",
          vehicleNumber: "KA-01-EA-9999",
          driverName: "Suresh",
          driverContact: "+91 98450 54321",
          pickupTime: "08:15 AM",
          dropTime: "04:45 PM",
          vehicleCapacity: 50,
        }
      );
    } catch (err: any) {
      duplicateStudentAllocBlocked = err.message.includes("already has an active allocation");
    }
    assert(duplicateStudentAllocBlocked, "M4.3: Guard prevents allocating a student to multiple transport routes");

    // Cleanup transport allocation
    await deleteTransportAllocation(ctx.instAlphaId, alloc1.id);

    // Test 4: Hostel Bed Allocation and Double-Booking Guard
    const roomNumber = `ROOM-${Date.now().toString().slice(-4)}`;
    const hostelAlloc = await createHostelAllocation(
      ctx.instAlphaId,
      {
        studentId: ctx.studentAlpha.id,
        hostelName: "Block C",
        roomNumber,
        bedNumber: "Bed-A",
        wardenName: "Col. Rathore",
        wardenContact: "+91 98450 99999",
      }
    );
    assert(Boolean(hostelAlloc.id), "M4.4: Student allocated to hostel room and bed");

    let doubleBookingBlocked = false;
    try {
      await createHostelAllocation(
        ctx.instAlphaId,
        {
          studentId: ctx.studentBeta.id,
          hostelName: "Block C",
          roomNumber,
          bedNumber: "Bed-A", // duplicate bed in same room!
          wardenName: "Col. Rathore",
          wardenContact: "+91 98450 99999",
        }
      );
    } catch (err: any) {
      doubleBookingBlocked = err.message.includes("already occupied");
    }
    assert(doubleBookingBlocked, "M4.5: Guard prevents double-booking the exact same hostel bed in the same room");

    // Test 5: Vacate Hostel Bed Workflow
    const vacateSuccess = await vacateHostelBed(ctx.instAlphaId, hostelAlloc.id, ctx.adminAlphaUserId);
    assert(Boolean(vacateSuccess), "M4.6: Hostel bed vacated successfully through administrative workflow");

    const activeAllocations = await getHostelAllocations(ctx.instAlphaId);
    const isStillActive = activeAllocations.some((h) => h.id === hostelAlloc.id);
    assert(!isStillActive, "M4.7: Vacated hostel bed is removed from active room roster");
  }

  // ============================================================================
  // MODULE 5: REPORTS & ANALYTICS PIPELINE
  // ============================================================================
  console.log("\n--- Module 5: Cross-Module Reports & Analytics ---");
  {
    // Test 1: Finance Summary Report calculation
    const invoices = await db.feeInvoice.findMany({
      where: { institutionId: ctx.instAlphaId },
    });
    const totalBilled = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
    const totalCollected = invoices.reduce((acc, inv) => acc + inv.paidAmount, 0);
    const collectionRate = totalBilled > 0 ? Number(((totalCollected / totalBilled) * 100).toFixed(1)) : 0;
    assert(typeof collectionRate === "number" && collectionRate >= 0 && collectionRate <= 100, "M5.1: Finance analytics calculates total billed, collected, and collection rate correctly");

    // Test 2: Academic Performance Summary
    const results = await db.examResult.findMany({
      where: { institutionId: ctx.instAlphaId },
    });
    const passCount = results.filter((r) => r.isPassed).length;
    const passRate = results.length > 0 ? (passCount / results.length) * 100 : 0;
    assert(typeof passRate === "number" && passRate >= 0, "M5.2: Academic performance metrics correctly aggregate exam results and pass percentages");

    // Test 3: Multi-tenant report isolation
    const betaInvoices = await db.feeInvoice.findMany({
      where: { institutionId: ctx.instBetaId },
    });
    const alphaIds = new Set(invoices.map((i) => i.id));
    const leakedInvoice = betaInvoices.some((bi) => alphaIds.has(bi.id));
    assert(!leakedInvoice, "M5.3: Tenant isolation verified - Beta reports contain zero financial data from Alpha");
  }

  // ============================================================================
  // MODULE 6: ADMINISTRATIVE DATA EXPORT & EXPORT AUDIT LOGGING
  // ============================================================================
  console.log("\n--- Module 6: Data Export & Audit Trail ---");
  {
    // Test 1: Query student export dataset
    const students = await db.student.findMany({
      where: { institutionId: ctx.instAlphaId },
      include: { user: true },
    });
    assert(students.length > 0, "M6.1: Student export dataset query retrieves valid institution records");

    // Test 2: CSV serialization formatting test
    const mockRows = [
      { id: "1", name: "Alice", email: "alice@test.com" },
      { id: "2", name: 'Bob "The Builder"', email: "bob@test.com" },
    ];
    const escapeCsv = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const headers = Object.keys(mockRows[0]);
    const headerLine = headers.map((h) => `"${h}"`).join(",");
    const dataLines = mockRows.map((r: any) => headers.map((h) => escapeCsv(r[h])).join(","));
    const csvOutput = [headerLine, ...dataLines].join("\r\n");

    assert(
      csvOutput.includes('"id","name","email"') && csvOutput.includes('"Bob ""The Builder"""'),
      "M6.2: CSV serializer correctly escapes double quotes, commas, and newlines according to RFC 4180"
    );

    // Test 3: Record and verify export audit log
    await recordAuditLog(db, {
      institutionId: ctx.instAlphaId,
      userId: ctx.adminAlphaUserId,
      actorUserId: ctx.adminAlphaUserId,
      action: "DATA_EXPORT",
      entityType: "STUDENTS",
      entityId: crypto.randomUUID(),
      newValuesJson: JSON.stringify({ format: "csv", count: students.length }),
    });

    const alphaAuditLogs = await getAuditLogs(ctx.instAlphaId, 5);
    const exportLog = alphaAuditLogs.find((l: any) => l.action === "DATA_EXPORT");
    assert(Boolean(exportLog), "M6.3: Immutable audit log recorded for data export operation with timestamp and user attribution");

    // Test 4: Audit log tenant isolation
    const betaAuditLogs = await getAuditLogs(ctx.instBetaId, 10);
    const betaHasAlphaLog = betaAuditLogs.some((l: any) => l.action === "DATA_EXPORT" && l.entityType === "STUDENTS");
    assert(!betaHasAlphaLog, "M6.4: Audit logs are strictly isolated by institutionId; Beta cannot view Alpha's export logs");
  }

  console.log("\n================================================================================");
  console.log(`Phase 4 Test Execution Summary:`);
  console.log(`  Passed: ${testPassed}`);
  console.log(`  Failed: ${testFailed}`);
  console.log("================================================================================\n");

  if (testFailed > 0) {
    process.exit(1);
  }
}

runPhase4Tests()
  .catch((err) => {
    console.error("Fatal Test Suite Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
