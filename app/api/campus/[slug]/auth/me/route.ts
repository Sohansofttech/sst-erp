import { NextRequest, NextResponse } from "next/server"
import {
  getTeacherSessionToken,
  verifyTeacherSession,
} from "@/lib/auth/teacher-session"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const token = await getTeacherSessionToken(req)

    if (!token) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "Not authenticated" },
        { status: 401 }
      )
    }

    const payload = await verifyTeacherSession(token)
    if (!payload) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "Invalid token" },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      data: {
        user: payload,
        slug,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve session" },
      { status: 500 }
    )
  }
}
