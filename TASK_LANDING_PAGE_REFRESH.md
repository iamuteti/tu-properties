# Task: Landing Page Refresh — Multi-Market, Truthful Claims

**Status:** Complete — all five phases done, verified 2026-10-20 (see §9)
**Created:** Mon Oct 20 2026
**Goal:** Bring the public landing page (`frontend/app/page.tsx` + `frontend/components/landing/*`) back in line with what the platform actually is today: a **twenty-plus module** product that runs **one organization per market across fifteen jurisdictions**, where jurisdiction (currency, locale, timezone, tax rate, telephone format, tax-ID shape, utility tariffs, rent band) is *configuration rather than code*.

---

## 0. Resume protocol (read this first)

This file is self-contained. A new session that reads **only this file** should be able to continue the work without rediscovery.

1. Read §1–§3 for the goal and the current state.
2. Read §4 — the claim-vs-reality table. Every entry has a `file:line` evidence pointer. **Do not trust a landing-page claim without checking the cited source.**
3. Work the checklist in §6 in phase order. Tick boxes as you complete each item.
4. Update §9 (Progress log) after each phase so the next session knows where it stopped.
5. Verify with §7 before marking a phase done.

### Repository state warning

The working tree contains **uncommitted in-flight work that is not part of this task**: the security-deposits module (`backend/src/modules/security-deposits/`, `frontend/app/(dashboard)/security-deposits/`), `PropertyUnitType` / `PropertyDepositRule` unit-type work, `backend/src/prisma/transaction-class.ts`, `backend/src/prisma/backfill-unit-types.ts`, and `backend/src/prisma/permission-keys.spec.ts`. `git status` will show all of it as modified. **Do not revert, reformat or "clean up" those files.** If the security-deposits module is not finished by the time Phase 3 runs, defer the deposits feature item (P3.1) and note it in §9.

> **Update 2026-10-20:** the security-deposits work has since been committed — `git status` no longer lists it, and the module is registered in the running backend. The rest of the in-flight work (move-out changes in `backend/src/modules/moveouts/`, `frontend/app/(dashboard)/moving-out/`, `frontend/lib/api.ts`, `frontend/types/index.ts`, `frontend/hooks/use-moveouts.ts`, `frontend/components/agreements/`) belongs to another thread and was left untouched. **P3.1 was therefore not deferred** — the deposits card is on the page.

---

## 1. Goal (one paragraph)

The landing page is the only public face of the product, and it currently sells a **ten-module, one-organisation-with-branches** system — with "London · New York · Dubai · Nairobi · Singapore" in the corner and a `multi-branch and multi-currency` promise. The platform that actually exists has **twenty module documents plus a security-deposits module in flight**, and a *different* multi-country model: **fifteen separate organizations, one per market**, each carrying its own currency, locale, timezone, consumption-tax rate, telephone format, utility tariffs, tax-ID shape and rent band — a model that is now **demonstrable**, because the seed creates them and the landing page's demo tab lets a prospect sign into four of them and see four different sets of money, phone numbers and tax identifiers on the same screens.

The work has two halves. **Part A: make every claim true.** Several claims have quietly stopped being true (payment rails, role names, tax presets, WhatsApp, invoice counts) and a public page that overstates is a liability, not a marketing asset. **Part B: tell the better story.** The per-market model is a stronger pitch than multi-branch, and **nine** built modules are invisible on the page.

---

## 2. Current state (what exists)

### The page

`frontend/app/page.tsx` composes, in order:

| # | Component | File |
|---|---|---|
| 1 | Navbar | `frontend/components/landing/Navbar.tsx` |
| 2 | Hero (+ interactive dashboard mockup, branch switcher) | `frontend/components/landing/Hero.tsx` |
| 3 | MetricsStrip | `frontend/components/landing/MetricsStrip.tsx` |
| 4 | FeaturesList ("THE 10 CORE MODULES") | `frontend/components/landing/FeaturesList.tsx` |
| 5 | InteractiveShowcase (4 engines) | `frontend/components/landing/InteractiveShowcase.tsx` |
| 6 | TrustSection (12 role pills) | `frontend/components/landing/TrustSection.tsx` |
| 7 | SaaSSection | `frontend/components/landing/SaaSSection.tsx` |
| 8 | Testimonials | `frontend/components/landing/Testimonials.tsx` |
| 9 | **DemoAccountsSection (market tabs)** | `frontend/components/landing/DemoAccountsSection.tsx` |
| 10 | PricingSection | `frontend/components/landing/PricingSection.tsx` |
| 11 | FAQSection | `frontend/components/landing/FAQSection.tsx` |
| 12 | ContactSection | `frontend/components/landing/ContactSection.tsx` |
| 13 | FinalCTA | `frontend/components/landing/FinalCTA.tsx` |
| 14 | Footer | `frontend/components/landing/Footer.tsx` |
| 15 | TrialModal | `frontend/components/landing/TrialModal.tsx` |

