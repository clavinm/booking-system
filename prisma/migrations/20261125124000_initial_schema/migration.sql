BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WorkspaceCity" AS ENUM ('Mangaluru', 'Bengaluru', 'Hubballi');

-- CreateEnum
CREATE TYPE "WorkspaceKind" AS ENUM ('coworking', 'library', 'study', 'private');

-- CreateEnum
CREATE TYPE "Amenity" AS ENUM ('wifi', 'power', 'ac', 'meeting', 'coffee', 'quiet');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(120) NOT NULL,
    "name" TEXT NOT NULL,
    "city" "WorkspaceCity" NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "kind" "WorkspaceKind" NOT NULL,
    "description" TEXT NOT NULL,
    "opensMinute" INTEGER NOT NULL,
    "closesMinute" INTEGER NOT NULL,
    "hourlyPricePaise" INTEGER NOT NULL,
    "ratingTenths" INTEGER NOT NULL,
    "sampleAvailableSeats" INTEGER NOT NULL,
    "amenities" "Amenity"[],
    "imageSrc" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "slotPricePaise" INTEGER NOT NULL,

    CONSTRAINT "SeatCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "gridRow" INTEGER NOT NULL,
    "gridColumn" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatSlot" (
    "seatId" UUID NOT NULL,
    "timeSlotId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "holdReservationId" UUID,
    "holdExpiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "SeatSlot_pkey" PRIMARY KEY ("seatId","timeSlotId")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "totalAmountPaise" INTEGER NOT NULL,
    "bookingReference" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservationId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "seatId" UUID NOT NULL,
    "timeSlotId" UUID NOT NULL,
    "seatCode" TEXT NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,

    CONSTRAINT "ReservationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAllocation" (
    "seatId" UUID NOT NULL,
    "timeSlotId" UUID NOT NULL,
    "reservationItemId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAllocation_pkey" PRIMARY KEY ("seatId","timeSlotId")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservationId" UUID NOT NULL,
    "attemptRef" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "operation" VARCHAR(60) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "requestId" TEXT,
    "instanceId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_city_published_idx" ON "Workspace"("city", "published");

-- CreateIndex
CREATE INDEX "Workspace_kind_published_idx" ON "Workspace"("kind", "published");

-- CreateIndex
CREATE INDEX "Workspace_amenities_idx" ON "Workspace" USING GIN ("amenities");

-- CreateIndex
CREATE UNIQUE INDEX "SeatCategory_workspaceId_name_key" ON "SeatCategory"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SeatCategory_id_workspaceId_key" ON "SeatCategory"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "Seat_categoryId_workspaceId_idx" ON "Seat"("categoryId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_workspaceId_code_key" ON "Seat"("workspaceId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_id_workspaceId_key" ON "Seat"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlot_workspaceId_startsAt_key" ON "TimeSlot"("workspaceId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlot_id_workspaceId_key" ON "TimeSlot"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "SeatSlot_timeSlotId_workspaceId_idx" ON "SeatSlot"("timeSlotId", "workspaceId");

-- CreateIndex
CREATE INDEX "SeatSlot_holdReservationId_idx" ON "SeatSlot"("holdReservationId");

-- CreateIndex
CREATE INDEX "SeatSlot_holdExpiresAt_idx" ON "SeatSlot"("holdExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeatSlot_seatId_timeSlotId_workspaceId_key" ON "SeatSlot"("seatId", "timeSlotId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_bookingReference_key" ON "Reservation"("bookingReference");

-- CreateIndex
CREATE INDEX "Reservation_userId_createdAt_idx" ON "Reservation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Reservation_status_expiresAt_idx" ON "Reservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Reservation_workspaceId_createdAt_idx" ON "Reservation"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_id_workspaceId_key" ON "Reservation"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "ReservationItem_seatId_timeSlotId_workspaceId_idx" ON "ReservationItem"("seatId", "timeSlotId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationItem_reservationId_seatId_timeSlotId_key" ON "ReservationItem"("reservationId", "seatId", "timeSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationItem_id_seatId_timeSlotId_key" ON "ReservationItem"("id", "seatId", "timeSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAllocation_reservationItemId_key" ON "BookingAllocation"("reservationItemId");

-- CreateIndex
CREATE INDEX "BookingAllocation_timeSlotId_idx" ON "BookingAllocation"("timeSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAllocation_item_pair_key" ON "BookingAllocation"("reservationItemId", "seatId", "timeSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_attemptRef_key" ON "Payment"("attemptRef");

-- CreateIndex
CREATE INDEX "Payment_reservationId_createdAt_idx" ON "Payment"("reservationId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_operation_key_key" ON "IdempotencyKey"("userId", "operation", "key");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "SeatCategory" ADD CONSTRAINT "SeatCategory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_categoryId_workspaceId_fkey" FOREIGN KEY ("categoryId", "workspaceId") REFERENCES "SeatCategory"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatSlot" ADD CONSTRAINT "SeatSlot_seatId_workspaceId_fkey" FOREIGN KEY ("seatId", "workspaceId") REFERENCES "Seat"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatSlot" ADD CONSTRAINT "SeatSlot_timeSlotId_workspaceId_fkey" FOREIGN KEY ("timeSlotId", "workspaceId") REFERENCES "TimeSlot"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatSlot" ADD CONSTRAINT "SeatSlot_holdReservationId_workspaceId_fkey" FOREIGN KEY ("holdReservationId", "workspaceId") REFERENCES "Reservation"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationItem" ADD CONSTRAINT "ReservationItem_reservationId_workspaceId_fkey" FOREIGN KEY ("reservationId", "workspaceId") REFERENCES "Reservation"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationItem" ADD CONSTRAINT "ReservationItem_seatId_timeSlotId_workspaceId_fkey" FOREIGN KEY ("seatId", "timeSlotId", "workspaceId") REFERENCES "SeatSlot"("seatId", "timeSlotId", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAllocation" ADD CONSTRAINT "BookingAllocation_seatId_timeSlotId_fkey" FOREIGN KEY ("seatId", "timeSlotId") REFERENCES "SeatSlot"("seatId", "timeSlotId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAllocation" ADD CONSTRAINT "BookingAllocation_reservationItemId_seatId_timeSlotId_fkey" FOREIGN KEY ("reservationItemId", "seatId", "timeSlotId") REFERENCES "ReservationItem"("id", "seatId", "timeSlotId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cross-field invariants that Prisma's schema does not express.
ALTER TABLE "User"
  ADD CONSTRAINT "User_email_normalized" CHECK ("email" = lower(btrim("email")));

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_opening_hours_check" CHECK (
    "opensMinute" >= 0 AND "closesMinute" <= 1440 AND "opensMinute" < "closesMinute"
    AND "opensMinute" % 30 = 0 AND "closesMinute" % 30 = 0
  ),
  ADD CONSTRAINT "Workspace_catalog_values_check" CHECK (
    "hourlyPricePaise" >= 0 AND "ratingTenths" BETWEEN 0 AND 50 AND "sampleAvailableSeats" >= 0
  );

ALTER TABLE "SeatCategory"
  ADD CONSTRAINT "SeatCategory_values_check" CHECK ("slotPricePaise" >= 0 AND "displayOrder" >= 0);

ALTER TABLE "Seat"
  ADD CONSTRAINT "Seat_grid_and_version_check" CHECK ("gridRow" > 0 AND "gridColumn" > 0 AND "version" >= 0);

ALTER TABLE "TimeSlot"
  ADD CONSTRAINT "TimeSlot_half_hour_check" CHECK (
    "endsAt" = "startsAt" + INTERVAL '30 minutes'
    AND mod(extract(epoch FROM "startsAt"), 1800) = 0
    AND "version" >= 0
  );

ALTER TABLE "SeatSlot"
  ADD CONSTRAINT "SeatSlot_hold_fields_check" CHECK (
    ("holdReservationId" IS NULL) = ("holdExpiresAt" IS NULL)
  );

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_amount_and_expiration_check" CHECK (
    "totalAmountPaise" >= 0 AND "expiresAt" > "createdAt"
  ),
  ADD CONSTRAINT "Reservation_confirmation_fields_check" CHECK (
    ("bookingReference" IS NULL) = ("confirmedAt" IS NULL)
    AND ("status" <> 'CONFIRMED' OR "confirmedAt" IS NOT NULL)
    AND ("status" = 'CANCELLED' OR "cancelledAt" IS NULL)
    AND ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
  );

ALTER TABLE "ReservationItem"
  ADD CONSTRAINT "ReservationItem_unit_price_check" CHECK ("unitPricePaise" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_check" CHECK ("amountPaise" >= 0);

CREATE UNIQUE INDEX "Payment_one_success_per_reservation_key"
  ON "Payment" ("reservationId") WHERE "status" = 'SUCCESS';

ALTER TABLE "IdempotencyKey"
  ADD CONSTRAINT "IdempotencyKey_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "IdempotencyKey_response_check" CHECK (
    ("status" = 'PROCESSING' AND "responseStatus" IS NULL AND "responseBody" IS NULL)
    OR ("status" = 'COMPLETED' AND "responseStatus" IS NOT NULL
        AND "responseStatus" BETWEEN 100 AND 599 AND "responseBody" IS NOT NULL)
  );

COMMIT;
