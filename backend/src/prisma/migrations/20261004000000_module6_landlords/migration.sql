-- Module 6: Landlord Management — owner statements, owner charges, payouts.
--
-- Also re-records the ON DELETE SET NULL behaviour of `audit_logs.userId` and
-- `documents.uploadedById`. Those columns were introduced by the Module 0/1
-- work with `db push`, so the live database has SET NULL while the migration
-- history still said CASCADE — a fresh database replayed from these migrations
-- drifted from the schema. Replaying the two statements keeps a rebuilt
-- database identical to the live one.

-- CreateEnum
CREATE TYPE "ManagementFeeType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "OwnerStatementStatus" AS ENUM ('DRAFT', 'ISSUED', 'SETTLED', 'VOID');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "ChargeCategory" AS ENUM ('MAINTENANCE', 'REPAIR', 'UTILITIES', 'INSURANCE', 'TAX', 'LEGAL', 'OTHER');

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_uploadedById_fkey";

-- AlterTable
ALTER TABLE "landlords" ADD COLUMN     "managementFeeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "managementFeeRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "managementFeeType" "ManagementFeeType" NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "owner_statements" (
    "id" TEXT NOT NULL,
    "statementNumber" TEXT NOT NULL,
    "organizationId" TEXT,
    "landlordId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "grossIncome" DECIMAL(14,2) NOT NULL,
    "expenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "managementFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "carriedForward" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPayout" DECIMAL(14,2) NOT NULL,
    "status" "OwnerStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "notes" TEXT,
    "incomeLines" JSONB NOT NULL,
    "expenseLines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "generatedBy" TEXT,

    CONSTRAINT "owner_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landlord_payouts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "landlordId" TEXT NOT NULL,
    "ownerStatementId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "landlord_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landlord_charges" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "landlordId" TEXT NOT NULL,
    "propertyId" TEXT,
    "category" "ChargeCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "chargeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerStatementId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "landlord_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_statements_statementNumber_key" ON "owner_statements"("statementNumber");

-- CreateIndex
CREATE INDEX "owner_statements_organizationId_idx" ON "owner_statements"("organizationId");

-- CreateIndex
CREATE INDEX "owner_statements_landlordId_idx" ON "owner_statements"("landlordId");

-- CreateIndex
CREATE INDEX "owner_statements_periodStart_periodEnd_idx" ON "owner_statements"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "owner_statements_status_idx" ON "owner_statements"("status");

-- CreateIndex
CREATE INDEX "landlord_payouts_organizationId_idx" ON "landlord_payouts"("organizationId");

-- CreateIndex
CREATE INDEX "landlord_payouts_landlordId_idx" ON "landlord_payouts"("landlordId");

-- CreateIndex
CREATE INDEX "landlord_payouts_ownerStatementId_idx" ON "landlord_payouts"("ownerStatementId");

-- CreateIndex
CREATE INDEX "landlord_payouts_status_idx" ON "landlord_payouts"("status");

-- CreateIndex
CREATE INDEX "landlord_charges_organizationId_idx" ON "landlord_charges"("organizationId");

-- CreateIndex
CREATE INDEX "landlord_charges_landlordId_idx" ON "landlord_charges"("landlordId");

-- CreateIndex
CREATE INDEX "landlord_charges_chargeDate_idx" ON "landlord_charges"("chargeDate");

-- CreateIndex
CREATE INDEX "landlord_charges_ownerStatementId_idx" ON "landlord_charges"("ownerStatementId");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_statements" ADD CONSTRAINT "owner_statements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_statements" ADD CONSTRAINT "owner_statements_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_payouts" ADD CONSTRAINT "landlord_payouts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_payouts" ADD CONSTRAINT "landlord_payouts_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_payouts" ADD CONSTRAINT "landlord_payouts_ownerStatementId_fkey" FOREIGN KEY ("ownerStatementId") REFERENCES "owner_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_charges" ADD CONSTRAINT "landlord_charges_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_charges" ADD CONSTRAINT "landlord_charges_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_charges" ADD CONSTRAINT "landlord_charges_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_charges" ADD CONSTRAINT "landlord_charges_ownerStatementId_fkey" FOREIGN KEY ("ownerStatementId") REFERENCES "owner_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;