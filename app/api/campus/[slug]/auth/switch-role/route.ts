import { NextRequest, NextResponse } from "next/server"
import db from "@/lib/db"
import {
  getTeacherSessionToken,
  verifyTeacherSession,
  signTeacherSession,
  hashSessionToken,
  TEACHER_AUTH_COOKIE,
} from "@/lib/auth/teacher-session"
import {
  type TeacherRole,
  TEACHER_ROLE_CONFIGS,
} from "@/lib/auth/roles"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const token = await getTeacherSessionToken(req)

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Authentication required to switch workspace role." },
        { status: 401 }
      )
    }

    const payload = await verifyTeacherSession(token)
    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired session. Please log in again." },
        { status: 401 }
      )
    }

    // TSEC-17: Validate route campus slug matches session tenant
    if (
      payload.institutionSlug &&
      payload.institutionSlug.toLowerCase() !== slug.toLowerCase()
    ) {
      return NextResponse.json(
        { success: false, error: "Campus slug does not match active session institution." },
        { status: 403 }
      )
    }

    // Verify against DB teacher_portal_sessions
    const oldTokenHash = hashSessionToken(token)
    const dbSessions: any[] = await db.$queryRaw`
      SELECT id, active_role
      FROM teacher_portal_sessions
      WHERE token_hash = ${oldTokenHash}
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `

    if (dbSessions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Session has been revoked or expired. Please sign in again." },
        { status: 401 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const targetRole = body.targetRole as TeacherRole

    if (!targetRole || !["teacher", "class_teacher", "hod"].includes(targetRole)) {
      return NextResponse.json(
        { success: false, error: "Invalid target role specified." },
        { status: 400 }
      )
    }

    // Validate on the server that the user holds the target role
    if (!payload.availableRoles.includes(targetRole)) {
      return NextResponse.json(
        {
          success: false,
          error: `Forbidden: Your account does not have the '${targetRole}' role assigned.`,
        },
        { status: 403 }
      )
    }

    // Update active role and refresh timestamp
    payload.activeRole = targetRole
    payload.lastActivity = Date.now()

    const newToken = await signTeacherSession(payload)
    const newTokenHash = hashSessionToken(newToken)
    const landingUrl = TEACHER_ROLE_CONFIGS[targetRole].landingPath(slug)

    // TSEC-17: Atomically update session in DB; only issue cookie if update succeeds
    try {
      const updateResult: any = await db.$executeRaw`
        UPDATE teacher_portal_sessions
        SET active_role = ${targetRole},
            token_hash = ${newTokenHash},
            updated_at = NOW()
        WHERE token_hash = ${oldTokenHash}
          AND revoked_at IS NULL
          AND expires_at > NOW()
      `

      if (typeof updateResult === "number" && updateResult === 0) {
        return NextResponse.json(
          { success: false, error: "Session record could not be updated in database." },
          { status: 500 }
        )
      }
    } catch (e: any) {
      console.error("[Switch Role] DB session update error:", e)
      return NextResponse.json(
        { success: false, error: "Internal database error updating active role." },
        { status: 500 }
      )
    }

    const response = NextResponse.json({
      success: true,
      message: `Active workspace switched to ${TEACHER_ROLE_CONFIGS[targetRole].label}.`,
      data: {
        activeRole: targetRole,
        redirectUrl: landingUrl,
      },
    })

    // Persist new token in cookie
    response.cookies.set({
      name: TEACHER_AUTH_COOKIE,
      value: newToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    })

    return response
  } catch (error: any) {
    console.error("[Switch Role Error]:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Failed to switch role." },
      { status: 500 }
    )
  }
}
