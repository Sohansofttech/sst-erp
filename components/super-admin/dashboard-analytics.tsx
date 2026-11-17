"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, BarChart3, Building2, CreditCard, Database, GraduationCap, Layers3, Users } from "lucide-react";
import type { DashboardSummary } from "@/lib/super-admin/dashboard";

const numberFormat = new Intl.NumberFormat("en-IN");
const palette = ["#12365a", "#f5a623", "#2563eb", "#16a34a", "#7c3aed", "#0f766e", "#dc2626"];

function formatNumber(value: number) {
  return numberFormat.format(Math.round(value));
}

function chartPoints(values: number[], width = 760, height = 220, padding = 28) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  return values.map((value, index) => ({
    x: padding + index * step,
    y: height - padding - (value / max) * (height - padding * 2),
  }));
}

function LineChart({ data }: { data: DashboardSummary["timeline"] }) {
  const [visible, setVisible] = useState({ institutions: true, students: true, users: true });
  const [hovered, setHovered] = useState<number | null>(null);
  const series = [
    { key: "institutions" as const, label: "Institutions", color: "#f5a623" },
    { key: "students" as const, label: "Students", color: "#2563eb" },
    { key: "users" as const, label: "Platform users", color: "#16a34a" },
  ];
  const max = Math.max(1, ...data.flatMap((point) => series.filter((item) => visible[item.key]).map((item) => point[item.key])));

  return (
    <div className="sa-chart-shell">
      <div className="sa-chart-legend">
        {series.map((item) => <button type="button" className={`sa-legend-button ${visible[item.key] ? "is-visible" : ""}`} key={item.key} onClick={() => setVisible((current) => ({ ...current, [item.key]: !current[item.key] }))}><i style={{ background: item.color }} />{item.label}</button>)}
      </div>
      <div className="sa-line-chart-wrap">
        <svg className="sa-line-chart" viewBox="0 0 760 250" role="img" aria-label="Platform growth line chart">
          {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="28" x2="732" y1={28 + line * 48} y2={28 + line * 48} className="sa-chart-grid-line" />)}
          {series.filter((item) => visible[item.key]).map((item) => {
            const points = chartPoints(data.map((point) => point[item.key] / max), 760, 220, 28);
            return <polyline key={item.key} points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sa-chart-line" />;
          })}
          {data.map((point, index) => <rect key={point.label} x={28 + index * (data.length > 1 ? 704 / (data.length - 1) : 0) - 18} y="20" width="36" height="205" fill="transparent" onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} />)}
        </svg>
        <div className="sa-chart-x-labels">{data.map((point) => <span key={point.label}>{point.label}</span>)}</div>
        {hovered !== null && <div className="sa-chart-tooltip" style={{ left: `${Math.min(82, Math.max(12, 12 + hovered * (76 / Math.max(1, data.length - 1))))}%` }}><strong>{data[hovered].label}</strong>{series.filter((item) => visible[item.key]).map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}: {formatNumber(data[hovered][item.key])}</span>)}</div>}
      </div>
    </div>
  );
}

function AreaChart({ data, currency }: { data: DashboardSummary["timeline"]; currency: string | null }) {
  if (!currency || data.every((point) => point.revenue === 0)) return <div className="sa-chart-empty">Paid revenue history is unavailable for the selected period.</div>;
  const points = chartPoints(data.map((point) => point.revenue), 760, 220, 28);
  const area = `${points[0].x},220 ${points.map((point) => `${point.x},${point.y}`).join(" ")} ${points.at(-1)?.x ?? 732},220`;
  return <div className="sa-area-chart-wrap"><svg className="sa-line-chart" viewBox="0 0 760 250" role="img" aria-label="Paid revenue area chart"><defs><linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#f5a623" stopOpacity=".35" /><stop offset="100%" stopColor="#f5a623" stopOpacity=".02" /></linearGradient></defs><line x1="28" x2="732" y1="220" y2="220" className="sa-chart-grid-line" /><polygon points={area} fill="url(#revenue-fill)" /><polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#f5a623" strokeWidth="3" strokeLinecap="round" /></svg><div className="sa-chart-x-labels">{data.map((point) => <span key={point.label}>{point.label}</span>)}</div></div>;
}

