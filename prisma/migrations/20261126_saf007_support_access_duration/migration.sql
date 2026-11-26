-- SAF-007: store the requested support-access duration so the approval window
-- is not consumed while a request is awaiting second-person approval.
-- Additive and backfill-safe: existing rows receive the default (60 minutes).
ALTER TABLE "SupportAccessSession" ADD COLUMN "requestedDurationMinutes" INTEGER NOT NULL DEFAULT 60;

-- Guard against invalid durations at the database layer (1..480 minutes inclusive).
ALTER TABLE "SupportAccessSession"
  ADD CONSTRAINT "SupportAccessSession_requestedDurationMinutes_check"
  CHECK ("requestedDurationMinutes" >= 1 AND "requestedDurationMinutes" <= 480);