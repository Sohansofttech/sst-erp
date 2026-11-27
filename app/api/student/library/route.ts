import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthErrorStatus } from "@/lib/auth/session";
import { getLibraryBooks, getIssuedBooks } from "@/lib/services/library.service";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const view = req.nextUrl.searchParams.get("view") || "catalog";

    if (view === "my-books") {
      // Student viewing own issued books and borrowing history
      const issues = await getIssuedBooks(session.institutionId, {
        borrowerUserId: session.userId,
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
    return NextResponse.json(
      { success: false, error: error.message || "Failed to query library." },
      { status: getAuthErrorStatus(error) ?? 500 }
    );
  }
}
