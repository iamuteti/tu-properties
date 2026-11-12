-- Add stripePrices to subscription_plans: map of ISO-4217 currency code -> Stripe Price ID
ALTER TABLE "subscription_plans" ADD COLUMN "stripePrices" JSONB NOT NULL DEFAULT '{}';