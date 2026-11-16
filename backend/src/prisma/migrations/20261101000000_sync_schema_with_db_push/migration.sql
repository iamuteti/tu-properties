-- Sync schema with db push changes
-- This migration captures schema changes made via `prisma db push` that were
-- not captured in migration files:
-- 1. Create subscription_plans table (with isPublic field)
-- 2. Add TERMINATED variant to TenantStatus enum
-- 3. Add planId column + FK + indexes to subscriptions table
-- 4. Add indexes to subscription_plans table
-- 5. Keep the hand-maintained index on notifications (re-created idempotently)
-- 6. Remove unique index from utility_charges table

-- Add TERMINATED variant to TenantStatus enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'TERMINATED' AND enumtypid = 'public."TenantStatus"'::regtype) THEN
        ALTER TYPE "TenantStatus" ADD VALUE 'TERMINATED';
    END IF;
END $$;

-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "prices" JSON NOT NULL DEFAULT '{}',
    "enabledModules" TEXT[] NOT NULL DEFAULT '{}',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "maxUsers" INTEGER NOT NULL DEFAULT 3,
    "maxProperties" INTEGER NOT NULL DEFAULT 10,
    "features" JSON NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- Create indexes on subscription_plans
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_name_key" ON "subscription_plans"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_slug_key" ON "subscription_plans"("slug");
CREATE INDEX IF NOT EXISTS "subscription_plans_isActive_sortOrder_idx" ON "subscription_plans"("isActive", "sortOrder");

-- Add planId column to subscriptions
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "planId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_planId_key" ON "subscriptions"("planId");
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so this is the idempotent form.
-- Without it this migration fails on every fresh database and `db:reset:demo`
-- (and `prisma migrate deploy`) cannot get past it.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_planId_fkey'
    ) THEN
        ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Keep the hand-maintained read-marker index. `migrate dev` proposes dropping it
-- because the schema cannot express it, and this file used to apply that drop on
-- every fresh database — it must exist (see AGENTS.md). Re-creating it here is
-- idempotent on databases that already have it.
CREATE INDEX IF NOT EXISTS "notifications_landlordId_readAt_idx" ON "notifications"("landlordId", "readAt");

-- Remove unique index from utility_charges table
DROP INDEX IF EXISTS "utility_charges_meterId_billingPeriod_key";
