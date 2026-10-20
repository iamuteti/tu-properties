# Testing Guide - TU Properties (Multi-Tenant SaaS)

This guide outlines how to test the multi-tenant functionality using the provided seed data.

## 1. Setup

Ensure you have your database running and the `.env` file configured (see `backend/.env.example`).

### Reset and Seed Database
Run the following commands in the `backend` directory:

```bash
# Apply any pending migrations
npx prisma migrate dev

# Run the seed script (super admin + demo organizations, users, and business data)
npx prisma db seed
```

> `npm run db:seed:demo` runs the same demo-data script standalone
> (`src/prisma/demo-data.ts`). `npx prisma db seed` is the documented
> entry point and produces the state described in this file.
>
> **The demo seed deletes every organization before it seeds.** If you want the
> Jedan Apartments dataset as well, run it afterwards:
>
> ```bash
> npm run db:seed:demo
> npm run db:seed:jedan
> ```

### Choosing the markets the demo covers

The seed covers fifteen markets by default — the big rental markets (US, UK,
Canada, Australia, Germany, France), the fast-growing ones (India, China,
Japan, South Korea, Brazil, Mexico), the GCC (United Arab Emirates) and, in
Africa, **Kenya and South Africa only**.

Two environment variables control it:

```bash
# The primary market — the one that gets the two full demo organizations
# (Rohi with the whole dataset, Westhill as the starter). Everything else
# gets a market organization with its own currency, locale and tax rules.
DEMO_COUNTRY=KE npm run db:seed:demo

# A subset of markets, by ISO-3166-1 alpha-2 code. An unknown code fails
# the seed loudly rather than silently skipping a market.
DEMO_COUNTRIES=KE,ZA,IN,BR npm run db:seed:demo
```

Each market is seeded from its own jurisdiction profile
(`backend/src/prisma/jurisdictions.ts`): currency, locale, timezone,
consumption-tax rate, telephone format, names, addresses, banks, tax ID
format, utility tariffs and a rent band in the local currency. A Johannesburg
rent is rand and a Seoul telephone number is eleven digits because the profile
says so, not because a constant was copied.

The organization name and the logins of each market are **fixed**, not
randomized — see the account table in section 2 — so a demo script can name
the login it wants before the seed has run. Property, tenant and street names
inside a market are randomized, as they are everywhere else.

## 2. Test User Accounts

The seed creates demo accounts representing different roles and organizations.
The password for **all** accounts is `Password123!`.

### Super Admin Account (Platform Admin)
| Role | Email | Password | Organization |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@tuproperties.co.ke` | `Password123!` | None (access to ALL organizations) |

**Purpose:** Can access all organizations, create new organizations, manage platform settings.

---

### Organization 1: Westhill Properties
| Role | Email | Password | Organization |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@westhill.co.ke` | `Password123!` | Westhill Properties |
| **Property Manager** | `manager@westhill.co.ke` | `Password123!` | Westhill Properties |
| **Accountant** | `accountant@westhill.co.ke` | `Password123!` | Westhill Properties |

**Purpose:** Westhill is a **small starter organization** — one property, two
units, two tenants, one agreement and two invoices — use it to create
properties, tenants, leases, and invoices from scratch.

---

