import { getSubscriptionInvoices } from "@/lib/services/subscription-portal.service";

export const instant = false;

export default async function SubscriptionInvoicesPage() {
  const data = await getSubscriptionInvoices();
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-[#153B66]">Subscription invoices</h2>
        <p className="mt-1 text-sm text-slate-500">Central SST-ERP subscription billing records only</p>
      </div>
      {data.invoices.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No subscription invoices are recorded.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Payments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-4 py-3 font-mono text-xs text-[#153B66]">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3 font-bold">
                      {invoice.currency} {Number(invoice.total).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">{invoice.status}</td>
                    <td className="px-4 py-3">{invoice.issuedAt?.toLocaleDateString("en-IN") ?? "Not issued"}</td>
                    <td className="px-4 py-3">{invoice.dueAt?.toLocaleDateString("en-IN") ?? "No due date"}</td>
                    <td className="px-4 py-3 text-xs">
                      {invoice.payments.length ? (
                        <ul className="space-y-2">
                          {invoice.payments.map((payment) => (
                            <li key={payment.id}>
                              <strong>{payment.status}</strong> · {payment.currency} {Number(payment.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                              <div>{payment.provider ?? "Manual/unspecified"} · {payment.paidAt?.toLocaleString("en-IN") ?? "Not paid"}</div>
                              {payment.providerReference && <div className="font-mono">{payment.providerReference}</div>}
                            </li>
                          ))}
                        </ul>
                      ) : "No payments recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
