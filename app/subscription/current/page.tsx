import Link from "next/link";
import { getCurrentSubscription } from "@/lib/services/subscription-portal.service";

export const instant = false;

export default async function CurrentSubscriptionPage() {
  const data = await getCurrentSubscription();
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-[#153B66]">Current subscription</h2>
        <p className="mt-1 text-sm text-slate-500">
          Current subscription and trial for this institution
        </p>
      </div>
      {data.subscriptions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No unexpired active or trial subscription is available.
        </div>
      ) : data.subscriptions.length > 1 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Multiple eligible active subscriptions exist. This view does not arbitrarily select one.
          <div className="mt-4 space-y-2">
            {data.subscriptions.map((subscription) => (
              <div key={subscription.id} className="rounded-lg border border-amber-200 bg-white p-3">
                <strong>{subscription.plan.name}</strong> · {subscription.status} ·
                {subscription.endsAt ? ` ends ${subscription.endsAt.toLocaleDateString("en-IN")}` : " no expiry"}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.subscriptions.map((subscription) => (
            <article key={subscription.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex justify-between gap-3">
                <h3 className="font-bold text-[#153B66]">
                  {subscription.plan.name}
                </h3>
                <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                  subscription.status === "TRIALING" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
                }`}>
                  {subscription.status}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
                <div><dt className="text-slate-500">Start</dt><dd className="mt-1 font-bold">{subscription.startsAt.toLocaleDateString("en-IN")}</dd></div>
                <div><dt className="text-slate-500">Expiry</dt><dd className="mt-1 font-bold">{subscription.endsAt?.toLocaleDateString("en-IN") ?? "No expiry"}</dd></div>
                <div><dt className="text-slate-500">Students</dt><dd className="mt-1 font-bold">{subscription.plan.maxStudents ?? "Unlimited"}</dd></div>
                <div><dt className="text-slate-500">Staff</dt><dd className="mt-1 font-bold">{subscription.plan.maxStaff ?? "Unlimited"}</dd></div>
                <div><dt className="text-slate-500">Users</dt><dd className="mt-1 font-bold">{subscription.plan.maxUsers ?? "Unlimited"}</dd></div>
                <div><dt className="text-slate-500">Storage</dt><dd className="mt-1 font-bold">{subscription.plan.storageLimitMb?.toString() ?? "Unspecified"} MB</dd></div>
              </dl>
              {subscription.status === "TRIALING" && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  Trial period · starts {subscription.startsAt.toLocaleDateString("en-IN")}
                  {subscription.endsAt ? ` · ends ${subscription.endsAt.toLocaleDateString("en-IN")}` : ""}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-sm font-bold text-[#153B66]">
        <Link className="underline" href="/subscription/plans">Review plans</Link>
        <Link className="underline" href="/subscription/invoices">Invoices and payments</Link>
        <Link className="underline" href="/subscription/history">Subscription history</Link>
      </div>
    </div>
  );
}
