# Payment Integration — Stripe (KES & USD)

## Overview

Stripe collects subscription payments for paid plans. Trial signups stay free (no card); paid plans are charged via **Stripe Checkout** (hosted redirect) in the organization's currency (USD or KES). Kenya also supports **M-Pesa** via Stripe.

## Architecture

```
Frontend                      Backend (NestJS)                 Stripe
--------                      ----------------                 ------
"Subscribe / Upgrade"  ──►  POST /payments/checkout     ──►  create Checkout Session
   (org detail page)          (ADMIN or SUPER_ADMIN)           (subscription mode)
        │                            │
        │  ◄── { url, sessionId }    │
        ▼                            ▼
  window.location = url  ──►  Stripe hosted Checkout page
        │                            │
        └──── pay ──────────────────►│
                                     │  webhook: checkout.session.completed
                                     │  POST /payments/webhooks/stripe ◄──
                                     ▼
                          mark Subscription ACTIVE + apply purchased plan
```

## How the Stripe catalog is used (important)

**The backend does not store Stripe `price_...` IDs.** At checkout it:

1. Reads the plan's `prices` map (e.g. `{ "USD": 49, "KES": 6500 }`) and the org's currency.
2. Calls `stripe.prices.list({ currency, active: true, limit: 100 })`.
3. Picks the price whose **`unit_amount` equals the plan price converted to minor units** (`×100` for USD/KES; `×1` for zero-decimal currencies like JPY/KRW) **and** whose **`recurring.interval` matches the plan's `interval`** (`month`/`year`).

So the prices you create in the Stripe Dashboard are matched **automatically by amount + currency + billing cycle**. You do **not** copy/paste `price_...` IDs anywhere.

**Consequence — the numbers must line up exactly:**
- Plan `Starter` USD price = `49` ↔ Stripe price `$49.00` recurring **monthly**.
- Plan `Starter` KES price = `6500` ↔ Stripe price `KES 6,500.00` recurring **monthly**.
- If the plan interval is `year`, the Stripe price must also be **yearly**, or no match is found.

If they don't match, checkout fails with `No Stripe price found for <CUR> <amount>/<interval>`.

> Note: `prices.list` returns at most 100 prices per call. Keep the number of active prices per currency modest (or paginate) so the match isn't missed.

## Files

### Backend — `backend/src/modules/payments/`
| File | Purpose |
|------|---------|
| `payments.module.ts` | Wires controller + services |
| `payments.controller.ts` | `POST /payments/checkout` (ADMIN/SUPER_ADMIN), `POST /payments/webhooks/stripe` (public, signature verified) |
| `payments.service.ts` | Resolve plan → match Stripe price → create customer + session; process webhook events; upgrade org |
| `stripe.service.ts` | Stripe SDK wrapper (client init, customer create/find, checkout session, webhook signature) |
| `dto/create-checkout-session.dto.ts` | `{ planId, currency, organizationId?, successUrl?, cancelUrl? }` |

### Backend — modified
| File | Change |
|------|--------|
| `backend/src/prisma/schema.prisma` | `Organization.stripeCustomerId`, `Organization.stripeSubscriptionId`; `Subscription.planId` (no longer `@unique`), `@@index([planId])` |
| `backend/src/main.ts` | `NestFactory.create(AppModule, { rawBody: true })` so the webhook can verify the Stripe signature |
| `backend/src/app.module.ts` | Registers `PaymentsModule` |
| `backend/.env` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/lib/api.ts` | `platformApi.checkout({ planId, currency, organizationId?, successUrl?, cancelUrl? })` |
| `frontend/app/(dashboard)/platform/organizations/[id]/page.tsx` | **"Subscribe / Upgrade"** button → calls checkout → `window.location = url` |
| `frontend/types/index.ts` | `PlatformOrganization.currency`, `subscription.planId` |

> **No frontend Stripe SDK is required.** Checkout is a hosted redirect — the browser goes to Stripe's URL, so no `stripe` npm package and no `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are needed. (Those are only needed if you switch to Stripe.js/Elements.)

## Environment Variables

**Backend (`backend/.env`):**
```
STRIPE_SECRET_KEY=sk_test_...        # from Stripe Dashboard → Developers → API keys
STRIPE_WEBHOOK_SECRET=whsec_...      # from the webhook endpoint's signing secret
```

**Frontend:** none required for the redirect flow.

## Stripe Dashboard Configuration

Steps in the Stripe Dashboard (`https://dashboard.stripe.com`):

### 1. Switch to Test Mode
- Toggle **Test mode** (top-left). Do everything in test mode first, then repeat in Live mode.

### 2. Create API Keys
- **Developers → API keys**.
- Copy **Secret key** → `STRIPE_SECRET_KEY` in `backend/.env`.
- (Publishable key not needed for redirect Checkout.)
- Test keys start `sk_test_...`; live keys `sk_live_...`.

### 3. Create Products (one per plan tier)
- **Products → Add product**.
- **Starter** — small firms / individual landlords.
- **Professional** — growing property management companies.
- **Enterprise** — do **not** create a fixed-price product. Enterprise is custom-priced per client: create a custom plan in the admin panel, then create a matching Stripe Product/Price on demand (deferred).

