import { getInvoiceRegister, hasBillingDocumentColumns } from "@/lib/subscriptions/management-data";
import { getSubscriptionPortalScope } from "@/lib/subscriptions/portal-data";
import Link from "next/link";

export const instant = false;

export default async function SubscriptionInvoicesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[]; invoice?: string | string[]; paymentsPage?: string | string[] }> }) {
  const scope = await getSubscriptionPortalScope();
  const { page: pageParam, invoice: paymentInvoiceId, paymentsPage } = await searchParams;
  const [register, documentsAvailable] = await Promise.all([
    getInvoiceRegister(scope.role === "INSTITUTION_ADMIN" ? scope.institutionId : undefined, typeof pageParam === "string" && /^\d+$/.test(pageParam) ? Number(pageParam) : 1, typeof paymentInvoiceId === "string" ? paymentInvoiceId : undefined, typeof paymentsPage === "string" && /^\d+$/.test(paymentsPage) ? Number(paymentsPage) : 1),
    hasBillingDocumentColumns(),
  ]);
  return <div className="sc-page"><div className="sc-page-heading"><div><div className="sc-eyebrow">Billing documents</div><h2>Invoices & receipts</h2><p>Existing invoice and verified payment records.</p></div></div>
    {!documentsAvailable && <p className="sc-data-notice">Printable invoice documents require the existing billing migration.</p>}
    <section className="sc-card"><div className="sc-table-wrap"><table className="sc-table"><thead><tr><th>Invoice</th><th>Institution</th><th>Plan</th><th>Amount</th><th>Issued</th><th>Due</th><th>Status</th><th>Payments / receipt references</th></tr></thead>
      <tbody>{register.invoices.map((invoice) => <tr key={invoice.id}>{[
        <td key="number">{documentsAvailable ? <Link href={scope.role === "SUPER_ADMIN" ? `/super-admin/invoices/${invoice.id}` : `/admin/subscriptions/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link> : invoice.invoiceNumber}</td>, <td key="institution">{invoice.institution.name}</td>,
        <td key="plan">{invoice.subscription?.plan.name ?? "Not linked"}</td>,
        <td key="amount">{invoice.currency} {invoice.total.toFixed(2)}</td>,
        <td key="issued">{invoice.issuedAt?.slice(0, 10) ?? "—"}</td>, <td key="due">{invoice.dueAt?.slice(0, 10) ?? "—"}</td>,
        <td key="status">{invoice.status}</td>,
        <td key="payments">{invoice.payments.length ? <>{invoice.payments.map((payment) => <div key={payment.id}>{payment.status} · {payment.currency} {payment.amount.toFixed(2)} · {payment.providerReference ?? "No receipt reference"}</div>)}{invoice._count.payments > 10 && (() => { const current = paymentInvoiceId === invoice.id ? register.selectedPaymentPage : 1; return <div>{current > 1 && <Link href={`?page=${register.page}&invoice=${invoice.id}&paymentsPage=${current - 1}`}>Previous payments</Link>} <span>Payments page {current} of {Math.ceil(invoice._count.payments / 10)}</span> {current * 10 < invoice._count.payments && <Link href={`?page=${register.page}&invoice=${invoice.id}&paymentsPage=${current + 1}`}>Next payments</Link>}</div>; })()}</> : "No payments"}</td>,
      ]}</tr>)}</tbody></table></div>{!register.invoices.length && <p>No invoice records found.</p>}
      <nav aria-label="Invoice pages">{register.page > 1 && <Link href={`?page=${register.page - 1}`}>Previous</Link>} <span>Page {register.page} of {Math.max(1, Math.ceil(register.total / register.pageSize))} · {register.total} invoices</span> {register.page * register.pageSize < register.total && <Link href={`?page=${register.page + 1}`}>Next</Link>}</nav>
    </section></div>;
}
