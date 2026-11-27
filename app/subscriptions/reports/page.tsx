import { redirect } from "next/navigation";
import { getPortalOverview, getSubscriptionPortalScope } from "@/lib/subscriptions/portal-data";
import { SubscriptionSection } from "@/components/subscriptions/SubscriptionSection";

export const instant = false;

export default async function SubscriptionReportsPage() {
  const scope = await getSubscriptionPortalScope();
  if (scope.role !== "SUPER_ADMIN") redirect("/subscriptions");
  return <SubscriptionSection section="reports" overviewData={await getPortalOverview(scope)} />;
}
