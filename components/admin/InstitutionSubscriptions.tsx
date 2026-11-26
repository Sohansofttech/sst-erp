"use client";

import { useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billingCycle: string;
  customCycleDays: number | null;
  studentLimit: number | null;
  storageLimitMb: string | null;
  features: string[];
};

type Subscription = {
  id: string;
  planId: string;
  planName: string;
  planPrice: number;
  planCurrency: string;
  billingCycle: string;
  customCycleDays: number | null;
  studentLimit: number | null;
  storageLimitMb: string | null;
  status: string;
  startsAt: string;
  endsAt: string | null;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  description: string | null;
  total: number;
  currency: string;
  status: string;
  createdAt: string;
  payments: {
    amount: number;
    currency: string;
    status: string;
    provider: string | null;
    createdAt: string;
  }[];
};

type PaymentTransaction = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  planName: string;
  amount: number;
  currency: string;
  status: string;
  provider: string | null;
  providerOrderId: string | null;
  providerReference: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
};

type TransactionPagination = {
  total: number;
  page: number;
  pageCount: number;
  search: string;
  status: string;
  from: string;
  to: string;
};

type CheckoutResult = {
  success: boolean;
  error?: string;
  data?: {
    free: boolean;
    keyId?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
    invoiceNumber: string;
    description?: string;
  };
};

type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => Promise<void>;
  modal: { ondismiss: () => void };
  theme: { color: string };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
    };
  }
}

