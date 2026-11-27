import { SubscriptionSection } from "@/components/subscriptions/SubscriptionSection";
import { getPortalPaymentList, getSubscriptionPortalScope } from "@/lib/subscriptions/portal-data";

export const instant = false;

export default async function SubscriptionPaymentsPage() {
  const scope = await getSubscriptionPortalScope();
  const paymentData = await getPortalPaymentList(scope);
  return <SubscriptionSection section="payments" paymentData={paymentData} />;
}
