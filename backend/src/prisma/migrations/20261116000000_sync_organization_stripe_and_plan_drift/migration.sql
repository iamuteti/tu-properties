-- Bring the migrated schema up to the datamodel in src/prisma/schema.prisma.
--
-- The migration history up to 20261112000000_add_stripe_prices_to_plan does not
-- produce the schema the client is generated from: `organizations` was missing
-- the two Stripe columns, `subscription_plans.prices`/`features` were created as
-- JSON instead of JSONB, and `subscriptions.planId` kept the unique index the
-- datamodel no longer declares. A database that had only ever been advanced with
-- `prisma migrate deploy` therefore failed at the first `organization.create()` in
-- `seedDemoData()` with P2022 (`ColumnNotFound`), which is how this was found.
--
-- Everything here is idempotent, and it deliberately does NOT touch
-- `notifications_landlordId_readAt_idx` or `utility_charges_no_double_bill_bulk`:
-- those exist only as raw SQL and `migrate dev` proposes dropping them, but they
-- are the guards AGENTS.md says must survive every generated migration.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_stripeCustomerId_key" ON "organizations"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_stripeSubscriptionId_key" ON "organizations"("stripeSubscriptionId");

-- Re-assert the hand-maintained read-marker index. `20261101000000` dropped it in
-- every database that applied the old version of that file, and fixing the file
-- does not re-run it there; this is a no-op where the index survived.
CREATE INDEX IF NOT EXISTS "notifications_landlordId_readAt_idx" ON "notifications"("landlordId", "readAt");

-- Also re-assert the partial unique guard. It cannot be expressed in
-- `schema.prisma`, so no generated migration should ever drop it.
CREATE UNIQUE INDEX IF NOT EXISTS "utility_charges_no_double_bill_bulk"
    ON "utility_charges" ("meterId", "billingPeriod")
    WHERE "unitId" IS NULL;

-- `Subscription.planId` is a plain index in the datamodel, not a unique one.
DROP INDEX IF EXISTS "subscriptions_planId_key";
CREATE INDEX IF NOT EXISTS "subscriptions_planId_idx" ON "subscriptions"("planId");

ALTER TABLE "subscription_plans"
ALTER COLUMN "prices" SET DATA TYPE JSONB USING "prices"::jsonb,
ALTER COLUMN "features" SET DATA TYPE JSONB USING "features"::jsonb;