export function InstitutionSubscriptions({
  plans,
  subscriptions,
  invoices,
  usage,
  transactions,
  transactionPagination,
}: {
  plans: Plan[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  usage: {
    registeredStudents: number;
    studentLimitAvailable: boolean;
    activePlanName: string | null;
    studentLimit: number | null;
    planPrice: number | null;
    planCurrency: string | null;
    billingCycle: string | null;
    customCycleDays: number | null;
    storageLimitMb: string | null;
    hasActivePlan: boolean;
  };
  transactions?: PaymentTransaction[];
  transactionPagination?: TransactionPagination;
}) {
  const router = useRouter();
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [checkoutLoadFailed, setCheckoutLoadFailed] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);
  const transactionPageHref = (page: number) => {
    const query = new URLSearchParams();
    if (transactionPagination?.search) query.set("q", transactionPagination.search);
    if (transactionPagination?.status && transactionPagination.status !== "all") {
      query.set("paystatus", transactionPagination.status);
    }
    if (transactionPagination?.from) query.set("from", transactionPagination.from);
    if (transactionPagination?.to) query.set("to", transactionPagination.to);
    query.set("paypage", String(page));
    return `/subscriptions?${query.toString()}`;
  };

  const startCheckout = async (plan: Plan, renewalSubscriptionId?: string) => {
    setPendingPlanId(plan.id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/admin/subscriptions/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, renewalSubscriptionId: renewalSubscriptionId ?? null }),
      });
      const result = await response.json() as CheckoutResult;
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || "Could not start subscription checkout.");
      }
      const checkoutData = result.data;

      if (checkoutData.free) {
        setSuccessMessage(`The free plan is active. Invoice ${checkoutData.invoiceNumber} is available below.`);
        router.refresh();
        return;
      }
      if (!window.Razorpay || !checkoutData.keyId || !checkoutData.orderId || !checkoutData.amount || !checkoutData.currency) {
        throw new Error("Razorpay Checkout did not load. Reload this page and try again.");
      }

      const checkout = new window.Razorpay({
        key: checkoutData.keyId,
        order_id: checkoutData.orderId,
        amount: checkoutData.amount,
        currency: checkoutData.currency,
        name: "SST ERP",
        description: checkoutData.description || plan.name,
        theme: { color: "#123B5A" },
        modal: { ondismiss: () => setPendingPlanId(null) },
        handler: async (payment) => {
          setPendingPlanId(plan.id);
          try {
            const verifyResponse = await fetch("/api/admin/subscriptions/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: payment.razorpay_order_id,
                paymentId: payment.razorpay_payment_id,
                signature: payment.razorpay_signature,
              }),
            });
            const verification = await verifyResponse.json() as { success: boolean; error?: string };
            if (!verifyResponse.ok || !verification.success) {
              throw new Error(verification.error || "Payment confirmation is pending.");
            }
            setSuccessMessage(`Payment confirmed. Invoice ${checkoutData.invoiceNumber} is available below.`);
            router.refresh();
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Could not verify the payment.");
          } finally {
            setPendingPlanId(null);
          }
        },
      });
      checkout.on("payment.failed", (failure) => {
        setPendingPlanId(null);
        setErrorMessage(failure.error?.description || "Payment failed. You can try again.");
      });
      checkout.open();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not start subscription checkout.");
    } finally {
      setPendingPlanId(null);
    }
  };

  return (
    <div className="space-y-8">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onReady={() => setCheckoutReady(true)}
        onError={() => setCheckoutLoadFailed(true)}
      />
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Subscriptions &amp; Billing</h1>
        <p className="mt-1 text-sm text-slate-600">View your plan, purchase or renew a subscription, and access invoices and payment history.</p>
      </header>

      {errorMessage && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{errorMessage}</p>}
      {successMessage && <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">{successMessage}</p>}
      {checkoutLoadFailed && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">Razorpay Checkout could not be loaded. Check your connection and reload the page.</p>}

      <section aria-labelledby="student-usage" className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 id="student-usage" className="text-lg font-semibold text-slate-900">Student capacity</h2>
        <p className="mt-2 text-sm text-slate-700">
          {usage.registeredStudents} student records are currently stored for this institution.
          {usage.hasActivePlan
            ? ` ${usage.activePlanName}: ${!usage.studentLimitAvailable ? "student capacity unavailable" : usage.studentLimit === null ? "unlimited capacity" : `${usage.registeredStudents} of ${usage.studentLimit} students used`}.`
            : " No active subscription is available; new student registration is blocked."}
        </p>
        <p className="mt-1 text-xs text-slate-500">All stored student records count toward capacity, regardless of lifecycle status.</p>
      </section>

      {usage.hasActivePlan && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Assigned subscription</h2>
          <p className="mt-1 text-sm text-slate-600">{usage.activePlanName}</p>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-slate-500">Price</dt><dd className="font-semibold text-slate-900">{usage.planPrice !== null && usage.planCurrency ? money(usage.planPrice, usage.planCurrency) : "Not available"}</dd></div>
            <div><dt className="text-slate-500">Billing cycle</dt><dd className="font-semibold text-slate-900">{usage.billingCycle === "CUSTOM" ? `${usage.customCycleDays ?? "Custom"} days` : usage.billingCycle?.toLowerCase() ?? "Not available"}</dd></div>
            <div><dt className="text-slate-500">Student limit</dt><dd className="font-semibold text-slate-900">{usage.studentLimitAvailable ? usage.studentLimit ?? "Unlimited" : "Unavailable"}</dd></div>
            <div><dt className="text-slate-500">Storage limit</dt><dd className="font-semibold text-slate-900">{usage.storageLimitMb ? `${usage.storageLimitMb} MB` : "Unlimited"}</dd></div>
          </dl>
        </section>
      )}

      <section aria-labelledby="available-plans" className="space-y-4">
        <div>
          <h2 id="available-plans" className="text-lg font-semibold text-slate-900">Available plans</h2>
          <p className="text-sm text-slate-600">Payments are created and verified by the server using Razorpay test mode.</p>
        </div>
        {plans.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">There are no active plans available. Contact your Super Admin.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const active = subscriptions.find((item) =>
                item.planId === plan.id &&
                ["ACTIVE", "EXPIRED", "PAST_DUE"].includes(item.status) &&
                item.endsAt !== null
              );
              const activeWithoutExpiry = subscriptions.some((item) =>
                item.planId === plan.id && item.status === "ACTIVE" && item.endsAt === null
              );
              const canCheckout = plan.currency.toUpperCase() === "INR" && (plan.price === 0 || checkoutReady);
              return (
                <article key={plan.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                  {plan.description && <p className="mt-1 text-sm text-slate-600">{plan.description}</p>}
                  <p className="mt-4 text-2xl font-bold text-slate-900">
                    {money(plan.price, plan.currency)}
                    <span className="ml-1 text-sm font-normal text-slate-500">/ {plan.billingCycle.toLowerCase()}</span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-1 text-sm text-slate-700">
                    {!usage.studentLimitAvailable ? <li>Student limit unavailable</li> : plan.studentLimit === null ? <li>Unlimited students</li> : <li>Up to {plan.studentLimit} students</li>}
                    {plan.storageLimitMb && <li>{plan.storageLimitMb} MB storage</li>}
                    {plan.features.map((feature) => <li key={feature}>• {feature}</li>)}
                    {!plan.features.length && <li>No feature list configured</li>}
                  </ul>
                  <button
                    className="mt-5 rounded-md bg-[#123B5A] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    disabled={pendingPlanId !== null || !canCheckout || activeWithoutExpiry}
                    onClick={() => startCheckout(plan, active?.id)}
                  >
                    {pendingPlanId === plan.id
                      ? "Processing..."
                      : activeWithoutExpiry
                        ? "No expiry — contact Super Admin"
                        : active
                          ? "Renew plan"
                          : plan.currency.toUpperCase() !== "INR"
                            ? "INR plans only"
                            : plan.price > 0 && !checkoutReady
                              ? "Loading checkout..."
                              : plan.price === 0
                                ? "Activate free plan"
                                : "Purchase plan"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="current-subscriptions" className="space-y-3">
        <h2 id="current-subscriptions" className="text-lg font-semibold text-slate-900">Subscription history</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Terms</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Start date</th><th className="px-4 py-3">Expiry</th></tr></thead>
            <tbody>
              {subscriptions.length ? subscriptions.map((subscription) => (
                <tr key={subscription.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{subscription.planName}</td>
                  <td className="px-4 py-3">{money(subscription.planPrice, subscription.planCurrency)} · {subscription.billingCycle === "CUSTOM" ? `${subscription.customCycleDays ?? "Custom"} days` : subscription.billingCycle.toLowerCase()}<small className="block text-slate-500">{usage.studentLimitAvailable ? subscription.studentLimit ?? "Unlimited" : "Unavailable"} students · {subscription.storageLimitMb ?? "Unlimited"} MB</small></td>
                  <td className="px-4 py-3">{subscription.status}</td>
                  <td className="px-4 py-3">{new Date(subscription.startsAt).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3">{subscription.endsAt ? new Date(subscription.endsAt).toLocaleDateString("en-IN") : "No expiry"}</td>
                </tr>
              )) : <tr><td className="px-4 py-4 text-slate-600" colSpan={5}>No subscriptions have been assigned yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="invoice-history" className="space-y-3">
        <h2 id="invoice-history" className="text-lg font-semibold text-slate-900">Invoices &amp; payment history</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Payments</th><th className="px-4 py-3">Document</th></tr></thead>
            <tbody>
              {invoices.length ? invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 font-medium text-slate-900">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3">{invoice.description || "Subscription charges"}</td>
                  <td className="px-4 py-3">{money(invoice.total, invoice.currency)}</td>
                  <td className="px-4 py-3">{invoice.status}</td>
                  <td className="px-4 py-3">
                    {invoice.payments.length
                      ? invoice.payments.map((payment, index) => (
                        <div key={`${invoice.id}-${index}`} className="mb-1">
                          {payment.status} · {money(payment.amount, payment.currency)} · {payment.provider || "Provider not recorded"}
                        </div>
                      ))
                      : "No payment recorded"}
                  </td>
                  <td className="px-4 py-3">
                    <a className="font-medium text-blue-700 underline" href={`/admin/subscriptions/invoices/${invoice.id}`}>View / print / save as PDF</a>
                  </td>
                </tr>
              )) : <tr><td className="px-4 py-4 text-slate-600" colSpan={6}>No invoices have been issued.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {transactions && transactionPagination && (
        <section aria-labelledby="transaction-history" className="space-y-3">
          <div>
            <h2 id="transaction-history" className="text-lg font-semibold text-slate-900">Payment transactions</h2>
            <p className="text-sm text-slate-600">Transaction status is updated only by the existing server-side payment verification and signed webhook flow.</p>
          </div>
          <form action="/subscriptions" className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Search reference or invoice
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" name="q" defaultValue={transactionPagination.search} />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Payment status
              <select className="rounded border border-slate-300 px-3 py-2 text-sm" name="paystatus" defaultValue={transactionPagination.status}>
                <option value="all">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="SUCCEEDED">Succeeded</option>
                <option value="FAILED">Failed</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              From
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" type="date" name="from" defaultValue={transactionPagination.from} />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              To
              <input className="rounded border border-slate-300 px-3 py-2 text-sm" type="date" name="to" defaultValue={transactionPagination.to} />
            </label>
            <button className="rounded-md bg-[#123B5A] px-4 py-2 text-sm font-semibold text-white" type="submit">Filter</button>
          </form>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Invoice / plan</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Order / payment reference</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length ? transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">{transaction.invoiceNumber}<small className="block text-slate-500">{transaction.planName}</small></td>
                    <td className="px-4 py-3">{money(transaction.amount, transaction.currency)}</td>
                    <td className="px-4 py-3">{transaction.provider ?? "Not recorded"}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{transaction.status}</span>
                      {transaction.failureReason && <small className="mt-1 block max-w-56 text-red-700">{transaction.failureReason}</small>}
                    </td>
                    <td className="px-4 py-3">
                      <small className="block">Order: {transaction.providerOrderId ?? "—"}</small>
                      <small className="block">Payment: {transaction.providerReference ?? "—"}</small>
                    </td>
                    <td className="px-4 py-3">{new Date(transaction.paidAt ?? transaction.createdAt).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3"><Link className="font-medium text-blue-700 underline" href={`/admin/subscriptions/invoices/${transaction.invoiceId}`}>View invoice</Link></td>
                  </tr>
                )) : <tr><td className="px-4 py-4 text-slate-600" colSpan={7}>No payment transactions match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
            <span>{transactionPagination.total} payments · page {transactionPagination.page} of {transactionPagination.pageCount}</span>
            <div className="flex gap-2">
              {transactionPagination.page > 1 && <Link className="rounded border border-slate-300 px-3 py-1.5" href={transactionPageHref(transactionPagination.page - 1)}>Previous</Link>}
              {transactionPagination.page < transactionPagination.pageCount && <Link className="rounded border border-slate-300 px-3 py-1.5" href={transactionPageHref(transactionPagination.page + 1)}>Next</Link>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
