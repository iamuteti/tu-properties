-- CreateEnum
CREATE TYPE "TenantRequestType" AS ENUM ('RENEWAL', 'MOVE_OUT', 'PAYMENT_PLAN', 'MAINTENANT', 'LEASE_AMENDMENT');

-- CreateEnum
CREATE TYPE "TenantRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "tenant_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rentalAgreementId" TEXT,
    "type" "TenantRequestType" NOT NULL,
    "status" "TenantRequestStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "preferredDate" TIMESTAMP(3),
    "earlyNotice" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_requests_organizationId_status_idx" ON "tenant_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "tenant_requests_tenantId_status_idx" ON "tenant_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tenant_requests_rentalAgreementId_idx" ON "tenant_requests"("rentalAgreementId");

-- AddForeignKey
ALTER TABLE "tenant_requests" ADD CONSTRAINT "tenant_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_requests" ADD CONSTRAINT "tenant_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_requests" ADD CONSTRAINT "tenant_requests_rentalAgreementId_fkey" FOREIGN KEY ("rentalAgreementId") REFERENCES "rental_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_requests" ADD CONSTRAINT "tenant_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

