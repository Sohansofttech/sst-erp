import { PlanManagement } from "@/components/subscriptions/Management";
import { getSubscriptionPortalScope } from "@/lib/subscriptions/portal-data";
import { getPlanCatalogue } from "@/lib/subscriptions/management-data";
import { isPlanCompatible } from "@/lib/institution-type-config";
import db from "@/lib/db";

export const instant = false;

export default async function SubscriptionPlansPage() {
  const scope = await getSubscriptionPortalScope();
  const catalogue = await getPlanCatalogue();
  if (scope.role === "INSTITUTION_ADMIN") {
    // Institution Admins only see published plans that are available for their own (database-stored) institution type.
    const institution = await db.platformInstitution.findUnique({ where: { id: scope.institutionId }, select: { type: true } });
    return <PlanManagement readOnly catalogue={{ ...catalogue, plans: catalogue.plans.filter((plan) => plan.isActive && isPlanCompatible(plan.institutionTypes, institution?.type)) }} />;
  }
  return <PlanManagement catalogue={catalogue} />;
}
