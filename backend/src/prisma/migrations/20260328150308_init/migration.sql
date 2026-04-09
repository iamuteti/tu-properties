/*
  Warnings:

  - You are about to drop the column `leaseId` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `leaseId` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the `leases` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('LEASE', 'RENTAL');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED');

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_leaseId_fkey";

-- DropForeignKey
ALTER TABLE "leases" DROP CONSTRAINT "leases_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "leases" DROP CONSTRAINT "leases_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "leases" DROP CONSTRAINT "leases_unitId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_leaseId_fkey";

-- DropIndex
DROP INDEX "invoices_leaseId_idx";

-- DropIndex
DROP INDEX "payments_leaseId_idx";

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "leaseId",
ADD COLUMN     "rentalAgreementId" TEXT;

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "leaseId",
ADD COLUMN     "rentalAgreementId" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';

-- DropTable
DROP TABLE "leases";

-- DropEnum
DROP TYPE "LeaseStatus";

-- CreateTable
CREATE TABLE "rental_agreements" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agreementType" "AgreementType" NOT NULL DEFAULT 'RENTAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "rentAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "paymentDay" INTEGER NOT NULL DEFAULT 1,
    "termMonths" INTEGER,
    "securityDeposit" DECIMAL(10,2),
    "escalationRate" DECIMAL(5,2),
    "escalationMonth" INTEGER,
    "noticePeriodDays" INTEGER,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "rental_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rental_agreements_code_key" ON "rental_agreements"("code");

-- CreateIndex
CREATE INDEX "rental_agreements_unitId_idx" ON "rental_agreements"("unitId");

-- CreateIndex
CREATE INDEX "rental_agreements_tenantId_idx" ON "rental_agreements"("tenantId");

-- CreateIndex
CREATE INDEX "rental_agreements_status_idx" ON "rental_agreements"("status");

-- CreateIndex
CREATE INDEX "rental_agreements_startDate_idx" ON "rental_agreements"("startDate");

-- CreateIndex
CREATE INDEX "rental_agreements_endDate_idx" ON "rental_agreements"("endDate");

-- CreateIndex
CREATE INDEX "rental_agreements_organizationId_idx" ON "rental_agreements"("organizationId");

-- CreateIndex
CREATE INDEX "invoices_rentalAgreementId_idx" ON "invoices"("rentalAgreementId");

-- CreateIndex
CREATE INDEX "payments_rentalAgreementId_idx" ON "payments"("rentalAgreementId");

-- AddForeignKey
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rentalAgreementId_fkey" FOREIGN KEY ("rentalAgreementId") REFERENCES "rental_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_rentalAgreementId_fkey" FOREIGN KEY ("rentalAgreementId") REFERENCES "rental_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