**Nearly all the copy lives in one file**: `frontend/components/landing/data/landingData.ts` (337 lines) — `FEATURES`, `TRUST_POINTS`, `ADMIN_ROLES`, `NOTIFICATION_SCHEDULE`, `METRICS`, `TESTIMONIALS`, `PRICING_PLANS`, `FAQS`. **Most of Phase 1 and Phase 3 is edits to this one file.**

`DemoAccountsSection.tsx` was just redesigned (market tabs: KE / US / GB / AU). It is the strongest asset on the page and currently sits **below** the testimonials.

### The product, as built

- **Markets:** 15 seeded — `KE ZA US GB CA AU DE FR IN CN JP KR BR MX AE` (Africa = Kenya and South Africa only; UAE kept, Qatar/Saudi dropped). Profiles in `backend/src/prisma/jurisdictions.ts`; list exported as `DEMO_MARKETS`.
- **Demo data:** Rohi (primary market) = 120 landlords, 100 properties, **~2,500–2,600 units**, **~1,900–2,000 tenants**, **~15,000–16,000 invoices**, ~14,800 payments, ~14,800 receipts. Every other market gets a compact organization: 1 landlord, 1 property, 3 units (one vacant), 2 tenants, 2 leases, 6 invoices (paid / overdue / pending), admin + resident logins.
  > ⚠️ **The seed randomises, so these totals move a few percent between runs** (units 2,514 in one run, 2,633 in another). Any figure quoted on the landing page must therefore be a **rounded order of magnitude** — "2,500+ units", "15,000+ invoices" — never an exact count. The metrics strip already carries the "Demo data for illustration" caption; keep it.
- **Roles:** 13 seeded system roles — Super Admin, Company Admin, Property Manager, Leasing Officer, Sales Agent, Accountant, Maintenance Manager, Technician, Landlord, Tenant, Procurement Officer, HR Manager, Staff Self-Service (`backend/src/prisma/roles-seed.ts`).
- **Tax rules bundled:** KE (VAT, WHT), GB (VAT), DE (VAT), US (VAT by region CA/TX) — `backend/src/prisma/tax-rules-seed.ts`.
- **Payroll samples bundled:** KE, DE, GB only — `backend/src/prisma/payroll-rules-seed.ts`.
- **Notification channels:** `IN_APP`, `EMAIL`, `SMS` — `backend/src/prisma/schema.prisma:3341`.
- **Payment methods recorded:** `CASH`, `BANK_TRANSFER`, `CHEQUE`, `MPESA`, `CARD`, `OTHER` — `backend/src/prisma/schema.prisma:2454`. **The application records payments; it does not process them.**
- **Modules:** 20 documents in `docs/01-…` through `docs/20-…`, plus the security-deposits module in flight.

---

## 3. Desired state

| Layer | Change |
|-------|--------|
| Claims | Every statement on the page is traceable to code, data, or a module document. Nothing overstates. Where the product is deliberately narrower (payment processing, owner portal), the page says so. |
| Narrative | Multi-branch → **multi-market**: one organisation per jurisdiction, jurisdiction as configuration. |
| Coverage | The feature list grows past 10 and covers the modules that are actually built and demoable. |
| Proof | The market tabs move up the page; a jurisdiction configurator and a market proof strip make the configuration story tangible. |

---

## 4. Claim vs reality — the audit (every row has evidence)

> **All rows closed 2026-10-20.** The table below is kept as the record of what the audit found; the
> fixes and their verification are in §9. Two audit rows were corrected against the source before
> being acted on: A8's domain is `app.tu-properties.co.ke` (per `DEPLOYMENT.md`), not
> `app.tuproperties.co.ke`; and A3's `NotificationChannel` enum *does* contain `WHATSAPP` and `PUSH`
> members, but **no provider is registered for either** — so the page's claim was still false.

### A. Claims that are false or stale — **fix these first**

