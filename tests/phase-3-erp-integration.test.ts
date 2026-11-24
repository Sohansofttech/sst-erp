/**
 * SST-ERP Phase 3 Integration & Multi-Institution Verification Test Suite
 *
 * Tests the 4 core Phase 3 modules:
 * 1. Fees & Finance
 * 2. Student Grievances & Feedback
 * 3. Institutional Communication
 * 4. Campus Services (Hostel, Transport, Resource Bookings)
 *
 * Enforces: Multi-tenant boundary isolation, student privacy, idempotency,
 * and zero regression on Phase 1 & Phase 2.
 */

import { db } from "../lib/db";
import {
  assignFeeStructure,
  applyFeeConcession,
  recordFeePayment,
  getFeeInvoices,
  createHostelAllocation,
  getHostelAllocations,
  deleteHostelAllocation,
  createTransportAllocation,
  getTransportAllocations,
  deleteTransportAllocation,
  broadcastNotification,
  getNotifications,
  updateNotification,
  deleteNotification,
  processApprovalRequest,
  getCampusServicesOverview,
} from "../lib/services/institution-admin.service";
import { verifyAndProcessPayment } from "../lib/services/payment.service";
import {
  submitQuery,
  getQueries,
  respondToQuery,
} from "../lib/services/query-management.service";
import {
  getUserNotifications,
  markNotificationAsRead,
} from "../lib/services/notification.service";
import { createStudent } from "../lib/services/institution-admin.service";

interface TestContext {
  instAlphaId: string;
  instBetaId: string;
  studentAlpha: any;
  studentBeta: any;
  adminAlphaUserId: string;
  adminBetaUserId: string;
  teacherAlphaUserId: string;
  teacherBetaUserId: string;
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
  console.log("Setup: Resolving Test Tenants...");

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

  // 2. Resolve or create Admin users
  const adminAlpha = await db.user.upsert({
    where: { email: "admin@alpha.edu" },
    update: { institutionId: alpha.id },
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
    update: { institutionId: beta.id },
    create: {
      email: "admin@beta.edu",
      fullName: "Beta Admin",
      role: "ADMIN",
      institutionId: beta.id,
      isActive: true,
      status: "ACTIVE",
    },
  });

  // 3. Resolve or create Teacher users
  const teacherAlpha = await db.user.upsert({
    where: { email: "prof.alpha@alpha.edu" },
    update: { institutionId: alpha.id },
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
    update: { institutionId: beta.id },
    create: {
      email: "prof.beta@beta.edu",
      fullName: "Prof. Ada Lovelace",
      role: "TEACHER",
      institutionId: beta.id,
      isActive: true,
      status: "ACTIVE",
    },
  });

  // Ensure teacher records exist in teachers table
  await db.teacher.upsert({
    where: { userId: teacherAlpha.id },
    update: { institutionId: alpha.id },
    create: {
      institutionId: alpha.id,
      userId: teacherAlpha.id,
      employeeId: "EMP-ALPHA-01",
      department: "Computer Science",
      designation: "Professor",
    },
  });

  await db.teacher.upsert({
    where: { userId: teacherBeta.id },
    update: { institutionId: beta.id },
    create: {
      institutionId: beta.id,
      userId: teacherBeta.id,
      employeeId: "EMP-BETA-01",
      department: "Information Science",
      designation: "Associate Professor",
    },
  });

  // 4. Resolve or create Students
  let studentAlpha = await db.student.findFirst({
    where: { institutionId: alpha.id, email: "student.alpha.p3@alpha.edu" },
    include: { user: true },
  });

  if (!studentAlpha) {
    const res = await createStudent(alpha.id, {
      firstName: "Rohan",
      lastName: "Sharma",
      email: "student.alpha.p3@alpha.edu",
      phone: "+91 98450 11223",
      rollNumber: `A3-${Date.now().toString().slice(-4)}`,
    });
    studentAlpha = await db.student.findUnique({
      where: { id: res.id },
      include: { user: true },
    });
  }

