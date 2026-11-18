import { Suspense } from "react";
import { ActivateInstitutionAdminForm } from "@/components/institution/ActivateInstitutionAdminForm";

export default function ActivateInstitutionAdminPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#eef1f5]" />}>
      <ActivateInstitutionAdminForm />
    </Suspense>
  );
}
