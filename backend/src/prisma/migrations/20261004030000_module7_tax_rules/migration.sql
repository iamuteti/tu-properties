-- CreateEnum
CREATE TYPE "TaxBasis" AS ENUM ('EXCLUSIVE', 'INCLUSIVE');

-- CreateEnum
CREATE TYPE "TaxTreatment" AS ENUM ('CHARGED', 'WITHHELD');

-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN     "taxBasis" "TaxBasis",
ADD COLUMN     "taxCode" TEXT,
ADD COLUMN     "taxRuleId" TEXT,
ADD COLUMN     "taxTreatment" "TaxTreatment";

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "taxBasis" "TaxBasis",
ADD COLUMN     "taxJurisdiction" TEXT,
ADD COLUMN     "taxSummary" JSONB,
ADD COLUMN     "taxWithheldAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "taxCountryCode" CHAR(2),
ADD COLUMN     "taxRegionCode" TEXT,
ADD COLUMN     "taxRegistrationNumber" TEXT;

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "countryCode" CHAR(2),
    "regionCode" TEXT,
    "basis" "TaxBasis" NOT NULL DEFAULT 'EXCLUSIVE',
    "isCompound" BOOLEAN NOT NULL DEFAULT false,
    "compoundOnRuleId" TEXT,
    "rate" DECIMAL(7,4) NOT NULL,
    "ledgerAccountCode" TEXT DEFAULT '2100',
    "treatment" "TaxTreatment" NOT NULL DEFAULT 'CHARGED',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_rules_organizationId_idx" ON "tax_rules"("organizationId");

-- CreateIndex
CREATE INDEX "tax_rules_countryCode_idx" ON "tax_rules"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rules_organizationId_code_countryCode_validFrom_key" ON "tax_rules"("organizationId", "code", "countryCode", "validFrom");

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "tax_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_compoundOnRuleId_fkey" FOREIGN KEY ("compoundOnRuleId") REFERENCES "tax_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
