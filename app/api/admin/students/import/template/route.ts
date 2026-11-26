import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import { buildCsvTemplate, buildXlsxTemplateBuffer } from "@/lib/services/student-import.service";

export async function GET(req: NextRequest) {
  try {
    await resolveAdminContext(req, { requiredPermission: PERMISSIONS.ADMIN_ALL });
    const format = (req.nextUrl.searchParams.get("format") || "csv").toLowerCase();

    if (format === "xlsx") {
      const buffer = await buildXlsxTemplateBuffer();
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="sst-erp-student-import-template.xlsx"',
        },
      });
    }

    const csv = buildCsvTemplate();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sst-erp-student-import-template.csv"',
      },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
