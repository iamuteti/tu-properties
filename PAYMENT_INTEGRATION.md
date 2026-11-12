# Payment Integration — Stripe (KES & USD)

## Overview

Integrate Stripe for collecting subscription payments on the Tu Properties platform. Trial signups remain free (no card required); paid plans (STARTER/PROFESSIONAL/ENTERPRISE) are charged via Stripe Checkout in the organization's currency (KES or USD). Kenya market additionally supports M-Pesa as a payment method via Stripe.

## Architecture

```
Frontend           Backend (NestJS)            Stripe
-------            ------------              ------
Checkout button -> POST /payments/checkout   <-- Create Checkout Session
                  <-- redirect URL          --> redirect user to Stripe Checkout
                  <-- Webhook POST          <-- Stripe sends events
                  UPDATE subscription/org
```

Data flow:
1. Super admin (or tenant on pricing page) clicks "Start trial/Upgrade to paid" on a plan.
2. Frontend calls `POST /payments/checkout` with `planId` and `currency` (from `plan.prices`).
3. Backend creates (or reuses) a Stripe `Customer` for the org, creates a Stripe `Checkout Session` in `subscription` mode with the plan's price for the selected currency, returns the checkout URL.
4. Frontend redirects the browser to Stripe Checkout.
5. Customer pays. Stripe fires `checkout.session.completed` webhook to `POST /webhooks/stripe`.
6. Backend verifies the webhook signature, finds the org by `stripeCustomerId` or `client_reference_id`, marks the organization's subscription `ACTIVE` and records the plan/price.
7. Stripe handles recurring billing automatically; `invoice.payment_succeeded` / `invoice.payment_failed` webhooks keep the subscription state in sync.

## Files to Create / Modify

### Backend (`backend/`)

New module directory: `backend/src/modules/payments/`

| File | Purpose |
|------|---------|
| `payments.module.ts` | Module wiring (PaymentsController, PaymentsService, StripeService) |
| `payments.controller.ts` | `POST /payments/checkout` (create session), `POST /webhooks/stripe` (Stripe events, no auth), `GET /payments/customer-portal` (optional) |
| `payments.service.ts` | Business logic: create/retrieve Stripe customer, create checkout session, process webhook events, update org subscription |
| `stripe.service.ts` | Thin wrapper around the Stripe SDK (initialize with secret key) |
| `dto/create-checkout-session.dto.ts` | Request body: `{ planId: string; currency: string }` |
| `dto/webhook-event.dto.ts` | Typed webhook payload (optional) |

Modified files:
| File | Change |
|------|--------|
| `backend/src/modules/platform/dto/onboarding.dto.ts` | Add optional `stripeCustomerId?: string` (for linking org to Stripe customer) |
| `backend/src/modules/platform/dto/update-subscription.dto.ts` | Already has plan; ensure it can also accept `stripeSubscriptionId` if you want to store Stripe's subscription ID |
| `backend/src/modules/platform/platform.service.ts` | Add methods to update org subscription status/plan after payment |
| `backend/src/prisma/schema.prisma` | Add `stripeCustomerId?: string` and `stripeSubscriptionId?: string` to `Organization` (or `Subscription`) model |
| `backend/.env` | `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...` |

### Frontend (`frontend/`)

| File | Purpose |
|------|---------|
| `frontend/lib/stripe.ts` | Load Stripe.js with `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| `frontend/components/payments/checkout-button.tsx` | Button that calls `POST /payments/checkout` and redirects to Stripe |
| `frontend/app/(dashboard)/platform/organizations/[id]/page.tsx` | Add "Upgrade to paid plan" button linking to checkout |
| `frontend/app/(dashboard)/platform/payments/success/page.tsx` | Success page after payment |
| `frontend/app/(dashboard)/platform/payments/cancel/page.tsx` | Cancel page |
| `frontend/.env` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` |

### Environment Variables

**Backend (`backend/.env`):**
```
STRIPE_SECRET_KEY=your-stripe-test-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-signing-secret
```

**Frontend (`frontend/.env`):**
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_XXXXXXXXXXXXXXXXXXXXXXXX
```

## Stripe Dashboard Configuration

Follow these steps in the Stripe Dashboard (`https://dashboard.stripe.com`):

### 1. Switch to Test Mode
- Toggle **Test mode** at the top-left of the Dashboard (switch to **Live mode** for production).
- All steps below should be done in Test mode first, then repeated in Live mode.

### 2. Create API Keys
- Go to **Developers → API keys**.
- Copy **Publishable key** → set as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `frontend/.env`.
- Copy **Secret key** → set as `STRIPE_SECRET_KEY` in `backend/.env`.
- Keys are prefixed `sk_test_...` / `pk_test_...` in test mode; `sk_live_...` / `pk_live_...` in live mode.

### 3. Create Products (one per plan tier)
- Go to **Products → Add product**.
- Create one product per tier:
  - **Starter** — for small firms / individual landlords
  - **Professional** — for growing property management companies
  - **Enterprise** — do NOT create a fixed-price Enterprise product in Stripe. Enterprise is custom-priced per client; create a custom plan in the admin panel instead, then create a matching Stripe Product/Price on demand.
- For each product, set:
  - **Name**: e.g. "Starter Plan"
  - **Description**: short blurb matching the plan
  - **Pricing model**: Recurring (subscription)
  - **Currency**: USD (then repeat for KES)

