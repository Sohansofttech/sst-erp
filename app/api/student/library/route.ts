import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import { getLibraryBooks, getIssuedBooks } from "@/lib/services/library.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const view = req.nextUrl.searchParams.get("view") || "catalog";

    if (view === "my-books") {
      let targetUserId = session.userId;

      if ((session.role as string) === "PARENT" || (session.role as string) === "GUARDIAN") {
        const requestedStudentId =
          req.nextUrl.searchParams.get("studentId") ||
          req.nextUrl.searchParams.get("childId") ||
          session.activeChildId;

        if (!requestedStudentId) {
          return NextResponse.json(
            { success: false, error: "Target childId or studentId is required for parent library query." },
            { status: 400 }
          );
        }

        // FIND-04: Authorize parent-child linkage and institution boundaries
        const { studentId } = await authorizeStudentOrParentAccess(session, requestedStudentId);

        // Resolve student's user ID for library loan tracking
        const student = await db.student.findUnique({
          where: { id: studentId },
          select: { userId: true, id: true },
        });

        if (!student) {
          return NextResponse.json({ success: false, error: "Student not found." }, { status: 404 });
        }

        targetUserId = student.userId || student.id;
      } else if (session.role === "STUDENT") {
        // Enforce student identity
        if (session.studentId) {
          const student = await db.student.findUnique({
            where: { id: session.studentId },
            select: { userId: true },
          });
          targetUserId = student?.userId || session.userId;
        }
      } else if (!["ADMIN", "SUPER_ADMIN", "TEACHER", "INSTITUTION_ADMIN"].includes((session.role || "").toUpperCase())) {
        return NextResponse.json(
          { success: false, error: "Unauthorized role for library borrowing history." },
          { status: 403 }
        );
      }

      // Query issued books by the verified borrower's ID
      const issues = await getIssuedBooks(session.institutionId, {
        borrowerUserId: targetUserId,
      });

      const now = new Date();
      const mapped = issues.map((i) => ({
        id: i.id,
        bookTitle: i.bookTitle,
        isbn: i.isbn,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        returnDate: i.returnDate,
        status: i.status,
        isOverdue: i.status === "ISSUED" && new Date(i.dueDate) < now,
        fineAmount: i.fineAmount,
        remarks: i.remarks,
      }));

      return NextResponse.json({
        success: true,
        data: {
          activeIssues: mapped.filter((b) => b.status === "ISSUED"),
          history: mapped.filter((b) => b.status === "RETURNED"),
          totalBorrowed: mapped.length,
        },
      });
    }

    // Default: Search library catalog
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const category = req.nextUrl.searchParams.get("category") || undefined;
    const availableOnly = req.nextUrl.searchParams.get("available") === "true";

    const books = await getLibraryBooks(session.institutionId, {
      search,
      category,
      availableOnly,
    });

    return NextResponse.json({
      success: true,
      data: books.map((b) => ({
        id: b.id,
        title: b.title,
        isbn: b.isbn,
        author: b.author,
        category: b.category,
        publisher: b.publisher,
        edition: b.edition,
        availableCopies: b.availableCopies,
        isAvailable: b.availableCopies > 0,
        shelfLocation: b.shelfLocation,
        description: b.description,
      })),
    });
  } catch (error: any) {
    const isForbidden = error.name === "ForbiddenError" || error.status === 403;
    const isUnauthorized = error.name === "UnauthorizedError" || error.status === 401;
    return NextResponse.json(
      { success: false, error: error.message || "Failed to query library." },
      { status: isForbidden ? 403 : isUnauthorized ? 401 : 500 }
    );
  }
}
