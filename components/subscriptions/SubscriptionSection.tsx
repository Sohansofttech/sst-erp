"use client";

import { useEffect, useId, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  GraduationCap,
  LockKeyhole,
  Pencil,
  Plus,
  PackageOpen,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  SAMPLE_ACTIVITY,
  SAMPLE_INSTITUTIONS,
  SAMPLE_INSTITUTION_ADMIN,
  SAMPLE_MONTHS,
  SAMPLE_PLANS,
  SAMPLE_RENEWALS,
  SAMPLE_TRANSACTIONS,
  type SampleInstitutionSubscription,
  type SamplePlan,
  type SampleTransaction,
} from "@/lib/subscriptions/ui-sample-data";
import type {
  PortalInstitutionListData,
  PortalInstitutionRecord,
  PortalOverviewData,
  PortalPaymentListData,
  PortalTransaction,
} from "@/lib/subscriptions/portal-data";
import { useSubscriptionPortalRole } from "@/components/subscriptions/SubscriptionPortalShell";

export type SubscriptionSectionKey =
  | "overview"
  | "plans"
  | "institutions"
  | "payments"
  | "invoices"
  | "renewals"
  | "reports"
  | "settings";

const cycleOptions = ["Monthly", "Quarterly", "Yearly"] as const;
const pageSize = 5;

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="sc-page-heading">
      <div>
        <div className="sc-eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function CardHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="sc-card-heading">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function SampleTag() {
  return <span className="sc-sample-tag">Sample</span>;
}

function StatusBadge({ status }: { status: string }) {
  const className = status.toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");
  return <span className={`sc-status sc-status-${className}`}>{displayStatus(status)}</span>;
}

function EmptyState({
  icon = FileText,
  title,
  message,
}: {
  icon?: LucideIcon;
  title: string;
  message: string;
}) {
  const Icon = icon;
  return (
    <div className="sc-empty-state">
      <Icon aria-hidden="true" size={27} strokeWidth={1.6} />
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="sc-modal-backdrop" onMouseDown={onClose}>
      <section
        aria-label={title}
        aria-modal="true"
        className="sc-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="sc-modal-header">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button aria-label="Close dialog" className="sc-modal-close" onClick={onClose} type="button">
            <X size={17} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "orange",
}: {
  label: string;
  value: string;
  note?: string;
  icon: LucideIcon;
  tone?: "orange" | "green" | "blue" | "violet";
}) {
  return (
    <article className="sc-stat-card">
      <div className="sc-stat-top">
        <span className="sc-stat-label">{label}</span>
        <span className={`sc-stat-icon sc-stat-icon-${tone}`}><Icon size={16} /></span>
      </div>
      <div>
        <strong className="sc-stat-value">{value}</strong>
        <span className="sc-stat-sub">{note ?? "illustrative sample"}</span>
      </div>
    </article>
  );
}

function LineChart() {
  const fillId = `sc-area-fill-${useId().replaceAll(":", "")}`;
  const points = SAMPLE_MONTHS.map((item, index) => {
    const x = 25 + index * 46;
    const y = 145 - item.revenue * 1.15;
    return `${x},${y}`;
  });
  const line = points.join(" ");
  const area = `M ${points[0]} L ${points.slice(1).join(" L ")} L 255,158 L 25,158 Z`;

  return (
    <svg aria-label="Illustrative monthly revenue trend, sample data only" className="sc-chart" role="img" viewBox="0 0 280 184">
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ed9b47" stopOpacity=".25" />
          <stop offset="100%" stopColor="#ed9b47" stopOpacity=".01" />
        </linearGradient>
      </defs>
      {[36, 76, 116, 156].map((y) => <line className="sc-chart-gridline" key={y} x1="22" x2="260" y1={y} y2={y} />)}
      <path className="sc-chart-area" d={area} fill={`url(#${fillId})`} />
      <polyline className="sc-chart-line" points={line} />
      {SAMPLE_MONTHS.map((item, index) => (
        <g key={item.label}>
          <circle className="sc-chart-point" cx={25 + index * 46} cy={145 - item.revenue * 1.15} r="3.5" />
          <text className="sc-chart-label" textAnchor="middle" x={25 + index * 46} y="177">{item.label}</text>
        </g>
      ))}
    </svg>
  );
}

