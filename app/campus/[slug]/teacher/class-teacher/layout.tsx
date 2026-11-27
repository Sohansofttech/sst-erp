import { redirect } from "next/navigation"
import { requireTeacherSession } from "@/lib/auth/teacher-session"

export default async function ClassTeacherLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}) {
  const { slug } = await params

  try {
    // TSEC-01: Enforce server-side route guard: must hold class_teacher or hod role
    await requireTeacherSession(slug, ["class_teacher", "hod"])
  } catch (err) {
    console.warn(`[ClassTeacherLayout] Access denied for campus ${slug}:`, err)
    redirect(`/campus/${slug}/teacher?error=unauthorized_class_teacher_workspace`)
  }

  return <>{children}</>
}