| # | Current claim (file:line) | Reality | Fix |
|---|---|---|---|
| A1 | "12 Admin-Defined Roles" — pills for Super Admin, Branch Manager, Finance Director, Letting Agent, Property Caretaker, Maintenance Lead, Utility Auditor, Payroll Officer, Compliance Auditor, Legal Officer, Front Desk, Auditor (Read-Only) (`TrustSection.tsx:138`, `landingData.ts:192-205`) | 13 roles seeded, **only "Super Admin" matches**. The section invites a click to "inspect its enforced permission scope", so it promises specificity about the thing that differs most | Replace `ADMIN_ROLES` with the 13 real names; update the count; re-point the per-role detail data at real permission summaries |
| A2 | "Every incoming payment (Stripe, Direct Debit, Card, or Mobile Money)…" (`Hero.tsx:473`); "**Instant settlement** via Stripe cards, bank direct debits, and regional mobile rails" (`landingData.ts:87`); "M-Pesa & Stripe automated payment logging" (`landingData.ts:259`) | No gateway integration exists. `PaymentMethod` records what was paid by | Say payments are **recorded against the ledger** and allocated FIFO; name the recorded rails (bank transfer, card, M-Pesa, cash, cheque) without claiming processing |
| A3 | "Priority **WhatsApp** & phone escalation" (`landingData.ts:286`); "SMS + **Push Alert**" (`landingData.ts:210`) | `NotificationChannel` = `IN_APP, EMAIL, SMS` | WhatsApp → email/SMS; drop "Push" |
| A4 | Tax simulator tab **NG** (FIRS, ITF, NHF) and notes claiming "eTIMS compatibility", "FUTA/SUTA", "automated digital VAT returns" (`InteractiveShowcase.tsx:68-75,66,58`) | Nigeria is **not** a jurisdiction profile any more. Bundled tax rules are KE/GB/DE/US; payroll samples KE/DE/GB | Remove NG; keep the presets that match the profiles (US, UK, KE, ZA, + add DE); replace the over-specific statutory claims with what the engine actually does |
| A5 | "**1,600+** Invoices Processed & Reconciled" (`landingData.ts:219`) | Rohi seeds **~16,000** invoices — an order of magnitude more than claimed | Raise to "15,000+". Quote a rounded figure (the seed randomises). The other two metrics — 2,500+ units, 1,900+ tenancies — are already correct |
| A6 | "all **10** modules" (`landingData.ts:16` heading, `SaaSSection.tsx:50` "full unconstrained access to all 10 modules") | 20 module docs + deposits in flight | See Phase 3 |
| A7 | "pre-configured with rulesets for the US, UK, EU, Kenya, **Nigeria**, South Africa, **Ghana**, UAE" (`landingData.ts:327`) | 15 markets have full jurisdiction profiles; 4 have bundled tax rules | Rewrite: *jurisdictions ship as profiles; statutory rates are configuration rows you add for your regime* |
| A8 | "app.tuproperties.**com**" (`Hero.tsx:133`); "TU Properties Engine **v4.2**" (`Hero.tsx:624`) | Real domain per `DEPLOYMENT.md` is `app.tuproperties.co.ke`; there is no v4.2 | Fix both |
| A9 | "Clear, technical answers to the **4** most critical questions" (`FAQSection.tsx:25`) | 5 FAQs | Say 5, or drop one |
| A10 | "operating across several **African borders**" (Enterprise tier, `landingData.ts:294`); pricing currency switcher is `USD / KES / NGN / ZAR` | The market story is global now; NGN is a dropped market | Reposition Enterprise globally; extend the switcher to the new markets' currencies; drop NGN |
| A11 | Owner portal: "currently in active private preview and coming shortly" (`landingData.ts:323`) | The owner **portal** is Phase 2 (not built), but owner statements, charges and payouts **are** built and seeded | Say the owner receives verified statements and payout receipts; the self-service owner portal is on the roadmap |
| A12 | "Statements dispatched via PDF email and SMS summary link" (`landingData.ts:59`) | Email and SMS are real now (notification module) — this is an *under*-claim | Keep, and upgrade to name the module |

### B. The multi-market reframe (Phase 2)

| # | Current | Target |
|---|---|---|
| B1 | Hero badge: `London • New York • Dubai • Nairobi • Singapore` (`Hero.tsx:55`) | The 15-market shortlist with currencies |
| B2 | Hero subheadline: "…one audited platform with **multi-branch and multi-currency** controls" (`Hero.tsx:70`) | "…one platform where each market is its own organization with its own currency, locale and tax rules" |
| B3 | Hero mockup branch switcher `London / New York / Nairobi / Dubai` (`Hero.tsx:143-155`), per-branch currency and tax labels (`Hero.tsx:228-253, 303-331`) | A **market** switcher driven by the real market list, changing currency, tax rate, tax label, locale and phone format |
| B4 | SaaSSection: "multi-branch provisioning" (`SaaSSection.tsx:50`) | "multi-market provisioning" |
| B5 | Pricing: Enterprise badge/description (`landingData.ts:291-300`) | Global positioning; new currencies |

### C. Modules that are built but invisible (Phase 3)

