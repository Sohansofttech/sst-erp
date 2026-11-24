import { getSubscriptionUsage } from "@/lib/services/subscription-portal.service";

export const instant = false;

export default async function SubscriptionUsagePage() {
  const data = await getSubscriptionUsage();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-[#153B66]">Usage & limits</h2>
        <p className="mt-1 text-sm text-slate-500">{data.institutionName}</p>
      </div>
      {data.hasAmbiguousSubscriptions && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Multiple eligible active subscriptions exist. Limits are not arbitrarily selected.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Students", data.studentCount, data.subscription?.plan.maxStudents],
          ["Staff", data.staffCount, data.subscription?.plan.maxStaff],
          ["Active ERP users", data.userCount, data.subscription?.plan.maxUsers],
          ["Storage", "Recorded metrics", data.subscription?.plan.storageLimitMb?.toString()],
        ].map(([label, usage, limit]) => (
          <section key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-[#153B66]">{usage}</p>
            <p className="mt-1 text-xs text-slate-500">
              {limit == null ? "Limit unavailable" : `Plan limit: ${limit}`}
            </p>
          </section>
        ))}
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-[#153B66]">Recorded usage metrics</h3>
        {data.metrics.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No reliable usage metrics are recorded. An empty list means unavailable, not zero usage.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {data.metrics.map((metric) => (
              <div key={metric.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-sm font-bold">{metric.metric}</p>
                  <p className="text-xs text-slate-500">Source: {metric.source}</p>
                </div>
                <div className="text-sm font-bold text-[#153B66]">
                  {Number(metric.value).toLocaleString("en-IN")} {metric.unit}
                  <span className="ml-2 text-xs font-normal text-slate-500">{metric.measuredAt.toLocaleString("en-IN")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
