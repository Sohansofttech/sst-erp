import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getAttendanceRecords,
  markStudentAttendance,
} from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const sectionId = req.nextUrl.searchParams.get("sectionId") || undefined;
    const studentId = req.nextUrl.searchParams.get("studentId") || undefined;
    const dateStr = req.nextUrl.searchParams.get("date") || undefined;

    const records = await getAttendanceRecords(institutionId, {
      studentId,
      date: dateStr ? new Date(dateStr) : undefined,
    });

    return NextResponse.json({
      success: true,
      data: records,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!Array.isArray(body.records) || body.records.length === 0) {
      return NextResponse.json(
        { success: false, error: "An array of attendance records is required." },
        { status: 400 }
      );
    }

    const formattedRecords = body.records.map((r: any) => ({
      studentId: r.studentId,
      sectionId: r.sectionId || body.sectionId,
      subjectId: r.subjectId || body.subjectId,
      date: new Date(r.date || body.date || new Date()),
      status: r.status,
      recordedByUserId: userId,
      remarks: r.remarks,
    }));

    const results = await markStudentAttendance(institutionId, formattedRecords);

    return NextResponse.json({
      success: true,
      message: `Recorded attendance for ${results.length} students.`,
      data: results,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
