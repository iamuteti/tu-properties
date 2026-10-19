-- Module 14 - Utilities: bundle metered utilities onto the rent invoice.
--
-- `Property.bundleUtilitiesWithRent` decides whether a property's metered
-- utility charges ride on the rent invoice as extra lines (one combined
-- document) or are raised as separate UTILITY statements. It was added to
-- `schema.prisma` without a migration, so every environment that was created
-- or updated by the migration history was missing the column and the Prisma
-- client failed at runtime with
-- `column properties.bundleUtilitiesWithRent does not exist` (P2022) the first
-- time a query selected it - the tenant list, for one, which includes the
-- unit's property.
--
-- NOT NULL DEFAULT false is the same shape Prisma generates for
-- `Boolean @default(false)`, so an existing property keeps the previous
-- behaviour: utilities billed on their own statement.
ALTER TABLE "properties" ADD COLUMN "bundleUtilitiesWithRent" BOOLEAN NOT NULL DEFAULT false;

-- The two hand-maintained indexes, repaired. Neither is expressible in the
-- Prisma schema - the second is a *partial* unique index - so Prisma does not
-- know they exist and treats them as disposable: `migrate dev` and `db push`
-- both propose to drop them, and a database that has been through one of those
-- has silently lost the guard that a bulk meter cannot be billed twice for the
-- same period. `IF NOT EXISTS` so this migration is a no-op on a healthy
-- database and a healing one on a database that lost them.
CREATE INDEX IF NOT EXISTS "notifications_landlordId_readAt_idx" ON "notifications"("landlordId", "readAt");

CREATE UNIQUE INDEX IF NOT EXISTS "utility_charges_no_double_bill_bulk"
    ON "utility_charges" ("meterId", "billingPeriod")
    WHERE "unitId" IS NULL;
