import { NextRequest, NextResponse } from "next/server";
import { resolveDivisionContext } from "@/lib/security/division-context";
import { handleAdminApiError } from "@/lib/security/admin-auth";
import db from "@/lib/db";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    await requireReadReq(req, context.institutionId);
    const institutionId = context.institutionId;

    // Filter divisions to only those permitted for the user
    const divisionWhere: Record<string, any> = {
      institutionId,
    };

    if (!context.isInstitutionWideAdmin) {
      divisionWhere.id = { in: context.permittedDivisionIds };
    }

    const divisions = await db.institutionDivision.findMany({
      where: divisionWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        slug: true,
        type: true,
        status: true,
        logoUrl: true,
        academicSettings: true,
      },
    });

    // For each division, count active students, enrollments, classes, staff, fee collection
    const divisionSummaries = await Promise.all(
      divisions.map(async (division) => {
        try {
          const [studentCount, classCount, staffCount, feeSummary] = await Promise.all([
            db.student.count({
              where: {
                institutionId,
                currentDivisionId: division.id,
                status: "ACTIVE",
              },
            }),
            db.class.count({
              where: {
                institutionId,
                divisionId: division.id,
                isActive: true,
              },
            }),
            db.staffDivisionAssignment.count({
              where: {
                institutionId,
                divisionId: division.id,
                status: "ACTIVE",
              },
            }),
            db.feeInvoice.aggregate({
              where: {
                institutionId,
                divisionId: division.id,
              },
              _sum: {
                paidAmount: true,
              },
            }),
          ]);

          return {
            id: division.id,
            name: division.name,
            code: division.code,
            slug: division.slug,
            type: division.type,
            status: division.status,
            logoUrl: division.logoUrl,
            academicSettings: division.academicSettings,
            studentCount,
            classCount,
            staffCount,
            feesCollected: feeSummary._sum?.paidAmount ? Number(feeSummary._sum.paidAmount) : 0,
          };
        } catch (err) {
          console.warn(`Failed to aggregate stats for division ${division.id}:`, err);
          return {
            id: division.id,
            name: division.name,
            code: division.code,
            slug: division.slug,
            type: division.type,
            status: division.status,
            logoUrl: division.logoUrl,
            academicSettings: division.academicSettings,
            studentCount: 0,
            classCount: 0,
            staffCount: 0,
            feesCollected: 0,
          };
        }
      })
    );

    // Compute institution-level aggregates across permitted divisions
    const totals = {
      totalDivisions: divisionSummaries.length,
      totalActiveStudents: divisionSummaries.reduce((acc, d) => acc + d.studentCount, 0),
      totalClasses: divisionSummaries.reduce((acc, d) => acc + d.classCount, 0),
      totalStaff: divisionSummaries.reduce((acc, d) => acc + d.staffCount, 0),
      totalFeesCollected: divisionSummaries.reduce((acc, d) => acc + d.feesCollected, 0),
    };

    return NextResponse.json({
      success: true,
      data: {
        institutionId,
        isInstitutionWide: context.isInstitutionWideAdmin,
        activeDivisionId: context.activeDivisionId || null,
        totals,
        divisions: divisionSummaries,
      },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
