import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getAcademicYears,
  createAcademicYear,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";
import { parseDateSafely, DateValidationError } from "@/lib/utils/date-parser";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


class ApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ApiError";
  }
}

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const academicYears = await getAcademicYears(institutionId);

    return NextResponse.json({
      success: true,
      data: academicYears,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    if (!body.name || !body.startDate || !body.endDate) {
      return NextResponse.json(
        { success: false, error: "Academic year name, start date, and end date are required." },
        { status: 400 }
      );
    }

    const parsedAYStart = parseDateSafely(body.startDate, "Academic year start date");
    const parsedAYEnd = parseDateSafely(body.endDate, "Academic year end date");
    if (parsedAYStart >= parsedAYEnd) {
      return NextResponse.json(
        { success: false, error: "Academic year start date must precede end date." },
        { status: 400 }
      );
    }

    let mappedTerms: any = undefined;
    if (body.terms && Array.isArray(body.terms)) {
      const seenNames = new Set<string>();
      mappedTerms = body.terms.map((t: any, index: number) => {
        const tName = (t.name || "").trim();
        if (!tName) {
          throw new ApiError(400, `Term #${index + 1} must have a valid title.`);
        }
        const lowerName = tName.toLowerCase();
        if (seenNames.has(lowerName)) {
          throw new ApiError(400, `Duplicate term title "${tName}" within the same academic year.`);
        }
        seenNames.add(lowerName);

        const tStart = parseDateSafely(t.startDate || body.startDate, `Term "${tName}" start date`);
        const tEnd = parseDateSafely(t.endDate || body.endDate, `Term "${tName}" end date`);

        return {
          name: tName,
          termNumber: t.termNumber || index + 1,
          startDate: tStart,
          endDate: tEnd,
          isCurrent: Boolean(t.isCurrent),
        };
      });
    }

    const isCurr = body.isCurrent ?? body.isActive;
    const ay = await createAcademicYear(institutionId, {
      name: body.name.trim(),
      startDate: parsedAYStart,
      endDate: parsedAYEnd,
      isCurrent: isCurr,
      terms: mappedTerms,
    });

    return NextResponse.json({
      success: true,
      message: "Academic year created successfully.",
      data: ay,
    });
  } catch (error: any) {
    if (error instanceof ApiError || error instanceof DateValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();
    const { id, isCurrent, isActive, name, startDate, endDate, terms } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Academic Year ID required." }, { status: 400 });
    }

    const normalizedName = name ? name.trim() : undefined;
    const currentFlag = typeof isCurrent === "boolean" ? isCurrent : (typeof isActive === "boolean" ? isActive : undefined);

    // Atomic transaction for academic year update and term persistence
    const updateResult = await db.$transaction(async (tx) => {
      // 1. Verify existence and tenant ownership
      const existingAY = await tx.academicYear.findFirst({
        where: { id, institutionId },
      });
      if (!existingAY) {
        throw new ApiError(404, "Academic year not found or access denied.");
      }

      // 2. Check duplicate name if name is changing
      if (normalizedName && normalizedName.toLowerCase() !== existingAY.name.toLowerCase()) {
        const conflict = await tx.academicYear.findFirst({
          where: {
            institutionId,
            name: { equals: normalizedName, mode: "insensitive" },
            id: { not: id },
          },
        });
        if (conflict) {
          throw new ApiError(409, `Academic year "${normalizedName}" already exists for this institution.`);
        }
      }

      // 3. Parse and validate dates
      let parsedAYStart = existingAY.startDate;
      let parsedAYEnd = existingAY.endDate;
      if (startDate !== undefined) {
        parsedAYStart = parseDateSafely(startDate, "Academic year start date");
      }
      if (endDate !== undefined) {
        parsedAYEnd = parseDateSafely(endDate, "Academic year end date");
      }
      if (parsedAYStart >= parsedAYEnd) {
        throw new ApiError(400, "Academic year start date must precede end date.");
      }

      // 4. Update the academic year
      await tx.academicYear.updateMany({
        where: { id, institutionId },
        data: {
          ...(normalizedName ? { name: normalizedName } : {}),
          startDate: parsedAYStart,
          endDate: parsedAYEnd,
          ...(typeof currentFlag === "boolean" ? { isCurrent: currentFlag } : {}),
        },
      });

      // 5. If setting as current, unset current on all other academic years for this institution
      if (currentFlag) {
        await tx.academicYear.updateMany({
          where: { institutionId, id: { not: id } },
          data: { isCurrent: false },
        });
      }

      // 6. Term synchronization
      let returnedTerms: any[] = [];
      const tableCheck: any[] = await tx.$queryRaw`SELECT to_regclass('public.academic_terms')::text as tbl;`;
      const hasTermsTable = tableCheck && tableCheck[0]?.tbl !== null;

      // Preserve existing terms when request does not intend to replace them (omitted or empty)
      const shouldSyncTerms = Array.isArray(terms) && terms.length > 0;

      if (shouldSyncTerms) {
        // Validate all terms before executing any DB operations
        const validatedTerms: {
          id: string;
          name: string;
          startDate: Date;
          endDate: Date;
          isCurrent: boolean;
        }[] = [];
        const seenNames = new Set<string>();
        let currentTermCount = 0;

        for (let i = 0; i < terms.length; i++) {
          const t = terms[i];
          const tName = (t.name || "").trim();
          if (!tName) {
            throw new ApiError(400, `Term #${i + 1} must have a valid title.`);
          }
          const lowerName = tName.toLowerCase();
          if (seenNames.has(lowerName)) {
            throw new ApiError(400, `Duplicate term title "${tName}" within the same academic year.`);
          }
          seenNames.add(lowerName);

          const tStart = parseDateSafely(t.startDate, `Term "${tName}" start date`);
          const tEnd = parseDateSafely(t.endDate, `Term "${tName}" end date`);

          if (tStart >= tEnd) {
            throw new ApiError(400, `Term "${tName}" start date must precede its end date.`);
          }

          if (tStart < parsedAYStart || tEnd > parsedAYEnd) {
            throw new ApiError(
              400,
              `Term "${tName}" dates (${tStart.toISOString().split("T")[0]} to ${tEnd.toISOString().split("T")[0]}) must fall within academic year boundary (${parsedAYStart.toISOString().split("T")[0]} to ${parsedAYEnd.toISOString().split("T")[0]}).`
            );
          }

          const isTermCurrent = Boolean(t.isCurrent);
          if (isTermCurrent) currentTermCount++;

          validatedTerms.push({
            id: t.id && typeof t.id === "string" && !t.id.startsWith("t") && t.id.includes("-") ? t.id : crypto.randomUUID(),
            name: tName,
            startDate: tStart,
            endDate: tEnd,
            isCurrent: isTermCurrent,
          });
        }

        // Sequential chronological check: sorted terms must not overlap
        const sorted = [...validatedTerms].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        for (let i = 0; i < sorted.length - 1; i++) {
          const cur = sorted[i];
          const nxt = sorted[i + 1];
          if (cur.endDate > nxt.startDate) {
            throw new ApiError(
              400,
              `Terms cannot overlap: "${cur.name}" ends on ${cur.endDate.toISOString().split("T")[0]}, but "${nxt.name}" starts on ${nxt.startDate.toISOString().split("T")[0]}.`
            );
          }
        }

        if (currentTermCount > 1) {
          throw new ApiError(400, "Only one term can be marked as current per academic year.");
        }

        if (hasTermsTable) {
          // Delete existing terms for this academic year & institution
          await tx.$executeRawUnsafe(
            `DELETE FROM academic_terms WHERE "academicYearId" = $1 AND "institutionId" = $2`,
            id,
            institutionId
          );

          // Insert newly validated terms
          for (const t of validatedTerms) {
            const termId = crypto.randomUUID();
            await tx.$executeRawUnsafe(
              `INSERT INTO academic_terms ("id", "institutionId", "academicYearId", "name", "startDate", "endDate", "isCurrent", "status", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
              termId,
              institutionId,
              id,
              t.name,
              t.startDate,
              t.endDate,
              t.isCurrent,
              "ACTIVE"
            );
            returnedTerms.push({
              id: termId,
              institutionId,
              academicYearId: id,
              name: t.name,
              startDate: t.startDate,
              endDate: t.endDate,
              isCurrent: t.isCurrent,
              status: "ACTIVE",
            });
          }
        } else {
          returnedTerms = validatedTerms;
        }
      } else {
        // Terms omitted or empty: PRESERVE existing terms
        if (hasTermsTable) {
          const termRows: any[] = await tx.$queryRaw`
            SELECT "id"::text, "institutionId"::text, "academicYearId"::text, "name", "startDate", "endDate", "isCurrent", "status"
            FROM academic_terms
            WHERE "academicYearId" = ${id} AND "institutionId" = ${institutionId}
            ORDER BY "startDate" ASC;
          `;
          returnedTerms = termRows;
        } else {
          returnedTerms = [];
        }
      }

      // Fetch the updated academic year to return
      const updatedAY = await tx.academicYear.findFirst({
        where: { id, institutionId },
      });

      return {
        academicYear: updatedAY,
        terms: returnedTerms,
      };
    });

    return NextResponse.json({
      success: true,
      message: "Academic year updated successfully.",
      data: updateResult.academicYear ? { ...updateResult.academicYear, terms: updateResult.terms } : null,
    });
  } catch (error: any) {
    if (error instanceof ApiError || error instanceof DateValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Academic Year ID required." }, { status: 400 });
    }

    await db.$transaction(async (tx) => {
      const tableCheck: any[] = await tx.$queryRaw`SELECT to_regclass('public.academic_terms')::text as tbl;`;
      if (tableCheck && tableCheck[0]?.tbl !== null) {
        await tx.$executeRawUnsafe(
          `DELETE FROM academic_terms WHERE "academicYearId" = $1 AND "institutionId" = $2`,
          id,
          institutionId
        );
      }

      const result = await tx.academicYear.deleteMany({
        where: { id, institutionId },
      });

      if (result.count === 0) {
        throw new ApiError(404, "Academic year not found or access denied.");
      }
    });

    return NextResponse.json({
      success: true,
      message: "Academic year deleted successfully.",
    });
  } catch (error: any) {
    if (error instanceof ApiError || error instanceof DateValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    return handleAdminApiError(error);
  }
}