Not on the page today, all built, seeded and demoable:

CRM lead capture · Sales pipeline (quotations, commissions) · Procurement (RFQ multi-quote → purchase order → goods receipt) · Inventory · Facilities & bookings (visitor log, amenity booking, access cards) · Documents & Legal (compliance certificates, lease contracts, renewals) · Notifications (email/SMS campaigns, resident comms) · SaaS Administration (platform onboarding, module toggles, plan limits) · **Security Deposits** (unit types with per-type deposit rules, derived settlement — in flight).

The **deposits** module is the best fit for this page: it is the purest expression of the page's own thesis (*derived, never typed*) — the deposit follows the rent, deductions come from logged inspection damage, the refund is computed. It is already in the seed (`PropertyUnitType` + `PropertyDepositRule`).

### D. Open decisions (defaults in force — say the word to change)

| ID | Decision | Default in force |
|---|---|---|
| D1 | Scope of this task | **Full refresh** (Phases 1–5). If a narrower pass is wanted, Phase 1 alone is the credibility floor |
| D2 | Invented testimonials | **Keep, but relabel honestly.** `TESTIMONIALS` are invented people (Eleanor Vance, Marcus Sterling) with a per-card "Illustrative example" label. Default: replace with quotes attributed to the **demo personas** (the market tab makes that possible) — or drop the section. Do not publish invented principals of invented firms under a small label |
| D3 | Feature-list size | **Expand** from 10 to cover the built modules, keeping "10 core modules" out of the copy. If the list must stay short, group the additions under one "Also included" card rather than dropping them |
| D4 | New sections (Phase 4) | **Do them** — the market proof strip and the jurisdiction configurator are the strongest new material |
| D5 | Market proof strip content | Data-driven from `backend/src/prisma/jurisdictions.ts` (code, country, currency, locale, VAT rate, phone format, rent band) — copy the values into the landing data file, do **not** import backend code into the frontend |

---

## 5. Ground rules for every claim

1. **No claim without a source.** Every number, role name, country, rate and capability on the page must be traceable to code, seed data or a module document. If it cannot be traced, cut it.
2. **Distinguish "records" from "processes".** The app records payments, allocates them FIFO, derives statements and posts to a double-entry ledger. It does not call Stripe or M-Pesa.
3. **Distinguish "built" from "coming".** Owner portal, payment gateways and statutory adapters for un-bundled jurisdictions are roadmap items.
4. **Jurisdiction is configuration.** Fifteen profiles exist; statutory *rates* are configuration you add. Do not imply more presets ship than do.
5. **Illustrative mockup numbers are fine; illustrative product facts are not.** A dashboard mockup may show a plausible rent roll. It may not claim a payment gateway, a role, or a version that does not exist.
6. **One source of copy.** Changes go in `landingData.ts` unless the claim lives in a component body.

---

## 6. Checklist (tick as you go)

### Phase 1 — Credibility (do this first; it is the floor)

- [x] **P1.1** Replace `ADMIN_ROLES` with the 13 real seeded role names, in a sensible order (`landingData.ts:192-205`)
- [x] **P1.2** Update the "12 Admin-Defined Roles" count and the `TRUST_POINTS` entry that says "12 Admin-Defined Roles" (`landingData.ts:181`)
- [x] **P1.3** Re-point the TrustSection role detail panel at real permission summaries instead of the invented Finance Director scope (`TrustSection.tsx` role-detail block)
- [x] **P1.4** Rewrite the payments copy: "Every incoming payment (Stripe, Direct Debit, Card, or Mobile Money)" → payments are *recorded* against the tenant's invoices and allocated oldest-first (`Hero.tsx:473`)
- [x] **P1.5** Rewrite "Instant settlement via Stripe cards, bank direct debits, and regional mobile rails" → name the recorded rails only (`landingData.ts:87`)
- [x] **P1.6** Fix "M-Pesa & Stripe automated payment logging" (`landingData.ts:259`)
- [x] **P1.7** Remove the WhatsApp promise; use email/SMS (`landingData.ts:286`)
- [x] **P1.8** Remove "Push Alert" from the notification schedule (`landingData.ts:210`)
- [x] **P1.9** Remove the **NG** tax preset and the Nigeria-specific statutory claims (`InteractiveShowcase.tsx:68-75`)
- [x] **P1.10** Add a **DE** tax preset and align the KE/UK/US/ZA statutory notes with what the engine actually does (no "eTIMS compatibility", no "digital VAT returns")
- [x] **P1.11** Update `METRICS.invoices` to a rounded "15,000+" (`landingData.ts:219`) — the seeded figure runs ~15,000–16,000 and moves a few percent per run, so never quote an exact count
- [x] **P1.12** Fix the domain `app.tuproperties.com` → `app.tu-properties.co.ke` (`Hero.tsx:133`)
- [x] **P1.13** Remove "TU Properties Engine v4.2" (`Hero.tsx:624`)
- [x] **P1.14** Fix the FAQ count "4 most critical questions" → 5 (`FAQSection.tsx:25`)
- [x] **P1.15** Rewrite the tax FAQ answer to the fifteen-jurisdiction / configuration story (`landingData.ts:327`)
- [x] **P1.16** Rewrite the owner-login FAQ answer to say owner statements and payouts ship today, self-service owner portal is roadmap (`landingData.ts:323`)
- [x] **P1.17** Reposition the Enterprise tier away from "several African borders" and drop NGN from the pricing currency switcher (`landingData.ts:244-313`, `PricingSection.tsx`)