function BarChart({ data = SAMPLE_MONTHS }: { data?: typeof SAMPLE_MONTHS }) {
  const max = Math.max(...data.map((item) => item.subscriptions));
  return (
    <div aria-label="Illustrative subscription growth chart, sample data only" className="sc-bar-chart" role="img">
      {data.map((item) => (
        <div className="sc-bar-column" key={item.label}>
          <span className="sc-bar" style={{ height: `${Math.max(14, (item.subscriptions / max) * 128)}px` }} />
          <span className="sc-bar-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return `${currency} ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)}`;
  }
}

function dateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function restrictedNotice(title: string, detail: string) {
  return (
    <div className="sc-card">
      <EmptyState icon={LockKeyhole} title={title} message={detail} />
    </div>
  );
}

function displayStatus(status: string) {
  if (status === "NO_SUBSCRIPTION") return "No subscription assigned";
  if (status === "NO_PAYMENT_RECORD") return "No payment record";
  return status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayDate(value: string | null) {
  return value ? dateLabel(value) : "—";
}

function RefreshDataButton() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  return (
    <button
      className="sc-button"
      disabled={refreshing}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      <RefreshCw aria-hidden="true" size={14} />
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
  );
}

function DataErrorNotice({ message }: { message: string }) {
  return <p className="sc-data-notice sc-data-error" role="alert">{message}</p>;
}

function LiveTransactionTable({
  rows,
  compact = false,
  onSelect,
}: {
  rows: PortalTransaction[];
  compact?: boolean;
  onSelect?: (transaction: PortalTransaction) => void;
}) {
  return (
    <div className="sc-table-wrap">
      <table className="sc-table">
        <thead>
          <tr><th>Transaction reference</th><th>Institution</th><th>Plan</th><th>Amount</th><th>Status</th>{!compact && <><th>Payment date</th><th>Provider</th><th>Razorpay order ID</th><th>Razorpay payment ID</th></>}{onSelect && <th>Details</th>}</tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cells: ReactNode[] = [
              <td key="reference"><strong>{row.reference}</strong></td>,
              <td key="institution">{row.institution}</td>,
              <td key="plan">{row.plan}</td>,
              <td key="amount">{formatMoney(row.amount, row.currency)}</td>,
              <td key="status"><StatusBadge status={row.status} /></td>,
            ];
            if (!compact) {
              cells.push(
                <td key="date">{displayDate(row.date)}</td>,
                <td key="provider">{row.provider}</td>,
                <td key="order">{row.orderIdAvailable ? row.orderId ?? "Not recorded" : "Unavailable in current schema"}</td>,
                <td key="payment">{row.paymentId ?? "Not recorded"}</td>,
              );
            }
            if (onSelect) {
              cells.push(
                <td key="details">
                  <button
                    aria-label={`View transaction ${row.reference}`}
                    className="sc-button sc-button-quiet"
                    onClick={() => onSelect(row)}
                    type="button"
                  >
                    <Eye size={14} /> View
                  </button>
                </td>,
              );
            }
            return <tr key={row.id}>{cells}</tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

function LiveTransactionDetails({ transaction, onClose }: { transaction: PortalTransaction; onClose: () => void }) {
  return (
    <Modal title="Transaction details" subtitle="Payment data from the existing ERP records." onClose={onClose}>
      <div className="sc-modal-body">
        <dl className="sc-detail-grid">
          <div><dt>Transaction reference</dt><dd>{transaction.reference}</dd></div>
          <div><dt>Institution</dt><dd>{transaction.institution}</dd></div>
          <div><dt>Plan</dt><dd>{transaction.plan}</dd></div>
          <div><dt>Amount</dt><dd>{formatMoney(transaction.amount, transaction.currency)}</dd></div>
          <div><dt>Status</dt><dd><StatusBadge status={transaction.status} /></dd></div>
          <div><dt>Payment date</dt><dd>{displayDate(transaction.date)}</dd></div>
          <div><dt>Payment provider</dt><dd>{transaction.provider}</dd></div>
          <div><dt>Razorpay order ID</dt><dd>{transaction.orderIdAvailable ? transaction.orderId ?? "Not recorded" : "Unavailable in current schema"}</dd></div>
          <div><dt>Razorpay payment ID</dt><dd>{transaction.paymentId ?? "Not recorded"}</dd></div>
        </dl>
      </div>
      <footer className="sc-modal-footer"><button className="sc-button sc-button-primary" onClick={onClose} type="button">Close</button></footer>
    </Modal>
  );
}

function LiveInstitutionDetails({ institution, onClose }: { institution: PortalInstitutionRecord; onClose: () => void }) {
  const studentLimit = institution.subscriptionStatus === "NO_SUBSCRIPTION"
    ? "—"
    : institution.studentLimitAvailable
      ? institution.studentLimit === null ? "Unlimited" : institution.studentLimit.toLocaleString("en-IN")
      : "Unavailable in current schema";
  const remaining = institution.subscriptionStatus === "NO_SUBSCRIPTION"
    ? "—"
    : !institution.studentLimitAvailable || institution.students === null
      ? "Unavailable"
      : institution.studentLimit === null
        ? "Unlimited"
        : (institution.remainingCapacity ?? 0).toLocaleString("en-IN");
  const usage = institution.studentLimit && institution.students !== null
    ? Math.min(100, Math.round((institution.students / institution.studentLimit) * 100))
    : null;

  return (
    <Modal title={institution.institution} subtitle={`Institution code: ${institution.code}`} onClose={onClose}>
      <div className="sc-modal-body">
        {usage !== null && <div aria-label={`Student usage ${usage}%`} className="sc-progress-track" role="progressbar" aria-valuenow={usage} aria-valuemin={0} aria-valuemax={100}><div className="sc-progress-fill" style={{ width: `${usage}%` }} /></div>}
        <dl className="sc-detail-grid">
          <div><dt>Institution administrator</dt><dd>{institution.administrator}</dd></div>
          <div><dt>Assigned plan</dt><dd>{institution.plan}</dd></div>
          <div><dt>Student Limit</dt><dd>{studentLimit}</dd></div>
          <div><dt>Registered students</dt><dd>{institution.students?.toLocaleString("en-IN") ?? "Unavailable"}</dd></div>
          <div><dt>Remaining capacity</dt><dd>{remaining}</dd></div>
          <div><dt>Subscription status</dt><dd><StatusBadge status={institution.subscriptionStatus} /></dd></div>
          <div><dt>Payment status</dt><dd><StatusBadge status={institution.paymentStatus} /></dd></div>
          <div><dt>Start date</dt><dd>{displayDate(institution.startsAt)}</dd></div>
          <div><dt>Expiry date</dt><dd>{displayDate(institution.expiresAt)}</dd></div>
          {institution.archived && <div><dt>Institution record</dt><dd>Archived</dd></div>}
        </dl>
      </div>
      <footer className="sc-modal-footer"><button className="sc-button sc-button-primary" onClick={onClose} type="button">Close details</button></footer>
    </Modal>
  );
}

function LiveOverviewSection({
  isInstitutionAdmin,
  data,
}: {
  isInstitutionAdmin: boolean;
  data: PortalOverviewData;
}) {
  const [selectedTransaction, setSelectedTransaction] = useState<PortalTransaction | null>(null);
  const currencies = Array.from(new Set(data.monthlyRevenue.flatMap((month) => month.values.map((value) => value.currency))));
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const chartCurrency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0];
  const monthlyRevenue = data.monthlyRevenue.map((month) => ({
    label: month.label,
    value: month.values.find((item) => item.currency === chartCurrency)?.amount ?? 0,
  }));
  const hasRevenue = data.revenueByCurrency.length > 0;

  if (isInstitutionAdmin) {
    const institution = data.institution;
    if (!institution && data.errors.length > 0) {
      return <div className="sc-page"><DataErrorNotice message={data.errors.join(" ")} /></div>;
    }
    if (!institution) {
      return <div className="sc-page"><PageHeading eyebrow="Institution workspace" title="My subscription" description="Your institution’s subscription and student capacity." action={<RefreshDataButton />} /><section className="sc-card"><EmptyState icon={Building2} title="Institution record unavailable" message="No institution is linked to this verified administrator account." /></section></div>;
    }
    const capacity = institution.subscriptionStatus === "NO_SUBSCRIPTION"
      ? "—"
      : !institution.studentLimitAvailable
        ? "Unavailable"
        : institution.studentLimit === null
          ? "Unlimited"
          : (institution.remainingCapacity ?? 0).toLocaleString("en-IN");
    const studentLimit = institution.subscriptionStatus === "NO_SUBSCRIPTION"
      ? "—"
      : institution.studentLimitAvailable
        ? institution.studentLimit === null ? "Unlimited" : institution.studentLimit.toLocaleString("en-IN")
        : "Unavailable";
    return (
      <div className="sc-page">
        <PageHeading eyebrow="Institution workspace" title="My subscription" description="Subscription and student usage for your institution only." action={<RefreshDataButton />} />
        {data.errors.length > 0 && <DataErrorNotice message={data.errors.join(" ")} />}
        <div className="sc-stat-grid">
          <StatCard icon={PackageOpen} label="Current plan" value={institution.plan} note="Existing subscription record" />
          <StatCard icon={BadgeCheck} label="Subscription status" value={displayStatus(institution.subscriptionStatus)} note="Existing subscription record" tone="green" />
          <StatCard icon={GraduationCap} label="Registered students" value={institution.students?.toLocaleString("en-IN") ?? "Unavailable"} note="Institution-specific student records" tone="blue" />
          <StatCard icon={Users} label="Student Limit" value={studentLimit} note={institution.studentLimitAvailable ? "From assigned plan" : "Unavailable in current schema"} tone="violet" />
        </div>
        <div className="sc-two-column">
          <section className="sc-card">
            <CardHeading title="Student capacity" subtitle="Calculated from your institution’s registered students and assigned plan." />
            <div className="sc-capacity-number">{institution.students?.toLocaleString("en-IN") ?? "Unavailable"} <span>/ {studentLimit}</span></div>
            <p className="sc-capacity-note">{capacity} remaining · Expiry {displayDate(institution.expiresAt)}</p>
            {institution.studentLimit !== null && institution.students !== null && <div aria-label={`Student usage ${Math.min(100, Math.round(institution.students / institution.studentLimit * 100))}%`} className="sc-progress-track" role="progressbar" aria-valuenow={Math.min(100, Math.round(institution.students / institution.studentLimit * 100))} aria-valuemin={0} aria-valuemax={100}><div className="sc-progress-fill" style={{ width: `${Math.min(100, Math.round(institution.students / institution.studentLimit * 100))}%` }} /></div>}
            <div className="sc-plan-actions"><Link className="sc-button sc-button-primary" href="/subscriptions/plans">View available plans</Link><Link className="sc-button" href="/subscriptions/renewals">Renewal options</Link></div>
          </section>
          <section className="sc-card">
            <CardHeading title="Plan overview" subtitle="Current plan assignment from the ERP database." />
            <dl className="sc-detail-grid">
              <div><dt>Institution</dt><dd>{institution.institution}</dd></div>
              <div><dt>Administrator</dt><dd>{institution.administrator}</dd></div>
              <div><dt>Plan</dt><dd>{institution.plan}</dd></div>
              <div><dt>Status</dt><dd><StatusBadge status={institution.subscriptionStatus} /></dd></div>
              <div><dt>Start date</dt><dd>{displayDate(institution.startsAt)}</dd></div>
              <div><dt>Expiry date</dt><dd>{displayDate(institution.expiresAt)}</dd></div>
            </dl>
          </section>
        </div>
        <section className="sc-card">
          <CardHeading title="Recent payment history" subtitle="Only payments belonging to your institution are displayed." action={<Link className="sc-button sc-button-quiet" href="/subscriptions/payments">View all <ArrowUpRight size={14} /></Link>} />
          {data.recentTransactions.length
            ? <LiveTransactionTable compact onSelect={setSelectedTransaction} rows={data.recentTransactions} />
            : <EmptyState icon={CreditCard} title="No payment records" message={data.errors.length ? "Payment history could not be loaded." : "No existing payment records are associated with this institution."} />}
        </section>
        <section className="sc-card">
          <CardHeading title="Invoices & receipts" subtitle="Invoice records are not connected in this view." />
          <EmptyState icon={FileText} title="Invoice details are not loaded" message="No invoice or receipt records are shown here." />
        </section>
        {selectedTransaction && <LiveTransactionDetails onClose={() => setSelectedTransaction(null)} transaction={selectedTransaction} />}
      </div>
    );
  }

  const stats = [
    { label: "Total institutions", value: data.institutionCount?.toLocaleString("en-IN") ?? "Unavailable", icon: Building2, tone: "blue" as const },
    { label: "Active subscriptions", value: data.activeSubscriptions?.toLocaleString("en-IN") ?? "Unavailable", icon: BadgeCheck, tone: "green" as const },
    { label: "Pending subscriptions", value: data.pendingSubscriptions?.toLocaleString("en-IN") ?? "Unavailable", icon: Clock3, tone: "orange" as const },
    { label: "Expired subscriptions", value: data.expiredSubscriptions?.toLocaleString("en-IN") ?? "Unavailable", icon: Activity, tone: "violet" as const },
    { label: "Successful payments", value: data.successfulPayments?.toLocaleString("en-IN") ?? "Unavailable", icon: Check, tone: "green" as const },
    { label: "Pending payments", value: data.pendingPayments?.toLocaleString("en-IN") ?? "Unavailable", icon: Clock3, tone: "orange" as const },
    { label: "Failed payments", value: data.failedPayments?.toLocaleString("en-IN") ?? "Unavailable", icon: X, tone: "violet" as const },
    { label: "Upcoming renewals", value: data.activeSubscriptions === null ? "Unavailable" : data.upcomingRenewals.length.toLocaleString("en-IN"), icon: CalendarDays, tone: "violet" as const },
    { label: "Verified revenue", value: !data.revenueAvailable ? "Unavailable" : data.revenueByCurrency.length ? data.revenueByCurrency.map((item) => formatMoney(item.amount, item.currency)).join(" · ") : "0", icon: CircleDollarSign, tone: "blue" as const },
  ];

  return (
    <div className="sc-page">
      <PageHeading eyebrow="Platform billing" title="Subscription overview" description="Live subscription, institution and verified payment records from the ERP database." action={<RefreshDataButton />} />
      {data.errors.length > 0 && <DataErrorNotice message={data.errors.join(" ")} />}
      <div className="sc-stat-grid">{stats.map((stat) => <StatCard key={stat.label} {...stat} note={stat.label === "Verified revenue" ? "SUCCEEDED payments only" : "Existing ERP records"} />)}</div>
      <div className="sc-dashboard-grid">
        <section className="sc-card">
          <CardHeading title="Subscription growth" subtitle="Subscriptions created per month · last six months." />
          {data.subscriptionGrowth.some((item) => item.value > 0)
            ? <LiveBarChart data={data.subscriptionGrowth} />
            : <EmptyState icon={Activity} title="No subscription activity" message="No subscription records were created in this period." />}
        </section>
        <section className="sc-card">
          <CardHeading title="Verified revenue overview" subtitle={chartCurrency ? `Successful payment amounts · ${chartCurrency} · last six months.` : "No verified payment dates are available for this period."} />
          {hasRevenue && chartCurrency
            ? <>
                {currencies.length > 1 && <label className="sc-form-field">Currency<select aria-label="Revenue chart currency" className="sc-select" onChange={(event) => setSelectedCurrency(event.target.value)} value={chartCurrency}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>}
                {monthlyRevenue.some((item) => item.value > 0) ? <LiveRevenueChart data={monthlyRevenue} /> : <EmptyState icon={CircleDollarSign} title="No recent verified revenue" message="No successful payments were recorded in the last six months." />}
                {currencies.length > 1 && <p className="sc-inline-note">The verified revenue summary above includes every currency; this chart shows the selected currency only.</p>}
              </>
            : <EmptyState icon={CircleDollarSign} title={hasRevenue ? "No recent verified revenue" : "No verified revenue records"} message={!data.revenueAvailable ? "Payment data could not be loaded." : hasRevenue ? "Verified payments exist, but none have a recorded paid date in the chart period." : "No successful payments are available to report."} />}
        </section>
      </div>
      <div className="sc-dashboard-grid">
        <section className="sc-card">
          <CardHeading title="Recent transactions" subtitle="Existing payment records, including non-successful statuses." action={<Link className="sc-button sc-button-quiet" href="/subscriptions/payments">View all <ArrowUpRight size={14} /></Link>} />
          {data.recentTransactions.length
            ? <LiveTransactionTable compact rows={data.recentTransactions} />
            : <EmptyState icon={CreditCard} title="No transaction records" message={data.errors.length ? "Transaction data could not be loaded." : "No payment records are available."} />}
        </section>
        <section className="sc-card">
          <CardHeading title="Recent subscription activity" subtitle="Recent subscription records from the platform." />
          {data.recentActivity.length
            ? <div>{data.recentActivity.map((item) => <div className="sc-activity-row" key={item.id}><span className="sc-activity-marker" /><span className="sc-list-main"><strong>{item.institution} · {item.plan}</strong><small>{displayStatus(item.status)}</small></span><span className="sc-list-meta">{displayDate(item.date)}</span></div>)}</div>
            : <EmptyState icon={Activity} title="No recent activity" message="No subscription records are available." />}
        </section>
      </div>
      <div className="sc-two-column">
        <section className="sc-card">
          <CardHeading title="Upcoming renewals" subtitle="Active subscriptions expiring or renewing within 30 days." action={<Link className="sc-button sc-button-quiet" href="/subscriptions/renewals">Review <ArrowUpRight size={14} /></Link>} />
          {data.upcomingRenewals.length
            ? <ul className="sc-list">{data.upcomingRenewals.map((item, index) => <li className="sc-list-item" key={`${item.institution}-${item.date}-${index}`}><span className="sc-list-main"><strong>{item.institution}</strong><small>{item.plan} · {displayStatus(item.status)}</small></span><span className="sc-list-meta">{displayDate(item.date)}</span></li>)}</ul>
            : <EmptyState icon={CalendarDays} title="No upcoming renewals" message="No active subscriptions are scheduled to renew within 30 days." />}
        </section>
        <section className="sc-card">
          <CardHeading title="Expiring subscriptions" subtitle="Current subscriptions with an expiry within 30 days." />
          {data.expiringSubscriptions.length
            ? <ul className="sc-list">{data.expiringSubscriptions.map((item, index) => <li className="sc-list-item" key={`${item.institution}-${item.date}-${index}`}><span className="sc-list-main"><strong>{item.institution}</strong><small>{item.plan} · {displayDate(item.date)}</small></span><StatusBadge status={item.status} /></li>)}</ul>
            : <EmptyState icon={CalendarDays} title="No expiring subscriptions" message="No active subscriptions are expiring within 30 days." />}
        </section>
      </div>
      {selectedTransaction && <LiveTransactionDetails onClose={() => setSelectedTransaction(null)} transaction={selectedTransaction} />}
    </div>
  );
}

function LiveBarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const maximum = Math.max(1, ...data.map((item) => item.value));
  return (
    <div aria-label="Subscription records created per month" className="sc-bar-chart" role="img">
      {data.map((item) => <div className="sc-bar-column" key={item.label}><span className="sc-bar" style={{ height: `${Math.max(4, item.value / maximum * 128)}px` }} /><span className="sc-bar-label">{item.label} · {item.value}</span></div>)}
    </div>
  );
}

function LiveRevenueChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const maximum = Math.max(1, ...data.map((item) => item.value));
  const points = data.map((item, index) => `${25 + index * 46},${145 - item.value / maximum * 110}`);
  const line = points.join(" ");
  const area = `M ${points[0]} L ${points.slice(1).join(" L ")} L 255,158 L 25,158 Z`;
  const fillId = `sc-live-revenue-${useId().replaceAll(":", "")}`;
  return (
    <svg aria-label="Verified monthly revenue trend" className="sc-chart" role="img" viewBox="0 0 280 184">
      <defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ed9b47" stopOpacity=".25" /><stop offset="100%" stopColor="#ed9b47" stopOpacity=".01" /></linearGradient></defs>
      {[36, 76, 116, 156].map((y) => <line className="sc-chart-gridline" key={y} x1="22" x2="260" y1={y} y2={y} />)}
      <path className="sc-chart-area" d={area} fill={`url(#${fillId})`} />
      <polyline className="sc-chart-line" points={line} />
      {data.map((item, index) => <g key={item.label}><circle className="sc-chart-point" cx={25 + index * 46} cy={145 - item.value / maximum * 110} r="3.5" /><text className="sc-chart-label" textAnchor="middle" x={25 + index * 46} y="177">{item.label}</text></g>)}
    </svg>
  );
}

function LiveInstitutionsSection({
  isInstitutionAdmin,
  data,
}: {
  isInstitutionAdmin: boolean;
  data: PortalInstitutionListData;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("institution");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PortalInstitutionRecord | null>(null);
  const filtered = useMemo(() => {
    const rows = data.records.filter((item) => {
      const textMatches = `${item.institution} ${item.code} ${item.administrator} ${item.plan}`.toLowerCase().includes(search.toLowerCase());
      const normalizedStatus = item.archived ? "archived" : item.subscriptionStatus.toLowerCase();
      return textMatches && (status === "all" || normalizedStatus === status.toLowerCase());
    });
    return rows.sort((a, b) => {
      if (sort === "usage") {
        const usageA = a.studentLimit && a.students !== null ? a.students / a.studentLimit : -1;
        const usageB = b.studentLimit && b.students !== null ? b.students / b.studentLimit : -1;
        return usageB - usageA;
      }
      return a.institution.localeCompare(b.institution);
    });
  }, [data.records, search, sort, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const activeCount = data.records.filter((item) => item.subscriptionStatus === "ACTIVE").length;
  const noSubscriptionCount = data.records.filter((item) => item.subscriptionStatus === "NO_SUBSCRIPTION").length;

  return (
    <div className="sc-page">
      <PageHeading
        eyebrow={isInstitutionAdmin ? "Institution workspace" : "Platform portfolio"}
        title={isInstitutionAdmin ? "Student usage & subscription" : "Institution subscriptions"}
        description={isInstitutionAdmin ? "Subscription and student capacity for your institution only." : "Institution records and subscription assignments from the ERP database."}
        action={<RefreshDataButton />}
      />
      {data.error && <DataErrorNotice message={data.error} />}
      {data.warnings.length > 0 && <DataErrorNotice message={`${data.warnings.join(" ")} Some fields are marked unavailable rather than estimated.`} />}
      {!data.studentLimitAvailable && data.records.length > 0 && <p className="sc-data-notice">Student Limit is unavailable in the current database schema. No capacity values are estimated.</p>}
      <div className="sc-stat-grid">
        <StatCard icon={Building2} label={isInstitutionAdmin ? "My institution" : "Institutions"} value={data.error ? "Unavailable" : data.records.length.toLocaleString("en-IN")} note="Institution records" tone="blue" />
        <StatCard icon={BadgeCheck} label="Active subscriptions" value={data.subscriptionDataAvailable ? activeCount.toLocaleString("en-IN") : "Unavailable"} note="Existing subscription records" tone="green" />
        <StatCard icon={PackageOpen} label="Without subscription" value={data.subscriptionDataAvailable ? noSubscriptionCount.toLocaleString("en-IN") : "Unavailable"} note="Institutions remain listed" tone="violet" />
        <StatCard icon={GraduationCap} label="Student counts" value={data.studentCountsAvailable ? "Available" : "Unavailable"} note="Counted by institution ID" tone="orange" />
      </div>
      <section className="sc-card">
        <CardHeading title={isInstitutionAdmin ? "My institution record" : "Institution register"} subtitle="No institution is omitted for having no subscription." />
        <div className="sc-toolbar">
          <label className="sc-search"><Search aria-hidden="true" size={15} /><input className="sc-input" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search institution, code, administrator or plan..." value={search} /></label>
          <select aria-label="Filter by subscription status" className="sc-select" onChange={(event) => { setStatus(event.target.value); setPage(1); }} value={status}>
            <option value="all">All statuses</option><option value="ACTIVE">Active</option><option value="PAST_DUE">Past due</option><option value="EXPIRED">Expired</option><option value="NO_SUBSCRIPTION">No subscription</option><option value="archived">Archived</option>
          </select>
          <select aria-label="Sort institutions" className="sc-select" onChange={(event) => setSort(event.target.value)} value={sort}>
            <option value="institution">Sort: institution</option><option value="usage">Sort: highest usage</option>
          </select>
        </div>
        {pageRows.length ? (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead><tr><th>Institution</th><th>Administrator</th><th>Plan</th><th>Student Limit</th><th>Registered</th><th>Remaining</th><th>Start date</th><th>Expiry date</th><th>Status</th><th>Payment</th><th>Details</th></tr></thead>
              <tbody>{pageRows.map((item) => {
                const limit = item.subscriptionStatus === "NO_SUBSCRIPTION"
                  ? "—"
                  : item.studentLimitAvailable
                    ? item.studentLimit === null ? "Unlimited" : item.studentLimit.toLocaleString("en-IN")
                    : "Unavailable";
                const remaining = item.subscriptionStatus === "NO_SUBSCRIPTION"
                  ? "—"
                  : !item.studentLimitAvailable || item.students === null
                    ? "Unavailable"
                    : item.studentLimit === null
                      ? "Unlimited"
                      : (item.remainingCapacity ?? 0).toLocaleString("en-IN");
                return <tr key={item.id}>{[
                  <td key="institution"><strong>{item.institution}</strong><small>{item.code}{item.archived ? " · archived" : ""}</small></td>,
                  <td key="administrator">{item.administrator}</td>,
                  <td key="plan">{item.plan}</td>,
                  <td key="limit">{limit}</td>,
                  <td key="students">{item.students?.toLocaleString("en-IN") ?? "Unavailable"}</td>,
                  <td key="remaining">{remaining}</td>,
                  <td key="starts">{displayDate(item.startsAt)}</td>,
                  <td key="expires">{displayDate(item.expiresAt)}</td>,
                  <td key="status"><StatusBadge status={item.subscriptionStatus} /></td>,
                  <td key="payment"><StatusBadge status={item.paymentStatus} /></td>,
                  <td key="details"><button aria-label={`View ${item.institution} details`} className="sc-button sc-button-quiet" onClick={() => setSelected(item)} type="button"><Eye size={14} /> View</button></td>,
                ]}</tr>;
              })}</tbody>
            </table>
          </div>
        ) : !data.error ? (
          <EmptyState icon={Building2} title={data.records.length ? "No institutions match" : "No institutions found"} message={data.records.length ? "Adjust the search or status filter." : "No institution records are available."} />
        ) : null}
        <div className="sc-page-footer">
          <span>{filtered.length} records · Page {page} of {pageCount}</span>
          <div><button className="sc-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button> <button className="sc-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div>
        </div>
      </section>
      {selected && <LiveInstitutionDetails institution={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function LivePaymentsSection({
  isInstitutionAdmin,
  data,
}: {
  isInstitutionAdmin: boolean;
  data: PortalPaymentListData;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PortalTransaction | null>(null);
  const filtered = data.records.filter((item) => {
    const matchesText = `${item.reference} ${item.institution} ${item.plan} ${item.orderId ?? ""} ${item.paymentId ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = status === "all" || item.status.toLowerCase() === status;
    return matchesText && matchesStatus && (!from || Boolean(item.date && item.date >= from)) && (!to || Boolean(item.date && item.date <= to));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const count = (value: string) => data.error ? "Unavailable" : data.records.filter((item) => item.status === value).length.toLocaleString("en-IN");

  return (
    <div className="sc-page">
      <PageHeading eyebrow="Billing operations" title={isInstitutionAdmin ? "Payment history" : "Payments & transactions"} description={isInstitutionAdmin ? "Existing payment records belonging to your institution only." : "Existing payment records from the ERP database; no payments are initiated here."} action={<RefreshDataButton />} />
      {data.error && <DataErrorNotice message={data.error} />}
      {!data.orderIdAvailable && !data.error && <p className="sc-data-notice">Razorpay order IDs are unavailable in the current database schema. Other stored payment fields remain available.</p>}
      <div className="sc-stat-grid">
        <StatCard icon={CreditCard} label="Total payments" value={data.error ? "Unavailable" : data.records.length.toLocaleString("en-IN")} note="Existing payment records" tone="blue" />
        <StatCard icon={Check} label="Successful" value={count("SUCCEEDED")} note="Payment status SUCCEEDED" tone="green" />
        <StatCard icon={Clock3} label="Pending" value={count("PENDING")} note="Existing payment records" />
        <StatCard icon={X} label="Failed" value={count("FAILED")} note="Existing payment records" tone="violet" />
      </div>
      <section className="sc-card">
        <CardHeading title="Transaction register" subtitle="Transaction values and statuses are read from existing payment records." />
        <div className="sc-toolbar">
          <label className="sc-search"><Search aria-hidden="true" size={15} /><input className="sc-input" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search transactions..." value={search} /></label>
          <select aria-label="Filter payments by status" className="sc-select" onChange={(event) => { setStatus(event.target.value); setPage(1); }} value={status}>
            <option value="all">All statuses</option><option value="succeeded">Successful</option><option value="pending">Pending</option><option value="failed">Failed</option>
          </select>
          <label className="sc-form-field">From<input aria-label="Payment date from" className="sc-input" onChange={(event) => { setFrom(event.target.value); setPage(1); }} type="date" value={from} /></label>
          <label className="sc-form-field">To<input aria-label="Payment date to" className="sc-input" onChange={(event) => { setTo(event.target.value); setPage(1); }} type="date" value={to} /></label>
        </div>
        {pageRows.length
          ? <LiveTransactionTable onSelect={setSelected} rows={pageRows} />
          : !data.error && <EmptyState icon={CreditCard} title={data.records.length ? "No payments match" : "No payment records"} message={data.records.length ? "Adjust the search, date range or status filter." : "No existing payment records are available."} />}
        {data.records.length > 0 && <div className="sc-page-footer"><span>{filtered.length} records · Page {page} of {pageCount}</span><div><button className="sc-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button> <button className="sc-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div></div>}
      </section>
      {selected && <LiveTransactionDetails onClose={() => setSelected(null)} transaction={selected} />}
    </div>
  );
}

function OverviewSection({ isInstitutionAdmin }: { isInstitutionAdmin: boolean }) {
  const [selectedTransaction, setSelectedTransaction] = useState<SampleTransaction | null>(null);
  if (isInstitutionAdmin) {
    const usage = Math.min(100, Math.round(
      (SAMPLE_INSTITUTION_ADMIN.registeredStudents / SAMPLE_INSTITUTION_ADMIN.studentLimit) * 100,
    ));
    const remaining = SAMPLE_INSTITUTION_ADMIN.studentLimit - SAMPLE_INSTITUTION_ADMIN.registeredStudents;
    return (
      <div className="sc-page">
        <PageHeading
          eyebrow="Institution workspace"
          title="My subscription"
          description="A preview of your institution plan, student capacity and renewal details."
        />
        <div className="sc-stat-grid">
          <StatCard icon={PackageOpen} label="Current plan" value="Standard" note="sample plan" />
          <StatCard icon={GraduationCap} label="Registered students" value={SAMPLE_INSTITUTION_ADMIN.registeredStudents.toLocaleString("en-IN")} note="illustrative sample" tone="blue" />
          <StatCard icon={Users} label="Student limit" value={SAMPLE_INSTITUTION_ADMIN.studentLimit.toLocaleString("en-IN")} note="illustrative sample" tone="violet" />
          <StatCard icon={CalendarDays} label="Remaining capacity" value={remaining.toLocaleString("en-IN")} note="illustrative sample" tone="green" />
        </div>
        <section className="sc-card sc-capacity-card">
          <div>
            <CardHeading title="Student capacity" subtitle="Sample usage for interface preview only." />
            <div className="sc-capacity-number">{SAMPLE_INSTITUTION_ADMIN.registeredStudents.toLocaleString("en-IN")} <span>/ {SAMPLE_INSTITUTION_ADMIN.studentLimit.toLocaleString("en-IN")}</span></div>
            <p className="sc-capacity-note">Plan renewal: {SAMPLE_INSTITUTION_ADMIN.expiresAt} · Sample dates</p>
          </div>
          <div>
            <div className="sc-list-item">
              <span className="sc-list-main"><strong>Usage</strong><small>Student records compared with plan limit</small></span>
              <strong>{usage}%</strong>
            </div>
            <div aria-label={`Sample capacity usage ${usage}%`} className="sc-progress-track" role="progressbar" aria-valuenow={usage} aria-valuemin={0} aria-valuemax={100}>
              <div className="sc-progress-fill" style={{ width: `${usage}%` }} />
            </div>
            <div className="sc-plan-actions">
              <Link className="sc-button sc-button-primary" href="/subscriptions/plans">View available plans</Link>
              <Link className="sc-button" href="/subscriptions/renewals">Renewal options</Link>
            </div>
          </div>
        </section>
        <div className="sc-two-column">
          <section className="sc-card">
            <CardHeading title="Plan overview" subtitle="Only this institution's sample subscription is shown." />
            <dl className="sc-detail-grid">
              <div><dt>Current plan</dt><dd>{SAMPLE_INSTITUTION_ADMIN.plan}</dd></div>
              <div><dt>Subscription status</dt><dd><StatusBadge status="Active" /><SampleTag /></dd></div>
              <div><dt>Start date</dt><dd>{SAMPLE_INSTITUTION_ADMIN.startsAt}</dd></div>
              <div><dt>Expiry date</dt><dd>{SAMPLE_INSTITUTION_ADMIN.expiresAt}</dd></div>
            </dl>
          </section>
          <section className="sc-card">
            <CardHeading title="Billing and documents" subtitle="Connected invoices and payment history will appear here later." />
            <EmptyState icon={FileText} title="No live records connected" message="This preview creates no payments, invoices or receipts." />
          </section>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Total institutions", value: "124", icon: Building2, tone: "blue" as const },
    { label: "Active subscriptions", value: "98", icon: BadgeCheck, tone: "green" as const },
    { label: "Pending subscriptions", value: "12", icon: Clock3, tone: "orange" as const },
    { label: "Expired subscriptions", value: "14", icon: Activity, tone: "violet" as const },
    { label: "Successful payments", value: "743", icon: Check, tone: "green" as const },
    { label: "Pending payments", value: "8", icon: Clock3, tone: "orange" as const },
    { label: "Sample revenue", value: "₹1.28M", icon: CircleDollarSign, tone: "blue" as const },
    { label: "Upcoming renewals", value: "9", icon: CalendarDays, tone: "violet" as const },
  ];

  return (
    <div className="sc-page">
      <PageHeading
        eyebrow="Platform billing"
        title="Subscription overview"
        description="A central view of subscription activity, plan usage and billing operations."
        action={<span className="sc-sample-tag"><Sparkles size={12} /> Illustrative dashboard</span>}
      />
      <div className="sc-stat-grid">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} note="sample UI figure" />)}
      </div>

      <div className="sc-dashboard-grid">
        <section className="sc-card">
          <CardHeading title="Subscription growth" subtitle="Illustrative monthly subscription trend." action={<SampleTag />} />
          <BarChart />
        </section>
        <section className="sc-card">
          <CardHeading title="Revenue overview" subtitle="Sample trend only — not financial data." action={<SampleTag />} />
          <LineChart />
        </section>
      </div>

      <div className="sc-dashboard-grid">
        <section className="sc-card">
          <CardHeading title="Recent transactions" subtitle="Example rows for visual preview only." action={<Link className="sc-button sc-button-quiet" href="/subscriptions/payments">View all <ArrowUpRight size={14} /></Link>} />
          <TransactionTable rows={SAMPLE_TRANSACTIONS.slice(0, 4)} onSelect={setSelectedTransaction} compact />
        </section>
        <section className="sc-card">
          <CardHeading title="Recent subscription activity" subtitle="Illustrative activity entries." action={<SampleTag />} />
          <div>
            {SAMPLE_ACTIVITY.map((activity) => (
              <div className="sc-activity-row" key={activity.title}>
                <span className="sc-activity-marker" />
                <span className="sc-list-main"><strong>{activity.title}</strong><small>{activity.detail}</small></span>
                <span className="sc-list-meta">{activity.time}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="sc-two-column">
        <section className="sc-card">
          <CardHeading title="Upcoming renewals" subtitle="Sample schedules, not connected to billing." action={<SampleTag />} />
          <ul className="sc-list">
            {SAMPLE_RENEWALS.map((renewal) => (
              <li className="sc-list-item" key={renewal.institution}>
                <span className="sc-list-main"><strong>{renewal.institution}</strong><small>{renewal.plan} plan · {renewal.days} days</small></span>
                <span className="sc-list-meta">{renewal.date}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="sc-card">
          <CardHeading title="Expiring subscriptions" subtitle="Sample expiry alerts." action={<Link className="sc-button sc-button-quiet" href="/subscriptions/renewals">Review <ArrowUpRight size={14} /></Link>} />
          <ul className="sc-list">
            {SAMPLE_INSTITUTIONS.filter((item) => item.subscriptionStatus === "Expired" || item.expiresAt <= "2026-12-15").slice(0, 3).map((institution) => (
              <li className="sc-list-item" key={institution.id}>
                <span className="sc-list-main"><strong>{institution.institution}</strong><small>{institution.plan} · {dateLabel(institution.expiresAt)}</small></span>
                <StatusBadge status={institution.subscriptionStatus} />
              </li>
            ))}
          </ul>
        </section>
      </div>
      {selectedTransaction && <TransactionDetails onClose={() => setSelectedTransaction(null)} transaction={selectedTransaction} />}
    </div>
  );
}

type PlanDraft = Omit<SamplePlan, "id"> & { id?: string };

function PlanFormModal({
  plan,
  onClose,
  onSave,
}: {
  plan?: SamplePlan;
  onClose: () => void;
  onSave: (draft: PlanDraft) => void;
}) {
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [samplePrice, setSamplePrice] = useState(plan?.samplePrice ?? "");
  const [currency, setCurrency] = useState(plan?.currency ?? "INR");
  const [billingCycle, setBillingCycle] = useState<SamplePlan["billingCycle"]>(plan?.billingCycle ?? "Monthly");
  const [studentLimit, setStudentLimit] = useState(String(plan?.studentLimit ?? ""));
  const [features, setFeatures] = useState(plan?.features.join(", ") ?? "");
  const [active, setActive] = useState(plan?.active ?? true);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      ...(plan ? { id: plan.id } : {}),
      name: name.trim(),
      description: description.trim(),
      priceLabel: samplePrice ? `Sample ${currency} ${samplePrice} · UI only` : "Sample pricing — not configured",
      samplePrice: samplePrice.trim(),
      currency,
      billingCycle,
      studentLimit: Number(studentLimit),
      features: features.split(",").map((feature) => feature.trim()).filter(Boolean),
      active,
    });
  };

  return (
    <Modal
      title={plan ? "Edit sample plan" : "Create sample plan"}
      subtitle="This form only changes temporary browser state. It does not create database records."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="sc-modal-body">
          <div className="sc-form-grid">
            <label className="sc-form-field">Plan name
              <input autoFocus className="sc-input" maxLength={70} onChange={(event) => setName(event.target.value)} required value={name} />
            </label>
            <label className="sc-form-field">Billing cycle
              <select className="sc-select" onChange={(event) => setBillingCycle(event.target.value as SamplePlan["billingCycle"])} value={billingCycle}>
                {cycleOptions.map((cycle) => <option key={cycle}>{cycle}</option>)}
              </select>
            </label>
            <label className="sc-form-field sc-form-field-full">Description
              <textarea className="sc-input" maxLength={300} onChange={(event) => setDescription(event.target.value)} value={description} />
            </label>
            <label className="sc-form-field">Sample price (illustrative only)
              <input className="sc-input" min="0" onChange={(event) => setSamplePrice(event.target.value)} placeholder="Leave blank if not set" step="0.01" type="number" value={samplePrice} />
            </label>
            <label className="sc-form-field">Currency
              <select className="sc-select" onChange={(event) => setCurrency(event.target.value)} value={currency}>
                <option value="INR">INR</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
            </label>
            <label className="sc-form-field">Student Limit
              <input className="sc-input" min="1" onChange={(event) => setStudentLimit(event.target.value)} required type="number" value={studentLimit} />
            </label>
            <label className="sc-form-field sc-form-field-full">Features (separate with commas)
              <textarea className="sc-input" onChange={(event) => setFeatures(event.target.value)} placeholder="Academic records, reporting, support" value={features} />
            </label>
            <label className="sc-check-row sc-form-field-full">
              <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" />
              Mark this sample plan as active
            </label>
          </div>
        </div>
        <footer className="sc-modal-footer">
          <button className="sc-button" onClick={onClose} type="button">Cancel</button>
          <button className="sc-button sc-button-primary" type="submit">{plan ? "Save preview changes" : "Add sample plan"}</button>
        </footer>
      </form>
    </Modal>
  );
}

function PlansSection({ isInstitutionAdmin }: { isInstitutionAdmin: boolean }) {
  const [plans, setPlans] = useState(SAMPLE_PLANS);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<SamplePlan | null | "new">(null);
  const [viewing, setViewing] = useState<SamplePlan | null>(null);

  const visiblePlans = useMemo(() => plans.filter((plan) => {
    const matchesText = `${plan.name} ${plan.description}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = status === "all" || (status === "active" ? plan.active : !plan.active);
    return matchesText && matchesStatus;
  }), [plans, search, status]);

  const savePlan = (draft: PlanDraft) => {
    if (draft.id) {
      setPlans((current) => current.map((plan) => plan.id === draft.id ? { ...plan, ...draft, id: draft.id! } : plan));
    } else {
      setPlans((current) => [{ ...draft, id: `sample-plan-${Date.now()}` }, ...current]);
    }
    setEditing(null);
  };

  const pageHeading = isInstitutionAdmin
    ? { eyebrow: "Plan catalogue", title: "Available plans", description: "Compare sample plan options. Plan selection and checkout are not connected in this preview." }
    : { eyebrow: "Catalogue management", title: "Subscription plans", description: "Review plan examples and preview plan creation, editing and status controls." };

  return (
    <div className="sc-page">
      <PageHeading
        {...pageHeading}
        action={!isInstitutionAdmin ? <button className="sc-button sc-button-primary" onClick={() => setEditing("new")} type="button"><Plus size={15} /> Create Plan</button> : undefined}
      />
      <div className="sc-toolbar">
        <label className="sc-search">
          <Search aria-hidden="true" size={15} />
          <input className="sc-input" onChange={(event) => setSearch(event.target.value)} placeholder="Search plans..." value={search} />
        </label>
        <select aria-label="Filter plans by status" className="sc-select" onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <span className="sc-sample-tag"><Filter size={11} /> Sample catalogue</span>
      </div>

      {visiblePlans.length ? (
        <div className="sc-plan-grid">
          {visiblePlans.map((plan, index) => (
            <article className={`sc-plan-card${index === 1 ? " sc-plan-card-featured" : ""}`} key={plan.id}>
              <div className="sc-plan-heading">
                <div><h3>{plan.name}</h3><p>{plan.billingCycle} billing · sample</p></div>
                <StatusBadge status={plan.active ? "Active" : "Inactive"} />
              </div>
              <p className="sc-plan-description">{plan.description}</p>
              <div className="sc-plan-price">{plan.priceLabel}</div>
              <div className="sc-plan-limit"><span>Student Limit</span><strong>{plan.studentLimit.toLocaleString("en-IN")}</strong></div>
              <ul className="sc-feature-list">{plan.features.map((feature) => <li key={feature}><Check size={14} />{feature}</li>)}</ul>
              <div className="sc-plan-actions">
                <button className="sc-button sc-button-quiet" onClick={() => setViewing(plan)} type="button"><Eye size={14} /> View details</button>
                {!isInstitutionAdmin && (
                  <>
                    <button className="sc-button sc-button-quiet" onClick={() => setEditing(plan)} type="button"><Pencil size={14} /> Edit</button>
                    <button className="sc-button sc-button-quiet" onClick={() => setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, active: !item.active } : item))} type="button">
                      {plan.active ? "Deactivate" : "Activate"}
                    </button>
                  </>
                )}
                {isInstitutionAdmin && <button className="sc-button" disabled title="Plan selection will be connected in a later phase" type="button">Not connected</button>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="sc-card"><EmptyState icon={PackageOpen} title="No plans match" message="Adjust the search or status filter to view the sample plan catalogue." /></div>
      )}

      {!isInstitutionAdmin && editing && (
        <PlanFormModal
          onClose={() => setEditing(null)}
          onSave={savePlan}
          plan={editing === "new" ? undefined : editing}
        />
      )}
      {viewing && (
        <Modal title={`${viewing.name} plan details`} subtitle="Illustrative plan data — not connected to live plan records." onClose={() => setViewing(null)}>
          <div className="sc-modal-body">
            <dl className="sc-detail-grid">
              <div><dt>Description</dt><dd>{viewing.description}</dd></div>
              <div><dt>Billing cycle</dt><dd>{viewing.billingCycle}</dd></div>
              <div><dt>Student Limit</dt><dd>{viewing.studentLimit.toLocaleString("en-IN")}</dd></div>
              <div><dt>Price</dt><dd>{viewing.priceLabel}</dd></div>
              <div><dt>Status</dt><dd>{viewing.active ? "Active sample plan" : "Inactive sample plan"}</dd></div>
              <div><dt>Features</dt><dd>{viewing.features.join(", ") || "No sample features"}</dd></div>
            </dl>
          </div>
          <footer className="sc-modal-footer"><button className="sc-button sc-button-primary" onClick={() => setViewing(null)} type="button">Close</button></footer>
        </Modal>
      )}
    </div>
  );
}

function InstitutionDetails({ institution, onClose }: { institution: SampleInstitutionSubscription; onClose: () => void }) {
  const remaining = Math.max(0, institution.studentLimit - institution.students);
  const usage = Math.round((institution.students / institution.studentLimit) * 100);
  return (
    <Modal title={institution.institution} subtitle={`Sample institution · ${institution.code}`} onClose={onClose}>
      <div className="sc-modal-body">
        <div className="sc-capacity-number">{institution.students.toLocaleString("en-IN")} <span>/ {institution.studentLimit.toLocaleString("en-IN")} students</span></div>
        <div aria-label={`Sample student usage ${usage}%`} className="sc-progress-track" role="progressbar" aria-valuenow={usage} aria-valuemin={0} aria-valuemax={100}>
          <div className="sc-progress-fill" style={{ width: `${usage}%` }} />
        </div>
        <dl className="sc-detail-grid">
          <div><dt>Institution code</dt><dd>{institution.code}</dd></div>
          <div><dt>Plan</dt><dd>{institution.plan}</dd></div>
          <div><dt>Remaining capacity</dt><dd>{remaining.toLocaleString("en-IN")}</dd></div>
          <div><dt>Subscription status</dt><dd><StatusBadge status={institution.subscriptionStatus} /></dd></div>
          <div><dt>Start date</dt><dd>{dateLabel(institution.startsAt)}</dd></div>
          <div><dt>Expiry date</dt><dd>{dateLabel(institution.expiresAt)}</dd></div>
          <div><dt>Payment status</dt><dd><StatusBadge status={institution.paymentStatus} /></dd></div>
          <div><dt>Record type</dt><dd>Sample UI placeholder</dd></div>
        </dl>
      </div>
      <footer className="sc-modal-footer"><button className="sc-button sc-button-primary" onClick={onClose} type="button">Close details</button></footer>
    </Modal>
  );
}

function InstitutionsSection({ isInstitutionAdmin }: { isInstitutionAdmin: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("institution");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SampleInstitutionSubscription | null>(null);
  const filtered = useMemo(() => {
    const rows = SAMPLE_INSTITUTIONS.filter((item) => {
      const textMatches = `${item.institution} ${item.code} ${item.plan}`.toLowerCase().includes(search.toLowerCase());
      const statusMatches = status === "all" || item.subscriptionStatus.toLowerCase() === status;
      return textMatches && statusMatches;
    });
    return rows.sort((a, b) => sort === "usage"
      ? b.students / b.studentLimit - a.students / a.studentLimit
      : a.institution.localeCompare(b.institution));
  }, [search, sort, status]);

  if (isInstitutionAdmin) {
    const usage = Math.round((SAMPLE_INSTITUTION_ADMIN.registeredStudents / SAMPLE_INSTITUTION_ADMIN.studentLimit) * 100);
    const remaining = SAMPLE_INSTITUTION_ADMIN.studentLimit - SAMPLE_INSTITUTION_ADMIN.registeredStudents;
    return (
      <div className="sc-page">
        <PageHeading eyebrow="Institution workspace" title="Student usage & subscription" description="A tenant-scoped sample view. No other institution's details are displayed." />
        <div className="sc-two-column">
          <section className="sc-card">
            <CardHeading title="Current plan" subtitle="Illustrative sample plan details." action={<SampleTag />} />
            <dl className="sc-detail-grid">
              <div><dt>Plan</dt><dd>{SAMPLE_INSTITUTION_ADMIN.plan}</dd></div>
              <div><dt>Status</dt><dd><StatusBadge status="Active" /></dd></div>
              <div><dt>Start date</dt><dd>{SAMPLE_INSTITUTION_ADMIN.startsAt}</dd></div>
              <div><dt>Expiry date</dt><dd>{SAMPLE_INSTITUTION_ADMIN.expiresAt}</dd></div>
            </dl>
          </section>
          <section className="sc-card">
            <CardHeading title="Student capacity" subtitle="Usage values are sample placeholders." action={<SampleTag />} />
            <div className="sc-capacity-number">{SAMPLE_INSTITUTION_ADMIN.registeredStudents.toLocaleString("en-IN")} <span>/ {SAMPLE_INSTITUTION_ADMIN.studentLimit.toLocaleString("en-IN")}</span></div>
            <p className="sc-capacity-note">{remaining.toLocaleString("en-IN")} sample capacity remaining · {usage}% used</p>
            <div aria-label={`Sample student usage ${usage}%`} className="sc-progress-track" role="progressbar" aria-valuenow={usage} aria-valuemin={0} aria-valuemax={100}>
              <div className="sc-progress-fill" style={{ width: `${usage}%` }} />
            </div>
          </section>
        </div>
        <section className="sc-card">
          <CardHeading title="Subscription details" subtitle="Only your institution's sample record is represented." />
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead><tr><th>Plan</th><th>Student Limit</th><th>Registered students</th><th>Remaining</th><th>Start date</th><th>Expiry date</th><th>Status</th></tr></thead>
              <tbody><tr><td><strong>{SAMPLE_INSTITUTION_ADMIN.plan}</strong><small>Sample record</small></td><td>{SAMPLE_INSTITUTION_ADMIN.studentLimit.toLocaleString("en-IN")}</td><td>{SAMPLE_INSTITUTION_ADMIN.registeredStudents.toLocaleString("en-IN")}</td><td>{remaining.toLocaleString("en-IN")}</td><td>{SAMPLE_INSTITUTION_ADMIN.startsAt}</td><td>{SAMPLE_INSTITUTION_ADMIN.expiresAt}</td><td><StatusBadge status="Active" /></td></tr></tbody>
            </table>
          </div>
        </section>
        <section className="sc-card">
          <CardHeading title="Plan capacity examples" subtitle="Compare available sample limits." />
          <dl className="sc-detail-grid">
            {SAMPLE_PLANS.map((plan) => <div key={plan.id}><dt>{plan.name} · sample</dt><dd>{plan.studentLimit.toLocaleString("en-IN")} students</dd></div>)}
          </dl>
        </section>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="sc-page">
      <PageHeading eyebrow="Platform portfolio" title="Institution subscriptions" description="Review sample institution plan assignments and student capacity." />
      <div className="sc-stat-grid">
        <StatCard icon={Building2} label="Institutions" value="124" note="sample UI figure" tone="blue" />
        <StatCard icon={BadgeCheck} label="Active" value="98" note="sample UI figure" tone="green" />
        <StatCard icon={Clock3} label="Pending" value="12" note="sample UI figure" />
        <StatCard icon={Activity} label="Expired" value="14" note="sample UI figure" tone="violet" />
      </div>
      <section className="sc-card">
        <CardHeading title="Subscription register" subtitle="Example data only. No live institution records are queried." action={<SampleTag />} />
        <div className="sc-toolbar">
          <label className="sc-search"><Search aria-hidden="true" size={15} /><input className="sc-input" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search institution, code or plan..." value={search} /></label>
          <select aria-label="Filter by subscription status" className="sc-select" onChange={(event) => { setStatus(event.target.value); setPage(1); }} value={status}>
            <option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="expired">Expired</option>
          </select>
          <select aria-label="Sort institutions" className="sc-select" onChange={(event) => setSort(event.target.value)} value={sort}>
            <option value="institution">Sort: institution</option><option value="usage">Sort: highest usage</option>
          </select>
        </div>
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead><tr><th>Institution</th><th>Plan</th><th>Student Limit</th><th>Registered</th><th>Remaining</th><th>Period</th><th>Status</th><th>Payment</th><th>Details</th></tr></thead>
            <tbody>{pageRows.map((item) => <tr key={item.id}>{[
              <td key="institution"><strong>{item.institution}</strong><small>{item.code} · sample</small></td>,
              <td key="plan">{item.plan}</td>,
              <td key="limit">{item.studentLimit.toLocaleString("en-IN")}</td>,
              <td key="students">{item.students.toLocaleString("en-IN")}</td>,
              <td key="remaining">{Math.max(0, item.studentLimit - item.students).toLocaleString("en-IN")}</td>,
              <td key="period">{dateLabel(item.startsAt)}<small>Expires {dateLabel(item.expiresAt)}</small></td>,
              <td key="status"><StatusBadge status={item.subscriptionStatus} /></td>,
              <td key="payment"><StatusBadge status={item.paymentStatus} /></td>,
              <td key="details"><button aria-label={`View ${item.institution} sample details`} className="sc-button sc-button-quiet" onClick={() => setSelected(item)} type="button"><Eye size={14} /> View</button></td>,
            ]}</tr>)}</tbody>
          </table>
        </div>
        {!pageRows.length && <EmptyState icon={Building2} title="No sample institutions match" message="Try a different search or status filter." />}
        <div className="sc-page-footer">
          <span>{filtered.length} sample records · Page {page} of {pageCount}</span>
          <div><button className="sc-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button> <button className="sc-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div>
        </div>
      </section>
      {selected && <InstitutionDetails institution={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function TransactionTable({
  rows,
  onSelect,
  compact = false,
}: {
  rows: SampleTransaction[];
  onSelect: (transaction: SampleTransaction) => void;
  compact?: boolean;
}) {
  return (
    <div className="sc-table-wrap">
      <table className="sc-table">
        <thead><tr><th>Transaction</th><th>Institution</th><th>Amount</th><th>Status</th>{!compact && <><th>Payment date</th><th>Method</th></>}<th /></tr></thead>
        <tbody>
          {rows.map((row) => {
            const cells: ReactNode[] = [
              <td key="reference"><strong>{row.id}</strong><small>Sample transaction</small></td>,
              <td key="institution">{row.institution}<small>{row.plan} · sample</small></td>,
              <td key="amount">{formatMoney(row.amount, row.currency)}<small>Illustrative amount</small></td>,
              <td key="status"><StatusBadge status={row.status} /></td>,
            ];
            if (!compact) cells.push(<td key="date">{dateLabel(row.date)}</td>, <td key="method">{row.method}</td>);
            cells.push(<td key="details"><button aria-label={`View ${row.id} sample transaction`} className="sc-button sc-button-quiet" onClick={() => onSelect(row)} type="button"><Eye size={14} /></button></td>);
            return <tr key={row.id}>{cells}</tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

function TransactionDetails({ transaction, onClose }: { transaction: SampleTransaction; onClose: () => void }) {
  return (
    <Modal title="Transaction preview" subtitle="This is illustrative sample data, not a payment record." onClose={onClose}>
      <div className="sc-modal-body">
        <dl className="sc-detail-grid">
          <div><dt>Sample transaction ID</dt><dd>{transaction.id}</dd></div>
          <div><dt>Institution</dt><dd>{transaction.institution}</dd></div>
          <div><dt>Plan</dt><dd>{transaction.plan} · sample</dd></div>
          <div><dt>Illustrative amount</dt><dd>{formatMoney(transaction.amount, transaction.currency)}</dd></div>
          <div><dt>Status</dt><dd><StatusBadge status={transaction.status} /></dd></div>
          <div><dt>Payment method</dt><dd>{transaction.method}</dd></div>
          <div><dt>Payment date</dt><dd>{dateLabel(transaction.date)}</dd></div>
          <div><dt>Provider reference</dt><dd>Not connected</dd></div>
        </dl>
      </div>
      <footer className="sc-modal-footer"><button className="sc-button sc-button-primary" onClick={onClose} type="button">Close</button></footer>
    </Modal>
  );
}

function PaymentsSection({ isInstitutionAdmin }: { isInstitutionAdmin: boolean }) {
  const roleRows = isInstitutionAdmin
    ? SAMPLE_TRANSACTIONS.slice(0, 2).map((transaction) => ({ ...transaction, institution: "Your institution" }))
    : SAMPLE_TRANSACTIONS;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<SampleTransaction | null>(null);
  const filtered = roleRows.filter((item) => {
    const matchesText = `${item.id} ${item.institution} ${item.plan}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = status === "all" || item.status.toLowerCase() === status;
    return matchesText && matchesStatus && (!from || item.date >= from) && (!to || item.date <= to);
  });

  return (
    <div className="sc-page">
      <PageHeading eyebrow="Billing operations" title={isInstitutionAdmin ? "Payment history" : "Payments & transactions"} description={isInstitutionAdmin ? "Only your institution's sample payment history is displayed." : "Search and review illustrative transaction examples. No payment provider is connected."} />
      <div className="sc-stat-grid">
        <StatCard icon={CreditCard} label="Total payments" value={isInstitutionAdmin ? "2" : "6"} note="sample UI figure" tone="blue" />
        <StatCard icon={Check} label="Successful" value={isInstitutionAdmin ? "1" : "3"} note="sample UI figure" tone="green" />
        <StatCard icon={Clock3} label="Pending" value={isInstitutionAdmin ? "1" : "2"} note="sample UI figure" />
        <StatCard icon={X} label="Failed" value={isInstitutionAdmin ? "0" : "1"} note="sample UI figure" tone="violet" />
      </div>
      <section className="sc-card">
        <CardHeading title="Transaction register" subtitle="Every row and amount is a clearly marked UI example." action={<SampleTag />} />
        <div className="sc-toolbar">
          <label className="sc-search"><Search aria-hidden="true" size={15} /><input className="sc-input" onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions..." value={search} /></label>
          <select aria-label="Filter payments by status" className="sc-select" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="all">All statuses</option><option value="succeeded">Successful</option><option value="pending">Pending</option><option value="failed">Failed</option>
          </select>
          <label className="sc-form-field">From<input aria-label="Payment date from" className="sc-input" onChange={(event) => setFrom(event.target.value)} type="date" value={from} /></label>
          <label className="sc-form-field">To<input aria-label="Payment date to" className="sc-input" onChange={(event) => setTo(event.target.value)} type="date" value={to} /></label>
        </div>
        {filtered.length
          ? <TransactionTable onSelect={setSelected} rows={filtered} />
          : <EmptyState icon={CreditCard} title="No sample transactions match" message="Adjust the search, date range or status filter. No live payment data is connected." />}
      </section>
      {selected && <TransactionDetails onClose={() => setSelected(null)} transaction={selected} />}
    </div>
  );
}

function InvoicesSection({ isInstitutionAdmin }: { isInstitutionAdmin: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  return (
    <div className="sc-page">
      <PageHeading eyebrow="Billing documents" title={isInstitutionAdmin ? "Invoices" : "Invoices & receipts"} description="Invoice and receipt records will be displayed when the billing data source is connected." />
      <section className="sc-card">
        <CardHeading title="Invoice register" subtitle="This preview intentionally contains no fabricated invoices or financial documents." />
        <div className="sc-toolbar">
          <label className="sc-search"><Search aria-hidden="true" size={15} /><input className="sc-input" onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice or institution..." value={search} /></label>
          <select aria-label="Filter invoices by payment status" className="sc-select" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="all">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="overdue">Overdue</option>
          </select>
          <button className="sc-button" disabled title="Invoice export is not connected" type="button"><Download size={14} /> Download selected</button>
        </div>
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead><tr><th>Invoice number</th><th>Institution</th><th>Plan</th><th>Amount</th><th>Issue date</th><th>Payment status</th><th>Document</th></tr></thead>
            <tbody><tr><td colSpan={7}><EmptyState icon={FileText} title="No invoice records connected" message={`Search "${search || "—"}" · Status: ${status}. This UI preview does not create fake invoices or downloadable financial documents.`} /></td></tr></tbody>
          </table>
        </div>
        <p className="sc-not-connected"><ShieldCheck size={13} /> Invoice links and downloads will activate when connected to verified billing records.</p>
      </section>
    </div>
  );
}

function RenewalsSection({ isInstitutionAdmin }: { isInstitutionAdmin: boolean }) {
  if (isInstitutionAdmin) {
    return (
      <div className="sc-page">
        <PageHeading eyebrow="Plan options" title="Renewals & upgrades" description="Review available paths for a future plan change. Operations are intentionally disabled in this UI phase." />
        <section className="sc-card">
          <CardHeading title="Current renewal preview" subtitle="Sample schedule only; no actual renewal is scheduled." action={<SampleTag />} />
          <dl className="sc-detail-grid">
            <div><dt>Current plan</dt><dd>{SAMPLE_INSTITUTION_ADMIN.plan}</dd></div>
            <div><dt>Renewal date</dt><dd>{SAMPLE_INSTITUTION_ADMIN.expiresAt}</dd></div>
            <div><dt>Renewal status</dt><dd><StatusBadge status="Pending" /></dd></div>
            <div><dt>Operation status</dt><dd>Not connected</dd></div>
          </dl>
        </section>
        <section className="sc-card">
          <CardHeading title="Available sample upgrade options" subtitle="Plan choices are illustrative; selecting a plan or checkout is disabled." />
          <div className="sc-plan-grid">
            {SAMPLE_PLANS.filter((plan) => plan.name !== "Standard").map((plan) => (
              <article className="sc-plan-card" key={plan.id}>
                <div className="sc-plan-heading"><h3>{plan.name}</h3><SampleTag /></div>
                <div className="sc-plan-limit"><span>Student Limit</span><strong>{plan.studentLimit.toLocaleString("en-IN")}</strong></div>
                <p className="sc-plan-description">{plan.description}</p>
                <button className="sc-button" disabled title="Upgrade and renewal actions are not connected" type="button">Upgrade · not connected</button>
              </article>
            ))}
          </div>
        </section>
        <section className="sc-card">
          <CardHeading title="Plan change history" subtitle="No real upgrade or downgrade records are loaded." />
          <EmptyState icon={ArrowDownRight} title="No plan changes connected" message="Upgrade and downgrade history will appear here after the billing backend is integrated." />
        </section>
      </div>
    );
  }

  return (
    <div className="sc-page">
      <PageHeading eyebrow="Lifecycle operations" title="Renewals & upgrades" description="Track sample renewals, expiry windows and plan change history." />
      <div className="sc-stat-grid">
        <StatCard icon={CalendarDays} label="Upcoming renewals" value="9" note="sample UI figure" tone="blue" />
        <StatCard icon={Clock3} label="Expiring in 30 days" value="5" note="sample UI figure" />
        <StatCard icon={Activity} label="Expired subscriptions" value="14" note="sample UI figure" tone="violet" />
        <StatCard icon={ArrowUpRight} label="Plan changes" value="6" note="sample UI figure" tone="green" />
      </div>
      <div className="sc-two-column">
        <section className="sc-card">
          <CardHeading title="Upcoming renewals" subtitle="Sample schedule entries only." action={<SampleTag />} />
          <ul className="sc-list">{SAMPLE_RENEWALS.map((renewal) => (
            <li className="sc-list-item" key={renewal.institution}>
              <span className="sc-list-main"><strong>{renewal.institution}</strong><small>{renewal.plan} plan · renews {renewal.date}</small></span>
              <span className="sc-list-meta">{renewal.days} days</span>
            </li>
          ))}</ul>
          <button className="sc-button" disabled title="Renewal actions are not connected" type="button">Manage renewals · not connected</button>
        </section>
        <section className="sc-card">
          <CardHeading title="Expiring & expired" subtitle="Sample expiry alerts." action={<SampleTag />} />
          <ul className="sc-list">{SAMPLE_INSTITUTIONS.filter((item) => item.subscriptionStatus !== "Pending").slice(0, 5).map((item) => (
            <li className="sc-list-item" key={item.id}>
              <span className="sc-list-main"><strong>{item.institution}</strong><small>{item.plan} · {dateLabel(item.expiresAt)}</small></span>
              <StatusBadge status={item.subscriptionStatus} />
            </li>
          ))}</ul>
        </section>
      </div>
      <section className="sc-card">
        <CardHeading title="Upgrade & downgrade history" subtitle="Illustrative plan change entries." action={<SampleTag />} />
        <div className="sc-table-wrap">
          <table className="sc-table"><thead><tr><th>Institution</th><th>Change type</th><th>Previous plan</th><th>New plan</th><th>Effective date</th><th>Status</th><th>Operation</th></tr></thead>
            <tbody>
              <tr><td>Northstar Demo Academy<small>Sample</small></td><td><span className="sc-not-connected"><ArrowUpRight size={13} /> Upgrade</span></td><td>Basic</td><td>Standard</td><td>01 Oct 2026</td><td><StatusBadge status="Active" /></td><td><button className="sc-button" disabled title="Backend operation not connected" type="button">Not connected</button></td></tr>
              <tr><td>Harbor Demo School<small>Sample</small></td><td><span className="sc-not-connected"><ArrowDownRight size={13} /> Downgrade</span></td><td>Premium</td><td>Standard</td><td>01 Sep 2026</td><td><StatusBadge status="Pending" /></td><td><button className="sc-button" disabled title="Backend operation not connected" type="button">Not connected</button></td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReportsSection({ isInstitutionAdmin }: { isInstitutionAdmin: boolean }) {
  const [period, setPeriod] = useState("6-months");
  const [plan, setPlan] = useState("all");
  if (isInstitutionAdmin) {
    return restrictedNotice("Reports are not available", "Institution Admins can view only their own subscription, payments and invoices. Platform revenue reports are restricted to Super Admins.");
  }
  return (
    <div className="sc-page">
      <PageHeading eyebrow="Analytics workspace" title="Revenue & reports" description="Illustrative charts and figures for preview only. No live financial data is loaded." action={<button className="sc-button" disabled title="Report export is not connected" type="button"><Download size={14} /> Export report</button>} />
      <div className="sc-toolbar">
        <label className="sc-form-field">Report period<select className="sc-select" onChange={(event) => setPeriod(event.target.value)} value={period}><option value="6-months">Last 6 months</option><option value="12-months">Last 12 months</option><option value="ytd">Year to date</option></select></label>
        <label className="sc-form-field">Plan<select className="sc-select" onChange={(event) => setPlan(event.target.value)} value={plan}><option value="all">All plans</option>{SAMPLE_PLANS.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
        <span className="sc-sample-tag"><Filter size={11} /> Filters: preview only</span>
      </div>
      <div className="sc-stat-grid">
        <StatCard icon={CircleDollarSign} label="Sample revenue" value="₹1.28M" note="not financial data" tone="blue" />
        <StatCard icon={ArrowUpRight} label="Sample revenue change" value="+8.4%" note="illustrative" tone="green" />
        <StatCard icon={Building2} label="Plan distribution" value="4 plans" note={`filter: ${plan}`} />
        <StatCard icon={CreditCard} label="Payment statuses" value="3 groups" note="illustrative" tone="violet" />
      </div>
      <div className="sc-dashboard-grid">
        <section className="sc-card"><CardHeading title="Monthly revenue" subtitle={`Illustrative values · ${period}`} action={<SampleTag />} /><LineChart /></section>
        <section className="sc-card"><CardHeading title="Subscription distribution" subtitle="Plan-level institution count example." action={<SampleTag />} />
          <ul className="sc-list">{SAMPLE_PLANS.map((item, index) => {
            const values = [42, 31, 19, 8];
            return <li className="sc-list-item" key={item.id}><span className="sc-list-main"><strong>{item.name}</strong><small>{values[index]} illustrative assignments</small></span><strong>{Math.round(values[index] / 100 * 100)}%</strong></li>;
          })}</ul>
        </section>
      </div>
      <div className="sc-two-column">
        <section className="sc-card"><CardHeading title="Plan-wise institutions" subtitle="Example distribution, not live assignment counts." action={<SampleTag />} /><BarChart /></section>
        <section className="sc-card"><CardHeading title="Payment status distribution" subtitle="Sample-only status ratio." action={<SampleTag />} />
          <ul className="sc-list"><li className="sc-list-item"><span className="sc-list-main"><strong>Successful</strong><small>Illustrative status count</small></span><StatusBadge status="Succeeded" /></li><li className="sc-list-item"><span className="sc-list-main"><strong>Pending</strong><small>Illustrative status count</small></span><StatusBadge status="Pending" /></li><li className="sc-list-item"><span className="sc-list-main"><strong>Failed</strong><small>Illustrative status count</small></span><StatusBadge status="Failed" /></li></ul>
        </section>
      </div>
    </div>
  );
}

function SettingsSection({ isInstitutionAdmin }: { isInstitutionAdmin: boolean }) {
  const [settings, setSettings] = useState({ renewalReminders: true, paymentAlerts: true, invoiceEmails: false });
  if (isInstitutionAdmin) {
    return restrictedNotice("Platform settings are restricted", "Subscription and billing configuration is available to Super Admins only. Your own plan details remain available in My Subscription.");
  }
  const toggle = (key: keyof typeof settings) => setSettings((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="sc-page">
      <PageHeading eyebrow="Workspace preferences" title="Subscription settings" description="Preview settings controls. Changes are held only in this page's temporary state and are not saved." />
      <section className="sc-card">
        <CardHeading title="Subscription settings" subtitle="Operational defaults (preview only)." />
        <div className="sc-settings-row"><span className="sc-settings-copy"><strong>Default billing cycle</strong><small>Used as the initial cycle when creating a sample plan.</small></span><select className="sc-select" defaultValue="Monthly"><option>Monthly</option><option>Quarterly</option><option>Yearly</option></select></div>
        <div className="sc-settings-row"><span className="sc-settings-copy"><strong>Student capacity warnings</strong><small>Preview warning threshold for plan capacity.</small></span><select className="sc-select" defaultValue="80%"><option>70%</option><option>80%</option><option>90%</option></select></div>
      </section>
      <section className="sc-card">
        <CardHeading title="Notification preferences" subtitle="These toggles do not send or change real notifications." />
        <div className="sc-settings-row"><span className="sc-settings-copy"><strong>Renewal reminders</strong><small>Sample reminder preference.</small></span><button aria-checked={settings.renewalReminders} aria-label="Toggle renewal reminders preview" className="sc-switch" onClick={() => toggle("renewalReminders")} role="switch" type="button" /></div>
        <div className="sc-settings-row"><span className="sc-settings-copy"><strong>Payment status alerts</strong><small>Sample payment notification preference.</small></span><button aria-checked={settings.paymentAlerts} aria-label="Toggle payment alerts preview" className="sc-switch" onClick={() => toggle("paymentAlerts")} role="switch" type="button" /></div>
        <div className="sc-settings-row"><span className="sc-settings-copy"><strong>Invoice emails</strong><small>Sample invoice delivery preference.</small></span><button aria-checked={settings.invoiceEmails} aria-label="Toggle invoice emails preview" className="sc-switch" onClick={() => toggle("invoiceEmails")} role="switch" type="button" /></div>
      </section>
      <div className="sc-two-column">
        <section className="sc-card">
          <CardHeading title="Payment configuration" subtitle="No credentials or API keys are requested or shown." />
          <div className="sc-settings-row"><span className="sc-settings-copy"><strong>Payment provider</strong><small>Provider setup is outside this UI-only phase.</small></span><span className="sc-not-connected"><LockKeyhole size={13} /> Not connected</span></div>
          <div className="sc-settings-row"><span className="sc-settings-copy"><strong>Webhook status</strong><small>Provider events are not configured in this preview.</small></span><span className="sc-not-connected"><ShieldCheck size={13} /> Not connected</span></div>
        </section>
        <section className="sc-card">
          <CardHeading title="Invoice settings" subtitle="No financial documents are created by this screen." />
          <div className="sc-settings-row"><span className="sc-settings-copy"><strong>Invoice numbering</strong><small>Document numbering will use the connected billing system.</small></span><span className="sc-not-connected">Preview only</span></div>
          <div className="sc-settings-row"><span className="sc-settings-copy"><strong>Invoice currency</strong><small>Currency display is not configured in this UI preview.</small></span><span className="sc-not-connected">Not configured</span></div>
        </section>
      </div>
    </div>
  );
}

export function SubscriptionSection({
  section,
  overviewData,
  institutionData,
  paymentData,
}: {
  section: SubscriptionSectionKey;
  overviewData?: PortalOverviewData;
  institutionData?: PortalInstitutionListData;
  paymentData?: PortalPaymentListData;
}) {
  const role = useSubscriptionPortalRole();
  const isInstitutionAdmin = role === "INSTITUTION_ADMIN";

  switch (section) {
    case "overview":
      return overviewData
        ? <LiveOverviewSection data={overviewData} isInstitutionAdmin={isInstitutionAdmin} />
        : <OverviewSection isInstitutionAdmin={isInstitutionAdmin} />;
    case "plans":
      return <PlansSection isInstitutionAdmin={isInstitutionAdmin} />;
    case "institutions":
      return institutionData
        ? <LiveInstitutionsSection data={institutionData} isInstitutionAdmin={isInstitutionAdmin} />
        : <InstitutionsSection isInstitutionAdmin={isInstitutionAdmin} />;
    case "payments":
      return paymentData
        ? <LivePaymentsSection data={paymentData} isInstitutionAdmin={isInstitutionAdmin} />
        : <PaymentsSection isInstitutionAdmin={isInstitutionAdmin} />;
    case "invoices":
      return <InvoicesSection isInstitutionAdmin={isInstitutionAdmin} />;
    case "renewals":
      return <RenewalsSection isInstitutionAdmin={isInstitutionAdmin} />;
    case "reports":
      return <ReportsSection isInstitutionAdmin={isInstitutionAdmin} />;
    case "settings":
      return <SettingsSection isInstitutionAdmin={isInstitutionAdmin} />;
    default:
      return <OverviewSection isInstitutionAdmin={isInstitutionAdmin} />;
  }
}
