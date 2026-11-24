import Link from "next/link";
import { getSubscriptionPlans } from "@/lib/services/subscription-portal.service";

export const instant = false;

export default async function SubscriptionPlansPage() {
  const data = await getSubscriptionPlans();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-[#153B66]">Subscription plans</h2>
        <p className="mt-1 text-sm text-slate-500">
          Active plans available for review
        </p>
      </div>
      {data.plans.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No plans are available.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.plans.map((plan) => (
            <article key={plan.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-[#153B66]">{plan.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{plan.code}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                    plan.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {plan.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-4 text-2xl font-black text-[#153B66]">
                {plan.currency} {Number(plan.price).toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-slate-500">{plan.billingCycle}</p>
              {plan.description && <p className="mt-3 text-sm text-slate-600">{plan.description}</p>}
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
                <div><dt className="text-slate-500">Students</dt><dd className="mt-1 font-bold">{plan.maxStudents ?? "Unlimited"}</dd></div>
                <div><dt className="text-slate-500">Staff</dt><dd className="mt-1 font-bold">{plan.maxStaff ?? "Unlimited"}</dd></div>
                <div><dt className="text-slate-500">Users</dt><dd className="mt-1 font-bold">{plan.maxUsers ?? "Unlimited"}</dd></div>
                <div><dt className="text-slate-500">Storage</dt><dd className="mt-1 font-bold">{plan.storageLimitMb?.toString() ?? "Unspecified"} MB</dd></div>
              </dl>
              <Link
                className="mt-5 inline-flex rounded-lg bg-[#153B66] px-4 py-2 text-sm font-bold text-white"
                href={`/subscription?planId=${encodeURIComponent(plan.id)}`}
              >
                Review plan
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
