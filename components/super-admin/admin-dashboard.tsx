import { Activity, Building2, CreditCard, GraduationCap, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { DashboardAnalytics } from "@/components/super-admin/dashboard-analytics";
import type { DashboardSummary } from "@/lib/super-admin/dashboard";

const numberFormat = new Intl.NumberFormat("en-IN");

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function AdminDashboard({
  summary,
  unavailable = false,
  filters = { from: "", to: "", range: "12m" },
}: {
  summary: DashboardSummary | null;
  unavailable?: boolean;
  filters?: { from: string; to: string; range: string };
}) {
  if (unavailable || !summary) {
    return (
      <section className="sa-data-error" role="alert">
        <Activity size={20} />
        <div>
          <strong>Dashboard data is unavailable</strong>
          <p>Check the database connection and confirm that the approved Prisma migrations are available. No demo figures are shown.</p>
        </div>
      </section>
    );
  }

  const revenue = summary.monthlyRecurringRevenue
    ? formatMoney(summary.monthlyRecurringRevenue.amount, summary.monthlyRecurringRevenue.currency)
    : "Not available";
  const stats = [
    { label: "Total Institutions", value: numberFormat.format(summary.totalInstitutions), note: `${numberFormat.format(summary.pendingInstitutions)} pending onboarding`, icon: Building2, tone: "blue", href: "/super-admin/institutions" },
    { label: "Active Institutions", value: numberFormat.format(summary.activeInstitutions), note: `${numberFormat.format(summary.suspendedInstitutions)} suspended`, icon: Building2, tone: "green", href: "/super-admin/institutions?status=ACTIVE" },
    { label: "Total Students", value: numberFormat.format(summary.totalStudents), note: "Across connected institutions", icon: GraduationCap, tone: "violet", href: "/super-admin/usage" },
    { label: "Platform Users", value: numberFormat.format(summary.totalUsers), note: "Registered platform accounts", icon: Users, tone: "orange", href: "/super-admin/users" },
    { label: "Active Subscriptions", value: numberFormat.format(summary.activeSubscriptions), note: `${numberFormat.format(summary.expiredSubscriptions)} expired`, icon: CreditCard, tone: "teal", href: "/super-admin/billing" },
    { label: "Platform Revenue", value: revenue, note: summary.monthlyRecurringRevenue ? "Estimated monthly recurring revenue" : "Multiple currencies are not combined", icon: Activity, tone: "navy", href: "/super-admin/billing" },
  ];

  return (
    <div className="sa-dashboard">
      <section className="sa-welcome" aria-labelledby="welcome-title">
        <div>
          <p className="sa-eyebrow">PLATFORM OVERVIEW</p>
          <h2 id="welcome-title">Super Admin Dashboard</h2>
          <p>Platform Overview &amp; Management</p>
        </div>
        <Link className="sa-button sa-button-secondary sa-refresh-button" href="/super-admin" title="Refresh dashboard data"><RefreshCw size={15} /> Refresh</Link>
      </section>

      <form className="sa-date-filter sa-analytics-filter" action="/super-admin">
        <div><strong>Analytics period</strong><span>Every chart uses real records within this period.</span></div>
        <div className="sa-filter-presets" aria-label="Analytics period presets">
          {[["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["12m", "12 months"]].map(([value, label]) => <Link className={filters.range === value ? "is-active" : ""} href={`/super-admin?range=${value}`} key={value}>{label}</Link>)}
        </div>
        <label>From<input type="date" name="from" defaultValue={filters.from} /></label>
        <label>To<input type="date" name="to" defaultValue={filters.to} /></label>
        <input type="hidden" name="range" value="custom" />
        <button className="sa-button sa-button-secondary">Apply</button>
        <Link className="sa-small-link" href="/super-admin?range=12m">Reset</Link>
      </form>

      <section className="sa-stats sa-dashboard-stats" aria-label="Live platform statistics">
        {stats.map(({ label, value, note, icon: Icon, tone, href }) => <Link className="sa-card sa-stat sa-stat-link" key={label} href={href}><div className="sa-stat-top"><span className="sa-stat-label">{label}</span><span className={`sa-stat-icon sa-stat-icon-${tone}`}><Icon size={18} /></span></div><div className="sa-stat-value">{value}</div><div className="sa-stat-note">{note}</div></Link>)}
      </section>

      <DashboardAnalytics summary={summary} />
    </div>
  );
}
