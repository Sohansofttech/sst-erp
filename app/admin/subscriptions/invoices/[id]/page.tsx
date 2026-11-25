import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import db from "@/lib/db";
import { PrintInvoiceButton } from "@/components/admin/PrintInvoiceButton";
import styles from "./invoice.module.css";

export const instant = false;

export default async function InstitutionInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  let session;
  try {
    session = await requireRole(undefined, ["ADMIN"]);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) redirect("/login");
    throw error;
  }
  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, institutionId: session.institutionId },
    include: {
      institution: {
        select: { name: true, email: true, address: true, city: true, state: true, postalCode: true, country: true },
      },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!invoice) notFound();

  const money = (amount: unknown) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: invoice.currency,
      maximumFractionDigits: 2,
    }).format(Number(amount));

  return (
    <main>
      <div className={styles.controls}>
        <Link className="text-sm font-medium text-blue-700 underline" href="/admin/subscriptions">Back to subscriptions</Link>
        <PrintInvoiceButton />
      </div>
      <article className={styles.document}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">SST ERP Platform</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Invoice</h1>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{invoice.status}</span>
        </header>

        <section className="grid gap-5 py-6 sm:grid-cols-2">
          <div><p className="text-xs text-slate-500">Invoice number</p><p className="font-semibold text-slate-900">{invoice.invoiceNumber}</p></div>
          <div><p className="text-xs text-slate-500">Institution</p><p className="font-semibold text-slate-900">{invoice.institution.name}</p></div>
          <div><p className="text-xs text-slate-500">Issued</p><p className="font-semibold text-slate-900">{invoice.issuedAt?.toLocaleDateString("en-IN") ?? "Not issued"}</p></div>
          <div><p className="text-xs text-slate-500">Paid</p><p className="font-semibold text-slate-900">{invoice.paidAt?.toLocaleDateString("en-IN") ?? "Unpaid"}</p></div>
          <div><p className="text-xs text-slate-500">Bill to</p><p className="font-semibold text-slate-900">{invoice.institution.email ?? "No billing email on file"}</p></div>
          <div><p className="text-xs text-slate-500">Address</p><p className="font-semibold text-slate-900">{[invoice.institution.address, invoice.institution.city, invoice.institution.state, invoice.institution.postalCode, invoice.institution.country].filter(Boolean).join(", ") || "No address on file"}</p></div>
        </section>

        <table className="w-full border-collapse text-left text-sm">
          <thead><tr className="border-y border-slate-200 text-slate-600"><th className="py-3">Description</th><th className="py-3 text-right">Subtotal</th><th className="py-3 text-right">Tax</th><th className="py-3 text-right">Total</th></tr></thead>
          <tbody><tr className="border-b border-slate-200"><td className="py-4">{invoice.description || "Subscription charges"}</td><td className="py-4 text-right">{money(invoice.subtotal)}</td><td className="py-4 text-right">{money(invoice.tax)}</td><td className="py-4 text-right font-bold">{money(invoice.total)}</td></tr></tbody>
        </table>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">Payment history</h2>
        {invoice.payments.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Status</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Provider</th><th className="px-3 py-2">Recorded</th></tr></thead>
              <tbody>{invoice.payments.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{payment.status}</td>
                  <td className="px-3 py-2">{money(payment.amount)}</td>
                  <td className="px-3 py-2">{payment.provider ?? "Not recorded"}</td>
                  <td className="px-3 py-2">{payment.createdAt.toLocaleString("en-IN")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-sm text-slate-600">No payment has been recorded for this invoice.</p>}
      </article>
    </main>
  );
}
