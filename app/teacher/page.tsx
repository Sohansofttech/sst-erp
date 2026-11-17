"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeacherRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          const slug = (data.user.institutionSlug || data.user.institutionName || "apex-tech").toLowerCase();
          router.replace(`/campus/${slug}/teacher`);
        } else {
          router.replace("/login");
        }
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEF1F5]">
      <div className="flex flex-col items-center gap-3 text-sm text-[#788391]">
        <div className="w-6 h-6 border-2 border-[#123B5A] border-t-transparent rounded-full animate-spin" />
        Redirecting to Teacher Portal...
      </div>
    </div>
  );
}
