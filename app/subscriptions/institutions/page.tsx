import { SubscriptionSection } from "@/components/subscriptions/SubscriptionSection";
import { getPortalInstitutionList, getSubscriptionPortalScope } from "@/lib/subscriptions/portal-data";

export default async function InstitutionSubscriptionsPage() {
  const scope = await getSubscriptionPortalScope();
  const institutionData = await getPortalInstitutionList(scope);
  return <SubscriptionSection section="institutions" institutionData={institutionData} />;
}
