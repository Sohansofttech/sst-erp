import { NextRequest, NextResponse } from "next/server"
import {
  getTeacherSessionToken,
  revokeDbSession,
  TEACHER_AUTH_COOKIE,
} from "@/lib/auth/teacher-session"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await params

  // 1. Mark session as revoked in PostgreSQL teacher_portal_sessions table
  const token = await getTeacherSessionToken(req)
  if (token) {
    try {
      await revokeDbSession(token)
    } catch (e) {
      console.warn("[Logout] Failed to revoke DB session:", e)
    }
  }

  // 2. Redirect target is the existing standard login page
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully.",
    redirectUrl: "/login",
  })

  // 3. Clear all authentication cookies
  response.cookies.set({
    name: TEACHER_AUTH_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  })

  response.cookies.set({
    name: "sst_session",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  })

  response.cookies.set({
    name: "sst_auth_token",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  })

  // 4. Disallow caching to prevent back-button browser cache leaks
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
  response.headers.set("Pragma", "no-cache")

  return response
}
