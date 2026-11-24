import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })
dotenv.config()

import { prisma } from "../lib/prisma"
import {
  resolveInstitution,
  getTenantContext,
  getTeacherSession,
} from "../lib/auth/teacher-session"
import {
  getTeacherDashboard,
  getTeacherDashboardOverview,
  getTeacherPortalKpis,
  getAttendanceSessions,
  getClassAllocations,
  getSubjectAllocations,
  getSectionStudents,
  getDepartmentFacultyLoad,
  getInternalAssessments,
  getTeacherLeaveRequests,
} from "../lib/services/teacher.service"

async function runPerformanceBenchmark() {
  console.log("==================================================")
  console.log("   SST-ERP Faculty Portal Performance Benchmark   ")
  console.log("==================================================")

  const timings: Record<string, number> = {}

  // 1. Institution & Tenant Context Resolution
  console.log("\n[1/7] Testing Tenant Context Resolution...")
  const t0 = performance.now()
  const tenantContext = await getTenantContext("demo-school")
  timings["tenantContext_initial"] = Math.round(performance.now() - t0)
  console.log(`  - Initial Tenant Context: ${timings["tenantContext_initial"]}ms`)
  console.log(`  - Institution: ${tenantContext.institution.name} (${tenantContext.institution.id})`)
  console.log(`  - Academic Years count: ${tenantContext.academicYears.length}`)

  // Cached lookup
  const t0Cached = performance.now()
  await getTenantContext("demo-school")
  timings["tenantContext_cached"] = Math.round(performance.now() - t0Cached)
  console.log(`  - Cached Tenant Context: ${timings["tenantContext_cached"]}ms`)

  // 2. Attendance Sessions Query
  console.log("\n[2/7] Testing Attendance Sessions Query...")
  const tAtt = performance.now()
  const sessions = await getAttendanceSessions({
    institutionId: tenantContext.institution.id,
    take: 50,
  })
  timings["attendanceSessions"] = Math.round(performance.now() - tAtt)
  console.log(`  - Attendance Sessions query (bounded take=50): ${timings["attendanceSessions"]}ms`)
  console.log(`  - Sessions returned: ${sessions.length}`)

  // 3. Class Allocations and Subject Allocations
  console.log("\n[3/7] Testing Class & Subject Allocations...")
  const tClass = performance.now()
  const classAllocs = await getClassAllocations(undefined, tenantContext.currentAcademicYear?.id)
  timings["classAllocations"] = Math.round(performance.now() - tClass)
  console.log(`  - Class Allocations (AY passed): ${timings["classAllocations"]}ms`)
  console.log(`  - Classes count: ${classAllocs.length}`)

  const tSub = performance.now()
  const subAllocs = await getSubjectAllocations(undefined, tenantContext.currentAcademicYear?.id)
  timings["subjectAllocations"] = Math.round(performance.now() - tSub)
  console.log(`  - Subject Allocations (AY passed): ${timings["subjectAllocations"]}ms`)
  console.log(`  - Subjects count: ${subAllocs.length}`)

  // 4. Section Students Roster (Optimized vs Full)
  console.log("\n[4/7] Testing Section Students Query Optimization...")
  const testSectionId = classAllocs[0]?.sectionId || "sec-10a"
  const tRosterOpt = performance.now()
  const rosterOpt = await getSectionStudents(testSectionId, undefined, tenantContext.institution.id, {
    includeGuardians: false,
  })
  timings["roster_without_guardians"] = Math.round(performance.now() - tRosterOpt)
  console.log(`  - Roster without deep guardian joins: ${timings["roster_without_guardians"]}ms (${rosterOpt.length} students)`)

  const tRosterFull = performance.now()
  const rosterFull = await getSectionStudents(testSectionId, undefined, tenantContext.institution.id, {
    includeGuardians: true,
  })
  timings["roster_with_guardians"] = Math.round(performance.now() - tRosterFull)
  console.log(`  - Roster with full guardian joins: ${timings["roster_with_guardians"]}ms (${rosterFull.length} students)`)

  // 5. Lightweight Shell KPIs
  console.log("\n[5/7] Testing Shell KPI Fetching...")
  const tKpi = performance.now()
  const kpis = await getTeacherPortalKpis("demo-school")
  timings["shell_kpis"] = Math.round(performance.now() - tKpi)
  console.log(`  - Shell KPIs: ${timings["shell_kpis"]}ms`)
  console.log(`  - Unread notifications: ${kpis.unreadNotificationsCount}, Pending approvals: ${kpis.pendingApprovalsCount}`)

  // 6. Full Dashboard Overview (Teacher Page)
  console.log("\n[6/7] Testing Full Teacher Dashboard Overview...")
  const tDash = performance.now()
  const dashboardOverview = await getTeacherDashboardOverview("demo-school")
  timings["dashboard_overview_initial"] = Math.round(performance.now() - tDash)
  console.log(`  - Full Dashboard Overview initial: ${timings["dashboard_overview_initial"]}ms`)
  console.log(`  - Slots count: ${dashboardOverview.slots.length}`)
  console.log(`  - Defaulter alerts count: ${dashboardOverview.alerts.length}`)

  // Cached overview
  const tDashCached = performance.now()
  await getTeacherDashboardOverview("demo-school")
  timings["dashboard_overview_cached"] = Math.round(performance.now() - tDashCached)
  console.log(`  - Full Dashboard Overview cached: ${timings["dashboard_overview_cached"]}ms`)

  // 7. HOD Route Metrics
  console.log("\n[7/7] Testing HOD Route Data Queries...")
  const tHod = performance.now()
  const [facultyLoad, assessments, facultyLeaves] = await Promise.all([
    getDepartmentFacultyLoad(),
    getInternalAssessments(),
    getTeacherLeaveRequests(),
  ])
  timings["hod_dashboard_all"] = Math.round(performance.now() - tHod)
  console.log(`  - HOD Parallel Data Fetch: ${timings["hod_dashboard_all"]}ms`)
  console.log(`  - Faculty load items: ${facultyLoad.length}`)
  console.log(`  - Internal assessments: ${assessments.length}`)
  console.log(`  - Faculty leaves: ${facultyLeaves.length}`)

  console.log("\n==================================================")
  console.log("               BENCHMARK SUMMARY                 ")
  console.log("==================================================")
  console.table(
    Object.entries(timings).map(([operation, timeMs]) => ({
      Operation: operation,
      "Duration (ms)": timeMs,
      Status: timeMs < 500 ? "EXCELLENT (<500ms)" : timeMs < 1500 ? "ACCEPTABLE (<1500ms)" : "SLOW (>1500ms)",
    }))
  )

  await prisma.$disconnect()
  console.log("\nDatabase disconnected cleanly. Benchmark finished successfully.")
  process.exit(0)
}

runPerformanceBenchmark().catch(async (err) => {
  console.error("Benchmark failed with error:", err)
  await prisma.$disconnect()
  process.exit(1)
})
