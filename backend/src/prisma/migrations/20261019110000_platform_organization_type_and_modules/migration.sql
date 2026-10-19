-- Platform: the organization's business shape and its per-organization module
-- enablement.
--
-- `Organization.organizationType` (AGENCY or OWNER) and
-- `Subscription.enabledModules` were added to `schema.prisma` without a
-- migration, so an environment built from the migration history - CI, a fresh
-- production database, `npm run db:reset:demo` - was missing the enum and both
-- columns, and the first query that touched them failed with
-- `column organizations.organizationType does not exist` (P2022). The same
-- shape as the `properties.bundleUtilitiesWithRent` gap, and the same fix.
--
-- `IF NOT EXISTS` throughout, because a database that was brought up by
-- `prisma db push` rather than by the migration history already has these -
-- `db push` applies the schema directly - and this migration must be a no-op
-- there rather than a failure.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'OrganizationType'
  ) THEN
    CREATE TYPE "OrganizationType" AS ENUM ('AGENCY', 'OWNER');
  END IF;
END$$;

-- AlterTable
ALTER TABLE "organizations"
    ADD COLUMN IF NOT EXISTS "organizationType" "OrganizationType" NOT NULL DEFAULT 'AGENCY';

-- AlterTable
ALTER TABLE "subscriptions"
    ADD COLUMN IF NOT EXISTS "enabledModules" TEXT[] DEFAULT ARRAY[]::text[];

-- The primary key of the renamed table.
--
-- PostgreSQL does not rename a table's indexes when the table is renamed, so
-- the migration that renamed `rental_agreements` to `agreements` left its
-- primary key behind as `rental_agreements_pkey` while every other index was
-- renamed explicitly. A database built by `db push` names it `agreements_pkey`,
-- and the two names mean the same row - but the mismatch shows up as phantom
-- drift in every `migrate diff` against the migration history, which is how a
-- real drift gets missed. Renamed here, guarded so it is a no-op where the
-- index is already named correctly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'rental_agreements_pkey'
  ) THEN
    EXECUTE 'ALTER INDEX "rental_agreements_pkey" RENAME TO "agreements_pkey"';
  END IF;
END$$;
