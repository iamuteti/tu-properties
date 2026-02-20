-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN     "className" TEXT,
ADD COLUMN     "incomeAccount" TEXT,
ADD COLUMN     "revenueExpenseItem" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "acReceivable" TEXT,
ADD COLUMN     "billTo" TEXT,
ADD COLUMN     "lpoNumber" TEXT,
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "paymentInfo" TEXT,
ADD COLUMN     "signOnEfims" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "spotRate" DECIMAL(10,4),
ADD COLUMN     "termsConditions" TEXT,
ADD COLUMN     "transactionClass" TEXT;
