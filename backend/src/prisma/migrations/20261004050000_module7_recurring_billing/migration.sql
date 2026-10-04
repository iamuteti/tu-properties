-- CreateEnum
CREATE TYPE "RecurringRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "billingPeriod" TEXT;

-- CreateTable
CREATE TABLE "recurring_billing_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "billingDate" TIMESTAMP(3) NOT NULL,
    "billingPeriod" TEXT NOT NULL,
    "invoicesCreated" INTEGER NOT NULL DEFAULT 0,
    "leasesSkipped" INTEGER NOT NULL DEFAULT 0,
    "leasesFailed" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "status" "RecurringRunStatus" NOT NULL DEFAULT 'COMPLETED',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "triggeredBy" TEXT,

    CONSTRAINT "recurring_billing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_billing_runs_organizationId_idx" ON "recurring_billing_runs"("organizationId");

-- CreateIndex
CREATE INDEX "recurring_billing_runs_billingPeriod_idx" ON "recurring_billing_runs"("billingPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_rentalAgreementId_billingPeriod_key" ON "invoices"("rentalAgreementId", "billingPeriod");

-- AddForeignKey
ALTER TABLE "recurring_billing_runs" ADD CONSTRAINT "recurring_billing_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
