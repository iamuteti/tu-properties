-- Rename `rental_agreements` → `agreements` and `rentalAgreementId` → `agreementId`.
--
-- Data-preserving: no rows are dropped or recreated. This renames the table,
-- the foreign-key column on every referencing table, and all indexes and
-- foreign-key constraints that carry the old name. Check constraints whose
-- bodies reference `rentalAgreementId` are rewritten automatically by
-- PostgreSQL's `RENAME COLUMN` dependency tracking.

-- 1. Table
ALTER TABLE "rental_agreements" RENAME TO "agreements";

-- 2. Foreign-key column on each referencing table
ALTER TABLE "invoices" RENAME COLUMN "rentalAgreementId" TO "agreementId";
ALTER TABLE "payments" RENAME COLUMN "rentalAgreementId" TO "agreementId";
ALTER TABLE "inspection_reports" RENAME COLUMN "rentalAgreementId" TO "agreementId";
ALTER TABLE "move_out_requests" RENAME COLUMN "rentalAgreementId" TO "agreementId";
ALTER TABLE "tenant_requests" RENAME COLUMN "rentalAgreementId" TO "agreementId";
ALTER TABLE "commissions" RENAME COLUMN "rentalAgreementId" TO "agreementId";
ALTER TABLE "utility_charges" RENAME COLUMN "rentalAgreementId" TO "agreementId";
ALTER TABLE "contracts" RENAME COLUMN "rentalAgreementId" TO "agreementId";

-- 3. Indexes on the agreements table
ALTER INDEX "rental_agreements_code_key" RENAME TO "agreements_code_key";
ALTER INDEX "rental_agreements_unitId_idx" RENAME TO "agreements_unitId_idx";
ALTER INDEX "rental_agreements_tenantId_idx" RENAME TO "agreements_tenantId_idx";
ALTER INDEX "rental_agreements_status_idx" RENAME TO "agreements_status_idx";
ALTER INDEX "rental_agreements_startDate_idx" RENAME TO "agreements_startDate_idx";
ALTER INDEX "rental_agreements_endDate_idx" RENAME TO "agreements_endDate_idx";
ALTER INDEX "rental_agreements_organizationId_idx" RENAME TO "agreements_organizationId_idx";
ALTER INDEX "rental_agreements_renewedToId_key" RENAME TO "agreements_renewedToId_key";

-- 4. Indexes on referencing tables
ALTER INDEX "invoices_rentalAgreementId_idx" RENAME TO "invoices_agreementId_idx";
ALTER INDEX "payments_rentalAgreementId_idx" RENAME TO "payments_agreementId_idx";
ALTER INDEX "inspection_reports_rentalAgreementId_idx" RENAME TO "inspection_reports_agreementId_idx";
ALTER INDEX "move_out_requests_rentalAgreementId_idx" RENAME TO "move_out_requests_agreementId_idx";
ALTER INDEX "tenant_requests_rentalAgreementId_idx" RENAME TO "tenant_requests_agreementId_idx";
ALTER INDEX "contracts_rentalAgreementId_idx" RENAME TO "contracts_agreementId_idx";
ALTER INDEX "invoices_rentalAgreementId_billingPeriod_key" RENAME TO "invoices_agreementId_billingPeriod_key";

-- 5. Foreign-key constraints
ALTER TABLE "agreements" RENAME CONSTRAINT "rental_agreements_unitId_fkey" TO "agreements_unitId_fkey";
ALTER TABLE "agreements" RENAME CONSTRAINT "rental_agreements_tenantId_fkey" TO "agreements_tenantId_fkey";
ALTER TABLE "agreements" RENAME CONSTRAINT "rental_agreements_organizationId_fkey" TO "agreements_organizationId_fkey";
ALTER TABLE "agreements" RENAME CONSTRAINT "rental_agreements_renewedToId_fkey" TO "agreements_renewedToId_fkey";
ALTER TABLE "invoices" RENAME CONSTRAINT "invoices_rentalAgreementId_fkey" TO "invoices_agreementId_fkey";
ALTER TABLE "payments" RENAME CONSTRAINT "payments_rentalAgreementId_fkey" TO "payments_agreementId_fkey";
ALTER TABLE "inspection_reports" RENAME CONSTRAINT "inspection_reports_rentalAgreementId_fkey" TO "inspection_reports_agreementId_fkey";
ALTER TABLE "move_out_requests" RENAME CONSTRAINT "move_out_requests_rentalAgreementId_fkey" TO "move_out_requests_agreementId_fkey";
ALTER TABLE "tenant_requests" RENAME CONSTRAINT "tenant_requests_rentalAgreementId_fkey" TO "tenant_requests_agreementId_fkey";
ALTER TABLE "commissions" RENAME CONSTRAINT "commissions_rentalAgreementId_fkey" TO "commissions_agreementId_fkey";
ALTER TABLE "utility_charges" RENAME CONSTRAINT "utility_charges_rentalAgreementId_fkey" TO "utility_charges_agreementId_fkey";
ALTER TABLE "contracts" RENAME CONSTRAINT "contracts_rentalAgreementId_fkey" TO "contracts_agreementId_fkey";
