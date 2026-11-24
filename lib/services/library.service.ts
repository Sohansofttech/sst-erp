import { db } from "../db";

export interface LibraryBook {
  id: string;
  institutionId: string;
  title: string;
  isbn: string;
  author: string;
  category: string;
  publisher?: string;
  edition?: string;
  totalCopies: number;
  availableCopies: number;
  shelfLocation?: string;
  description?: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
}

export interface BookIssueRecord {
  id: string;
  institutionId: string;
  bookId: string;
  bookTitle: string;
  isbn: string;
  borrowerUserId: string;
  borrowerName: string;
  borrowerRole: "STUDENT" | "TEACHER";
  borrowerIdentifier?: string; // Roll number or employee ID
  issueDate: string;
  dueDate: string;
  returnDate?: string;
  status: "ISSUED" | "RETURNED" | "OVERDUE";
  fineAmount: number;
  issuedByUserId?: string;
  remarks?: string;
}

/**
 * 1. Fetch library books catalog scoped strictly to institution
 */
export async function getLibraryBooks(
  institutionId: string,
  filters?: { search?: string; category?: string; availableOnly?: boolean }
): Promise<LibraryBook[]> {
  const records = await db.approvalRequest.findMany({
    where: {
      institutionId,
      requestType: "LIBRARY_BOOK",
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const books: LibraryBook[] = records.map((r) => {
    let data: any = {};
    try {
      data = JSON.parse(r.requestedDataJson || "{}");
    } catch {}

    return {
      id: r.id,
      institutionId: r.institutionId,
      title: r.title,
      isbn: data.isbn || "ISBN-UNKNOWN",
      author: data.author || "Unknown Author",
      category: data.category || "General",
      publisher: data.publisher,
      edition: data.edition,
      totalCopies: Number(data.totalCopies ?? 1),
      availableCopies: Number(data.availableCopies ?? 1),
      shelfLocation: data.shelfLocation,
      description: data.description,
      status: "ACTIVE",
      createdAt: r.createdAt.toISOString(),
    };
  });

  let filtered = books;

  if (filters?.category && filters.category !== "ALL") {
    filtered = filtered.filter((b) => b.category.toLowerCase() === filters.category!.toLowerCase());
  }

  if (filters?.availableOnly) {
    filtered = filtered.filter((b) => b.availableCopies > 0);
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    filtered = filtered.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.isbn.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q)
    );
  }

  return filtered;
}

/**
 * 2. Add a new book to the library inventory
 */
export async function addLibraryBook(
  institutionId: string,
  data: {
    title: string;
    isbn: string;
    author: string;
    category: string;
    publisher?: string;
    edition?: string;
    totalCopies: number;
    shelfLocation?: string;
    description?: string;
  },
  actorUserId?: string
): Promise<LibraryBook> {
  if (!data.title?.trim() || !data.isbn?.trim() || !data.author?.trim()) {
    throw new Error("Book title, ISBN, and author are mandatory.");
  }

  const copies = Math.max(1, Number(data.totalCopies || 1));

  // Check for duplicate ISBN in institution
  const existingBooks = await getLibraryBooks(institutionId);
  const duplicate = existingBooks.find((b) => b.isbn.trim().toLowerCase() === data.isbn.trim().toLowerCase());
  if (duplicate) {
    throw new Error(`A book with ISBN '${data.isbn}' already exists in your library inventory ('${duplicate.title}').`);
  }

  const payload = {
    isbn: data.isbn.trim(),
    author: data.author.trim(),
    category: data.category?.trim() || "General",
    publisher: data.publisher?.trim(),
    edition: data.edition?.trim(),
    totalCopies: copies,
    availableCopies: copies,
    shelfLocation: data.shelfLocation?.trim() || "Main Stack",
    description: data.description?.trim(),
  };

  const record = await db.approvalRequest.create({
    data: {
      institutionId,
      userId: actorUserId || "admin",
      requestType: "LIBRARY_BOOK",
      title: data.title.trim(),
      requestedDataJson: JSON.stringify(payload),
      status: "ACTIVE",
    },
  });

  // Record audit log
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO audit_logs ("id", "institutionId", "actorUserId", "action", "entityType", "entityId", "newValuesJson", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      crypto.randomUUID(),
      institutionId,
      actorUserId || null,
      "LIBRARY_BOOK_ADDED",
      "BOOK",
      record.id,
      JSON.stringify({ title: data.title, isbn: data.isbn, totalCopies: copies })
    );
  } catch {}

  return {
    id: record.id,
    institutionId,
    title: record.title,
    ...payload,
    status: "ACTIVE",
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * 3. Update book details or inventory copies
 */
export async function updateLibraryBook(
  institutionId: string,
  bookId: string,
  data: Partial<LibraryBook>,
  actorUserId?: string
): Promise<LibraryBook> {
  const record = await db.approvalRequest.findFirst({
    where: { id: bookId, institutionId, requestType: "LIBRARY_BOOK" },
  });

  if (!record) {
    throw new Error("Library book record not found or access denied.");
  }

  let payload: any = {};
  try {
    payload = JSON.parse(record.requestedDataJson || "{}");
  } catch {}

  const newTotal = data.totalCopies !== undefined ? Math.max(1, Number(data.totalCopies)) : payload.totalCopies;
  const copiesDiff = newTotal - payload.totalCopies;
  const newAvailable = Math.max(0, (payload.availableCopies || 0) + copiesDiff);

  const updatedPayload = {
    ...payload,
    ...(data.isbn ? { isbn: data.isbn } : {}),
    ...(data.author ? { author: data.author } : {}),
    ...(data.category ? { category: data.category } : {}),
    ...(data.publisher !== undefined ? { publisher: data.publisher } : {}),
    ...(data.edition !== undefined ? { edition: data.edition } : {}),
    totalCopies: newTotal,
    availableCopies: newAvailable,
    ...(data.shelfLocation !== undefined ? { shelfLocation: data.shelfLocation } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
  };

  const updatedTitle = data.title ? data.title.trim() : record.title;

  await db.approvalRequest.update({
    where: { id: bookId },
    data: {
      title: updatedTitle,
      requestedDataJson: JSON.stringify(updatedPayload),
    },
  });

  return {
    id: record.id,
    institutionId,
    title: updatedTitle,
    ...updatedPayload,
    status: "ACTIVE",
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * 4. Issue a book to a student or teacher
 * Enforces:
 * - Available copies > 0
 * - No duplicate active issue for the same user & book
 */
export async function issueBook(
  institutionId: string,
  data: {
    bookId: string;
    borrowerUserId: string;
    borrowerRole: "STUDENT" | "TEACHER";
    borrowerName: string;
    borrowerIdentifier?: string;
    dueDateDays?: number;
    actorUserId?: string;
    remarks?: string;
  }
): Promise<BookIssueRecord> {
  if (!data.bookId || !data.borrowerUserId) {
    throw new Error("Book ID and borrower user ID are required to issue a book.");
  }

  // 1. Fetch book record
  const bookRecord = await db.approvalRequest.findFirst({
    where: { id: data.bookId, institutionId, requestType: "LIBRARY_BOOK" },
  });

  if (!bookRecord) {
    throw new Error("Library book not found or does not belong to your institution.");
  }

  let bookPayload: any = {};
  try {
    bookPayload = JSON.parse(bookRecord.requestedDataJson || "{}");
  } catch {}

  // 2. Prevent issuing unavailable copies
  if (Number(bookPayload.availableCopies || 0) <= 0) {
    throw new Error(`Cannot issue book '${bookRecord.title}': No copies currently available (all copies in circulation).`);
  }

  // 3. Prevent duplicate active issues of the same book to the same borrower
  const activeIssues = await db.approvalRequest.findMany({
    where: {
      institutionId,
      requestType: "LIBRARY_ISSUE",
      userId: data.borrowerUserId,
      status: "ISSUED" as const,
    },
  });

  const duplicateIssue = activeIssues.find((issue) => {
    try {
      const p = JSON.parse(issue.requestedDataJson || "{}");
      return p.bookId === data.bookId;
    } catch {
      return false;
    }
  });

  if (duplicateIssue) {
    throw new Error(`Borrower '${data.borrowerName}' already has an active copy of '${bookRecord.title}' issued.`);
  }

  // 4. Create Issue Record
  const issueDate = new Date();
  const days = data.dueDateDays || (data.borrowerRole === "TEACHER" ? 30 : 14);
  const dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const issuePayload = {
    bookId: data.bookId,
    bookTitle: bookRecord.title,
    isbn: bookPayload.isbn || "ISBN",
    borrowerUserId: data.borrowerUserId,
    borrowerName: data.borrowerName,
    borrowerRole: data.borrowerRole,
    borrowerIdentifier: data.borrowerIdentifier || "N/A",
    issueDate: issueDate.toISOString(),
    dueDate: dueDate.toISOString(),
    status: "ISSUED" as const,
    fineAmount: 0,
    issuedByUserId: data.actorUserId,
    remarks: data.remarks,
  };

  const issueRecord = await db.approvalRequest.create({
    data: {
      institutionId,
      userId: data.borrowerUserId,
      requestType: "LIBRARY_ISSUE",
      title: `Issued: ${bookRecord.title} to ${data.borrowerName}`,
      requestedDataJson: JSON.stringify(issuePayload),
      status: "ISSUED" as const,
    },
  });

  // 5. Decrement available copies
  bookPayload.availableCopies = Math.max(0, (bookPayload.availableCopies || 1) - 1);
  await db.approvalRequest.update({
    where: { id: data.bookId },
    data: { requestedDataJson: JSON.stringify(bookPayload) },
  });

  // 6. Record audit log
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO audit_logs ("id", "institutionId", "actorUserId", "action", "entityType", "entityId", "newValuesJson", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      crypto.randomUUID(),
      institutionId,
      data.actorUserId || null,
      "LIBRARY_BOOK_ISSUED",
      "BOOK_ISSUE",
      issueRecord.id,
      JSON.stringify({ bookTitle: bookRecord.title, borrowerName: data.borrowerName, dueDate: dueDate.toISOString() })
    );
  } catch {}

  return {
    id: issueRecord.id,
    institutionId,
    ...issuePayload,
  };
}

/**
 * 5. Return an issued book and compute any overdue fines
 */
export async function returnBook(
  institutionId: string,
  data: {
    issueId: string;
    actorUserId?: string;
    remarks?: string;
  }
): Promise<BookIssueRecord> {
  const issueRecord = await db.approvalRequest.findFirst({
    where: { id: data.issueId, institutionId, requestType: "LIBRARY_ISSUE" },
  });

  if (!issueRecord) {
    throw new Error("Book issue record not found or access denied.");
  }

  if (issueRecord.status === "RETURNED") {
    throw new Error("This book copy has already been returned.");
  }

  let issuePayload: any = {};
  try {
    issuePayload = JSON.parse(issueRecord.requestedDataJson || "{}");
  } catch {}

  const returnDate = new Date();
  const dueDate = new Date(issuePayload.dueDate);

  // Compute fine: ₹5 per day overdue
  let fineAmount = 0;
  if (returnDate > dueDate) {
    const overdueDays = Math.ceil((returnDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    fineAmount = overdueDays * 5;
  }

  issuePayload.returnDate = returnDate.toISOString();
  issuePayload.status = "RETURNED";
  issuePayload.fineAmount = fineAmount;
  if (data.remarks) issuePayload.returnRemarks = data.remarks;

  // 1. Update issue record
  await db.approvalRequest.update({
    where: { id: data.issueId },
    data: {
      status: "RETURNED",
      reviewedAt: returnDate,
      reviewedByUserId: data.actorUserId,
      adminRemarks: `Returned on ${returnDate.toISOString().slice(0, 10)}. Fine assessed: ₹${fineAmount}.`,
      requestedDataJson: JSON.stringify(issuePayload),
    },
  });

  // 2. Increment book available copies
  if (issuePayload.bookId) {
    const bookRecord = await db.approvalRequest.findFirst({
      where: { id: issuePayload.bookId, institutionId, requestType: "LIBRARY_BOOK" },
    });
    if (bookRecord) {
      let bPayload: any = {};
      try {
        bPayload = JSON.parse(bookRecord.requestedDataJson || "{}");
      } catch {}
      bPayload.availableCopies = Math.min(bPayload.totalCopies || 1, (bPayload.availableCopies || 0) + 1);
      await db.approvalRequest.update({
        where: { id: issuePayload.bookId },
        data: { requestedDataJson: JSON.stringify(bPayload) },
      });
    }
  }

  // 3. Record audit log
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO audit_logs ("id", "institutionId", "actorUserId", "action", "entityType", "entityId", "newValuesJson", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      crypto.randomUUID(),
      institutionId,
      data.actorUserId || null,
      "LIBRARY_BOOK_RETURNED",
      "BOOK_ISSUE",
      data.issueId,
      JSON.stringify({ bookTitle: issuePayload.bookTitle, fineAmount, returnDate: returnDate.toISOString() })
    );
  } catch {}

  return {
    id: issueRecord.id,
    institutionId,
    ...issuePayload,
  };
}

/**
 * 6. Get issued books list with optional borrower/status filters
 */
export async function getIssuedBooks(
  institutionId: string,
  filters?: { borrowerUserId?: string; status?: string }
): Promise<BookIssueRecord[]> {
  const records = await db.approvalRequest.findMany({
    where: {
      institutionId,
      requestType: "LIBRARY_ISSUE",
      ...(filters?.borrowerUserId ? { userId: filters.borrowerUserId } : {}),
      ...(filters?.status && filters.status !== "ALL" ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return records.map((r) => {
    let payload: any = {};
    try {
      payload = JSON.parse(r.requestedDataJson || "{}");
    } catch {}

    return {
      id: r.id,
      institutionId: r.institutionId,
      bookId: payload.bookId || "",
      bookTitle: payload.bookTitle || r.title,
      isbn: payload.isbn || "",
      borrowerUserId: payload.borrowerUserId || r.userId,
      borrowerName: payload.borrowerName || "Borrower",
      borrowerRole: payload.borrowerRole || "STUDENT",
      borrowerIdentifier: payload.borrowerIdentifier,
      issueDate: payload.issueDate || r.createdAt.toISOString(),
      dueDate: payload.dueDate || r.createdAt.toISOString(),
      returnDate: payload.returnDate,
      status: (r.status as any) || "ISSUED",
      fineAmount: Number(payload.fineAmount || 0),
      remarks: payload.remarks,
    };
  });
}

/**
 * 7. Get Library Circulation & Inventory Report
 */
export async function getLibraryCirculationReport(institutionId: string) {
  const [books, issues] = await Promise.all([
    getLibraryBooks(institutionId),
    getIssuedBooks(institutionId),
  ]);

  const totalTitles = books.length;
  const totalCopies = books.reduce((acc, b) => acc + b.totalCopies, 0);
  const availableCopies = books.reduce((acc, b) => acc + b.availableCopies, 0);
  const activeIssues = issues.filter((i) => i.status === "ISSUED");
  const returnedIssues = issues.filter((i) => i.status === "RETURNED");
  const totalFinesCollected = issues.reduce((acc, i) => acc + (i.fineAmount || 0), 0);

  const now = new Date();
  const overdueCount = activeIssues.filter((i) => new Date(i.dueDate) < now).length;

  return {
    inventory: {
      totalTitles,
      totalCopies,
      availableCopies,
      circulatingCopies: totalCopies - availableCopies,
    },
    circulation: {
      totalTransactions: issues.length,
      activeIssuesCount: activeIssues.length,
      returnedCount: returnedIssues.length,
      overdueCount,
      totalFinesCollected,
    },
    recentTransactions: issues.slice(0, 10),
  };
}
