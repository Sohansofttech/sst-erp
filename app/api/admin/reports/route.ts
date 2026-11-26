import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import {
  getFeeInvoices,
  getHostelAllocations,
  getTransportAllocations,
  getDashboardMetrics,
} from "@/lib/services/institution-admin.service";
import { getLibraryCirculationReport } from "@/lib/services/library.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const reportType = req.nextUrl.searchParams.get("type") || "overview";
    const { institutionId } = await resolveAdminContext(
      req,
      reportType === "finance" ? { requiredPermission: PERMISSIONS.REPORTS_FINANCE } : undefined
    );

    if (reportType === "finance") {
      const invoices = await getFeeInvoices(institutionId);
      const totalBilled = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
      const totalCollected = invoices.reduce((acc, inv) => acc + inv.paidAmount, 0);
      const totalOutstanding = invoices.reduce((acc, inv) => acc + inv.outstandingAmount, 0);
      const now = new Date();
      const overdueInvoices = invoices.filter((i) => i.outstandingAmount > 0 && new Date(i.dueDate) < now);
      const totalOverdue = overdueInvoices.reduce((acc, inv) => acc + inv.outstandingAmount, 0);

      return NextResponse.json({
        success: true,
        reportType: "FINANCE",
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

    if (reportType === "academics") {
      const [schedules, results] = await Promise.all([
        db.examSchedule.findMany({
          where: { institutionId },
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

    if (reportType === "library") {
      const libReport = await getLibraryCirculationReport(institutionId);
      return NextResponse.json({
        success: true,
        reportType: "LIBRARY",
        data: libReport,
      });
    }

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

    // Default: Comprehensive Overview
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
