import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import { getStudents, projectStudentDirectoryItem } from "@/lib/services/institution-admin.service";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


/**
 * Shared read-only Student Directory for departmental staff and Institution Admin.
 * Strips sensitive personal fields (address, guardian contacts, DOB, blood group, etc.).
 */
export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.STUDENTS_READ,
    });
    await requireReadReq(req, institutionId);
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const status = req.nextUrl.searchParams.get("status") || "ACTIVE";
    const take = parseInt(req.nextUrl.searchParams.get("take") || "100", 10);

    const students = await getStudents(institutionId, { search, status, take });
    const directory = students.map(projectStudentDirectoryItem);

    return NextResponse.json({
      success: true,
      readOnly: true,
      data: directory,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