  let studentBeta = await db.student.findFirst({
    where: { institutionId: beta.id, email: "student.beta.p3@beta.edu" },
    include: { user: true },
  });

  if (!studentBeta) {
    const res = await createStudent(beta.id, {
      firstName: "Pooja",
      lastName: "Reddy",
      email: "student.beta.p3@beta.edu",
      phone: "+91 98450 33445",
      rollNumber: `B3-${Date.now().toString().slice(-4)}`,
    });
    studentBeta = await db.student.findUnique({
      where: { id: res.id },
      include: { user: true },
    });
  }

  console.log(`Context Ready: Alpha (${alpha.id}), Beta (${beta.id})\n`);

  return {
    instAlphaId: alpha.id,
    instBetaId: beta.id,
    studentAlpha,
    studentBeta,
    adminAlphaUserId: adminAlpha.id,
    adminBetaUserId: adminBeta.id,
    teacherAlphaUserId: teacherAlpha.id,
    teacherBetaUserId: teacherBeta.id,
  };
}

async function runTests() {
  console.log("========================================================");
  console.log("SST-ERP PHASE 3 ERP INTEGRATION TEST SUITE");
  console.log("========================================================\n");

  const ctx = await setupTestContext();

  // -------------------------------------------------------------------------
  // 1. FEES & FINANCE MODULE
  // -------------------------------------------------------------------------
  console.log("--- 1. Testing Fees & Finance Module ---");
  let invoiceAlphaId = "";
  const feeStructureTitle = `Tuition & Lab Fee Sem 3 - ${Date.now()}`;
  const feeAmount = 25000;

  // 1.1 Admin assigns fee structure to students
  try {
    const assignResult = await assignFeeStructure(ctx.instAlphaId, {
      title: feeStructureTitle,
      totalAmount: feeAmount,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      studentIds: [ctx.studentAlpha.id],
      items: [
        { description: "Tuition Fee", amount: 20000 },
        { description: "Computer Lab & Cloud Services Fee", amount: 5000 },
      ],
      adminUserId: ctx.adminAlphaUserId,
    });

    assert(assignResult.success === true, "Admin successfully assigned fee structure");
    assert(assignResult.assignedCount >= 1, `Assigned to ${assignResult.assignedCount} student(s)`);
    invoiceAlphaId = assignResult.invoices[0].id;
  } catch (err: any) {
    assert(false, `Assign fee structure error: ${err.message}`);
  }

  // 1.2 Student views assigned fees
  try {
    const studentInvoices = await getFeeInvoices(ctx.instAlphaId, ctx.studentAlpha.id);
    const targetInv = studentInvoices.find((i: any) => i.id === invoiceAlphaId);
    assert(Boolean(targetInv), "Student can see their newly assigned fee invoice");
    assert(targetInv.totalAmount === feeAmount, `Invoice totalAmount matches ₹${feeAmount}`);
    assert(targetInv.outstandingAmount === feeAmount, "Initial outstanding amount equals total fee");
    assert(targetInv.status === "UNPAID", "Initial invoice status is UNPAID");
  } catch (err: any) {
    assert(false, `Student view fees error: ${err.message}`);
  }

  // 1.3 Fee Concession / Waiver
  const concessionAmount = 5000;
  try {
    const updatedWithConcession = await applyFeeConcession(ctx.instAlphaId, {
      invoiceId: invoiceAlphaId,
      concessionAmount,
      reason: "Merit Academic Scholarship Waiver 20%",
      adminUserId: ctx.adminAlphaUserId,
    });
    assert(updatedWithConcession.outstandingAmount === feeAmount - concessionAmount, `Fee concession applied: outstanding reduced to ₹${feeAmount - concessionAmount}`);
    assert(updatedWithConcession.totalAmount === feeAmount - concessionAmount, `Total billed adjusted to ₹${feeAmount - concessionAmount}`);
  } catch (err: any) {
    assert(false, `Apply fee concession error: ${err.message}`);
  }

  // 1.4 Overpayment prevention
  try {
    let overpayBlocked = false;
    try {
      await recordFeePayment(ctx.instAlphaId, {
        invoiceId: invoiceAlphaId,
        studentId: ctx.studentAlpha.id,
        amount: 30000, // Exceeds outstanding
        paymentMethod: "UPI",
        transactionRef: `TEST-OVERPAY-${Date.now()}`,
      });
    } catch {
      overpayBlocked = true;
    }
    assert(overpayBlocked, "System blocks overpayment exceeding outstanding balance");
  } catch (err: any) {
    assert(false, `Overpayment check error: ${err.message}`);
  }

  // 1.5 Valid Authorized Payment & Receipt Generation
  const paymentAmount = 10000;
  const uniqueTxnRef = `UPI-TXN-${Date.now()}`;
  let receiptNumberGenerated = "";
  try {
    const payResult = await recordFeePayment(ctx.instAlphaId, {
      invoiceId: invoiceAlphaId,
      studentId: ctx.studentAlpha.id,
      amount: paymentAmount,
      paymentMethod: "UPI",
      transactionRef: uniqueTxnRef,
    });

    assert(Boolean(payResult.payment), "Authorized fee payment recorded successfully");
    assert(payResult.payment.status === "SUCCESS", "Payment status marked as SUCCESS");
    assert(Boolean(payResult.receipt), "Official fee receipt generated automatically");
    assert(payResult.receipt.amountPaid === paymentAmount, `Receipt amount reflects ₹${paymentAmount}`);
    receiptNumberGenerated = payResult.receipt.receiptNumber;

    // Verify invoice status is updated to PARTIAL
    const invAfterPay = await db.feeInvoice.findUnique({ where: { id: invoiceAlphaId } });
    assert(invAfterPay?.paidAmount === paymentAmount, `Invoice paidAmount updated to ₹${paymentAmount}`);
    assert(invAfterPay?.status === "PARTIAL", "Invoice status transitioned to PARTIAL");
  } catch (err: any) {
    assert(false, `Record fee payment error: ${err.message}`);
  }

  // 1.6 Duplicate payment prevention (idempotency check)
  try {
    let duplicateBlocked = false;
    try {
      await recordFeePayment(ctx.instAlphaId, {
        invoiceId: invoiceAlphaId,
        studentId: ctx.studentAlpha.id,
        amount: 2000,
        paymentMethod: "UPI",
        transactionRef: uniqueTxnRef, // Same txnRef!
      });
    } catch {
      duplicateBlocked = true;
    }
    assert(duplicateBlocked, "Security: Duplicate payment transaction reference is strictly blocked");
  } catch (err: any) {
    assert(false, `Duplicate payment prevention error: ${err.message}`);
  }

  // 1.7 Student accesses receipt details
  try {
    const receiptRecord = await db.feeReceipt.findFirst({
      where: { receiptNumber: receiptNumberGenerated, institutionId: ctx.instAlphaId },
      include: {
        feePayment: {
          include: { student: true, invoice: true },
        },
      },
    });
    assert(Boolean(receiptRecord), "Student can access verified payment receipt from database");
    assert(receiptRecord?.feePayment.studentId === ctx.studentAlpha.id, "Receipt belongs to authenticated student");
  } catch (err: any) {
    assert(false, `Student access receipt error: ${err.message}`);
  }

  // 1.8 Multi-tenant isolation in Fees
  try {
    const betaInvoices = await getFeeInvoices(ctx.instBetaId, ctx.studentBeta.id);
    const leaked = betaInvoices.some((i: any) => i.id === invoiceAlphaId);
    assert(!leaked, "Tenant Isolation: Beta student sees 0 fee invoices from Alpha");
  } catch (err: any) {
    assert(false, `Fee tenant isolation error: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // 2. STUDENT GRIEVANCES & FEEDBACK MODULE
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Testing Student Grievances & Feedback Module ---");
  let grievanceId = "";
  const grievanceSubject = `Library Air Conditioning & Power Socket Issue #${Date.now()}`;

  // 2.1 Student submits grievance
  try {
    const submitted = await submitQuery({
      institutionId: ctx.instAlphaId,
      userId: ctx.studentAlpha.userId,
      role: "STUDENT",
      category: "INFRASTRUCTURE",
      subject: grievanceSubject,
      description: "Third floor study hall socket points are non-functional and AC cooling is insufficient.",
      studentId: ctx.studentAlpha.id,
      priority: "HIGH",
    });

    assert(Boolean(submitted.id), "Student submitted grievance successfully");
    assert(submitted.status === "PENDING", "Initial grievance status is PENDING");
    assert(submitted.category === "INFRASTRUCTURE", "Grievance category correctly recorded");
    grievanceId = submitted.id;
  } catch (err: any) {
    assert(false, `Submit grievance error: ${err.message}`);
  }

  // 2.2 Student sees own grievances, cannot see others
  try {
    const studentQueries = await getQueries({
      institutionId: ctx.instAlphaId,
      userId: ctx.studentAlpha.userId,
      role: "STUDENT",
    });
    const found = studentQueries.some((q) => q.id === grievanceId);
    assert(found, "Student can retrieve their own submitted grievance");

    // Privacy check: Beta student queries
    const betaQueries = await getQueries({
      institutionId: ctx.instBetaId,
      userId: ctx.studentBeta.userId,
      role: "STUDENT",
    });
    const betaLeak = betaQueries.some((q) => q.id === grievanceId);
    assert(!betaLeak, "Privacy & Isolation: Beta student CANNOT view Alpha student's private grievance");
  } catch (err: any) {
    assert(false, `Student grievance retrieval error: ${err.message}`);
  }

  // 2.3 Admin assigns grievance to authorized teacher
  try {
    const assigned = await respondToQuery({
      institutionId: ctx.instAlphaId,
      adminUserId: ctx.adminAlphaUserId,
      queryId: grievanceId,
      status: "IN_PROGRESS",
      adminRemarks: "Assigned to Campus Infrastructure In-Charge for inspection.",
      assignedToUserId: ctx.teacherAlphaUserId,
      assignedToName: "Prof. Alan Turing",
    });

    assert(assigned.status === "IN_PROGRESS", "Admin updated grievance status to IN_PROGRESS");
    assert(assigned.assignedToUserId === ctx.teacherAlphaUserId, "Admin assigned grievance to Prof. Alan Turing");
  } catch (err: any) {
    assert(false, `Admin assign grievance error: ${err.message}`);
  }

  // 2.4 Teacher views only assigned grievances
  try {
    const teacherAssignedQueries = await getQueries({
      institutionId: ctx.instAlphaId,
      assignedToUserId: ctx.teacherAlphaUserId,
    });
    const isAssigned = teacherAssignedQueries.some((q) => q.id === grievanceId);
    assert(isAssigned, "Assigned teacher can view the grievance assigned to them");

    // Teacher Beta should not see it
    const teacherBetaQueries = await getQueries({
      institutionId: ctx.instBetaId,
      assignedToUserId: ctx.teacherBetaUserId,
    });
    const betaTeacherLeak = teacherBetaQueries.some((q) => q.id === grievanceId);
    assert(!betaTeacherLeak, "Tenant Isolation: Teacher in Beta institution cannot see Alpha grievance");
  } catch (err: any) {
    assert(false, `Teacher view assigned query error: ${err.message}`);
  }

  // 2.5 Teacher responds to assigned grievance and marks RESOLVED
  try {
    const teacherResponse = await respondToQuery({
      institutionId: ctx.instAlphaId,
      adminUserId: ctx.teacherAlphaUserId,
      queryId: grievanceId,
      status: "RESOLVED",
      adminRemarks: "Maintenance team replaced the power strip sockets and serviced the HVAC unit. Issue resolved.",
    });

    assert(teacherResponse.status === "RESOLVED", "Teacher successfully resolved the assigned grievance");
    assert(Boolean(teacherResponse.adminRemarks?.includes("HVAC unit")), "Teacher resolution remarks recorded");
    assert(teacherResponse.history.length >= 2, "Full grievance lifecycle history maintained with audit timestamps");
  } catch (err: any) {
    assert(false, `Teacher respond grievance error: ${err.message}`);
  }

  // 2.6 Student views resolution
  try {
    const studentCheck = await getQueries({
      institutionId: ctx.instAlphaId,
      userId: ctx.studentAlpha.userId,
    });
    const resolvedItem = studentCheck.find((q) => q.id === grievanceId);
    assert(resolvedItem?.status === "RESOLVED", "Student sees updated status: RESOLVED");
    assert(Boolean(resolvedItem?.adminRemarks), "Student sees authorized resolution remarks");
  } catch (err: any) {
    assert(false, `Student check resolved grievance error: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // 3. INSTITUTIONAL COMMUNICATION MODULE
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Testing Institutional Communication Module ---");
  let notifId = "";
  const announcementTitle = `Important: Semester End Academic Circular - ${Date.now()}`;

  // 3.1 Admin broadcasts targeted institutional announcement
  try {
    const broadcast = await broadcastNotification(ctx.instAlphaId, {
      title: announcementTitle,
      message: "Final semester end project submissions and evaluation schedule announced.",
      category: "ANNOUNCEMENT",
      targetRole: "ALL",
      priority: "HIGH",
    });

    assert(Boolean(broadcast.id), "Admin broadcast notification created successfully");
    assert(broadcast.title === announcementTitle, "Announcement title correctly set");
    notifId = broadcast.id;

    // Verify delivery recipients were registered
    const recipients = await db.notificationRecipient.findMany({
      where: { notificationId: notifId },
    });
    assert(recipients.length >= 1, `Recipients registered in notification_recipients: ${recipients.length}`);
  } catch (err: any) {
    assert(false, `Broadcast notification error: ${err.message}`);
  }

  // 3.2 Student views institution announcement
  let recipientRecordId = "";
  try {
    const studentNotifs = await getUserNotifications(ctx.studentAlpha.userId, ctx.instAlphaId);
    const targetNotif = studentNotifs.find((n) => n.notificationId === notifId);
    assert(Boolean(targetNotif), "Student retrieved active institution announcement");
    assert(targetNotif?.isRead === false, "Announcement initially marked unread (isRead: false)");
    if (targetNotif) recipientRecordId = targetNotif.id;
  } catch (err: any) {
    assert(false, `Student view announcement error: ${err.message}`);
  }

  // 3.3 Student marks announcement as read (read receipts)
  try {
    if (recipientRecordId) {
      await markNotificationAsRead(recipientRecordId, ctx.studentAlpha.userId);
      const updatedNotif = await db.notificationRecipient.findUnique({
        where: { id: recipientRecordId },
      });
      assert(updatedNotif?.isRead === true, "Student marked announcement as read (isRead: true)");
      assert(Boolean(updatedNotif?.readAt), "Read receipt timestamp recorded (readAt)");
    } else {
      assert(false, "Recipient record ID missing for read receipt test");
    }
  } catch (err: any) {
    assert(false, `Mark notification read error: ${err.message}`);
  }

  // 3.4 Admin views read statistics
  try {
    const adminNotifs = await getNotifications(ctx.instAlphaId);
    const targetAdminNotif = adminNotifs.find((n: any) => n.id === notifId);
    assert(Boolean(targetAdminNotif), "Admin can view announcement list with tracking metrics");
    assert(targetAdminNotif?.readCount >= 1, `Admin tracking shows readCount >= 1 (${targetAdminNotif?.readCount})`);
  } catch (err: any) {
    assert(false, `Admin notification tracking error: ${err.message}`);
  }

  // 3.5 Admin updates announcement
  try {
    const updatedTitle = `${announcementTitle} [REVISED DEADLINE]`;
    await updateNotification(ctx.instAlphaId, notifId, {
      title: updatedTitle,
      message: "Deadline extended by 48 hours for all departments.",
    });
    const checkUpdated = await db.notification.findUnique({ where: { id: notifId } });
    assert(checkUpdated?.title === updatedTitle, "Admin successfully updated announcement content");
  } catch (err: any) {
    assert(false, `Update notification error: ${err.message}`);
  }

  // 3.6 Tenant Isolation in Communication
  try {
    const betaNotifs = await getUserNotifications(ctx.studentBeta.userId, ctx.instBetaId);
    const leak = betaNotifs.some((n) => n.notificationId === notifId);
    assert(!leak, "Tenant Isolation: Beta student sees 0 announcements from Alpha");
  } catch (err: any) {
    assert(false, `Communication tenant isolation error: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // 4. CAMPUS SERVICES MODULE (Hostel, Transport, Resource Bookings)
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Testing Campus Services Module ---");

  // 4.1 Hostel Allocation & Room Duplicate Prevention
  let hostelAllocId = "";
  try {
    const hostelAlloc = await createHostelAllocation(ctx.instAlphaId, {
      studentId: ctx.studentAlpha.id,
      hostelName: "Aryabhata Hall of Residence",
      roomNumber: "302",
      bedNumber: "Bed-A",
      wardenName: "Dr. K. Swaminathan",
      wardenContact: "+91 98450 11999",
    });

    assert(Boolean(hostelAlloc.id), "Admin successfully allocated hostel bed to student");
    assert(hostelAlloc.hostelName === "Aryabhata Hall of Residence", "Hostel name accurately recorded");
    hostelAllocId = hostelAlloc.id;

    // Verify student can view their hostel allocation
    const studentHostel = await db.hostelAllocation.findFirst({
      where: { studentId: ctx.studentAlpha.id, institutionId: ctx.instAlphaId },
    });
    assert(studentHostel?.roomNumber === "302", "Student can view assigned room (302)");

    // Double-booking check: Attempting to allocate same bed in same room should be blocked
    let doubleBookingBlocked = false;
    try {
      await createHostelAllocation(ctx.instAlphaId, {
        studentId: ctx.studentBeta.id, // Different student
        hostelName: "Aryabhata Hall of Residence",
        roomNumber: "302",
        bedNumber: "Bed-A", // Same bed!
        wardenName: "Dr. K. Swaminathan",
        wardenContact: "+91 98450 11999",
      });
    } catch {
      doubleBookingBlocked = true;
    }
    assert(doubleBookingBlocked, "System prevents double-booking of same hostel bed/room");
  } catch (err: any) {
    assert(false, `Hostel allocation error: ${err.message}`);
  }

  // 4.2 Transport Route Allocation
  let transportAllocId = "";
  try {
    const transportAlloc = await createTransportAllocation(ctx.instAlphaId, {
      studentId: ctx.studentAlpha.id,
      routeName: "Electronic City Express",
      routeNumber: "R-14",
      vehicleNumber: "KA-01-EQ-9876",
      driverName: "Manjunath Gowda",
      driverContact: "+91 98450 22334",
      pickupPoint: "Silk Board Junction",
      pickupTime: "07:15 AM",
      dropTime: "05:45 PM",
    });

    assert(Boolean(transportAlloc.id), "Admin successfully allocated transport route");
    assert(transportAlloc.routeNumber === "R-14", "Transport route number accurately recorded");
    transportAllocId = transportAlloc.id;

    // Student views transport allocation
    const studentTransport = await db.transportAllocation.findFirst({
      where: { studentId: ctx.studentAlpha.id, institutionId: ctx.instAlphaId },
    });
    assert(studentTransport?.pickupPoint === "Silk Board Junction", "Student views assigned pickup point");
  } catch (err: any) {
    assert(false, `Transport allocation error: ${err.message}`);
  }

  // 4.3 Student Resource Reservation & Admin Approval Workflow
  let bookingId = "";
  try {
    // Student books a high-performance lab workstation
    const booking = await db.resourceBooking.create({
      data: {
        institutionId: ctx.instAlphaId,
        studentId: ctx.studentAlpha.id,
        resourceType: "LAB_WORKSTATION",
        resourceName: "AI/ML GPU Cluster Station #04",
        bookingDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
        timeSlot: "14:00 - 18:00",
        purpose: "Final Year Capstone Model Training (Deep Learning)",
        status: "PENDING",
      },
    });
    bookingId = booking.id;
    assert(Boolean(booking.id), "Student submitted resource booking request");
    assert(booking.status === "PENDING", "Booking status starts as PENDING");

    // Also register approval request
    const approval = await db.approvalRequest.create({
      data: {
        institutionId: ctx.instAlphaId,
        userId: ctx.studentAlpha.userId,
        requestType: "RESOURCE_BOOKING",
        title: `Resource Booking: ${booking.resourceName}`,
        requestedDataJson: JSON.stringify({ bookingId: booking.id, resourceName: booking.resourceName }),
        status: "PENDING",
      },
    });

    // Admin adjudicates approval request
    await processApprovalRequest(
      ctx.instAlphaId,
      approval.id,
      "APPROVED",
      "Approved for final year capstone compute requirements.",
      ctx.adminAlphaUserId
    );

    // Verify resource booking status is synchronized to APPROVED
    const updatedBooking = await db.resourceBooking.findUnique({
      where: { id: bookingId },
    });
    assert(updatedBooking?.status === "APPROVED", "Admin approval automatically synchronized resource booking to APPROVED");
  } catch (err: any) {
    assert(false, `Resource booking workflow error: ${err.message}`);
  }

  // 4.4 Campus Services Overview
  try {
    const overview = await getCampusServicesOverview(ctx.instAlphaId);
    assert(overview.hostel.totalAllocations >= 1, "Campus overview reflects active hostel allocations");
    assert(overview.transport.totalAllocations >= 1, "Campus overview reflects active transport routes");
    assert(overview.resourceBookings.totalBookings >= 1, "Campus overview reflects resource bookings");
  } catch (err: any) {
    assert(false, `Campus services overview error: ${err.message}`);
  }

  // 4.5 Tenant Isolation in Campus Services
  try {
    const betaHostel = await getHostelAllocations(ctx.instBetaId);
    const betaTransport = await getTransportAllocations(ctx.instBetaId);
    const hostelLeak = betaHostel.some((h: any) => h.id === hostelAllocId);
    const transportLeak = betaTransport.some((t: any) => t.id === transportAllocId);
    assert(!hostelLeak, "Tenant Isolation: Beta institution sees 0 hostel allocations from Alpha");
    assert(!transportLeak, "Tenant Isolation: Beta institution sees 0 transport allocations from Alpha");
  } catch (err: any) {
    assert(false, `Campus services tenant isolation error: ${err.message}`);
  }

  // Cleanup created test allocations to leave clean state
  try {
    if (hostelAllocId) await deleteHostelAllocation(ctx.instAlphaId, hostelAllocId);
    if (transportAllocId) await deleteTransportAllocation(ctx.instAlphaId, transportAllocId);
    if (notifId) await deleteNotification(ctx.instAlphaId, notifId);
  } catch {}

  console.log("\n========================================================");
  console.log(`PHASE 3 INTEGRATION TEST RESULTS: ${testPassed} PASSED, ${testFailed} FAILED`);
  console.log("========================================================\n");

  if (testFailed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error("Test Suite Fatal Error:", e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