**Phase 1 gate:** no string on the page asserts a capability that `grep` cannot find in the backend. ✅ — swept `frontend/components/landing/**` for `Stripe|WhatsApp|Push Alert|NGN|Nigeria|v4.2|multi-branch|Singapore|webhook|gateway|tuproperties.com`: zero hits remain. The only surviving `webhook` mentions are the CRM public lead-capture webhook (real, `docs/04-MODULE-crm.md`) and the notifications card's explicit "no WhatsApp or push provider is claimed" line.

### Phase 2 — Reframe to multi-market

- [x] **P2.1** Hero badge: replace the five-city list with the 15-market shortlist (`Hero.tsx:55`)
- [x] **P2.2** Hero subheadline: "multi-branch and multi-currency controls" → per-market organisations with their own currency, locale and tax rules (`Hero.tsx:70`)
- [x] **P2.3** Convert the mockup's branch switcher into a market switcher over the 15 markets (`Hero.tsx:143-155`)
- [x] **P2.4** Make the mockup's currency, tax label and stat cards market-derived (currency code, VAT/WHT rate, locale, phone format) rather than the four hard-coded branches (`Hero.tsx:228-253, 303-331`)
- [x] **P2.5** SaaSSection: "multi-branch provisioning" → "multi-market provisioning"; "all 10 modules" → the real module set (`SaaSSection.tsx:50`)
- [x] **P2.6** Extend the pricing currency switcher to the new markets' currencies (EUR, GBP, INR, JPY, CNY, KRW, BRL, MXN, AED) and set sensible amounts (`PricingSection.tsx`)
- [x] **P2.7** Navbar/hero chip alignment: the marketing chip and the demo tab should tell the same story

### Phase 3 — Show what was built

- [x] **P3.1** Add the **Security Deposits** feature card (unit types → per-type deposit rules → derived settlement) — *defer if the module is still in flight* (`landingData.ts` `FEATURES`)
- [x] **P3.2** Add **CRM & Lead Capture**
- [x] **P3.3** Add **Sales Pipeline** (quotations, commissions)
- [x] **P3.4** Add **Procurement** (RFQ multi-quote → PO → goods receipt)
- [x] **P3.5** Add **Inventory**
- [x] **P3.6** Add **Facilities & Bookings**
- [x] **P3.7** Add **Documents, Legal & Compliance**
- [x] **P3.8** Add **Notifications & Resident Comms**
- [x] **P3.9** Add **Platform Administration** (multi-org onboarding, module toggles, plan limits)
- [x] **P3.10** Update the FeaturesList heading ("THE 10 CORE MODULES" / "All 10 Features") and its filter tabs (`FeaturesList.tsx`, `landingData.ts`)
- [x] **P3.11** Update the SaaSSection module count
- [x] **P3.12** Confirm the feature cards' `proofPoint` and `details` for every added card against the relevant `docs/NN-MODULE-*.md`

### Phase 4 — New proof

- [x] **P4.1** Build the **market proof strip**: 15 markets × (code, country, currency, locale, VAT rate, phone format, rent band), data copied into `landingData.ts` from `backend/src/prisma/jurisdictions.ts` (no backend import)
- [x] **P4.2** Build the **jurisdiction configurator**: pick a country → a derived tenant phone number, tax ID, rent, currency and utility tariff, re-derived live
- [x] **P4.3** Move `DemoAccountsSection` **above** `Testimonials` in `frontend/app/page.tsx`
- [x] **P4.4** Ensure the demo section's market list and the market proof strip agree (one source)

### Phase 5 — Verification

