import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";

export default function TeacherPortalEntry() {
  return (
    <Suspense fallback={<PortalEntryFallback />}>
      <TeacherPortalRedirect />
    </Suspense>
  );
}

async function TeacherPortalRedirect() {
  await connection();
  const session = await getSession();

  if (!session) {
    redirect("/login?role=teacher");
  }

  switch (session.role) {
    case "TEACHER": {
      const institutionRoute = session.institutionId;
      if (!institutionRoute) {
        redirect("/login?role=teacher");
      }
      redirect(`/campus/${encodeURIComponent(institutionRoute)}/teacher`);
    }
    case "STUDENT":
      redirect("/student/dashboard");
    case "PARENT":
      redirect("/parent");
    case "ADMIN":
    case "INSTITUTION_ADMIN":
      redirect("/admin");
    case "SUPER_ADMIN":
      redirect("/super-admin");
    default:
      redirect("/login?role=teacher");
  }

  return null;
}

function PortalEntryFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EEF1F5] text-sm text-[#64748B]">
      Opening Teacher Portal…
    </main>
  );
}
