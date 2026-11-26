import { NextRequest, NextResponse } from "next/server";
import { resolveDivisionContext } from "@/lib/security/division-context";
import { handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import {
  getHostelAllocations,
  getTransportAllocations,
  getDashboardMetrics,
} from "@/lib/services/institution-admin.service";
import { getLibraryCirculationReport } from "@/lib/services/library.service";
import {
  getConsolidatedInstitutionReport,
  getDivisionSpecificReport,
} from "@/lib/services/division-reporting.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const reportType = (req.nextUrl.searchParams.get("type") || "overview").toLowerCase();
    const context = await resolveDivisionContext(req, undefined, {
      allowUnscoped: true,
      ...(reportType === "finance" ? { requiredPermission: PERMISSIONS.REPORTS_FINANCE } : {}),
    });
    const institutionId = context.institutionId;
    const divisionIdParam = req.nextUrl.searchParams.get("divisionId");
    const academicYearId = req.nextUrl.searchParams.get("academicYearId") || undefined;
    const gradeLevel = req.nextUrl.searchParams.get("gradeLevel") || undefined;
    const stream = req.nextUrl.searchParams.get("stream") || undefined;
    const classId = req.nextUrl.searchParams.get("classId") || undefined;
    const semesterStr = req.nextUrl.searchParams.get("semester");
    const semester = semesterStr ? parseInt(semesterStr, 10) : undefined;
    const startDateStr = req.nextUrl.searchParams.get("startDate");
    const endDateStr = req.nextUrl.searchParams.get("endDate");
    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    // Resolve target division ID
    let targetDivisionId: string | undefined = undefined;
    if (divisionIdParam && divisionIdParam !== "__ALL__") {
      targetDivisionId = divisionIdParam;
    } else if (!context.isInstitutionWideAdmin && context.activeDivisionId) {
      targetDivisionId = context.activeDivisionId;
    }

    // Verify division access if targeting a specific division
    if (targetDivisionId) {
      if (!context.isInstitutionWideAdmin && !context.permittedDivisionIds.includes(targetDivisionId)) {
        return NextResponse.json(
          { success: false, error: "Security Violation: You are not authorized to view reports for this division." },
          { status: 403 }
        );
      }
    }

    // 1. Consolidated Report across all divisions
    if (reportType === "consolidated" || (!targetDivisionId && reportType === "overview" && context.isInstitutionWideAdmin)) {
      const consolidated = await getConsolidatedInstitutionReport(institutionId, {
        academicYearId,
        startDate,
        endDate,
      });
      return NextResponse.json({
        success: true,
        reportType: "CONSOLIDATED",
        data: consolidated,
      });
    }

    // 2. Division-Specific Report
    if (reportType === "division" || (targetDivisionId && reportType === "overview")) {
      const divisionReport = await getDivisionSpecificReport(institutionId, targetDivisionId!, {
        academicYearId,
        classId,
        gradeLevel,
        stream,
        semester,
        startDate,
        endDate,
      });
      return NextResponse.json({
        success: true,
        reportType: "DIVISION_SPECIFIC",
        data: divisionReport,
      });
    }

    // 3. Finance Report (with division filtering)
    if (reportType === "finance") {
      const invoices = await db.feeInvoice.findMany({
        where: {
          institutionId,
          ...(targetDivisionId ? { divisionId: targetDivisionId } : {}),
          ...(startDate || endDate
            ? {
                createdAt: {
                  ...(startDate ? { gte: startDate } : {}),
                  ...(endDate ? { lte: endDate } : {}),
                },
              }
            : {}),
        },
        include: {
          student: { select: { fullName: true, rollNumber: true } },
          division: { select: { id: true, name: true, code: true, type: true } },
        },
      });

      const totalBilled = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
      const totalCollected = invoices.reduce((acc, inv) => acc + inv.paidAmount, 0);
      const totalOutstanding = invoices.reduce((acc, inv) => acc + inv.outstandingAmount, 0);
      const now = new Date();
      const overdueInvoices = invoices.filter((i) => i.outstandingAmount > 0 && new Date(i.dueDate) < now);
      const totalOverdue = overdueInvoices.reduce((acc, inv) => acc + inv.outstandingAmount, 0);

      return NextResponse.json({
        success: true,
        reportType: "FINANCE",
        divisionId: targetDivisionId || "ALL_DIVISIONS",
        data: {
          summary: {
            totalInvoices: invoices.length,
            totalBilled,
            totalCollected,
            totalOutstanding,
            totalOverdue,
            collectionRate: totalBilled > 0 ? Number(((totalCollected / totalBilled) * 100).toFixed(1)) : 0,
          },
          invoices: invoices.map((inv) => ({
            invoiceNumber: inv.invoiceNumber,
            divisionName: inv.division?.name || "Standard",
            studentName: inv.student?.fullName || "Student",
            rollNumber: inv.student?.rollNumber || "N/A",
            totalAmount: inv.totalAmount,
            paidAmount: inv.paidAmount,
            outstandingAmount: inv.outstandingAmount,
            status: inv.status,
            dueDate: inv.dueDate,
          })),
        },
      });
    }

    // 4. Academic Exams & Results (with division filtering)
    if (reportType === "academics") {
      const [schedules, results] = await Promise.all([
        db.examSchedule.findMany({
          where: {
            institutionId,
            ...(semester ? { semester } : {}),
          },
          include: { slots: true },
        }),
        db.examResult.findMany({
          where: { institutionId },
        }),
      ]);

      const totalExams = schedules.length;
      const publishedExams = schedules.filter((s) => s.isPublished).length;
      const totalResults = results.length;
      const passedResults = results.filter((r) => r.isPassed).length;
      const overallPassRate = totalResults > 0 ? Number(((passedResults / totalResults) * 100).toFixed(1)) : 0;

      return NextResponse.json({
        success: true,
        reportType: "ACADEMICS",
        divisionId: targetDivisionId || "ALL_DIVISIONS",
        data: {
          totalExams,
          publishedExams,
          totalResults,
          passedResults,
          overallPassRate,
          schedules,
        },
      });
    }

    // 5. Library Circulation
    if (reportType === "library") {
      const libReport = await getLibraryCirculationReport(institutionId);
      return NextResponse.json({
        success: true,
        reportType: "LIBRARY",
        data: libReport,
      });
    }

    // 6. Campus & Facilities
    if (reportType === "campus") {
      const [hostel, transport] = await Promise.all([
        getHostelAllocations(institutionId),
        getTransportAllocations(institutionId),
      ]);

      return NextResponse.json({
        success: true,
        reportType: "CAMPUS",
        data: {
          hostel: {
            totalOccupiedBeds: hostel.length,
            allocations: hostel,
          },
          transport: {
            totalAllocatedStudents: transport.length,
            allocations: transport,
          },
        },
      });
    }

    // Default Fallback: Dashboard metrics
    const metrics = await getDashboardMetrics(institutionId);
    return NextResponse.json({
      success: true,
      reportType: "OVERVIEW",
      data: metrics,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
