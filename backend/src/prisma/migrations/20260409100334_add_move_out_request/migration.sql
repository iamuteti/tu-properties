-- CreateEnum
CREATE TYPE "MoveOutStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "ReceiptCategory" ADD VALUE 'Refund';

-- AlterTable
ALTER TABLE "rental_agreements" ADD COLUMN     "depositRefunded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "terminatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "move_out_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rentalAgreementId" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noticePeriodMonths" INTEGER NOT NULL,
    "approvalDate" TIMESTAMP(3),
    "approvedBy" TEXT,
    "status" "MoveOutStatus" NOT NULL DEFAULT 'PENDING',
    "depositRefunded" BOOLEAN NOT NULL DEFAULT false,
    "depositRefundAmount" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_out_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "move_out_requests_tenantId_idx" ON "move_out_requests"("tenantId");

-- CreateIndex
CREATE INDEX "move_out_requests_rentalAgreementId_idx" ON "move_out_requests"("rentalAgreementId");

-- CreateIndex
CREATE INDEX "move_out_requests_status_idx" ON "move_out_requests"("status");

-- AddForeignKey
ALTER TABLE "move_out_requests" ADD CONSTRAINT "move_out_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_requests" ADD CONSTRAINT "move_out_requests_rentalAgreementId_fkey" FOREIGN KEY ("rentalAgreementId") REFERENCES "rental_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
