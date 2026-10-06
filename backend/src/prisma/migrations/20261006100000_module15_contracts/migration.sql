-- Module 15 - Documents & Legal: the contract register.
--
-- One new table. The `documents` table is left alone on purpose: the Document Center
-- already exists, already versions a re-upload, and already attaches a file to any
-- entity through its `(entityType, entityId)` pair. Adding a second file store beside
-- it is the defect this schema has already committed once with `landlordId`/`tenantId`
-- and once with `Supplier`, so `Contract` points at `Document` instead.
--
-- A contract's addenda and riders need no schema at all - they hang off
-- `('CONTRACT', <contractId>)` like every other attachment in this system. The
-- `documentId` column is only the *authoritative* copy, the signed agreement.

CREATE TYPE "ContractType" AS ENUM ('LEASE', 'SALE', 'VENDOR', 'MANAGEMENT', 'COMPLIANCE');

CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ContractType" NOT NULL DEFAULT 'VENDOR',

    "rentalAgreementId" TEXT,
    "saleTransactionId" TEXT,
    "supplierId" TEXT,
    "landlordId" TEXT,
    "documentId" TEXT,

    "startDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "noticeDays" INTEGER,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "renewalOfId" TEXT,
    "notes" TEXT,

    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- ── The reference ──────────────────────────────────────────────────────────
--
-- Contracts get cited in disputes, in letters and in court, so `CON-0001` has to be a
-- thing a person can name. Scoped per organization rather than globally: two
-- organizations in this system are separate businesses that both started their
-- contracts at CON-0001, and forcing a global sequence would leak one tenant's
-- document numbering to another.
CREATE UNIQUE INDEX "contracts_organizationId_reference_key" ON "contracts"("organizationId", "reference");

-- ── One related entity, or none ─────────────────────────────────────────────
--
-- Four typed foreign keys instead of the module doc's `relatedEntityType String` /
-- `relatedEntityId String` pair. That pair is a polymorphic reference with no
-- referential integrity at all: it can name a row that never existed or was deleted
-- yesterday, nothing cascades, and every read has to hand-resolve the type.
--
-- The constraint is **at most one**, not exactly one, and the exception is
-- `COMPLIANCE`. A gas safety certificate, a fire inspection, a lift maintenance
-- licence - these are the most compliance-critical instruments in the set and they
-- have no counterparty at all, because the obligation runs to the authority rather
-- than to a tenant or a supplier. A schema that *requires* a related entity cannot
-- represent them, which is why `COMPLIANCE` exists and why this check permits zero.
--
-- `num_nonnulls()` counts the set columns in one call, which is the only way to
-- express "at most one of these" without writing it out as a long OR-chain - and a
-- long OR-chain over nullable columns is exactly the shape that evaluates to NULL and
-- silently passes (see Module 14's `utility_meters_rollover_consistent`, which did
-- exactly that).
ALTER TABLE "contracts"
    ADD CONSTRAINT "contracts_one_related_entity"
    CHECK (
        CASE
            WHEN "type" = 'COMPLIANCE' THEN num_nonnulls("rentalAgreementId", "saleTransactionId", "supplierId", "landlordId") <= 1
            ELSE num_nonnulls("rentalAgreementId", "saleTransactionId", "supplierId", "landlordId") = 1
        END
    );

-- A COMPLIANCE certificate attached to a tenant is a category error, and the check
-- above permits it (zero *or* one). This is the pair that makes the categories
-- distinguishable: a lease contract must point at a lease, a vendor contract at a
-- supplier. Without it, `type = LEASE` with a `supplierId` is a valid row that means
-- nothing.
ALTER TABLE "contracts"
    ADD CONSTRAINT "contracts_entity_matches_type"
    CHECK (
        CASE "type"
            WHEN 'LEASE' THEN ("rentalAgreementId" IS NOT NULL) AND ("saleTransactionId" IS NULL) AND ("supplierId" IS NULL) AND ("landlordId" IS NULL)
            WHEN 'SALE' THEN ("saleTransactionId" IS NOT NULL) AND ("rentalAgreementId" IS NULL) AND ("supplierId" IS NULL) AND ("landlordId" IS NULL)
            WHEN 'VENDOR' THEN ("supplierId" IS NOT NULL) AND ("rentalAgreementId" IS NULL) AND ("saleTransactionId" IS NULL) AND ("landlordId" IS NULL)
            WHEN 'MANAGEMENT' THEN ("landlordId" IS NOT NULL) AND ("rentalAgreementId" IS NULL) AND ("saleTransactionId" IS NULL) AND ("supplierId" IS NULL)
            ELSE num_nonnulls("rentalAgreementId", "saleTransactionId", "supplierId", "landlordId") = 0
        END
    );

-- Notice that cannot be served is not notice. A negative figure would make
-- `noticeDueAt` land *after* the expiry date, which is how a contract that needs 90
-- days' notice ends up looking like it has until the day before to act on it.
ALTER TABLE "contracts"
    ADD CONSTRAINT "contracts_notice_days_sane"
    CHECK ("noticeDays" IS NULL OR "noticeDays" >= 0);

-- A term that ends before it starts is a data-entry slip, and it would otherwise
-- report itself as expired forever with no way to tell a typo from a real contract.
ALTER TABLE "contracts"
    ADD CONSTRAINT "contracts_term_is_ordered"
    CHECK (
        "startDate" IS NULL
        OR "expiresAt" IS NULL
        OR "expiresAt" > "startDate"
    );

CREATE INDEX "contracts_organizationId_idx" ON "contracts"("organizationId");
CREATE INDEX "contracts_type_idx" ON "contracts"("type");

-- The list screen sorts by expiry and filters by type, so this is the index that makes
-- "what is expiring next" fast rather than a scan of every contract the organization
-- has ever signed.
CREATE INDEX "contracts_organizationId_type_expiresAt_idx" ON "contracts"("organizationId", "type", "expiresAt");
CREATE INDEX "contracts_expiresAt_idx" ON "contracts"("expiresAt");
CREATE INDEX "contracts_rentalAgreementId_idx" ON "contracts"("rentalAgreementId");
CREATE INDEX "contracts_saleTransactionId_idx" ON "contracts"("saleTransactionId");
CREATE INDEX "contracts_supplierId_idx" ON "contracts"("supplierId");
CREATE INDEX "contracts_landlordId_idx" ON "contracts"("landlordId");
CREATE INDEX "contracts_renewalOfId_idx" ON "contracts"("renewalOfId");

-- The authoritative document belongs to exactly one contract. Without uniqueness, two
-- contracts could each claim the same signed PDF and the register would show it
-- attached to two different counterparties.
CREATE UNIQUE INDEX "contracts_documentId_key" ON "contracts"("documentId");

-- `CASCADE` on the related entity: a lease that no longer exists has no contract
-- worth keeping, and an orphaned contract is worse than a missing one. `SET NULL` on
-- the document and on the renewal parent, because those are references to something
-- that can legitimately disappear - a file deleted by mistake, a contract superseded.
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_rentalAgreementId_fkey" FOREIGN KEY ("rentalAgreementId") REFERENCES "rental_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_saleTransactionId_fkey" FOREIGN KEY ("saleTransactionId") REFERENCES "sale_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_renewalOfId_fkey" FOREIGN KEY ("renewalOfId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;