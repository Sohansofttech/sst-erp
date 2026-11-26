ALTER TABLE "SubscriptionPlan"
ADD COLUMN IF NOT EXISTS "studentLimit" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SubscriptionPlan_studentLimit_positive_check'
  ) THEN
    ALTER TABLE "SubscriptionPlan"
    ADD CONSTRAINT "SubscriptionPlan_studentLimit_positive_check"
    CHECK ("studentLimit" IS NULL OR "studentLimit" > 0);
  END IF;
END $$;
