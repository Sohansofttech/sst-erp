import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getCampusInOutLogs,
  createCampusInOutLog,
  getVisitorPasses,
  createVisitorPass,
  checkoutVisitorPass,
} from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const tab = req.nextUrl.searchParams.get("tab") || "visitors";
    const take = parseInt(req.nextUrl.searchParams.get("take") || "50", 10);

    if (tab === "campus_logs") {
      const logs = await getCampusInOutLogs(institutionId, take);
      return NextResponse.json({ success: true, data: logs });
    }

    const visitors = await getVisitorPasses(institutionId, take);
    return NextResponse.json({ success: true, data: visitors });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (body.type === "CAMPUS_STUDENT_LOG") {
      if (!body.studentId || !body.logType) {
        return NextResponse.json(
          { success: false, error: "studentId and logType (ENTRY/EXIT) are required." },
          { status: 400 }
        );
      }
      const log = await createCampusInOutLog(institutionId, body);
      return NextResponse.json({ success: true, data: log });
    }

    // Default: Visitor Pass Creation
    if (!body.visitorName || !body.phoneNumber || !body.purpose || !body.hostName) {
      return NextResponse.json(
        {
          success: false,
          error: "visitorName, phoneNumber, purpose and hostName are required.",
        },
        { status: 400 }
      );
    }

    const pass = await createVisitorPass(institutionId, body);
    return NextResponse.json({ success: true, data: pass });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { passId } = await req.json();

    if (!passId) {
      return NextResponse.json(
        { success: false, error: "passId is required for check-out." },
        { status: 400 }
      );
    }

    const pass = await checkoutVisitorPass(institutionId, passId);
    return NextResponse.json({ success: true, data: pass, message: "Visitor checked out successfully." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
