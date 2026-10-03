-- CreateEnum
CREATE TYPE "SaleStage" AS ENUM ('QUOTATION', 'OFFER', 'RESERVATION', 'AGREEMENT', 'PAYMENT', 'HANDOVER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('SCHEDULED', 'INVOICED', 'PAID', 'OVERDUE', 'WAIVED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "saleTransactionId" TEXT;

-- CreateTable
CREATE TABLE "sale_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "propertyTitle" TEXT,
    "buyerContactId" TEXT,
    "leadId" TEXT,
    "agentUserId" TEXT,
    "stage" "SaleStage" NOT NULL DEFAULT 'QUOTATION',
    "askingPrice" DECIMAL(14,2),
    "agreedPrice" DECIMAL(14,2),
    "bookingFee" DECIMAL(14,2),
    "depositAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "commissionRate" DECIMAL(5,2),
    "quotationDate" TIMESTAMP(3),
    "offerDate" TIMESTAMP(3),
    "reservationDate" TIMESTAMP(3),
    "agreementDate" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "handoverDate" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sale_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_installments" (
    "id" TEXT NOT NULL,
    "saleTransactionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "invoiceId" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleTransactionId" TEXT,
    "rentalAgreementId" TEXT,
    "agentUserId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "splitPercentage" DECIMAL(5,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "basis" TEXT NOT NULL DEFAULT 'SALE',
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_transactions_code_key" ON "sale_transactions"("code");

-- CreateIndex
CREATE INDEX "sale_transactions_organizationId_idx" ON "sale_transactions"("organizationId");

-- CreateIndex
CREATE INDEX "sale_transactions_stage_idx" ON "sale_transactions"("stage");

-- CreateIndex
CREATE INDEX "sale_transactions_propertyId_idx" ON "sale_transactions"("propertyId");

-- CreateIndex
CREATE INDEX "sale_transactions_buyerContactId_idx" ON "sale_transactions"("buyerContactId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_installments_invoiceId_key" ON "sale_installments"("invoiceId");

-- CreateIndex
CREATE INDEX "sale_installments_saleTransactionId_idx" ON "sale_installments"("saleTransactionId");

-- CreateIndex
CREATE INDEX "sale_installments_status_idx" ON "sale_installments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sale_installments_saleTransactionId_sequence_key" ON "sale_installments"("saleTransactionId", "sequence");

-- CreateIndex
CREATE INDEX "commissions_organizationId_idx" ON "commissions"("organizationId");

-- CreateIndex
CREATE INDEX "commissions_saleTransactionId_idx" ON "commissions"("saleTransactionId");

-- CreateIndex
CREATE INDEX "commissions_agentUserId_idx" ON "commissions"("agentUserId");

-- CreateIndex
CREATE INDEX "commissions_status_idx" ON "commissions"("status");

-- CreateIndex
CREATE INDEX "invoices_saleTransactionId_idx" ON "invoices"("saleTransactionId");

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_buyerContactId_fkey" FOREIGN KEY ("buyerContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_installments" ADD CONSTRAINT "sale_installments_saleTransactionId_fkey" FOREIGN KEY ("saleTransactionId") REFERENCES "sale_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_installments" ADD CONSTRAINT "sale_installments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_saleTransactionId_fkey" FOREIGN KEY ("saleTransactionId") REFERENCES "sale_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_rentalAgreementId_fkey" FOREIGN KEY ("rentalAgreementId") REFERENCES "rental_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_saleTransactionId_fkey" FOREIGN KEY ("saleTransactionId") REFERENCES "sale_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

