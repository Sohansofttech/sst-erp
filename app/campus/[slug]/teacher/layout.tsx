import { Suspense } from "react"
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
  const { slug } = await params
  const institutionName = formatInstitutionName(slug)

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

