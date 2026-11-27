import { NextRequest, NextResponse } from "next/server";
import { resolveDivisionContext } from "@/lib/security/division-context";
import { handleAdminApiError } from "@/lib/security/admin-auth";
import db from "@/lib/db";
import { MONTESSORI_MILESTONES } from "@/lib/academics/montessori-milestones";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req);
    await requireReadReq(req, context.institutionId);
    const institutionId = context.institutionId;

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const classId = searchParams.get("classId");
    const domainFilter = searchParams.get("domain");

    // Build student query strictly within institution and Montessori context
    const studentWhere: any = {
      institutionId,
      status: "ACTIVE",
    };

    if (studentId) {
      studentWhere.id = studentId;
    } else if (classId) {
      studentWhere.enrollments = {
        some: { classId, status: "ACTIVE" },
      };
    } else if (context.activeDivisionId) {
      studentWhere.currentDivisionId = context.activeDivisionId;
    }

    const students: any[] = await (db.student as any).findMany({
      where: studentWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        admissionNumber: true,
        currentDivisionId: true,
        currentDivision: {
          select: { id: true, name: true, code: true, type: true },
        },
        enrollments: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            class: { select: { id: true, name: true, gradeLevel: true } },
          },
          take: 1,
        },
      },
      take: 30,
      orderBy: { firstName: "asc" },
    });

    if (students.length === 0) {
      return NextResponse.json({
        success: true,
        milestones: MONTESSORI_MILESTONES,
        data: [],
        message: "No Montessori students found.",
      });
    }

    // Query existing observation records for these students
    const studentIds = students.map((s) => s.id);
    const rawRecords = await db.assessmentRecord.findMany({
      where: {
        institutionId,
        studentId: { in: studentIds },
        assessmentName: { startsWith: "MONTESSORI:" },
      },
      orderBy: { conductedDate: "desc" },
    });

    // Parse observations from assessment records
    const observationMap: Record<string, Record<string, any>> = {};
    for (const rec of rawRecords) {
      const parts = rec.assessmentName.replace("MONTESSORI:", "").trim().split("::");
      const milestoneId = parts[0] || "";
      if (!observationMap[rec.studentId]) {
        observationMap[rec.studentId] = {};
      }
      if (!observationMap[rec.studentId][milestoneId]) {
        let parsedNotes = rec.remarks || "";
        let status = "INTRODUCED";
        try {
          if (rec.remarks && rec.remarks.startsWith("{")) {
            const json = JSON.parse(rec.remarks);
            status = json.status || status;
            parsedNotes = json.notes || parsedNotes;
          } else {
            status = rec.marksObtained >= 3 ? "MASTERED" : rec.marksObtained >= 2 ? "WORKING_ON" : "INTRODUCED";
          }
        } catch {
          // Keep default
        }

        observationMap[rec.studentId][milestoneId] = {
          recordId: rec.id,
          status,
          notes: parsedNotes,
          conductedDate: rec.conductedDate,
        };
      }
    }

    // Build complete student milestone progress
    const activeMilestones = domainFilter
      ? MONTESSORI_MILESTONES.filter((m) => m.domain === domainFilter)
      : MONTESSORI_MILESTONES;

    const studentProgressList = students.map((st) => {
      const studentObs = observationMap[st.id] || {};
      const milestoneObservations = activeMilestones.map((m) => {
        const obs = studentObs[m.id];
        return {
          milestoneId: m.id,
          domain: m.domain,
          domainLabel: m.domainLabel,
          title: m.title,
          description: m.description,
          status: obs?.status || "NOT_STARTED",
          notes: obs?.notes || "",
          observedDate: obs?.conductedDate || null,
        };
      });

      const total = milestoneObservations.length;
      const mastered = milestoneObservations.filter((o) => o.status === "MASTERED").length;
      const workingOn = milestoneObservations.filter((o) => o.status === "WORKING_ON").length;
      const progressPercentage = total > 0 ? Math.round((mastered / total) * 100) : 0;

      return {
        studentId: st.id,
        studentName: `${st.firstName} ${st.lastName || ""}`.trim(),
        admissionNumber: st.admissionNumber || st.rollNumber || "N/A",
        divisionName: st.currentDivision?.name || "Montessori Wing",
        className: st.enrollments[0]?.class?.name || st.enrollments[0]?.class?.gradeLevel || "Primary Group",
        progressPercentage,
        summary: { total, mastered, workingOn, notStarted: total - mastered - workingOn },
        observations: milestoneObservations,
      };
    });

    return NextResponse.json({
      success: true,
      milestoneTaxonomy: MONTESSORI_MILESTONES,
      data: studentProgressList,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req);
    await requireWriteReq(req, context.institutionId);
    const institutionId = context.institutionId;
    const body = await req.json();

    const { studentId, milestoneId, status, notes } = body;

    if (!studentId || !milestoneId || !status) {
      return NextResponse.json(
        { success: false, error: "studentId, milestoneId, and status are required." },
        { status: 400 }
      );
    }

    const milestoneDef = MONTESSORI_MILESTONES.find((m) => m.id === milestoneId);
    if (!milestoneDef) {
      return NextResponse.json(
        { success: false, error: `Invalid milestone ID: ${milestoneId}` },
        { status: 400 }
      );
    }

    // Verify student belongs to this institution and is in active state
    const student: any = await (db.student as any).findFirst({
      where: { id: studentId, institutionId },
      include: {
        enrollments: { where: { status: "ACTIVE" }, take: 1 },
      },
    });

    if (!student) {
      return NextResponse.json(
        { success: false, error: "Student not found in authenticated institution." },
        { status: 404 }
      );
    }

    // Resolve or find default subject for Montessori developmental record
    let subject = await db.subject.findFirst({
      where: { institutionId },
    });

    if (!subject) {
      subject = await db.subject.create({
        data: {
          institutionId,
          name: "Early Childhood Development",
          code: "MONT-ECD",
          type: "CORE_THEORY",
          credits: 1,
        },
      });
    }

    // Resolve enrollment
    let enrollmentId = student.enrollments[0]?.id;
    if (!enrollmentId) {
      // Find or create active enrollment for student
      const ay = await db.academicYear.findFirst({
        where: { institutionId },
        orderBy: { startDate: "desc" },
      });
      if (ay) {
        const enr = await (db.enrollment as any).create({
          data: {
            institutionId,
            studentId,
            academicYearId: ay.id,
            status: "ACTIVE",
          },
        });
        enrollmentId = enr.id;
      }
    }

    if (!enrollmentId) {
      return NextResponse.json(
        { success: false, error: "Cannot record milestone without an active academic year enrollment." },
        { status: 400 }
      );
    }

    const assessmentIdentifier = `MONTESSORI:${milestoneId}::${milestoneDef.title}`;
    const scoreVal = status === "MASTERED" ? 3 : status === "WORKING_ON" ? 2 : 1;
    const observationPayload = JSON.stringify({
      status,
      notes: notes || "",
      observedBy: context.userId || "Montessori Guide",
      domain: milestoneDef.domain,
      recordedAt: new Date().toISOString(),
    });

    // Tenant-safe persistence: Check if observation already exists for this student & milestone
    const existing = await db.assessmentRecord.findFirst({
      where: {
        institutionId,
        studentId,
        assessmentName: assessmentIdentifier,
      },
    });

    let savedRecord;
    if (existing) {
      savedRecord = await db.assessmentRecord.update({
        where: { id: existing.id },
        data: {
          marksObtained: scoreVal,
          remarks: observationPayload,
          conductedDate: new Date(),
        },
      });
    } else {
      savedRecord = await db.assessmentRecord.create({
        data: {
          institutionId,
          studentId,
          enrollmentId,
          subjectId: subject.id,
          assessmentName: assessmentIdentifier,
          maxMarks: 3,
          marksObtained: scoreVal,
          remarks: observationPayload,
          conductedDate: new Date(),
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Montessori milestone observation recorded successfully.",
        data: {
          studentId,
          milestoneId,
          status,
          notes,
          recordId: savedRecord.id,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}
