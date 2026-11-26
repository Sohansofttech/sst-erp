import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { isDevelopmentBypassEnabled } from "@/lib/super-admin/development-access"
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt"
import { isAdminPortalRole } from "@/lib/security/rbac"

const JWT_SECRET = process.env.JWT_SECRET || "erp-secret-super-secure-key-32-chars-long!"
const jwtKey = new TextEncoder().encode(JWT_SECRET)
const TEACHER_AUTH_COOKIE = "sst_teacher_session"

interface DecodedTeacherToken {
  userId: string
  teacherId: string
  institutionId: string
  institutionSlug: string
  activeRole: "teacher" | "class_teacher" | "hod"
  availableRoles: string[]
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ---------------------------------------------------------------------------
  // 1. Campus Teacher Portal & Workspace Security
  // ---------------------------------------------------------------------------
  const campusPageMatch = pathname.match(/^\/campus\/([^/]+)\/(teacher|class-teacher|hod)(\/.*)?$/)
  const campusApiMatch = pathname.match(/^\/api\/campus\/([^/]+)\/(.*)$/)

  if (campusPageMatch || campusApiMatch) {
    // Exempt public auth endpoints
    if (
      pathname.includes("/login") ||
      pathname.endsWith("/auth/login") ||
      pathname.endsWith("/auth/logout")
    ) {
      return NextResponse.next()
    }

    const slug = campusPageMatch ? campusPageMatch[1] : campusApiMatch ? campusApiMatch[1] : ""
    const token = request.cookies.get(TEACHER_AUTH_COOKIE)?.value

    // Helper for unauthorized redirect / JSON response
    const handleUnauthorized = () => {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Authentication required for campus workspace." },
          { status: 401 }
        )
      }
      const loginUrl = new URL(`/login`, request.url)
      loginUrl.searchParams.set("from", pathname)
      loginUrl.searchParams.set("error", "unauthorized")
      return NextResponse.redirect(loginUrl)
    }

    if (!token) {
      return handleUnauthorized()
    }

    let session: DecodedTeacherToken | null = null
    try {
      const { payload } = await jwtVerify(token, jwtKey)
      session = payload as unknown as DecodedTeacherToken
    } catch {
      return handleUnauthorized()
    }

    if (!session || !session.userId) {
      return handleUnauthorized()
    }

    // Tenant validation: Ensure URL slug matches token's institutionSlug or institutionId
    const slugNorm = (slug || "").toLowerCase().trim()
    const tokenSlug = (session.institutionSlug || "").toLowerCase().trim()
    const tokenInstId = (session.institutionId || "").toLowerCase().trim()
    const tokenCode = ((session as any).institutionCode || "").toLowerCase().trim()

    const matchesTenant =
      (tokenSlug && tokenSlug === slugNorm) ||
      (tokenInstId && tokenInstId === slugNorm) ||
      (tokenCode && tokenCode === slugNorm)

    if (!matchesTenant) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Access denied: Tenant mismatch." },
          { status: 403 }
        )
      }
      const loginUrl = new URL(`/login`, request.url)
      loginUrl.searchParams.set("error", "tenant_mismatch")
      return NextResponse.redirect(loginUrl)
    }

    // Role validation for HoD workspace
    const isHodRoute =
      pathname === `/campus/${slug}/teacher/hod` ||
      pathname.startsWith(`/campus/${slug}/teacher/hod/`) ||
      pathname === `/campus/${slug}/hod` ||
      pathname.startsWith(`/campus/${slug}/hod/`) ||
      pathname.startsWith(`/api/campus/${slug}/hod`)

    if (isHodRoute && session.activeRole !== "hod") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            success: false,
            error: "Forbidden: HoD workspace requires active HoD role.",
          },
          { status: 403 }
        )
      }
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>403 Forbidden - HoD Workspace</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #EEF1F5; color: #202936; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: #FFFFFF; border: 1px solid #E5E9EF; border-radius: 1rem; padding: 2.5rem; max-width: 28rem; text-align: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
    .badge { display: inline-block; background: #FEF3F2; color: #B42318; border-radius: 9999px; padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 700; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 800; color: #123B5A; margin: 0 0 0.5rem 0; }
    p { font-size: 0.875rem; color: #788391; margin: 0 0 1.5rem 0; line-height: 1.5; }
    .btn { display: inline-block; background: #F5A000; color: #FFFFFF; text-decoration: none; font-weight: 700; font-size: 0.875rem; padding: 0.75rem 1.5rem; border-radius: 0.75rem; transition: background 0.15s; }
    .btn:hover { background: #E09200; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">403 FORBIDDEN</div>
    <h1>Department Leadership Restricted</h1>
    <p>Your current active workspace is <strong>${session.activeRole}</strong>. Access to the Department of Mathematics (HoD) workspace requires switching to the HoD role via the header switcher.</p>
    <a href="/campus/${slug}/teacher" class="btn">Return to Teacher Workspace</a>
  </div>
</body>
</html>`
      return new NextResponse(html, {
        status: 403,
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
      })
    }

    // Role validation for Class Teacher workspace
    const isClassTeacherRoute =
      pathname === `/campus/${slug}/teacher/class-teacher` ||
      pathname.startsWith(`/campus/${slug}/teacher/class-teacher/`) ||
      pathname === `/campus/${slug}/class-teacher` ||
      pathname.startsWith(`/campus/${slug}/class-teacher/`) ||
      pathname.startsWith(`/api/campus/${slug}/class-teacher`)

    if (
      isClassTeacherRoute &&
      session.activeRole !== "class_teacher" &&
      session.activeRole !== "hod"
    ) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            success: false,
            error: "Forbidden: Class Teacher workspace requires active Class Teacher role.",
          },
          { status: 403 }
        )
      }
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>403 Forbidden - Class Teacher Workspace</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #EEF1F5; color: #202936; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: #FFFFFF; border: 1px solid #E5E9EF; border-radius: 1rem; padding: 2.5rem; max-width: 28rem; text-align: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
    .badge { display: inline-block; background: #FEF3F2; color: #B42318; border-radius: 9999px; padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 700; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 800; color: #123B5A; margin: 0 0 0.5rem 0; }
    p { font-size: 0.875rem; color: #788391; margin: 0 0 1.5rem 0; line-height: 1.5; }
    .btn { display: inline-block; background: #F5A000; color: #FFFFFF; text-decoration: none; font-weight: 700; font-size: 0.875rem; padding: 0.75rem 1.5rem; border-radius: 0.75rem; transition: background 0.15s; }
    .btn:hover { background: #E09200; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">403 FORBIDDEN</div>
    <h1>Homeroom Workspace Restricted</h1>
    <p>Your current active workspace is <strong>${session.activeRole}</strong>. Access to Homeroom Class 10-A requires switching to the Class Teacher role.</p>
    <a href="/campus/${slug}/teacher" class="btn">Return to Teacher Workspace</a>
  </div>
</body>
</html>`
      return new NextResponse(html, {
        status: 403,
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
      })
    }

    // Direct aliases for /campus/:slug/class-teacher and /campus/:slug/hod
    if (pathname === `/campus/${slug}/class-teacher`) {
      return NextResponse.rewrite(new URL(`/campus/${slug}/teacher/class-teacher`, request.url))
    }
    if (pathname === `/campus/${slug}/hod`) {
      return NextResponse.rewrite(new URL(`/campus/${slug}/teacher/hod`, request.url))
    }

    // Protected page cache control
    const res = NextResponse.next()
    if (!pathname.startsWith("/api/")) {
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
      res.headers.set("Pragma", "no-cache")
    }
    return res
  }

  // ---------------------------------------------------------------------------
  // 2. Admin & Super-Admin Proxy Handling
  // ---------------------------------------------------------------------------
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", pathname)

  if (isDevelopmentBypassEnabled()) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // The admin layout enforces live database permissions after the session check.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !pathname.startsWith("/admin/login/")) {
    const adminToken =
      request.cookies.get(AUTH_COOKIE_NAME)?.value || request.cookies.get("sst_session")?.value

    if (!adminToken) {
      const loginUrl = new URL("/admin/login", request.url)
      loginUrl.searchParams.set("from", pathname)
      return NextResponse.redirect(loginUrl)
    }

    const session = await verifyToken(adminToken)
    if (!session || !session.userId) {
      const loginUrl = new URL("/admin/login", request.url)
      loginUrl.searchParams.set("from", pathname)
      return NextResponse.redirect(loginUrl)
    }

    const roleUpper = (session.role || "").toUpperCase()
    if (!isAdminPortalRole(roleUpper)) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("error", "forbidden")
      return NextResponse.redirect(loginUrl)
    }
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getClaims()
  return response
}

export const config = {
  matcher: [
    "/campus/:slug/teacher/:path*",
    "/campus/:slug/class-teacher/:path*",
    "/campus/:slug/hod/:path*",
    "/api/campus/:slug/:path*",
    "/admin/:path*",
    "/super-admin/:path*",
  ],
}
