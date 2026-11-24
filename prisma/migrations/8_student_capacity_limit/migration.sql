ALTER TABLE "SubscriptionPlan"
ADD COLUMN "studentLimit" INTEGER;

ALTER TABLE "SubscriptionPlan"
ADD CONSTRAINT "SubscriptionPlan_studentLimit_positive_check"
CHECK ("studentLimit" IS NULL OR "studentLimit" > 0);