### 4. Create Prices (one per currency per product)
- On each product, **Add price**.
- **Starter**: `$49.00` USD monthly, `KES 6,500.00` monthly.
- **Professional**: `$129.00` USD monthly, `KES 17,000.00` monthly.
- Set **Billing cycle** to match the plan's `interval` in the admin panel (monthly ↔ `month`).
- These amounts must equal the plan's `prices` map exactly (see "How the Stripe catalog is used").
- You do **not** need to copy the `price_...` IDs — the backend matches by amount.

### 5. Register Webhook Endpoint
- **Developers → Webhooks → Add endpoint**.
- **Endpoint URL**: `https://api-properties.tuhame.co.ke/payments/webhooks/stripe`
  (local dev: `http://localhost:3003/payments/webhooks/stripe` via ngrok)
- **Events**:
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted` (optional)
- Copy the **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET` in `backend/.env`.
- **Test**: **Send test webhook** → `checkout.session.completed` → backend returns `200 { received: true }`.

### 6. Enable Payment Methods
- **Settings → Payment methods**.
- **Card**: enabled (default).
- **M-Pesa** (Kenya): enable under **Mobile money** → M-Pesa (required for KES).

### 7. Billing Settings
- **Settings → Billing**: enable **Automatic collection**; turn on **Smart retries**.

### 8. Test Cards
- `4242 4242 4242 4242` — succeeds
- `4000 0000 0000 9995` — insufficient funds
- `4000 0000 0000 9987` — lost card
- Any future expiry, any CVC

### 9. Go Live
- Switch to **Live mode**, repeat steps 2–8 with live keys, replace `backend/.env` values.

## Database Schema

`backend/src/prisma/schema.prisma`:
```prisma
model Organization {
  // ...
  stripeCustomerId     String?  @unique
  stripeSubscriptionId String?  @unique
}

model Subscription {
  // ...
  planId     String?
  planRecord SubscriptionPlan? @relation(fields: [planId], references: [id], onDelete: SetNull)
  @@index([planId])
}
```

Apply:
```bash
cd backend
npx prisma db push --accept-data-loss
npx prisma generate
```

## Checklist

### Backend
- [x] Install `stripe` npm package in `backend/`
- [x] Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to `backend/.env`
- [x] Add `stripeCustomerId` / `stripeSubscriptionId` to `Organization`; `Subscription.planId` + index
- [x] Run `npx prisma db push --accept-data-loss` and `npx prisma generate`
- [x] Create `backend/src/modules/payments/` module (controller, service, stripe service, DTO)
- [x] `POST /payments/checkout` — resolve org, match Stripe price (amount+currency+interval), create customer + subscription session, return URL
- [x] `POST /payments/webhooks/stripe` — verify signature; handle `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`
- [x] Apply purchased plan on `checkout.session.completed` (upgrade `Subscription.plan`/`planId` + `Organization.plan`), set status ACTIVE
- [x] `NestFactory.create(..., { rawBody: true })` for webhook signature verification (`req.rawBody`, `req.body` still parsed)
- [x] Register `PaymentsModule` in `AppModule`
- [x] Typecheck (`npx tsc --noEmit`) and lint pass
- [x] Live check: JSON login 201, signed webhook 200, forged signature 400, malformed body 400

### Frontend
- [x] `platformApi.checkout()` in `lib/api.ts`
- [x] "Subscribe / Upgrade" button on org detail page (calls checkout, redirects to Stripe)
- [x] `PlatformOrganization.currency` + `subscription.planId` types
- [x] Typecheck (`npx tsc --noEmit`) and lint pass
- [ ] (Optional) Dedicated success/cancel pages — currently handled via `?checkout=success|cancelled` query params on the org page
- [x] No Stripe SDK / publishable key required (hosted redirect)

### Operations (Stripe Dashboard)
- [x] Products created: Starter, Professional
- [x] Prices created: USD + KES for each (amounts must equal plan `prices`)
- [ ] Register webhook endpoint: `https://api-properties.tuhame.co.ke/payments/webhooks/stripe` (events above)
- [ ] Enable M-Pesa (Kenya, KES)
- [ ] Test with Stripe test cards in test mode
- [ ] Switch to live keys for production

### Verification
- [ ] Org page "Subscribe / Upgrade" redirects to Stripe Checkout with the correct amount
- [ ] `checkout.session.completed` webhook marks the org `ACTIVE` on the purchased plan
- [ ] Recurring `invoice.payment_succeeded` / `invoice.payment_failed` update subscription state
- [ ] M-Pesa works for KES (Kenya test)
- [ ] Plan amount in admin == Stripe price amount (else checkout errors clearly)

## Notes

- `Organization.plan` holds the tier string; the plan's `prices` map + Stripe price must agree on amount and billing cycle.
- `Subscription.planId` links to `SubscriptionPlan` (multiple orgs can share a plan; the FK is not unique).
- Never log or expose Stripe secret keys.
- Enterprise custom pricing (inline `price_data`) is deferred; when implemented it will bypass the amount-match lookup.