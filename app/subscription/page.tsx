import {
  getSubscriptionDashboard,
  getSelectedSubscriptionPlan,
} from "@/lib/services/subscription-portal.service";
import Link from "next/link";

export const instant = false;

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-[#153B66]">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </section>
  );
}

export default async function SubscriptionDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string | string[] }>;
}) {
  const data = await getSubscriptionDashboard();
  const query = await searchParams;
  const selectedPlanId = typeof query.planId === "string" ? query.planId : null;
  const { plan: selectedPlan } = await getSelectedSubscriptionPlan(selectedPlanId);
  const subscription = data.currentSubscription;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-[#153B66]">Institution subscription overview</h2>
        <p className="mt-1 text-sm text-slate-500">{data.institutionName}</p>
      </div>
      {selectedPlanId && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h3 className="font-bold text-[#153B66]">Review selected plan</h3>
          {selectedPlan ? (
            <>
              <p className="mt-2 text-sm text-slate-700">
                {selectedPlan.name} · {selectedPlan.currency} {Number(selectedPlan.price).toLocaleString("en-IN")} · {selectedPlan.billingCycle}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                This is a plan review only. Online payment and activation are not available yet; no invoice, payment, or subscription record has been created.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">This plan is no longer available. Choose an active plan to continue.</p>
          )}
          <Link className="mt-4 inline-flex text-sm font-bold text-[#153B66] underline" href="/subscription/plans">
            Browse plans
          </Link>
        </section>
      )}
      {data.hasAmbiguousSubscriptions && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Multiple eligible active subscriptions were found. A current subscription cannot be selected safely until the records are reconciled.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={subscription?.status === "TRIALING" ? "Trial plan" : subscription?.status === "ACTIVE" ? "Current plan" : "Latest plan"}
          value={subscription?.plan.name ?? "Unavailable"}
          detail={subscription ? subscription.status : "No single eligible subscription"}
        />
        <StatCard
          label={subscription?.status === "TRIALING" ? "Trial expiry" : "Expiry"}
          value={subscription?.endsAt ? subscription.endsAt.toLocaleDateString("en-IN") : "No expiry"}
          detail={subscription ? `Started ${subscription.startsAt.toLocaleDateString("en-IN")}` : "No verified current record"}
        />
        <StatCard
          label="Student usage"
          value={String(data.studentCount)}
          detail={subscription ? `${subscription.plan.maxStudents ?? "Unlimited"} student limit` : "Plan limit unavailable"}
        />
        <StatCard
          label="Staff usage"
          value={String(data.staffCount)}
          detail={subscription ? `${subscription.plan.maxStaff ?? "Unlimited"} staff limit` : "Plan limit unavailable"}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Active ERP users</p>
          <p className="mt-2 text-2xl font-black text-[#153B66]">{data.userCount}</p>
          <p className="mt-1 text-xs text-slate-500">ERP users with this institution ID</p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Storage usage</p>
          <p className="mt-2 text-2xl font-black text-[#153B66]">
            {data.storageUsage ? `${data.storageUsage.value.toLocaleString("en-IN")} ${data.storageUsage.unit}` : "Unavailable"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data.storageUsage ? `Recorded ${data.storageUsage.measuredAt.toLocaleString("en-IN")}` : "No reliable usage metric"}
          </p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Plan user limit</p>
          <p className="mt-2 text-2xl font-black text-[#153B66]">
            {subscription?.plan.maxUsers ?? "Unavailable"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Maximum users recorded by the current plan</p>
        </section>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-[#153B66]">Plan and billing actions</h3>
        <p className="mt-2 text-sm text-slate-600">
          Review available plans and view your subscription, invoice, payment, and subscription history. Renewals and upgrades require an approved billing policy and payment workflow.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold text-[#153B66]">
          <Link className="underline" href="/subscription/plans">View plans</Link>
          <Link className="underline" href="/subscription/current">Current subscription</Link>
          <Link className="underline" href="/subscription/invoices">Invoices & payments</Link>
          <Link className="underline" href="/subscription/history">Subscription history</Link>
        </div>
      </section>
    </div>
  );
}
