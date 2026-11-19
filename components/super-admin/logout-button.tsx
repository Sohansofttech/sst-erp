"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/super-admin/session-actions";
import { InlineBrandSpinner } from "@/components/shared/BrandLoadingScreen";

function LogoutSubmitButton({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={`sa-logout-form-button ${className}`} type="submit" aria-label="Sign out" disabled={pending}>
      {pending ? <InlineBrandSpinner size={15} /> : <LogOut size={16} />}
      <span>{pending ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}

export function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOut}>
      <LogoutSubmitButton className={className} />
    </form>
  );
}
