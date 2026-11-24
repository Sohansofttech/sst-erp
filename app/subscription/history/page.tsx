import Link from "next/link";
import { getSubscriptionHistory } from "@/lib/services/subscription-portal.service";

export const instant = false;

export default async function SubscriptionHistoryPage() {
  const data = await getSubscriptionHistory();
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-[#153B66]">Subscription history</h2>
        <p className="mt-1 text-sm text-slate-500">Recorded subscriptions and status events</p>
      </div>
      {data.subscriptions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No subscription history is recorded.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Events and audit trail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.subscriptions.map((subscription) => (
                  <tr key={subscription.id}>
                    <td className="px-4 py-3 font-semibold text-[#153B66]">{subscription.plan.name}</td>
                    <td className="px-4 py-3">{subscription.status}</td>
                    <td className="px-4 py-3">{subscription.startsAt.toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3">{subscription.endsAt?.toLocaleDateString("en-IN") ?? "No expiry"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {subscription.events.length ? (
                        <ul className="space-y-2">
                          {subscription.events.map((event) => (
                            <li key={event.id}>
                              <strong>{event.action}</strong>
                              <span> · {event.createdAt.toLocaleString("en-IN")}</span>
                              {event.actor && <span> · {event.actor.name || event.actor.email}</span>}
                              {event.details && <pre className="mt-1 whitespace-pre-wrap break-words text-[11px]">{JSON.stringify(event.details)}</pre>}
                            </li>
                          ))}
                        </ul>
                      ) : "No recorded events"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Link className="text-sm font-bold text-[#153B66] underline" href="/subscription/invoices">
        View invoices and payment history
      </Link>
    </div>
  );
}
