import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const url = new URL(req.url);
    const requestedStudentId = url.searchParams.get("studentId") || session.studentId || session.activeChildId;

    if (!requestedStudentId) {
      return NextResponse.json({ success: false, error: "Missing student ID" }, { status: 400 });
    }

    const { studentId } = await authorizeStudentOrParentAccess(session, requestedStudentId);

    const [assessments, approvals] = await Promise.all([
      db.assessmentRecord.findMany({
        where: {
          studentId,
          institutionId: session.institutionId,
        },
        include: {
          subject: true,
        },
        orderBy: { conductedDate: "desc" },
      }),
      db.approvalRequest.findMany({
        where: {
          institutionId: session.institutionId,
          requestType: "INTERNAL_ASSESSMENT",
        },
      }),
    ]);

    const approvalStatusMap = new Map<string, string>();
    for (const apr of approvals) {
      if (apr.id) {
        approvalStatusMap.set(apr.id.replace("apr-ia-", ""), apr.status);
      }
      if (apr.title) {
        approvalStatusMap.set(apr.title.toLowerCase().trim(), apr.status);
        const stripped = apr.title.replace(/^ia(\s*published)?:\s*/i, "").toLowerCase().trim();
        if (stripped) {
          approvalStatusMap.set(stripped, apr.status);
        }
      }
      try {
        const parsed = JSON.parse(apr.requestedDataJson);
        if (parsed.assessmentName) {
          approvalStatusMap.set(parsed.assessmentName.toLowerCase().trim(), apr.status);
        }
        if (parsed.assessmentId) {
          approvalStatusMap.set(parsed.assessmentId, apr.status);
        }
      } catch {}
    }

    // Filter out DRAFT, PENDING, SUBMITTED, RETURNED assessments — return ONLY published assessments to students/parents
    const publishedAssessments = assessments.filter((item) => {
      const nameKey = item.assessmentName.toLowerCase().trim();
      const status = approvalStatusMap.get(item.id) || approvalStatusMap.get(nameKey);
      if (status) {
        return status === "APPROVED" || status === "PUBLISHED" || status === "LOCKED";
      }
      // If no explicit approval request exists for legacy assessment records, check remarks
      if (item.remarks && item.remarks.toUpperCase().includes("DRAFT")) {
        return false;
      }
      return true;
    });

    // Group by subject
    const subjectWiseMap = new Map<string, any>();
    publishedAssessments.forEach((item) => {
      const existing = subjectWiseMap.get(item.subjectId) || {
        subjectCode: item.subject.code,
        subjectName: item.subject.name,
        assessments: [],
        totalMarksScored: 0,
        totalMaxMarks: 0,
      };
      existing.assessments.push({
        id: item.id,
        assessmentName: item.assessmentName,
        marksObtained: item.marksObtained,
        maxMarks: item.maxMarks,
        weightage: item.weightage,
        remarks: item.remarks,
        conductedDate: item.conductedDate,
      });
      existing.totalMarksScored += item.marksObtained;
      existing.totalMaxMarks += item.maxMarks;
      subjectWiseMap.set(item.subjectId, existing);
    });

    const subjectWiseAssessments = Array.from(subjectWiseMap.values()).map((s) => ({
      ...s,
      percentage: s.totalMaxMarks > 0 ? Math.round((s.totalMarksScored / s.totalMaxMarks) * 100) : 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        assessments: publishedAssessments,
        subjectWise: subjectWiseAssessments,
      },
    }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch internal assessments" },
      { status: err.name === "ForbiddenError" ? 403 : 500 }
    );
  }
}
