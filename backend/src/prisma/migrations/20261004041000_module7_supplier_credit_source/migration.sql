-- AlterTable
ALTER TABLE "supplier_credits" ADD COLUMN     "sourcePaymentId" TEXT;

-- AddForeignKey
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "bill_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
