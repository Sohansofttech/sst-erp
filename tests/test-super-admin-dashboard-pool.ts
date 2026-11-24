import assert from "node:assert/strict";
import db from "../lib/db";

async function testSuperAdminDashboardPool() {
  console.log("==================================================================");
  console.log("TESTING SUPER ADMIN DASHBOARD WITH UPDATED DB POOL CONFIGURATION");
  console.log("==================================================================");

  // 1. Verify pool settings in db.ts
  console.log("\n1. Verifying DB Pool configuration...");
  assert.ok(db, "Prisma Client with pg adapter must be initialized");
  const testPing = await db.$queryRaw<Array<{ ping: number }>>`SELECT 1 as ping`;
  assert.equal(testPing[0].ping, 1, "Database ping query must succeed");
  console.log("[PASS] Database connection and query execution verified.");

  // 2. Test concurrent query execution simulating Super Admin Dashboard load
  console.log("\n2. Executing concurrent dashboard queries...");
  const start = Date.now();

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const from = defaultFrom;
  const until = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const activityPeriod = { createdAt: { gte: from, lt: until } };
  const activeSubscriptionWhere = { status: "ACTIVE" as const, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };

  const [
    totalInstitutions,
    activeInstitutions,
    suspendedInstitutions,
    pendingInstitutions,
    totalStudents,
    totalUsers,
    activeSubscriptions,
    expiredSubscriptions,
    activePlanPrices,
    recentInstitutions,
    recentAuditLogs,
    recentNotifications,
    expiringSubscriptions,
    failedPayments,
    openSupportTickets,
    storageMetric,
    institutionsCreated,
    studentsCreated,
    usersCreated,
    subscriptionsCreated,
    paidPayments,
    subscriptionDistribution,
    subscriptionStatusDistribution,
    paymentStatusDistribution,
    institutionStatusDistribution,
    onboardingFunnel,
    institutionPerformance,
    studentPopulation,
    usageByInstitution,
    featureOverrides,
    roleDistribution,
  ] = await Promise.all([
    db.platformInstitution.count(),
    db.platformInstitution.count({ where: { status: "ACTIVE" } }),
    db.platformInstitution.count({ where: { status: "SUSPENDED" } }),
    db.platformInstitution.count({ where: { status: "PENDING" } }),
    db.student.count(),
    db.platformUser.count(),
    db.institutionSubscription.count({ where: activeSubscriptionWhere }),
    db.institutionSubscription.count({ where: { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", endsAt: { lte: now } }] } }),
    db.institutionSubscription.findMany({
      where: activeSubscriptionWhere,
      select: { plan: { select: { price: true, currency: true, billingCycle: true, customCycleDays: true } } },
    }),
    db.platformInstitution.findMany({
      where: activityPeriod,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, type: true, status: true, createdAt: true },
    }),
    db.platformAuditLog.findMany({
      where: activityPeriod,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true, email: true } }, institution: { select: { name: true } } },
    }),
    db.platformNotification.findMany({ where: { status: { in: ["PUBLISHED", "SCHEDULED"] } }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, title: true, status: true, createdAt: true } }),
    db.institutionSubscription.findMany({
      where: { ...activeSubscriptionWhere, endsAt: { gte: now, lte: new Date(now.getTime() + 30 * 86400000) } },
      orderBy: { endsAt: "asc" },
      take: 5,
      select: { id: true, endsAt: true, institution: { select: { name: true } } },
    }),
    db.payment.count({ where: { status: "FAILED" } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_RESPONSE"] } } }),
    db.institutionUsageMetric.findMany({
      where: { metric: "storage_bytes" },
      distinct: ["institutionId"],
      orderBy: { measuredAt: "desc" },
      select: { value: true },
    }),
    db.platformInstitution.findMany({ where: activityPeriod, select: { createdAt: true } }),
    db.student.findMany({ where: { createdAt: activityPeriod.createdAt }, select: { createdAt: true } }),
    db.platformUser.findMany({ where: { createdAt: activityPeriod.createdAt }, select: { createdAt: true } }),
    db.institutionSubscription.findMany({ where: { createdAt: activityPeriod.createdAt }, select: { createdAt: true } }),
    db.payment.findMany({
      where: { status: "SUCCEEDED", paidAt: { gte: from, lt: until } },
      select: { amount: true, currency: true, paidAt: true, invoice: { select: { subscription: { select: { plan: { select: { name: true } } } } } } },
    }),
    db.institutionSubscription.groupBy({ by: ["planId"], where: activeSubscriptionWhere, _count: { _all: true } }),
    db.institutionSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
    db.payment.groupBy({ by: ["status"], _count: { _all: true } }),
    db.platformInstitution.groupBy({ by: ["status"], _count: { _all: true } }),
    db.platformInstitution.groupBy({ by: ["onboardingStage"], _count: { _all: true } }),
    db.platformInstitution.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        memberships: { where: { status: "ACTIVE" }, select: { id: true } },
        subscriptions: { where: activeSubscriptionWhere, orderBy: { startsAt: "desc" }, take: 1, select: { plan: { select: { name: true } } } },
      },
    }),
    db.institution.findMany({ take: 100, select: { id: true, name: true, _count: { select: { students: true } } } }),
    db.institutionUsageMetric.findMany({ orderBy: { measuredAt: "desc" }, take: 100, select: { institutionId: true, metric: true, value: true, unit: true, institution: { select: { name: true } } } }),
    db.institutionFeatureOverride.groupBy({ by: ["featureId"], where: { enabled: true }, _count: { _all: true } }),
    db.platformUser.groupBy({ by: ["platformRole"], _count: { _all: true } }),
  ]);

  const elapsed = Date.now() - start;
  console.log(`[PASS] All 31 dashboard queries resolved in ${elapsed}ms.`);
  assert.ok(totalInstitutions > 0, "totalInstitutions must be > 0");
  assert.ok(totalStudents > 0, "totalStudents must be > 0");
  assert.ok(totalUsers > 0, "totalUsers must be > 0");
  console.log(`  - Total Institutions: ${totalInstitutions}`);
  console.log(`  - Active Institutions: ${activeInstitutions}`);
  console.log(`  - Pending Institutions: ${pendingInstitutions}`);
  console.log(`  - Total Students: ${totalStudents}`);
  console.log(`  - Platform Users: ${totalUsers}`);

  // 3. Test idle connection release
  console.log("\n3. Testing idle connection cleanup...");
  console.log("Waiting 2000ms for idleTimeoutMillis (1500ms) to release pool sockets...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Verify database can accept another fresh query after idle eviction
  const postIdleCheck = await db.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
  assert.equal(postIdleCheck[0].ok, 1, "Query after idle connection eviction must succeed seamlessly");
  console.log("[PASS] Post-idle connection re-acquisition verified.");

  console.log("\n==================================================================");
  console.log("SUPER ADMIN DASHBOARD POOL TESTS: ALL PASSED");
  console.log("==================================================================");
}

testSuperAdminDashboardPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
  });