### Organization 2: Rohi Estate Management
| Role | Email | Password | Organization |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@rohi.co.ke` | `Password123!` | Rohi Estate Management |

**Purpose:** Rohi contains the **full demo dataset** (~120 landlords, ~100
properties, ~2,400 units, ~1,800 tenants, plus rental agreements, invoices,
payments, and receipts). Use it to verify list/filter/pagination behavior.

---

### Organizations 3+: the market organizations

Every market in `DEMO_COUNTRIES` other than the primary one gets an
organization of its own, with an administrator login and a resident portal
login. The organization name and the login address come from the market's
jurisdiction profile, so they are **the same on every seed run** — the seed
does not randomize them.

| Market | Organization | Admin login | Resident portal login |
| :--- | :--- | :--- | :--- |
| South Africa | Cape Town Property Group | `admin@cape-town-property-group-za.co.za` | `tenant@cape-town-property-group-za.co.za` |
| United States | Liberty Property Group | `admin@liberty-property-group-us.com` | `tenant@liberty-property-group-us.com` |
| United Kingdom | Thames Property Group | `admin@thames-property-group-gb.co.uk` | `tenant@thames-property-group-gb.co.uk` |
| Canada | Maple Leaf Property Group | `admin@maple-leaf-property-group-ca.ca` | `tenant@maple-leaf-property-group-ca.ca` |
| Australia | Sydney Property Group | `admin@sydney-property-group-au.com.au` | `tenant@sydney-property-group-au.com.au` |
| Germany | Berlin Immobilien GmbH | `admin@berlin-immobilien-gmbh-de.de` | `tenant@berlin-immobilien-gmbh-de.de` |
| France | Paris Immobilier Gestion | `admin@paris-immobilier-gestion-fr.fr` | `tenant@paris-immobilier-gestion-fr.fr` |
| India | Mumbai Property Management | `admin@mumbai-property-management-in.co.in` | `tenant@mumbai-property-management-in.co.in` |
| China | Shanghai Property Services | `admin@shanghai-property-services-cn.com.cn` | `tenant@shanghai-property-services-cn.com.cn` |
| Japan | Tokyo Property Services | `admin@tokyo-property-services-jp.co.jp` | `tenant@tokyo-property-services-jp.co.jp` |
| South Korea | Seoul Property Services | `admin@seoul-property-services-kr.co.kr` | `tenant@seoul-property-services-kr.co.kr` |
| Brazil | São Paulo Property Management | `admin@sao-paulo-property-management-br.com.br` | `tenant@sao-paulo-property-management-br.com.br` |
| Mexico | Ciudad de México Property Management | `admin@ciudad-de-mexico-property-management-mx.com.mx` | `tenant@ciudad-de-mexico-property-management-mx.com.mx` |
| United Arab Emirates | Dubai Properties Group | `admin@dubai-properties-group-ae.ae` | `tenant@dubai-properties-group-ae.ae` |

The **primary** market does not get a market organization — it gets Rohi and
Westhill instead. So with the default `DEMO_COUNTRY=KE`, the Kenya row above
does not exist and `admin@rohi.co.ke` / `admin@westhill.co.ke` are Kenya's
accounts; with `DEMO_COUNTRY=ZA` the roles swap and South Africa becomes the
market organization.

**Purpose:** a market organization is the fastest way to see that the product
is genuinely multi-country rather than multi-labelled — the same screens with
a different currency, a different telephone format and a different tax
identifier shape. It is also the only place a **second currency** appears in
the data.

---

### Organization: Jedan Apartments (separate seed)

| Role | Email | Password | Organization |
| :--- | :--- | :--- | :--- |
| **Manager** | `manager@jedan-apartments.co.ke` | `Password123!` | Jedan Apartments |

**Purpose:** the immersive one-estate dataset (1 property, 44 units, 53
tenants). Seeded by `npm run db:seed:jedan`, which is a **separate script** —
the demo seed deletes every organization, so run it afterwards.

## 3. Multi-Tenancy Test Scenarios

### Scenario 1: Data Isolation
1. Login as `admin@rohi.co.ke` (Rohi Estate Management).
2. Verify the large demo dataset is visible (properties, units, tenants, invoices).
3. Logout and login as `admin@westhill.co.ke` (Westhill Properties).
4. Verify only Westhill's own rows are visible — its one property, two units
   and two tenants — and **none** of Rohi's hundred properties.

### Scenario 2: Super Admin Access
1. Login as `admin@tuproperties.co.ke` (Super Admin).
2. Navigate to Dashboard → Organizations.
3. Verify you can see ALL organizations.
4. Create a new organization.
5. Verify you can see data from ALL organizations (super admin bypasses the tenant filter).

### Scenario 3: Role-Based Access
1. Login as `accountant@westhill.co.ke`.
2. Verify finance pages are available and the nav hides admin-only items.
3. Navigate to Settings — should be restricted (Settings is visible to SUPER_ADMIN/ADMIN only).
4. Login as `manager@westhill.co.ke` (Property Manager) and verify property/tenant/lease
   pages are available but finance pages are hidden from the nav.

### Scenario 4: A market organization
1. Login as `admin@liberty-property-group-us.com` (the United States market).
2. Properties → verify one property, whose country reads "United States" and
   whose address is a US street in a US city.
3. Finance → Invoices → verify the amounts are in **USD** and the numbering is
   `INV-US-YYYY-MM-NN`, with two paid, two overdue and two pending.
4. Tenants → verify the telephone numbers are US-format (+1 …), and that the
   landlord's tax ID is EIN-shaped (for example `49-3202779`), not a Kenyan
   KRA PIN.
5. Login as `tenant@liberty-property-group-us.com` — the resident portal shows
   only that tenant's invoices and receipts, and none from any other market.
6. Repeat for one other market (e.g. `admin@cape-town-property-group-za.co.za`)
   and confirm the currency, the telephone format and the tax-ID shape have
   both changed.

### Scenario 5: Market isolation
1. Login as `admin@liberty-property-group-us.com` (United States).
2. Verify the Kenyan Rohi dataset is **not** visible — the US organization has
   one property, not a hundred.
3. Login as `admin@rohi.co.ke` and verify the US organization is not visible.
4. Login as `admin@tuproperties.co.ke` (Super Admin) and verify **both** are
   visible at once, in the same Organizations list.

## 4. Test Data

### Organizations
| Name | Slug | Subdomain | Plan |
| :--- | :--- | :--- | :--- |
| Westhill Properties | westhill-properties | demo | PROFESSIONAL |
| Rohi Estate Management | rohi-estate-management | rohi | ENTERPRISE |
| Cape Town Property Group | cape-town-property-group-za | mza | PROFESSIONAL |
| Liberty Property Group | liberty-property-group-us | mus | PROFESSIONAL |
| Thames Property Group | thames-property-group-gb | mgb | PROFESSIONAL |
| Maple Leaf Property Group | maple-leaf-property-group-ca | mca | PROFESSIONAL |
| Sydney Property Group | sydney-property-group-au | mau | PROFESSIONAL |
| Berlin Immobilien GmbH | berlin-immobilien-gmbh-de | mde | PROFESSIONAL |
| Paris Immobilier Gestion | paris-immobilier-gestion-fr | mfr | PROFESSIONAL |
| Mumbai Property Management | mumbai-property-management-in | min | PROFESSIONAL |
| Shanghai Property Services | shanghai-property-services-cn | mcn | PROFESSIONAL |
| Tokyo Property Services | tokyo-property-services-jp | mjp | PROFESSIONAL |
| Seoul Property Services | seoul-property-services-kr | mkr | PROFESSIONAL |
| São Paulo Property Management | sao-paulo-property-management-br | mbr | PROFESSIONAL |
| Ciudad de México Property Management | ciudad-de-mexico-property-management-mx | mmx | PROFESSIONAL |
| Dubai Properties Group | dubai-properties-group-ae | mae | PROFESSIONAL |

Only the markets listed in `DEMO_COUNTRIES` (and not the primary one) get a
row here; the table is the full set.

### Business Data
- **Westhill Properties:** 1 property, 2 units, 2 tenants, 1 agreement, 2 invoices.
- **Rohi Estate Management:** ~120 landlords, ~100 properties, ~2,400 units,
  ~1,800 tenants, plus rental agreements, invoices, payments, and receipts.
  Exact counts may vary slightly between seed runs (names/addresses are randomized).
  Since Module 6 the seed also produces **owner statements, owner charges and
  payouts** for the 12 landlords with the largest portfolios (~24 statements,
  ~20 charges, ~15 payouts) — generated from the payments it just created, so
  every statement reconciles.
- **Market organizations:** 1 landlord, 1 property, 3 units (one deliberately
  vacant), 2 tenants, 2 leases and 6 invoices per market — settled, overdue
  and pending — all denominated in that market's currency, with an
  administrator login (`admin@<slug>.<domain>`) and a resident portal login
  (`tenant@<slug>.<domain>`). Property, unit, tenant and street names are
  randomized per run; the organization name and both logins are not.

---

## 5. Testing Steps

1. **Database Reset**: Run `npx prisma migrate dev` then `npx prisma db seed`
   (or `npx prisma migrate reset` + `npx prisma db seed` to wipe and reseed).
2. **Test Data Isolation**:
   - Login as admin@rohi.co.ke → sees the full demo dataset.
   - Login as admin@westhill.co.ke → sees only Westhill's one property.
   - Login as manager@westhill.co.ke → sees no finance nav.
3. **Test Super Admin**:
   - Login as admin@tuproperties.co.ke → access the Organizations page.
4. **Test New Organization**:
   - As Super Admin, create a new organization.
   - Create a user for that organization.
   - Login as the new user → should only see their org's data (none, initially).
5. **Test a market organization**:
   - Login as admin@liberty-property-group-us.com → one property, USD invoices,
     US-format telephone numbers.
   - Login as tenant@liberty-property-group-us.com → the resident portal, that
     tenant's invoices only.
   - Login as admin@rohi.co.ke → the Kenyan dataset; the US organization must
     not be visible from either account.

---

## 6. Automated Tests & CI

- **Backend unit tests** (no database needed — all Prisma collaborators are mocked):
  ```bash
  cd backend && npx jest --runInBand
  ```
  **1468 tests across 74 suites** (`npx jest`, 2026-10-20) — the ones that matter:
  - `jurisdictions.spec.ts` — the market list and the profiles behind it agree
    exactly (a profile with no market is a country the seeder would skip; a
    market with no profile is a country the seeder would crash on), **Africa is
    Kenya and South Africa only**, every profile is complete (currency, locale,
    timezone, tax rate, telephone prefixes that fit the subscriber length, a
    rent band with min < max), the primary market is hoisted to the front, and
    an unknown code is refused.
  - `statement-calculator.spec.ts` + `payout-status.spec.ts` (Module 6) — the owner-statement
    arithmetic in integer cents, the overlapping-period double-pay guard, carry-forward of an
    unpaid balance, and every payout gate (reference required to be paid, reason required to
    fail, no overpayment, PAID terminal).
  - `owner-statements.service.spec.ts`, `landlord-payouts.service.spec.ts`,
    `landlord-charges.service.spec.ts` (Module 6) — the derivation (including the sale-invoice
    exclusion), charge freezing, tenant isolation, and the payout lifecycle.
  - `auth.service.spec.ts` — session issuance (`jti` linkage), MFA-disabled/enabled login
    paths, `verifyMfa` (valid/invalid code, expired challenge), MFA enrollment
    (setup/enable/disable), logout + revoke-others, password reset revokes all sessions.
  - `properties.service.spec.ts` — the tenant-scoped CRUD pattern (create connects the
    caller's org, list filters by `organizationId`, read-by-id 404s cross-tenant,
    update/delete pre-verify ownership).
  - `common/utils.spec.ts` — `getTenantId` fail-closed, `requireRecord`, `assertTenantRecord`.
- **CI** (`.github/workflows/ci.yml`, runs on push to `main` + PRs):
  backend: `npm ci` → `prisma generate` → `tsc --noEmit` → `jest`;
  frontend: `npm ci --legacy-peer-deps` → `tsc --noEmit` → `next build`.

## 7. Auth Hardening Behaviors (2026-10-03)

- **Sessions:** every login creates a `Session` row tied to the JWT's `jti`.
  `POST /auth/logout` revokes the current session immediately (the cookie stops
  working, not just at expiry); `POST /auth/sessions/revoke-others` kills all
  other devices; a password reset kills every session. Verified behavior:
  request with a revoked cookie → 401.
- **MFA (TOTP):** Settings → Security → "Enable 2FA" gives a one-time secret +
  `otpauth://` URL; confirm with a 6-digit code. Once enabled, `/auth/login`
  returns `{ mfaRequired, mfaToken }` with no session cookie; the login page
  then asks for the authenticator code (`POST /auth/mfa/verify`). Wrong code →
  401. The challenge token expires after 5 minutes.
- **Rate limiting (per client IP):** login 10/5 min, register 5/hour,
  forgot/reset password 5/15 min, MFA verify 10/5 min → then HTTP 429 with
  `retryAfter`. Note: in-memory, per-process — a multi-instance deploy needs a
  shared store behind the same guard.
- **Audit trail:** all mutating requests + login/MFA/session/password-reset
  events are written to `AuditLog` with the actor's `organizationId`.
  `GET /audit` (ADMIN = own organization only, SUPER_ADMIN = all; cross-tenant
  reads 404).

## 8. Troubleshooting

1. **Database Connection**: Verify `DATABASE_URL` in `backend/.env`.
2. **Re-seed**: If data gets messy, run `npx prisma migrate reset` and then `npx prisma db seed`.
3. **Check Organization ID**: Users without an `organizationId` can only be Super Admins.
