-- CreateEnum
CREATE TYPE "DeductionCategory" AS ENUM ('DAMAGE', 'CLEANING', 'UNPAID_RENT', 'LATE_FEE', 'UTILITY', 'REPAIRS', 'OTHER');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('MOVE_IN', 'PERIODIC', 'MOVE_OUT', 'ANNUAL');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'COMPLETED', 'VOID');

-- CreateEnum
CREATE TYPE "ConditionRating" AS ENUM ('GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- AlterTable
ALTER TABLE "move_out_requests" ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedById" TEXT;

-- AlterTable
ALTER TABLE "rental_agreements" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "expiredAt" TIMESTAMP(3),
ADD COLUMN     "renewedFromId" TEXT,
ADD COLUMN     "renewedToId" TEXT,
ADD COLUMN     "terminatedReason" TEXT;

-- CreateTable
CREATE TABLE "move_out_deductions" (
    "id" TEXT NOT NULL,
    "moveOutRequestId" TEXT NOT NULL,
    "category" "DeductionCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "approvedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_out_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_reports" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "rentalAgreementId" TEXT,
    "type" "InspectionType" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "notes" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_items" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "condition" "ConditionRating" NOT NULL,
    "notes" TEXT,
    "estimatedCost" DECIMAL(10,2),
    "requiresAction" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agreementType" "AgreementType" NOT NULL DEFAULT 'RENTAL',
    "rentAmount" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "securityDeposit" DECIMAL(10,2),
    "termMonths" INTEGER,
    "noticePeriodDays" INTEGER NOT NULL DEFAULT 30,
    "escalationRate" DECIMAL(5,2),
    "paymentDay" INTEGER NOT NULL DEFAULT 1,
    "termsBody" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "move_out_deductions_moveOutRequestId_idx" ON "move_out_deductions"("moveOutRequestId");

-- CreateIndex
CREATE INDEX "move_out_deductions_category_idx" ON "move_out_deductions"("category");

-- CreateIndex
CREATE INDEX "inspection_reports_unitId_idx" ON "inspection_reports"("unitId");

-- CreateIndex
CREATE INDEX "inspection_reports_rentalAgreementId_idx" ON "inspection_reports"("rentalAgreementId");

-- CreateIndex
CREATE INDEX "inspection_reports_status_idx" ON "inspection_reports"("status");

-- CreateIndex
CREATE INDEX "inspection_reports_organizationId_idx" ON "inspection_reports"("organizationId");

-- CreateIndex
CREATE INDEX "inspection_items_reportId_idx" ON "inspection_items"("reportId");

-- CreateIndex
CREATE INDEX "lease_templates_organizationId_idx" ON "lease_templates"("organizationId");

-- CreateIndex
CREATE INDEX "lease_templates_isActive_idx" ON "lease_templates"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "rental_agreements_renewedToId_key" ON "rental_agreements"("renewedToId");

-- AddForeignKey
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_renewedToId_fkey" FOREIGN KEY ("renewedToId") REFERENCES "rental_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_deductions" ADD CONSTRAINT "move_out_deductions_moveOutRequestId_fkey" FOREIGN KEY ("moveOutRequestId") REFERENCES "move_out_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_deductions" ADD CONSTRAINT "move_out_deductions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_rentalAgreementId_fkey" FOREIGN KEY ("rentalAgreementId") REFERENCES "rental_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "inspection_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_templates" ADD CONSTRAINT "lease_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_out_requests" ADD CONSTRAINT "move_out_requests_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

