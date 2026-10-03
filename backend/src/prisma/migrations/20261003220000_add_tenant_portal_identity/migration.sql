-- AlterTable
ALTER TABLE "users" ADD COLUMN     "portalTenantId" TEXT;

-- CreateIndex
CREATE INDEX "users_portalTenantId_idx" ON "users"("portalTenantId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_portalTenantId_fkey" FOREIGN KEY ("portalTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