### 4. Create Prices (one per currency per product)
- On each product page, click **Add price**.
- Create two prices per product (USD and KES):
  - **Starter**: $49 / month (USD), KES 6,500 / month (KES)
  - **Professional**: $129 / month (USD), KES 17,000 / month (KES)
  - **Enterprise**: custom — create price on demand with the negotiated amount
- Set **Billing cycle**: Monthly
- Copy each Price ID (starts with `price_...`) — you'll need these when creating checkout sessions.

### 5. Register Webhook Endpoint
- Go to **Developers → Webhooks → Add endpoint**.
- **Endpoint URL**: `https://api-properties.tuhame.co.ke/webhooks/stripe`
- **Events to send**:
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted` (optional)
- Click **Add endpoint**.
- Copy the **Signing secret** (starts with `whsec_...`) → set as `STRIPE_WEBHOOK_SECRET` in `backend/.env`.
- **Test the webhook**: click **Send test webhook** → select `checkout.session.completed` → verify your backend returns 200.

### 6. Enable Payment Methods
- Go to **Settings → Payment methods**.
- **Card**: ensure it is enabled (default).
- **M-Pesa** (Kenya only): enable under **Mobile money** → M-Pesa. Required for KES transactions in Kenya.
- Other methods (Apple Pay, Google Pay, etc.) can be enabled optionally.

### 7. Billing Settings
- Go to **Settings → Billing**.
- Enable **Automatic collection** for unpaid invoices.
- Set **Smart retries** on for failed payments (helps recover failed card payments).

### 8. Test Cards
Use these Stripe test card numbers in test mode:
- `4242 4242 4242 4242` — succeeds
- `4000 0000 0000 9995` — declines with insufficient funds
- `4000 0000 0000 9987` — declines with lost card
- Any future expiry date, any CVC

### 9. Go Live
- Switch Stripe Dashboard to **Live mode**.
- Repeat steps 2–8 with live keys.
- Replace test keys in `backend/.env` and `frontend/.env` with live keys.
- Update the webhook endpoint URL if using a different production domain.

## Database Schema Changes

Add to `backend/src/prisma/schema.prisma`:

```prisma
model Organization {
  // ... existing fields ...
  stripeCustomerId    String?   @unique
  stripeSubscriptionId String?  @unique
  // ... rest of model ...
}
```

Then run:
```bash
cd backend
npx prisma db push --accept-data-loss
npx prisma db generate
```

## Checklist

### Backend
- [ ] Install `stripe` npm package in `backend/`
- [ ] Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to `backend/.env`
- [ ] Add `stripeCustomerId` and `stripeSubscriptionId` to Prisma schema (`Organization` or `Subscription` model)
- [ ] Run `npx prisma db push --accept-data-loss` and `npx prisma db generate`
- [ ] Create `backend/src/modules/payments/` module with controller, service, DTOs
- [ ] Implement `POST /payments/checkout` — create Stripe customer (if missing), create checkout session in `subscription` mode with plan's price for the selected currency
- [ ] Implement `POST /webhooks/stripe` — verify signature, handle `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`
- [ ] Update org subscription status to `ACTIVE` on successful payment
- [ ] Add `STRIPE_SECRET_KEY` to backend lockfile install flags (`--legacy-peer-deps` already used)
- [ ] Typecheck (`npx tsc --noEmit`) and lint (`npm run lint`) pass

### Frontend
- [ ] Install `stripe` npm package in `frontend/`
- [ ] Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to `frontend/.env`
- [ ] Create `frontend/lib/stripe.ts` — Stripe.js loader
- [ ] Create `frontend/components/payments/checkout-button.tsx`
- [ ] Wire checkout button into plan selection (landing page PricingSection and/or org detail page)
- [ ] Create success and cancel pages
- [ ] Typecheck (`npx tsc --noEmit`) passes

### Operations
- [ ] Create Stripe Products for each plan (STARTER, PROFESSIONAL, ENTERPRISE) in Stripe Dashboard
- [ ] Create Stripe Prices for each product in USD and KES
- [ ] Register webhook endpoint: `https://api-properties.tuhame.co.ke/webhooks/stripe` (events: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`)
- [ ] Enable M-Pesa payment method in Stripe Dashboard (for KES/Kenya)
- [ ] Test with Stripe test cards (4242 4242 4242 4242 etc.) and test mode
- [ ] Switch to live keys (`sk_live_`, `pk_live_`) for production

### Verification
- [ ] Guest can select a paid plan and is redirected to Stripe Checkout
- [ ] Webhook receives `checkout.session.completed` and marks org subscription `ACTIVE`
- [ ] Recurring invoice succeeds/fails and webhook updates subscription state
- [ ] M-Pesa payment works for KES (Kenya test)
- [ ] Frontend redirects to success page after payment

## Notes

- The existing `Organization.plan` field holds the tier string (`STARTER`, `PROFESSIONAL`, `ENTERPRISE`). Stripe's `Price` object is keyed by currency — lookup the plan's `prices[currency]` amount when creating the checkout session.
- Stripe Checkout in `subscription` mode creates a Stripe Subscription automatically; store its ID in `stripeSubscriptionId` so you can cancel/update it later from your admin panel.
- Do not log or expose Stripe secret keys in frontend code or logs.
