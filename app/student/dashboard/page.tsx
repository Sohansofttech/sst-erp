"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StudentDashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-3 border-[#0F2942] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-xs text-[#64748B] font-medium">Redirecting to Student Portal Dashboard...</p>
      </div>
    </div>
  );
}