function DonutChart({ items, emptyMessage = "No data is available." }: { items: { label: string; value: number }[]; emptyMessage?: string }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const visible = items.filter((item) => !hidden.includes(item.label));
  const total = visible.reduce((sum, item) => sum + item.value, 0);
  if (items.length === 0 || total === 0) return <div className="sa-chart-empty">{emptyMessage}</div>;
  const stops = visible.reduce<{ cursor: number; values: string[] }>((result, item, index) => {
    const start = result.cursor;
    const cursor = start + item.value / total * 360;
    result.values.push(`${palette[index % palette.length]} ${start}deg ${cursor}deg`);
    return { cursor, values: result.values };
  }, { cursor: 0, values: [] }).values;
  return <div className="sa-donut-layout"><div className="sa-donut" style={{ background: `conic-gradient(${stops.join(", ")})` }}><div><strong>{formatNumber(total)}</strong><span>records</span></div></div><div className="sa-chart-legend sa-chart-legend-stack">{items.map((item, index) => <button type="button" className={`sa-legend-button ${hidden.includes(item.label) ? "" : "is-visible"}`} key={item.label} onClick={() => setHidden((current) => current.includes(item.label) ? current.filter((value) => value !== item.label) : [...current, item.label])}><i style={{ background: palette[index % palette.length] }} /><span>{item.label}</span><strong>{formatNumber(item.value)}</strong></button>)}</div></div>;
}

function HorizontalBars({ items, emptyMessage = "No comparison data is available." }: { items: { label: string; value: number; meta?: string }[]; emptyMessage?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0) return <div className="sa-chart-empty">{emptyMessage}</div>;
  return <div className="sa-horizontal-bars">{items.map((item, index) => <div className="sa-horizontal-bar" key={item.label}><div><span>{item.label}</span><strong>{formatNumber(item.value)}{item.meta ? ` · ${item.meta}` : ""}</strong></div><div className="sa-horizontal-track"><span style={{ width: `${Math.max(3, item.value / max * 100)}%`, background: palette[index % palette.length] }} /></div></div>)}</div>;
}

function Funnel({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0) return <div className="sa-chart-empty">Onboarding stage data is unavailable.</div>;
  return <div className="sa-funnel">{items.map((item, index) => <div className="sa-funnel-row" key={item.label}><span>{item.label.replaceAll("_", " ")}</span><div><i style={{ width: `${Math.max(10, item.value / max * 100)}%`, background: palette[index % palette.length] }} /><strong>{formatNumber(item.value)}</strong></div></div>)}</div>;
}

