import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(_req: NextRequest) {
  try {
    // 1. Find the primary college institution (Apex Institute of Technology / APEX-TECH)
    const primaryInst = await db.institution.findFirst({
      where: {
        OR: [
          { id: "inst_apex" },
          { slug: "APEX-TECH" },
          { slug: "apex-tech" },
        ],
      },
      select: { name: true },
    });

    if (primaryInst?.name) {
      return NextResponse.json({
        success: true,
        name: primaryInst.name,
      });
    }

    // 2. Fallback to first non-test institution in DB
    const anyRealInst = await db.institution.findFirst({
      where: {
        AND: [
          { name: { not: { contains: "E2E" } } },
          { name: { not: { contains: "Test" } } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { name: true },
    });

    if (anyRealInst?.name) {
      return NextResponse.json({
        success: true,
        name: anyRealInst.name,
      });
    }

    return NextResponse.json({
      success: true,
      name: "Apex Institute of Technology",
    });
  } catch {
    return NextResponse.json({
      success: true,
      name: "Apex Institute of Technology",
    });
  }
}
