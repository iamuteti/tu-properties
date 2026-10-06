-- Module 14 - Utilities.
--
-- Four tables: the meter register, the readings taken off it, the tariff table
-- the readings are priced with, and the charge that ties the three together and
-- records which invoice carries it. The reasoning for each is in the model
-- comments in schema.prisma; the part that has to live *here* is at the bottom.
--
-- This migration also reshapes the pre-existing `unit_meter_numbers` table into
-- `utility_meters` rather than creating a fifth table beside it. `UnitMeterNumber`
-- held a `meterNo` and a `readingSetup` string and nothing else - no type, no
-- property, no readings, no rate - and it had zero rows. A table with zero rows is
-- not dead code to be preserved out of caution, it is an unfinished sentence; and
-- two "meter" tables is how an estate ends up with two halves of the truth and no
-- way to reconcile them (the same defect this schema already has for `Supplier`,
-- where Module 10 had to notice and not duplicate).

-- ============================================================ enums

-- CreateEnum
CREATE TYPE "UtilityType" AS ENUM ('WATER', 'ELECTRICITY', 'GAS', 'SEWAGE');

-- CreateEnum
CREATE TYPE "MeterScope" AS ENUM ('SUBMETER', 'BULK');

-- CreateEnum
CREATE TYPE "ApportionmentMethod" AS ENUM ('AREA', 'EQUAL', 'OCCUPANCY', 'MANUAL');

-- CreateEnum
CREATE TYPE "MeterStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "MeterReadingSource" AS ENUM ('MANUAL', 'SMART', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "UtilityChargeStatus" AS ENUM ('PENDING', 'INVOICED', 'VOID');

-- ============================================================ the old meter registry

-- DropForeignKey
ALTER TABLE "unit_meter_numbers" DROP CONSTRAINT "unit_meter_numbers_unitId_fkey";

-- DropTable
DROP TABLE "unit_meter_numbers";

-- ============================================================ tables

