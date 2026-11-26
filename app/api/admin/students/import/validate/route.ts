import { NextRequest, NextResponse } from "next/server";
import { requireActiveSubscription, handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import {
  applyColumnMapping,
  parseImportFileBuffer,
  validateStudentImportRows,
  type ImportTargetField,
} from "@/lib/services/student-import.service";

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });

    const contentType = req.headers.get("content-type") || "";
    let fileType: "CSV" | "XLSX" = "CSV";
    let fileName = "upload.csv";
    let headers: string[] = [];
    let rawRows: Record<string, string>[] = [];
    let mapping: Partial<Record<ImportTargetField, string>> = {};

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ success: false, error: "Please upload a .csv or .xlsx file." }, { status: 400 });
      }
      fileName = file.name || "upload.csv";
      const arrayBuf = await file.arrayBuffer();
      const parsed = await parseImportFileBuffer(fileName, file.type || "", Buffer.from(arrayBuf));
      fileType = parsed.fileType;
      headers = parsed.headers;
      rawRows = parsed.rows;
      mapping = parsed.suggestedMapping;

      const customMappingRaw = formData.get("mapping");
      if (typeof customMappingRaw === "string" && customMappingRaw.trim()) {
        try {
          mapping = JSON.parse(customMappingRaw);
        } catch {
          return NextResponse.json({ success: false, error: "Invalid column mapping JSON." }, { status: 400 });
        }
      }
    } else {
      const body = await req.json();
      if (!Array.isArray(body.rawRows) || !body.mapping) {
        return NextResponse.json(
          { success: false, error: "Either multipart file upload or { rawRows, mapping } is required." },
          { status: 400 }
        );
      }
      rawRows = body.rawRows;
      headers = Array.isArray(body.headers) ? body.headers : Object.keys(rawRows[0] || {});
      mapping = body.mapping;
      fileName = body.fileName || "upload.csv";
      fileType = body.fileType === "XLSX" ? "XLSX" : "CSV";
    }

    const mapped = applyColumnMapping(rawRows, mapping);
    const validation = await validateStudentImportRows(institutionId, mapped);

    return NextResponse.json({
      success: true,
      data: {
        fileName,
        fileType,
        headers,
        mapping,
        rawRows,
        results: validation.results,
        summary: validation.summary,
      },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
