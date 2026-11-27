import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";

export default function InstitutionEntryPage() {
  return (
    <Suspense fallback={<InstitutionEntryFallback />}>
      <InstitutionSessionRedirect />
    </Suspense>
  );
}

async function InstitutionSessionRedirect() {
  await connection();
  const session = await getSession();

  if (!session) {
    redirect("/admin/login");
  }

  switch (session.role) {
    case "ADMIN":
    case "INSTITUTION_ADMIN":
      redirect("/admin");
    case "SUPER_ADMIN":
      redirect("/admin/login");
    case "TEACHER":
      redirect("/teacher");
    case "STUDENT":
      redirect("/dashboard");
    case "PARENT":
      redirect("/parent");
    default:
      redirect("/admin/login");
  }

  return null;
}

function InstitutionEntryFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9fa] px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-[#123B5A]">
          Sohan Soft Tech
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Opening your institution portal…
        </p>
      </div>
    </main>
  );
}
