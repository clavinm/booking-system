BEGIN;

ALTER TABLE "Payment"
  ADD COLUMN "checkoutAccessKey" TEXT,
  ADD COLUMN "checkoutClaimedAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "Payment_one_pending_easebuzz_per_reservation_key"
  ON "Payment" ("reservationId") WHERE "provider" = 'EASEBUZZ_TEST' AND "status" = 'PENDING';

COMMIT;
