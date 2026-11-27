import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default function StudentRootPage() {
  return (
    <Suspense fallback={<PortalEntryFallback />}>
      <StudentPortalRedirect />
    </Suspense>
  );
}

async function StudentPortalRedirect() {
  const session = await getSession();

  if (!session) {
    redirect("/login?role=student");
  }

  switch (session.role) {
    case "STUDENT":
      redirect("/student/dashboard");
    case "PARENT":
      redirect("/parent");
    case "TEACHER":
      redirect("/teacher");
    case "ADMIN":
    case "INSTITUTION_ADMIN":
      redirect("/admin");
    case "SUPER_ADMIN":
      redirect("/super-admin");
    default:
      redirect("/login?role=student");
  }

  return null;
}

function PortalEntryFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EEF1F5] text-sm text-[#64748B]">
      Opening Student Portal…
    </main>
  );
}
