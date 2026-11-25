BEGIN;

ALTER TABLE "Payment"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "providerPaymentId" TEXT;

CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key"
  ON "Payment" ("provider", "providerPaymentId");

CREATE UNIQUE INDEX "Payment_one_pending_payu_per_reservation_key"
  ON "Payment" ("reservationId") WHERE "provider" = 'PAYU_TEST' AND "status" = 'PENDING';

COMMIT;