- [x] **P5.1** `cd frontend && npx tsc --noEmit`
- [x] **P5.2** `cd frontend && npx eslint app/page.tsx components/landing`
- [x] **P5.3** `cd frontend && npm run build` — **known pre-existing failure**: the `/auth/login` prerender fails with `useSearchParams()` outside a Suspense boundary. Confirm it is the *same* failure and not a new one (see §7)
- [x] **P5.4** Run `npm run dev` from `frontend/` and walk the whole page: nav, every tab, every engine, pricing currency switcher, FAQ, demo tabs, direct-login links
- [x] **P5.5** Confirm each demo login still signs in (KE / US / GB / AU) and that the market data shows the right currency, phone format and tax-ID shape
- [x] **P5.6** Re-read every claim on the finished page against §4 and tick off each row
- [x] **P5.7** Update `docs/00-MASTER-ARCHITECTURE.md` with a numbered entry recording this refresh
- [x] **P5.8** Update this file's §9 progress log and mark §6 phase boxes

---

## 7. Verification commands

```bash
# Frontend (from frontend/)
npx tsc --noEmit
npx eslint app/page.tsx components/landing
npm run build          # expect the known /auth/login Suspense failure — see §7 note
npm run dev            # port is chosen by scripts/with-port.mjs; read the log for the URL

# The landing page's server-rendered HTML (verify every market login is present)
curl -s http://127.0.0.1:<port>/ | grep -c "admin@liberty-property-group-us.com"

# Ground truth for the numbers (from backend/)
npx jest src/prisma/jurisdictions.spec.ts
```

**Pre-existing build failure (do not try to fix it as part of this task):** `next build` fails prerendering `/auth/login` — `useSearchParams()` is called in a client component with no Suspense boundary. Verified present on untouched `HEAD` files (2026-10-20). If the build fails with a *different* error, that one is ours.

---

## 8. Files this task will touch

- `frontend/components/landing/data/landingData.ts` — **most of the copy** (features, roles, metrics, pricing, FAQs, testimonials)
- `frontend/components/landing/Hero.tsx` — badge, subheadline, market switcher, mockup values, domain, version string
- `frontend/components/landing/InteractiveShowcase.tsx` — tax presets
- `frontend/components/landing/TrustSection.tsx` — role pills and detail panel
- `frontend/components/landing/SaaSSection.tsx` — module count, provisioning language
- `frontend/components/landing/FeaturesList.tsx` — heading, filters, card count
- `frontend/components/landing/PricingSection.tsx` — currency switcher
- `frontend/components/landing/FAQSection.tsx` — count
- `frontend/components/landing/Testimonials.tsx` — decision D2
- `frontend/app/page.tsx` — section order (Phase 4.3)
- **New:** `frontend/components/landing/MarketProofStrip.tsx`, `frontend/components/landing/JurisdictionConfigurator.tsx` (names to finalise)
- `docs/00-MASTER-ARCHITECTURE.md` — record the refresh (P5.7)

**Do not touch** `frontend/components/landing/DemoAccountsSection.tsx` except for the P4.4 consistency check — it was just redesigned and is correct.

---

## 9. Progress log

