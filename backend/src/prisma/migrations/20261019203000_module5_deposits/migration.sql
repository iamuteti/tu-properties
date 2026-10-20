-- Module 5 — deposits: the property's own unit types, and the deposit rule
-- that hangs off each of them.
--
-- Hand-maintained, not generated as-is. `prisma migrate diff` proposed dropping
-- two indexes that no migration in this repository creates and that Prisma
-- cannot express:
--
--   notifications_landlordId_readAt_idx   — the read marker on a notification
--   utility_charges_no_double_bill_bulk  — the partial unique index that stops
--                                           a utility charge being billed twice
--
-- Both are created by their own raw-SQL migrations and every generated
-- migration proposes dropping them. Those two DROP INDEX statements have been
-- removed from this file on purpose. Verify after applying:
--
--   SELECT indexname FROM pg_indexes
--    WHERE indexname IN ('notifications_landlordId_readAt_idx',
--                         'utility_charges_no_double_bill_bulk');

-- AlterEnum
ALTER TYPE "DeductionCategory" ADD VALUE 'MAINTENANCE';

-- AlterTable
ALTER TABLE "agreements" ADD COLUMN     "depositAdjustment" DECIMAL(10,2),
ADD COLUMN     "depositRuleAmount" DECIMAL(10,2),
ADD COLUMN     "depositWaived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "depositWaivedAt" TIMESTAMP(3),
ADD COLUMN     "depositWaivedById" TEXT,
ADD COLUMN     "depositWaiverReason" TEXT;

-- AlterTable
ALTER TABLE "units" DROP COLUMN "type",
ADD COLUMN     "unitTypeId" TEXT;

-- DropTable
-- `property_security_deposits` is replaced by `property_deposit_rules`: the old
-- table had one value and four booleans and no per-unit-type key, so it could
-- not say "this kind of unit takes no deposit", and it had no rows anywhere.
DROP TABLE "property_security_deposits";

-- CreateTable
CREATE TABLE "property_unit_types" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_unit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_deposit_rules" (
    "id" TEXT NOT NULL,
    "unitTypeId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'FIXED',
    "months" DECIMAL(4,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_deposit_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_unit_types_propertyId_idx" ON "property_unit_types"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "property_unit_types_propertyId_code_key" ON "property_unit_types"("propertyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "property_deposit_rules_unitTypeId_key" ON "property_deposit_rules"("unitTypeId");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "property_unit_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_unit_types" ADD CONSTRAINT "property_unit_types_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_deposit_rules" ADD CONSTRAINT "property_deposit_rules_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "property_unit_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
