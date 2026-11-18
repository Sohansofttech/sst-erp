import { AdminDashboard } from "@/components/super-admin/admin-dashboard";
import { getDashboardSummary } from "@/lib/super-admin/dashboard";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandLoadingScreen } from "@/components/shared/BrandLoadingScreen";

export const instant = false;

type DashboardSearchParams = Promise<{ from?: string | string[]; to?: string | string[]; range?: string | string[] }>;

async function DashboardContent({ searchParams }: { searchParams: DashboardSearchParams }) {
  await connection();
  let summary = null;
  let unavailable = false;
  const params = await searchParams;
  const range = Array.isArray(params.range) ? params.range[0] : params.range;
  const fromInput = Array.isArray(params.from) ? params.from[0] : params.from;
  const toInput = Array.isArray(params.to) ? params.to[0] : params.to;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date();
  const presetFrom = new Date(today);
  if (range === "7d") presetFrom.setDate(today.getDate() - 7);
  else if (range === "30d") presetFrom.setDate(today.getDate() - 30);
  else if (range === "90d") presetFrom.setDate(today.getDate() - 90);
  else if (range === "12m" || !range) presetFrom.setMonth(today.getMonth() - 11, 1);
  const validFrom = fromInput && datePattern.test(fromInput) ? new Date(`${fromInput}T00:00:00.000Z`) : range === "custom" ? undefined : presetFrom;
  const validToDate = toInput && datePattern.test(toInput) ? new Date(`${toInput}T00:00:00.000Z`) : undefined;
  const validDates = (!validFrom || !Number.isNaN(validFrom.getTime())) && (!validToDate || !Number.isNaN(validToDate.getTime())) && (!validFrom || !validToDate || validFrom <= validToDate);
  const until = validToDate ? new Date(validToDate.getTime() + 86400000) : undefined;
  try {
    if (validDates) summary = await getDashboardSummary({ from: validFrom, until });
    else unavailable = true;
  } catch {
    unavailable = true;
  }
  return <AdminDashboard summary={summary} unavailable={unavailable} filters={{ from: fromInput ?? "", to: toInput ?? "", range: range ?? "12m" }} />;
}

function DashboardFallback() {
  return <BrandLoadingScreen compact message="LOADING LIVE ANALYTICS..." />;
}

export default function AdminPage({ searchParams }: { searchParams: DashboardSearchParams }) {
  return <Suspense fallback={<DashboardFallback />}><DashboardContent searchParams={searchParams} /></Suspense>;
}