| Date | Phase | Status | Notes |
|---|---|---|---|
| 2026-10-20 | — | Planned | File created. Audit of every claim against code, seed data and module docs completed and recorded in §4. No code written yet. |
| 2026-10-20 | 1 | Done | Credibility floor. `ADMIN_ROLES` → the 13 seeded names; role detail panel re-pointed at real permission summaries (moved to `ROLE_PERMISSIONS` in `landingData.ts`). Payments re-worded as *recorded* against the ledger (rails: bank transfer, card, M-Pesa, cash, cheque — the `PaymentMethod` enum). WhatsApp → email/SMS; "Push Alert" removed (the enum has `WHATSAPP`/`PUSH` members but **no provider is registered** for either). NG tax preset removed, DE added, statutory notes rewritten to what the engine does. Invoice metric 1,600+ → 15,000+ (rounded; the seed randomises). Domain → `app.tu-properties.co.ke`; "Engine v4.2" removed. FAQ count 4 → 5; tax and owner-portal answers rewritten. Enterprise repositioned globally; NGN dropped. |
| 2026-10-20 | 2 | Done | Multi-market reframe. New `MARKETS` array (15 profiles) copied by hand from `backend/src/prisma/jurisdictions.ts` into `landingData.ts` — currency, locale, timezone, VAT rate, tax-ID label + example, phone example, rent band, utility tariffs, seeded organization name, four illustrative properties. Hero badge → the 15 market codes; subheadline → one organization per market. The mockup's four hard-coded branches became a 15-market `<select>`; currency, tax label, rent roll, property rows, payment rows and owner payouts are all derived from the selected market via `Intl.NumberFormat` + the market's own locale. Pricing switcher extended to 12 currencies (USD KES ZAR GBP EUR INR JPY CNY KRW BRL MXN AED) with per-currency amounts. Navbar now says "Multi-Market Architecture" and "20 Core Modules"; Footer market chips are generated from `MARKETS`. |
| 2026-10-20 | 3 | Done | Feature list expanded 10 → **20** cards: added CRM & Lead Capture, Sales Pipeline, Procurement, Inventory, Facilities & Bookings, Documents/Legal/Compliance, Notifications & Resident Comms, Tenant Requests & Move-Out, Platform Administration and Security Deposits. Each card's `proofPoint` and three `details` checked against `docs/04,05,11,12,14,16,18,20-MODULE-*.md`. Filter tabs rebuilt into six groups that partition all 20. **P3.1 was not deferred** — `backend/src/modules/security-deposits/` and `frontend/app/(dashboard)/security-deposits/` are present and the module is registered in the running backend (`SecurityDepositsController {/security-deposits}` mapped with `policies`, `rule`, `unit-types/:unitTypeId/rule`), so the card is honest. |
| 2026-10-20 | 4 | Done | Two new components: `MarketProofStrip.tsx` (15 cards: code, country, currency, locale, tax label, phone format, tax-ID shape, rent band, typical rent) and `JurisdictionConfigurator.tsx` (pick a market → derived tenant phone, landlord tax ID, typical rent, consumption tax, electricity/water/gas tariffs, plus currency, locale, timezone and city). `DemoAccountsSection` moved **above** `Testimonials` in `app/page.tsx`. The proof strip's demo-login links and the demo tabs agree on KE / US / GB / AU. |
| 2026-10-20 | 5 | Done | `npx tsc --noEmit` clean. `npx eslint app/page.tsx components/landing` → **0 errors**, 28 warnings, all pre-existing unused-import warnings (the three files this task rewrote — `Hero.tsx`, `FeaturesList.tsx`, `JurisdictionConfigurator.tsx` — carry none). `npm run build` compiles and then fails with **exactly** the documented pre-existing `/auth/login` `useSearchParams()` Suspense error — same failure, not a new one. (A first build attempt died on a transient Google Fonts fetch; the retry passed compilation.) Dev server on :3007 rendered 200; verified in the served HTML: 15 market options, 15 proof-strip cards, 15 configurator buttons, 20 feature cards, all four demo logins present, section order `features → how-it-works → trust → saas → markets → jurisdiction → demo-accounts → pricing → faq → contact`. Backend on :3008: all four demo logins return 200 and resolve to the right organization, currency and locale; the seeded rows confirm the market shapes (KE `A1O7IDUL62Q` / `+254 708718079`, US `42-8247193` / `+1 5176035571`, GB `9745574652` / `+44 7401642788`, AU `62088966689` / `+61 467683032`, CA 9-digit BN, ZA 10-digit Tax Number). `docs/00-MASTER-ARCHITECTURE.md` gained issues **130**, **131** and **132**. |
| 2026-10-20 | 5b | Done | Two claims found by the final served-HTML sweep rather than by the source sweep, and fixed: `Footer.tsx` still said **"12 Admin-Defined Roles"** in its link column, and `frontend/app/layout.tsx` still carried the page metadata **"Multi-tenant SaaS platform for property management companies, landlords, and letting agents across Africa and beyond"** — a stale multi-tenant / letting-agents / Africa-only description that predated the multi-market reframe. Title is now "TU Properties — Multi-Market Property Management Platform". The remaining "Multi-Tenant DB Isolation" footer link is deliberate: it describes database tenancy per organization, which is what `TRUST_POINTS` and the schema partitioning actually mean. |
| 2026-10-20 | 5c | Done | **Domain corrected to `properties.tuhame.co.ke`** (user-confirmed). The audit had followed `DEPLOYMENT.md`'s env-variable table, which carried `app.tu-properties.co.ke` — but that value was itself the placeholder ("replace with your real domain", line 369), while the concrete nginx/certbot/verification blocks in the same file use `properties.tuhame.co.ke` / `api-properties.tuhame.co.ke`. Changed: `Hero.tsx` `APP_ORIGIN`; `DEPLOYMENT.md` env table (backend `FRONTEND_URL` + `CORS_ORIGINS`, frontend `NEXT_PUBLIC_BACKEND_URL`), the domain bullet, the wildcard-DNS note and the production-env checklist; `backend/.env` `CORS_ORIGINS` (exact-origin comparison — the placeholder origin would have rejected the real one); the support mailbox (`support@tuhame.co.ke`). The seeded Super Admin `admin@tuproperties.co.ke` was **not** changed: it is a demo credential that must match the database. |
| 2026-10-20 | 5d | Done | **The market list and the currency list are now driven by `frontend/.env`.** Five market surfaces (hero badge, hero market switcher, footer chips, jurisdiction configurator, market proof strip) and the pricing currency switcher each carried their own copy of the same lists. Two new vars now decide them, comma-separated and order-significant: `NEXT_PUBLIC_LANDING_MARKETS` (ISO-3166-1 alpha-2) and `NEXT_PUBLIC_LANDING_CURRENCIES` (ISO-4217). `landingData.ts` filters its copied profile list through the env at module load, so every surface follows automatically and the counts in the copy ("15 Jurisdictions", "fifteen local realities", "15 Market Profiles") are derived rather than typed. Unknown codes are dropped with a console warning; an all-unknown list falls back to the full set rather than rendering an empty section. `frontend/.env` and `frontend/.env.example` both document them (and note that `NEXT_PUBLIC_*` is inlined at build time). Verified by narrowing the env to `KE,US,GB` / `USD,GBP,EUR` and re-reading the served HTML — 3 switcher options, 3 proof-strip cards, 3 footer chips, "3 Jurisdictions", "three local realities", 3-button currency switcher — then restoring the full lists. |
| 2026-10-20 | 5e | Done | **The currency list now matches the market list.** The switcher offered twelve currencies while the page showed fifteen markets, and **CAD and AUD were missing** — not merely absent from the switcher but not even keys the `PricingCurrency` union allowed, so `plan.pricing['CAD']` could not have existed. Germany and France share the euro, so **fourteen currencies cover fifteen markets**; the switcher now carries all fourteen and every tier has a CAD and an AUD amount (`CA$` 67/177/410 and `A$` 74/197/457 monthly against USD 49/129/299), with `CA$` and `A$` added to `CURRENCY_SYMBOLS`. `PricingCurrency` gained `'CAD' | 'AUD'`, `ALL_PRICING_CURRENCIES` gained both, and the pricing card now falls back to USD if a currency somehow has no amounts. Leaving `NEXT_PUBLIC_LANDING_CURRENCIES` unset now derives the list from the enabled markets, so the two lists cannot drift apart the way these two did. Verified: switcher renders `USD KES ZAR GBP CAD AUD EUR INR CNY JPY KRW BRL MXN AED`, and a market-currency vs switcher cross-check reports no market currency unpriceable and no switcher currency without a market. |

