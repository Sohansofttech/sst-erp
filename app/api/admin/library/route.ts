import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getLibraryBooks,
  addLibraryBook,
  updateLibraryBook,
  issueBook,
  returnBook,
  getIssuedBooks,
  getLibraryCirculationReport,
} from "@/lib/services/library.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const view = req.nextUrl.searchParams.get("view") || "books";

    if (view === "report") {
      const report = await getLibraryCirculationReport(institutionId);
      return NextResponse.json({ success: true, data: report });
    }

    if (view === "issues") {
      const borrowerUserId = req.nextUrl.searchParams.get("borrowerUserId") || undefined;
      const status = req.nextUrl.searchParams.get("status") || undefined;
      const issues = await getIssuedBooks(institutionId, { borrowerUserId, status });
      return NextResponse.json({ success: true, data: issues });
    }

    // Default: Books catalog
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const category = req.nextUrl.searchParams.get("category") || undefined;
    const availableOnly = req.nextUrl.searchParams.get("available") === "true";

    const books = await getLibraryBooks(institutionId, { search, category, availableOnly });
    return NextResponse.json({ success: true, data: books });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    const body = await req.json();

    if (body.type === "ISSUE_BOOK") {
      if (!body.bookId || !body.borrowerUserId || !body.borrowerName) {
        return NextResponse.json(
          { success: false, error: "Book ID, borrower user ID, and borrower name are required." },
          { status: 400 }
        );
      }

      const issue = await issueBook(institutionId, {
        bookId: body.bookId,
        borrowerUserId: body.borrowerUserId,
        borrowerRole: body.borrowerRole || "STUDENT",
        borrowerName: body.borrowerName,
        borrowerIdentifier: body.borrowerIdentifier,
        dueDateDays: body.dueDateDays ? parseInt(body.dueDateDays, 10) : undefined,
        actorUserId: userId,
        remarks: body.remarks,
      });

      return NextResponse.json({
        success: true,
        message: `Book '${issue.bookTitle}' issued successfully to ${issue.borrowerName}. Due on ${issue.dueDate.slice(0, 10)}.`,
        data: issue,
      });
    }

    // Default: Add Book to inventory
    if (!body.title || !body.isbn || !body.author) {
      return NextResponse.json(
        { success: false, error: "Book title, ISBN, and author are required." },
        { status: 400 }
      );
    }

    const newBook = await addLibraryBook(
      institutionId,
      {
        title: body.title,
        isbn: body.isbn,
        author: body.author,
        category: body.category || "General",
        publisher: body.publisher,
        edition: body.edition,
        totalCopies: body.totalCopies ? parseInt(body.totalCopies, 10) : 1,
        shelfLocation: body.shelfLocation,
        description: body.description,
      },
      userId
    );

    return NextResponse.json({
      success: true,
      message: `Book '${newBook.title}' added to inventory (${newBook.totalCopies} copies).`,
      data: newBook,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    const body = await req.json();

    if (body.type === "RETURN_BOOK") {
      if (!body.issueId) {
        return NextResponse.json({ success: false, error: "Issue ID is required to return a book." }, { status: 400 });
      }

      const returned = await returnBook(institutionId, {
        issueId: body.issueId,
        actorUserId: userId,
        remarks: body.remarks,
      });

      return NextResponse.json({
        success: true,
        message: `Book '${returned.bookTitle}' returned successfully. Fine assessed: ₹${returned.fineAmount}.`,
        data: returned,
      });
    }

    // Default: Update book details
    if (!body.id) {
      return NextResponse.json({ success: false, error: "Book ID is required." }, { status: 400 });
    }

    const updated = await updateLibraryBook(institutionId, body.id, body, userId);
    return NextResponse.json({
      success: true,
      message: `Book details updated.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Book ID is required." }, { status: 400 });
    }

    const result = await db.approvalRequest.deleteMany({
      where: { id, institutionId, requestType: "LIBRARY_BOOK" },
    });

    if (result.count === 0) {
      return NextResponse.json({ success: false, error: "Book not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Book archived and removed from catalog." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
