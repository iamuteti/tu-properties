-- Module 14 - Utilities: let an organization choose what document a charge ends up on.
--
-- Adds `organizations.utilityBillingMode` and the `RECONCILED` charge status.
--
-- The reason this exists: the question has no universal answer and the markets
-- genuinely differ, which is exactly why `taxCountryCode`, `currency` and `timezone`
-- are per-organization columns rather than code. Where a resident holds the utility
-- account themselves - the norm in the US and Canada - an organization still wants
-- consumption recorded and reconciled against what the utility company billed the
-- estate, but it must not raise a resident invoice it has no standing to raise. That is
-- `DIRECT_ACCOUNT`.
--
-- Previously the module hardcoded one arrangement and documented the other in a code
-- comment, which is the inconsistency: every other jurisdictional or commercial
-- variation in this schema is a column, and a document shape presented as the
-- product's shape reads as the only one its authors considered.
--
-- NULL means SEPARATE_STATEMENT, and the split is deliberate: "nobody has decided"
-- stays distinguishable from "decided to re-bill". That default is chosen rather than
-- neutral because it leaves `Invoice.billingPeriod` alone, and that column is unique
-- per lease per period *because it is the rent bill's key* - a utility charge claiming
-- it makes the recurring rent run skip the month, so the resident is billed for water
-- and not for rent.
--
-- The third real-world arrangement, bundling utilities into the rent bill or a
-- consolidated service-charge statement, is deliberately NOT implemented. It collides
-- with the same `billingPeriod` key, and it would additionally double-bill against
-- `UnitServiceCharge`, which already carries fixed per-unit utility charges onto the
-- rent invoice through recurring billing. Naming it in the enum's schema comment keeps
-- its absence a stated decision with a reason rather than a silent gap.

CREATE TYPE "UtilityBillingMode" AS ENUM ('SEPARATE_STATEMENT', 'DIRECT_ACCOUNT');

ALTER TABLE "organizations"
    ADD COLUMN "utilityBillingMode" "UtilityBillingMode";

-- `RECONCILED` is a state the enum was missing: consumption priced and matched
-- against the supplier's bill with no resident document.
--
-- A plain `ADD VALUE` is used rather than the three-step add / use / remove dance that
-- older Postgres releases required, because a migration file may not use an enum value
-- in the same transaction that adds it. That restriction was lifted in Postgres 12 and
-- this database is 18, so the statement is safe here — but it *would* fail against a
-- pre-12 server, which is worth knowing before pointing this migration at one.
ALTER TYPE "UtilityChargeStatus" ADD VALUE 'RECONCILED';