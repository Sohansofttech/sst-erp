import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { recordAuditLog, getStaff } from "@/lib/services/institution-admin.service";
import { getLibraryBooks } from "@/lib/services/library.service";
import db from "@/lib/db";

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    if (val instanceof Date) return `"${val.toISOString()}"`;
    let str = String(val);
    // Sanitize CSV formula injection: prefix with single-quote if cell starts with formula triggers (=, +, -, @, tab, CR)
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  };
  const headerLine = headers.map(h => `"${h}"`).join(",");
  const dataLines = rows.map(row => headers.map(h => escapeCsv(row[h])).join(","));
  return [headerLine, ...dataLines].join("\r\n");
}

export async function GET(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    const type = (req.nextUrl.searchParams.get("type") || "students").toLowerCase();
    const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();

    let rows: Record<string, any>[] = [];

    switch (type) {
      case "students": {
        const students = await db.student.findMany({
          where: { institutionId },
          include: {
            currentCourse: { select: { name: true } },
            currentDepartment: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        rows = students.map((s) => ({
          id: s.id,
          admissionNumber: s.admissionNumber,
          rollNumber: s.rollNumber || "",
          fullName: s.fullName || `${s.firstName} ${s.lastName}`.trim(),
          email: s.email || s.institutionalEmail || "",
          phone: s.phone || "",
          gender: s.gender || "",
          bloodGroup: s.bloodGroup || "",
          status: s.status,
          course: s.currentCourse?.name || "",
          department: s.currentDepartment?.name || "",
          semester: s.currentSemester ? String(s.currentSemester) : "",
          section: s.currentSection || "",
          createdAt: s.createdAt,
        }));
        break;
      }

      case "staff": {
        const staffList = await getStaff(institutionId);

        rows = staffList.map((st: any) => ({
          id: st.id || st.userId,
          employeeId: st.employeeId || "",
          fullName: st.fullName || `${st.firstName} ${st.lastName}`,
          email: st.email || "",
          phone: st.phone || "",
          designation: st.designation || "",
          department: st.department || "",
          role: st.role || "STAFF",
          status: st.status || "ACTIVE",
          isActive: st.isActive ?? true,
          createdAt: st.createdAt,
        }));
        break;
      }

      case "attendance": {
        const attendance = await db.attendanceRecord.findMany({
          where: { institutionId },
          include: {
            student: { select: { fullName: true, rollNumber: true, admissionNumber: true } },
            subject: { select: { name: true, code: true } },
          },
          orderBy: { date: "desc" },
          take: 1000,
        });

        rows = attendance.map((a) => ({
          id: a.id,
          studentName: a.student?.fullName || "",
          rollNumber: a.student?.rollNumber || a.student?.admissionNumber || "",
          subject: a.subject?.name || "",
          date: a.date.toISOString().split("T")[0],
          status: a.status,
          remarks: a.remarks || "",
        }));
        break;
      }

      case "fees": {
        const invoices = await db.feeInvoice.findMany({
          where: { institutionId },
          include: {
            student: { select: { fullName: true, rollNumber: true, admissionNumber: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        rows = invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          studentName: inv.student?.fullName || "",
          rollNumber: inv.student?.rollNumber || inv.student?.admissionNumber || "",
          totalAmount: inv.totalAmount,
          paidAmount: inv.paidAmount,
          outstandingAmount: inv.outstandingAmount,
          status: inv.status,
          dueDate: inv.dueDate.toISOString().split("T")[0],
          createdAt: inv.createdAt,
        }));
        break;
      }

      case "library": {
        const books = await getLibraryBooks(institutionId);
        rows = books.map((b) => ({
          id: b.id,
          title: b.title,
          isbn: b.isbn || "",
          author: b.author,
          category: b.category,
          totalCopies: b.totalCopies,
          availableCopies: b.availableCopies,
          status: b.status,
          location: b.shelfLocation || "",
        }));
        break;
      }

      case "exams": {
        const results = await db.examResult.findMany({
          where: { institutionId },
          include: {
            student: { select: { fullName: true, rollNumber: true, admissionNumber: true } },
            subject: { select: { name: true, code: true } },
          },
          orderBy: { publishedAt: "desc" },
        });

        rows = results.map((r) => ({
          id: r.id,
          studentName: r.student?.fullName || "",
          rollNumber: r.student?.rollNumber || r.student?.admissionNumber || "",
          subject: r.subject?.name || "",
          totalMarks: r.totalMarks,
          maxMarks: r.maxMarks,
          grade: r.grade || "",
          isPassed: r.isPassed ? "PASS" : "FAIL",
          publishedAt: r.publishedAt,
        }));
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: `Invalid export type: ${type}. Allowed: students, staff, attendance, fees, library, exams` },
          { status: 400 }
        );
    }

    // Log the data export operation in immutable audit log
    await recordAuditLog(db, {
      institutionId,
      userId,
      actorUserId: userId,
      action: "DATA_EXPORT",
      entityType: type.toUpperCase(),
      entityId: crypto.randomUUID(),
      newValuesJson: JSON.stringify({ type, format, recordCount: rows.length, timestamp: new Date().toISOString() }),
    });

    if (format === "csv") {
      const csv = toCsv(rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${type}_export_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      type,
      format: "json",
      count: rows.length,
      data: rows,
    });
  } catch (error: any) {
    return handleAdminApiError(error);
  }
}