-- CreateTable
CREATE TABLE "utility_meters" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "type" "UtilityType" NOT NULL,
    "meterNumber" TEXT NOT NULL,
    "serialNumber" TEXT,
    "source" "MeterReadingSource" NOT NULL DEFAULT 'MANUAL',
    "scope" "MeterScope" NOT NULL DEFAULT 'SUBMETER',
    "apportionmentMethod" "ApportionmentMethod",
    "apportionmentWeights" JSONB,
    "digits" INTEGER,
    "digitWrapAt" INTEGER,
    "lastBilledThrough" TIMESTAMP(3),
    "status" "MeterStatus" NOT NULL DEFAULT 'ACTIVE',
    "readingSetup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utility_meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "readingDate" TIMESTAMP(3) NOT NULL,
    "reading" DECIMAL(12,2) NOT NULL,
    "source" "MeterReadingSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_rates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meterId" TEXT,
    "propertyId" TEXT,
    "type" "UtilityType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "ratePerUnit" DECIMAL(12,4) NOT NULL,
    "standingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prorateStandingCharge" BOOLEAN NOT NULL DEFAULT false,
    "purchaseCurrency" TEXT DEFAULT 'KES',
    "spotRate" DECIMAL(12,4),
    "vatRate" DECIMAL(5,2),
    "incomeAccount" TEXT,
    "revenueExpenseItem" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utility_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_charges" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "unitId" TEXT,
    "rentalAgreementId" TEXT,
    "fromReadingId" TEXT NOT NULL,
    "toReadingId" TEXT NOT NULL,
    "rateId" TEXT,
    "ratePerUnit" DECIMAL(12,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "spotRate" DECIMAL(12,4),
    "vatRate" DECIMAL(5,2),
    "incomeAccount" TEXT,
    "revenueExpenseItem" TEXT,
    "allocationShare" DECIMAL(12,6) NOT NULL DEFAULT 1,
    "allocationBasis" TEXT,
    "billingPeriod" TEXT NOT NULL,
    "invoiceId" TEXT,
    "status" "UtilityChargeStatus" NOT NULL DEFAULT 'PENDING',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utility_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "utility_meters_organizationId_idx" ON "utility_meters"("organizationId");

-- CreateIndex
CREATE INDEX "utility_meters_propertyId_idx" ON "utility_meters"("propertyId");

-- CreateIndex
CREATE INDEX "utility_meters_unitId_idx" ON "utility_meters"("unitId");

-- CreateIndex
CREATE INDEX "utility_meters_type_status_idx" ON "utility_meters"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "utility_meters_organizationId_type_meterNumber_key" ON "utility_meters"("organizationId", "type", "meterNumber");

-- CreateIndex
CREATE INDEX "meter_readings_organizationId_idx" ON "meter_readings"("organizationId");

-- CreateIndex
CREATE INDEX "meter_readings_meterId_readingDate_idx" ON "meter_readings"("meterId", "readingDate");

-- CreateIndex
CREATE INDEX "meter_readings_readingDate_idx" ON "meter_readings"("readingDate");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_meterId_readingDate_key" ON "meter_readings"("meterId", "readingDate");

-- CreateIndex
CREATE INDEX "utility_rates_organizationId_type_validFrom_idx" ON "utility_rates"("organizationId", "type", "validFrom");

-- CreateIndex
CREATE INDEX "utility_rates_meterId_idx" ON "utility_rates"("meterId");

-- CreateIndex
CREATE INDEX "utility_rates_propertyId_idx" ON "utility_rates"("propertyId");

-- CreateIndex
CREATE INDEX "utility_charges_organizationId_idx" ON "utility_charges"("organizationId");

-- CreateIndex
CREATE INDEX "utility_charges_billingPeriod_idx" ON "utility_charges"("billingPeriod");

-- CreateIndex
CREATE INDEX "utility_charges_invoiceId_idx" ON "utility_charges"("invoiceId");

-- CreateIndex
CREATE INDEX "utility_charges_unitId_idx" ON "utility_charges"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "utility_charges_meterId_unitId_billingPeriod_key" ON "utility_charges"("meterId", "unitId", "billingPeriod");

-- AddForeignKey
ALTER TABLE "utility_meters" ADD CONSTRAINT "utility_meters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_meters" ADD CONSTRAINT "utility_meters_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_meters" ADD CONSTRAINT "utility_meters_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "utility_meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_rates" ADD CONSTRAINT "utility_rates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_rates" ADD CONSTRAINT "utility_rates_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "utility_meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_rates" ADD CONSTRAINT "utility_rates_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_charges" ADD CONSTRAINT "utility_charges_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_charges" ADD CONSTRAINT "utility_charges_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "utility_meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_charges" ADD CONSTRAINT "utility_charges_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_charges" ADD CONSTRAINT "utility_charges_rentalAgreementId_fkey" FOREIGN KEY ("rentalAgreementId") REFERENCES "rental_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_charges" ADD CONSTRAINT "utility_charges_fromReadingId_fkey" FOREIGN KEY ("fromReadingId") REFERENCES "meter_readings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_charges" ADD CONSTRAINT "utility_charges_toReadingId_fkey" FOREIGN KEY ("toReadingId") REFERENCES "meter_readings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_charges" ADD CONSTRAINT "utility_charges_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "utility_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_charges" ADD CONSTRAINT "utility_charges_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_charges" ADD CONSTRAINT "utility_charges_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================ what has to be true, not merely typed
--
-- Everything above this line is what Prisma can express. Everything below it is a
-- rule the acceptance criterion depends on, and it is here because Prisma cannot
-- write it.

-- The module's central refusal: a bulk meter cannot be billed until the estate has
-- said how its consumption is divided.
--
-- Splitting a riser meter twenty ways is a *decision*, not a computation - area,
-- headcount, occupancy days and a negotiated fixed split are all defensible and all
-- produce different bills. So the method is stored as data and a bulk meter with no
-- method is not a meter with a default, it is a meter nobody has decided about.
--
-- The constraint covers all three halves, not just "bulk implies method": a sub-meter
-- must NOT carry a method (there is nothing to divide, so a method on one is either
-- a mistake or a bulk meter that was registered as a sub-meter), and a bulk meter
-- must not carry a `unitId` (`scope` is what says it feeds many units; a bulk meter
-- with exactly one unit is a contradiction, and leaving it permitted is how a bulk
-- meter silently starts behaving like a sub-meter and bills one resident for
-- everybody's water).
ALTER TABLE "utility_meters"
    ADD CONSTRAINT "utility_meters_bulk_needs_method"
    CHECK (
        (
            "scope" = 'BULK'
            AND "unitId" IS NULL
            AND "apportionmentMethod" IS NOT NULL
        )
        OR
        (
            "scope" = 'SUBMETER'
            AND "apportionmentMethod" IS NULL
        )
    );

-- `MANUAL` apportionment without weights is a refusal waiting to happen: the method
-- says "use the negotiated split" and the split is not there, so the only thing the
-- code can do is guess. Better that the row cannot exist.
ALTER TABLE "utility_meters"
    ADD CONSTRAINT "utility_meters_manual_needs_weights"
    CHECK (
        "apportionmentMethod" <> 'MANUAL'
        OR "apportionmentWeights" IS NOT NULL
    );

-- Rollover configuration has to be internally consistent, because the consumption
-- arithmetic trusts it.
--
-- A 5-digit electromechanical register reading 99998 and then 00003 has consumed 5
-- units; naive subtraction returns -99995, which metered onto an invoice is a
-- five-figure credit. `digitWrapAt` is what makes the subtraction safe, and if it
-- disagrees with `digits` the arithmetic is wrong in a way that looks like a valid
-- number. So `digitWrapAt` must be exactly 10 ** `digits`, and either both columns
-- are set or neither is.
--
-- Both are nullable on purpose: NULL disables rollover handling entirely, so the
-- overwhelming majority of meters - which are read as plain increasing numbers - get
-- the cheaper path and cannot be affected by this logic at all. Opt-in special
-- casing beats always-on, because an always-on rollover fix is a permanent risk paid
-- for an edge case.
ALTER TABLE "utility_meters"
    ADD CONSTRAINT "utility_meters_rollover_consistent"
    CHECK (
        ("digits" IS NULL AND "digitWrapAt" IS NULL)
        OR (
            "digits" > 0
            AND "digitWrapAt" = power(10::numeric, "digits"::numeric)
        )
    );

-- The exactly-once guard, completed.
--
-- `utility_charges_meterId_unitId_billingPeriod_key` above is the load-bearing
-- constraint of the whole module: billing the same meter to the same unit for the
-- same period twice hands a resident two bills for one month's water. It is in the
-- database rather than in a `findFirst` because two concurrent requests both pass a
-- `findFirst` - the Module 13 lesson, applied up front rather than after a race was
-- found.
--
-- But a nullable column inside a unique index is a constraint with a hole in it, and
-- the hole sits on whichever case made the column nullable. Here that case is BULK
-- meters: they have no `unitId` by definition, and PostgreSQL treats NULLs as
-- distinct in a unique index, so the index above does not apply to them at all. In
-- other words the guard is weakest precisely where the estate is most likely to be
-- re-selling water.
--
-- This partial index closes it, and is complementary rather than redundant: it only
-- covers rows where `unitId IS NULL`, which the index above does not constrain.
--
-- A partial index rather than a unique index on `COALESCE("unitId",'')`: the COALESCE
-- form has to be materialised for every row including the overwhelming submeter
-- majority, whereas this only carries the bulk charges it actually constrains - and
-- `COALESCE` on the unique key would also be invisible to Prisma's schema diff,
-- whereas this can be read on its own.
CREATE UNIQUE INDEX "utility_charges_no_double_bill_bulk"
    ON "utility_charges" ("meterId", "billingPeriod")
    WHERE "unitId" IS NULL;

-- A unit cannot be billed more than the whole meter. A share of 1.4 means the
-- arithmetic has double-counted somebody, and it is cheaper to refuse the row than
-- to issue a resident an invoice for more water than the building used.
--
-- 0 is refused too: a zero share produces a free-but-invoiceable line, which is how
-- a nil-rated utility line ends up on a resident's statement looking like a mistake.
ALTER TABLE "utility_charges"
    ADD CONSTRAINT "utility_charges_share_in_range"
    CHECK ("allocationShare" > 0 AND "allocationShare" <= 1);

-- `INVOICED` has to mean an invoice exists. This is the same "the status and the
-- fact must agree" rule this codebase keeps arriving at - a status that can claim
-- something the row does not have is a status that lies on exactly the screen
-- somebody reads when they are chasing money.
ALTER TABLE "utility_charges"
    ADD CONSTRAINT "utility_charges_invoiced_has_invoice"
    CHECK ("status" <> 'INVOICED' OR "invoiceId" IS NOT NULL);

-- `billingPeriod` is the period key this module uses in place of
-- `Invoice.billingPeriod` (which a utility invoice must not claim - see the schema
-- comment on `UtilityCharge.billingPeriod` and master doc issue 102), so it has to
-- actually be a month. A free-text period here would quietly break the uniqueness
-- that this column exists to support.
ALTER TABLE "utility_charges"
    ADD CONSTRAINT "utility_charges_period_is_month"
    CHECK ("billingPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
