-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_leaseId_fkey";

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "landlordId" TEXT,
ALTER COLUMN "leaseId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