export function DashboardAnalytics({ summary }: { summary: DashboardSummary }) {
  const [revenueTab, setRevenueTab] = useState<"trend" | "plans">("trend");
  const usage = useMemo(() => summary.usageByInstitution.filter((item) => item.metric === "storage_bytes").map((item) => ({ label: item.name, value: item.value, meta: item.unit })), [summary.usageByInstitution]);
  const activityIcon = (action: string) => action.includes("SUBSCRIPTION") ? CreditCard : action.includes("INSTITUTION") ? Building2 : Activity;

  return (
    <div className="sa-advanced-analytics">
      <section className="sa-analytics-row sa-analytics-growth">
        <article className="sa-card sa-panel sa-analytics-main"><div className="sa-panel-heading"><div><h3>Platform Growth Overview</h3><div className="sa-panel-subtitle">Monthly registrations, students and platform users from actual records</div></div><BarChart3 size={19} /></div><LineChart data={summary.timeline} /></article>
        <article className="sa-card sa-panel"><div className="sa-panel-heading"><div><h3>Subscription distribution</h3><div className="sa-panel-subtitle">Active plans</div></div><CreditCard size={19} /></div><DonutChart items={summary.subscriptionDistribution} emptyMessage="No active subscriptions are available." /></article>
      </section>

      <section className="sa-analytics-row">
        <article className="sa-card sa-panel sa-analytics-main"><div className="sa-panel-heading"><div><h3>Revenue analytics</h3><div className="sa-panel-subtitle">Successful payments only · {summary.revenueCurrency ?? "currency totals are not combined"}</div></div><div className="sa-tab-list"><button className={revenueTab === "trend" ? "is-active" : ""} onClick={() => setRevenueTab("trend")}>Trend</button><button className={revenueTab === "plans" ? "is-active" : ""} onClick={() => setRevenueTab("plans")}>By plan</button></div></div>{revenueTab === "trend" ? <AreaChart data={summary.timeline} currency={summary.revenueCurrency} /> : <HorizontalBars items={summary.revenueByPlan.map((item) => ({ label: item.label, value: item.value, meta: item.currency }))} emptyMessage="No paid revenue by plan is available." />}</article>
        <article className="sa-card sa-panel"><div className="sa-panel-heading"><div><h3>Subscription status</h3><div className="sa-panel-subtitle">Current records by lifecycle state</div></div><Layers3 size={19} /></div><DonutChart items={summary.subscriptionStatusDistribution} emptyMessage="No subscription records are available." /></article>
      </section>

      <section className="sa-analytics-row">
        <article className="sa-card sa-panel"><div className="sa-panel-heading"><div><h3>Institution performance</h3><div className="sa-panel-subtitle">Active users by platform institution</div></div><Link className="sa-small-link" href="/super-admin/institutions">Manage <ArrowUpRight size={13} /></Link></div><HorizontalBars items={summary.institutionPerformance.map((item) => ({ label: item.name, value: item.activeUsers, meta: item.plan ?? "No active plan" }))} emptyMessage="No institution performance data is available." /></article>
        <article className="sa-card sa-panel"><div className="sa-panel-heading"><div><h3>Institution status</h3><div className="sa-panel-subtitle">Registered platform institutions</div></div><Building2 size={19} /></div><DonutChart items={summary.institutionStatusDistribution} emptyMessage="No institution status data is available." /></article>
      </section>

      <section className="sa-analytics-row">
        <article className="sa-card sa-panel"><div className="sa-panel-heading"><div><h3>Platform usage</h3><div className="sa-panel-subtitle">Latest recorded storage measurements</div></div><Database size={19} /></div><HorizontalBars items={usage} emptyMessage="No storage measurements are recorded." /></article>
        <article className="sa-card sa-panel"><div className="sa-panel-heading"><div><h3>Institution onboarding funnel</h3><div className="sa-panel-subtitle">Current onboarding stages</div></div><Layers3 size={19} /></div><Funnel items={summary.onboardingFunnel} /></article>
      </section>

      <section className="sa-analytics-row">
        <article className="sa-card sa-panel"><div className="sa-panel-heading"><div><h3>Recent platform activity</h3><div className="sa-panel-subtitle">Audit events recorded by the platform</div></div><Link className="sa-small-link" href="/super-admin/audit-logs">View audit logs</Link></div>{summary.recentAuditLogs.length === 0 ? <div className="sa-chart-empty">No audit activity has been recorded.</div> : <div className="sa-timeline">{summary.recentAuditLogs.map((entry) => { const Icon = activityIcon(entry.action); return <div className="sa-timeline-item" key={entry.id}><span className="sa-timeline-icon"><Icon size={15} /></span><div><strong>{entry.action.replaceAll("_", " ")}</strong><span>{entry.user?.name ?? entry.user?.email ?? "System"}{entry.institution ? ` · ${entry.institution.name}` : ""}</span><time>{new Date(entry.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div></div>; })}</div>}</article>
        <article className="sa-card sa-panel"><div className="sa-panel-heading"><div><h3>Top institutions by students</h3><div className="sa-panel-subtitle">Connected student records</div></div><GraduationCap size={19} /></div><HorizontalBars items={summary.studentPopulation.map((item) => ({ label: item.name, value: item.students }))} emptyMessage="No student population data is available." /></article>
      </section>

      <section className="sa-analytics-footer-grid">
        <div className="sa-analytics-mini"><Users size={17} /><span>Platform user roles</span><strong>{formatNumber(summary.totalUsers)}</strong><DonutChart items={summary.roleDistribution} emptyMessage="No role data." /></div>
        <div className="sa-analytics-mini"><Activity size={17} /><span>Paid payment records</span><strong>{formatNumber(summary.paymentStatusDistribution.find((item) => item.label === "SUCCEEDED")?.value ?? 0)}</strong><span className="sa-muted-copy">Successful payments only; unpaid invoices are excluded.</span></div>
      </section>
    </div>
  );
}
