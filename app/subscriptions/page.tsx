import type { Metadata } from "next";
import { SubscriptionSection } from "@/components/subscriptions/SubscriptionSection";
import { getPortalOverview, getSubscriptionPortalScope } from "@/lib/subscriptions/portal-data";

export const metadata: Metadata = {
  title: "Subscription Center | SST-ERP",
  description: "Subscription and billing workspace for SST-ERP.",
};

export default async function SubscriptionsOverviewPage() {
  const scope = await getSubscriptionPortalScope();
  const overviewData = await getPortalOverview(scope);
  return <SubscriptionSection section="overview" overviewData={overviewData} />;
}
