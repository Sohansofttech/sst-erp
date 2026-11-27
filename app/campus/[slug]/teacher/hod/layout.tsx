import { redirect } from "next/navigation"
import { requireTeacherSession } from "@/lib/auth/teacher-session"

export default async function HodLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}) {
  const { slug } = await params

  try {
    // TSEC-01: Enforce server-side route guard: must hold hod role
    await requireTeacherSession(slug, ["hod"])
  } catch (err) {
    console.warn(`[HodLayout] Access denied for campus ${slug}:`, err)
    redirect(`/campus/${slug}/teacher?error=unauthorized_hod_workspace`)
  }

  return <>{children}</>
}