### Notes for the next session

- **The real domain is `properties.tuhame.co.ke`.** `DEPLOYMENT.md` was the source, but not in the place the audit assumed: its **env-variable table** carried `app.tu-properties.co.ke` with the note *"replace with your real domain"*, while the **nginx / certbot / verification blocks** further down use `properties.tuhame.co.ke` (frontend) and `api-properties.tuhame.co.ke` (backend) — those are the concrete deployment steps, so the table was the placeholder. The user confirmed this on 2026-10-20. The Hero mockup now shows `properties.tuhame.co.ke`; `DEPLOYMENT.md`'s env table, its domain bullet, the wildcard-DNS note and the production-env checklist were all corrected to match its own nginx block; `backend/.env`'s `CORS_ORIGINS` was changed from the placeholder origin to `https://properties.tuhame.co.ke` (the backend compares CORS origins exactly, so the old value would have rejected the real origin); and the support mailbox became `support@tuhame.co.ke`.
- **The platform's e-mail domain is different from its web domain, and deliberately left that way.** The seeded Super Admin is `admin@tuproperties.co.ke` (`backend/src/prisma/seed.ts:106`, `Testing.md`, `docs/20-MODULE-saas-administration.md`) and the demo section and the login page both show that credential, so it must keep matching the database. It is a *demo account*, not the corporate mail domain, so it was not changed.
- **`MARKETS` in `landingData.ts` is a hand-copy of `backend/src/prisma/jurisdictions.ts`** and will drift if a market profile changes. The header comment in `landingData.ts` says so. A follow-up worth doing: generate the frontend copy from the backend file in the seeder, or add a spec that compares them. **Which** of those profiles appear on the page is now deployment configuration (`NEXT_PUBLIC_LANDING_MARKETS` in `frontend/.env`) rather than page copy — change it there and rebuild, not in the component.
- **The demo data set in the local database was seeded with a subset** (KE, ZA, US, GB, CA, AU). The page still lists all fifteen markets — that is correct, because the profile set is fifteen; only the *seeded organizations* depend on `DEMO_COUNTRIES`.
- **Open items deliberately left alone:** the owner self-service portal, payment gateways, and statutory adapters for un-bundled jurisdictions remain roadmap and are now labelled as such on the page. The `/auth/login` Suspense build failure is still the pre-existing one.

