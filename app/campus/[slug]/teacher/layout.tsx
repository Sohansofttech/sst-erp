import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import db from "@/lib/db"
import { LoadingState } from "@/components/shared/StateViews"
import { TeacherPortalShell } from "./teacher-portal-shell"

function formatInstitutionName(slug: string): string {
  if (slug === "demo-school") return "Vidya Niketan Public School"
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

async function TeacherLayoutResolver({
  params,
  children,
}: {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}) {
  const session = await getSession();
  if (session && session.role === "STUDENT") {
    redirect("/dashboard");
  }

  const { slug } = await params
  let institutionName = formatInstitutionName(slug)

  try {
    const inst = await db.institution.findFirst({
      where: { slug },
      select: { name: true },
    });
    if (inst?.name) {
      institutionName = inst.name;
    } else {
      const platformInst = await db.platformInstitution.findFirst({
        where: { slug },
        select: { name: true },
      });
      if (platformInst?.name) {
        institutionName = platformInst.name;
      } else if (session?.institutionName) {
        institutionName = session.institutionName;
      }
    }
  } catch {
    if (session?.institutionName) {
      institutionName = session.institutionName;
    }
  }

  return (
    <TeacherPortalShell slug={slug} institutionName={institutionName}>
      {children}
    </TeacherPortalShell>
  )
}

export default function TeacherLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-md">
            <LoadingState
              title="Loading Teacher Portal"
              description="Initializing campus workspace..."
            />
          </div>
        </div>
      }
    >
      <TeacherLayoutResolver params={params}>{children}</TeacherLayoutResolver>
    </Suspense>
  )
}

