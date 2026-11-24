import type { Metadata } from "next";
import { SubscriptionShell } from "./_components/subscription-shell";
import {
  resolveSubscriptionPortalContext,
  type SubscriptionPortalContext,
} from "@/lib/services/subscription-portal.service";

export const metadata: Metadata = {
  title: "Subscription Portal | SST-ERP",
  description: "Subscription and billing information for SST-ERP.",
};

export const instant = false;

export default async function SubscriptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let context: SubscriptionPortalContext;
  try {
    context = await resolveSubscriptionPortalContext();
  } catch (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-6">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-[#153B66]">Subscription access unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error instanceof Error ? error.message : "Your subscription access could not be verified."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <SubscriptionShell
      institutionName={context.institutionName}
      userName={context.institutionName}
    >
      {children}
    </SubscriptionShell>
  );
}
