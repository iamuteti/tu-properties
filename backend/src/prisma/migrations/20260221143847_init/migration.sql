/*
  Warnings:

  - You are about to drop the column `receiptNumber` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `propertyTypeId` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `unitTypeId` on the `units` table. All the data in the column will be lost.
  - You are about to drop the `property_categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `property_types` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `unit_types` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ReceiptCategory" AS ENUM ('Rent', 'General');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('ApplyToBill', 'CashPayment');

-- CreateEnum
CREATE TYPE "ReceiptType" AS ENUM ('ApplyToInvoice', 'CashReceipt');

-- CreateEnum
CREATE TYPE "ReceiptTo" AS ENUM ('Landlord', 'GeneralLedger');

-- CreateEnum
CREATE TYPE "DRTOrDRF" AS ENUM ('DirectReceipt', 'DepositRefund');

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_leaseId_fkey";

-- DropForeignKey
ALTER TABLE "properties" DROP CONSTRAINT "properties_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "properties" DROP CONSTRAINT "properties_propertyTypeId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_unitTypeId_fkey";

-- DropIndex
DROP INDEX "payments_receiptNumber_key";

-- DropIndex
DROP INDEX "properties_categoryId_idx";

-- DropIndex
DROP INDEX "properties_propertyTypeId_idx";

-- DropIndex
DROP INDEX "units_unitTypeId_idx";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "receiptNumber",
ADD COLUMN     "attachments" TEXT,
ADD COLUMN     "chequeDate" TIMESTAMP(3),
ADD COLUMN     "chequeNumber" TEXT,
ADD COLUMN     "paidFrom" TEXT,
ADD COLUMN     "paidTo" TEXT,
ADD COLUMN     "payee" TEXT,
ADD COLUMN     "paymentType" "PaymentType" NOT NULL DEFAULT 'ApplyToBill',
ADD COLUMN     "receiptId" TEXT,
ADD COLUMN     "recordedBy" TEXT,
ADD COLUMN     "spotRate" DECIMAL(10,4),
ALTER COLUMN "leaseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "properties" DROP COLUMN "categoryId",
DROP COLUMN "propertyTypeId",
ADD COLUMN     "agencyRole" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "units" DROP COLUMN "unitTypeId";

-- DropTable
DROP TABLE "property_categories";

-- DropTable
DROP TABLE "property_types";

-- DropTable
DROP TABLE "unit_types";

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "receiptType" "ReceiptType" NOT NULL DEFAULT 'ApplyToInvoice',
    "receiptCategory" "ReceiptCategory" NOT NULL DEFAULT 'Rent',
    "receivedFrom" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "depositIntoAc" TEXT,
    "refNo" TEXT,
    "chequeNo" TEXT,
    "chequeDate" TIMESTAMP(3),
    "recordingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountReceived" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "tenantId" TEXT,
    "landlordId" TEXT,
    "recordDate" TIMESTAMP(3),
    "bankingDate" TIMESTAMP(3),
    "paymentRefNo" TEXT,
    "amountVatInclusive" BOOLEAN NOT NULL DEFAULT true,
    "receiptTo" "ReceiptTo" NOT NULL DEFAULT 'Landlord',
    "drtOrDrf" "DRTOrDRF" NOT NULL DEFAULT 'DepositRefund',
    "memo" TEXT,
    "paymentBank" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "spotRate" DECIMAL(10,4),
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_lines" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "invNo" TEXT,
    "particular" TEXT NOT NULL,
    "invoiceTotal" DECIMAL(10,2) NOT NULL,
    "prevReceipts" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amtDue" DECIMAL(10,2) NOT NULL,
    "payment" DECIMAL(10,2) NOT NULL,
    "newBalance" DECIMAL(10,2) NOT NULL,
    "whtTax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receiptId_key" ON "receipts"("receiptId");

-- CreateIndex
CREATE INDEX "receipts_tenantId_idx" ON "receipts"("tenantId");

-- CreateIndex
CREATE INDEX "receipts_landlordId_idx" ON "receipts"("landlordId");

-- CreateIndex
CREATE INDEX "receipts_receiptType_idx" ON "receipts"("receiptType");

-- CreateIndex
CREATE INDEX "receipts_receiptCategory_idx" ON "receipts"("receiptCategory");

-- CreateIndex
CREATE INDEX "receipts_recordingDate_idx" ON "receipts"("recordingDate");

-- CreateIndex
CREATE INDEX "receipts_paymentMethod_idx" ON "receipts"("paymentMethod");

-- CreateIndex
CREATE INDEX "receipts_organizationId_idx" ON "receipts"("organizationId");

-- CreateIndex
CREATE INDEX "receipt_lines_receiptId_idx" ON "receipt_lines"("receiptId");

-- CreateIndex
CREATE INDEX "payments_receiptId_idx" ON "payments"("receiptId");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
