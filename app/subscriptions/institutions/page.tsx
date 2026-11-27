import { SubscriptionSection } from "@/components/subscriptions/SubscriptionSection";
import { getPortalInstitutionList, getSubscriptionPortalScope } from "@/lib/subscriptions/portal-data";
import { getPlanCatalogue } from "@/lib/subscriptions/management-data";

export const instant = false;

export default async function InstitutionSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ assignPlan?: string | string[] }>;
}) {
  const scope = await getSubscriptionPortalScope();
  const params = await searchParams;
  const initialPlanId = typeof params.assignPlan === "string" ? params.assignPlan : undefined;
  const [institutionData, catalogue] = await Promise.all([
    getPortalInstitutionList(scope),
    scope.role === "SUPER_ADMIN" ? getPlanCatalogue() : Promise.resolve(undefined),
  ]);
  return <SubscriptionSection section="institutions" institutionData={institutionData} catalogue={catalogue} initialPlanId={initialPlanId} />;
}
