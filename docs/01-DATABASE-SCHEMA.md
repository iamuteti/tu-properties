# TU Properties — Database Schema (Target, Postgres via Prisma 7)

> Read `00-MASTER-ARCHITECTURE.md` first. **Database engine is PostgreSQL — non-negotiable.**
>
> **Before touching this doc's contents:** open `backend/src/prisma/schema.prisma` and treat it as the current source of truth. The schema currently has **20 Prisma models** (`schema.prisma` lines 17–905), verified by a full codebase audit — more than this doc's "believed existing" tables below account for individually, because several accounting/integration fields already exist on models below as placeholder columns with no logic behind them yet. Specifically verified as already present but **unwired**:
> - `acReceivable`, `incomeAccount`, `spotRate` (accounting/GL-adjacent fields, likely on Property/Invoice/Account-like models) — no chart of accounts or GL engine consumes them yet.
> - `Property.mpesaPropertyPayNumber` — a payment gateway config field exists, but no live payment gateway integration, reconciliation logic exists.
> - `Invoice.signOnEfims` — a legacy boolean named after one country's e-invoicing system. It is **not** a multi-jurisdiction compliance flag: statutory e-invoicing differs per country (transmission API, document format, verification/QR scheme, fiscal-device rules). It is unwired and should be **replaced** by a jurisdiction-driven transmission status on the invoice, not extended with more single-country booleans. See `08-MODULE-finance-accounting.md`.
> - `Receipt.bankingDate` — field exists, reconciliation logic doesn't.
> - `exemptAllSms` — an SMS opt-out flag with no SMS sending system behind it yet.
>
> **Tax is now real and country-agnostic (added 2026-10-04).** `tax_rules` plus `Organization.taxCountryCode`/`taxRegionCode`/`taxRegistrationNumber` are live and drive invoice pricing — see the Finance & Accounting domain below. Nothing in the schema or code assumes a particular country, currency or rate; a jurisdiction is data.
>
> **Do not add duplicate fields for any of the above** — extend/wire the existing ones. Also verified: `AuditLog` model exists and a `logAction()` service exists (`backend/src/modules/audit/audit.service.ts`), but `logAction` is **never called anywhere in the codebase** — it needs to be wired into every create/update/delete on tenant data, not rebuilt.
>
> Tables below marked "✅ Believed existing" should be reconciled field-by-field against the live file — treat this doc as the *target* shape, not a guaranteed-accurate mirror of today's schema.
>
> **Drift watch (2026-10-03):** the live `schema.prisma` was verified against the live DB via `migrate deploy` — the DB was behind the schema (users table lacked the password-reset columns), and catch-up migration `20261003082158_add_password_reset_fields` was created and applied. After any schema edit, run `npx prisma migrate dev` so the migrations directory stays the source of truth for the DB; a fresh DB is built with `npx prisma migrate deploy` + `npx prisma db seed` (seed now includes the full demo dataset — see `Testing.md`).
>
 > **Drift watch (2026-10-03, verified against live schema + DB):** this doc's "Conventions" say *every* tenant table carries `organizationId`. The live schema does **not** enforce that on child/line models: `Unit`, `UnitServiceCharge`, `UnitMeterNumber`, `UnitFeature`, `PropertyStandingCharge`, `PropertySecurityDeposit`, `TenantEmergencyContact`, `InvoiceItem`, `ReceiptLine` have **no `organizationId` column** — tenant scoping flows through the parent relation (`Unit` → `Property`). Also live: `Organization` carries SaaS-plan fields (`plan`, `maxUsers`, `maxProperties`, `slug`, `subdomain`, branding) that this doc's target model does not show. Querying a child model directly with `where: { organizationId }` throws a Prisma validation error — always filter by the parent relation (e.g. `{ property: { organizationId } }`). Do not "fix" this by adding `organizationId` to `Unit` etc. without an explicit decision — it is a data-integrity migration, not a drive-by change.
 >
 > **Drift watch (2026-10-03, auth hardening pass):** migration `20261003103521_add_sessions_mfa_audit_org` added (a) the `Session` model — server-side backing for the httpOnly auth cookie: `jti @unique`, `userId` (cascade), denormalized `organizationId`, `expiresAt`, `revokedAt`, `ipAddress`, `userAgent`; the `JwtStrategy` rejects any token whose `jti` is missing/revoked/expired (fail-closed), which is what makes logout / revoke-others / password-reset instantly kill sessions; (b) `User.mfaSecret` + `User.mfaEnabled` (TOTP enrollment); (c) `AuditLog.organizationId` (nullable, `SetNull`; NULL = platform-level SUPER_ADMIN action) so audit queries can be tenant-scoped without joining through the audited entity. The live `User` model also differs from the target shape above (flat `role UserRole` enum instead of the `Role`/`UserRole` permission tables — that structured RBAC model is Module 1 work).

---

## Conventions for every table

- Primary key: `id String @id @default(uuid())`
- Tenant tables: `organizationId String` + `@@index([organizationId])` + relation to `Organization`
- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- Soft delete where the module doc calls for it: `deletedAt DateTime?` (nullable; filter `WHERE deletedAt IS NULL` in services — do not hard-delete tenant financial/legal records)
- Money fields: `Decimal @db.Decimal(14,2)` — never `Float`
- Enums: use Prisma `enum` types, not free-text strings, for status fields
- All FKs indexed

---

## Domain: Identity & Organization (Module: Core Platform) — ✅ Believed existing, verify & extend

```prisma
model Organization {
  id            String   @id @default(uuid())
  name          String
  legalName     String?
  taxId         String?
  currency      String   @default("USD")
  timezone      String   @default("UTC")
  status        OrgStatus @default(ACTIVE)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  branches      Branch[]
  users         User[]
  // ... relations to all tenant-scoped domains
}

enum OrgStatus {
  ACTIVE
  SUSPENDED
  TRIAL
  CANCELLED
}

model Branch {
  id             String   @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  address        String?
  @@index([organizationId])
}

model User {
  id             String   @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  email          String   @unique
  passwordHash   String
  firstName      String
  lastName       String
  status         UserStatus @default(ACTIVE)
  twoFactorEnabled Boolean @default(false)
  lastLoginAt    DateTime?
  // Live in the real schema (added by migration 20261003082158_add_password_reset_fields):
  resetPasswordToken   String? // SHA-256 hashed token for /auth/reset-password
  resetPasswordExpires DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  roles          UserRole[]
  auditLogs      AuditLog[]
  @@index([organizationId])
}

enum UserStatus {
  ACTIVE
  INVITED
  SUSPENDED
  DISABLED
}

model Role {
  id             String   @id @default(uuid())
  organizationId String?  // null = system-defined role available to all orgs
  name           String   // Super Admin, Company Admin, Property Manager, Leasing Officer,
                           // Sales Agent, Accountant, Maintenance Manager, Technician,
                           // Landlord, Tenant, Procurement Officer, HR Manager
  permissions    Json     // structured permission set
  users          UserRole[]
}

model UserRole {
  id      String @id @default(uuid())
  userId  String
  roleId  String
  user    User @relation(fields: [userId], references: [id])
  role    Role @relation(fields: [roleId], references: [id])
  @@unique([userId, roleId])
}

model AuditLog {
  id             String   @id @default(uuid())
  organizationId String
  userId         String?
  action         String
  entityType     String
  entityId       String?
  metadata       Json?
  ipAddress      String?
  createdAt      DateTime @default(now())
  @@index([organizationId])
  @@index([entityType, entityId])
}

model Document {
  id             String   @id @default(uuid())
  organizationId String
  entityType     String   // polymorphic: "Property", "Lease", "Tenant", etc.
  entityId       String
  fileName       String
  fileUrl        String
  mimeType       String
  version        Int      @default(1)
  uploadedById   String?
  uploadedBy     User?   @relation(fields: [uploadedById], references: [id], onDelete: SetNull)
  createdAt      DateTime @default(now())
  @@index([organizationId])
  @@index([entityType, entityId])
}
```

> **Drift watch (2026-10-03, Core Platform bug-fix):** `AuditLog.userId` and `Document.uploadedById` are **nullable** with `onDelete: SetNull` (matching `AuditLog.userId String?` above). A non-nullable `Restrict` FK meant `DELETE /users/:id` returned HTTP 500 whenever a user had audit rows or had uploaded documents; both are now nullable so audit history is retained while user deletion succeeds (the actor reference is nulled, not the row). Treat `schema.prisma` as the source of truth for FK actions; this doc is the target shape only.

---

## Domain: Property (Module: Property Management) — ✅ Resolved 2026-10-03 (see `03-MODULE-property-management.md`)

**Target vs. shipped.** The block below is the original target sketch. What Module 2 actually shipped keeps the
same intent but differs where the existing schema forced it to:

| Target | Shipped | Why |
| --- | --- | --- |
| `status PropertyStatus` | ✅ `PropertyStatus { ACTIVE, INACTIVE, ARCHIVED }` on `Property.status` | Adds the operational middle state competitors have. `INACTIVE` is "managed but not listed"; `ARCHIVED` is hidden from default lists. |
| `branchId String?` | ✅ `Property.branchId` → `Branch` (`onDelete: SetNull`) | The relationship was missing entirely. Nullable so pre-Module-2 rows keep working. |
| — | ✅ `PropertyAmenity` (unique `(propertyId, name)`, cascade delete, `category`, `notes`) | Amenities were never stored. Structured rows so they can be filtered and grouped in reports. |
| `addressLine1/2`, `city` | `roadStreet`, `estateArea`, `areaRegion`, `country` | The `properties` table already had granular location columns; the demo layout ("Area / Region, Estate / Area, Country, Road / Street") matches the product screenshots, so no rename was warranted. |
| `gpsLat/gpsLng Decimal(9,6)` | `latitude`/`longitude` as `Float` with `@db.Decimal(9,6)` | Column names already existed as `latitude`/`longitude`. |
| `type PropertyType` (enum) | `type String?` + `category String?` | An enum would require a migration over 100 seeded properties and blocks the free-form types the demo shows. Values are seeded from `PROPERTY_TYPES`/`PROPERTY_CATEGORIES` in `frontend/lib/constants.ts`. |
| — | Occupancy is derived, not stored free-form | `Unit.status` stays a column (for queries/indexes) but can only change through `PATCH /units/:id/status`, which validates it against the unit's `RentalAgreement` records; the leases module re-derives it on every agreement change. |

```prisma
model Property {
  id             String   @id @default(uuid())
  organizationId String
  landlordId     String?
  branchId       String?
  code           String
  name           String
  type           PropertyType
  status         PropertyStatus @default(ACTIVE)
  addressLine1   String?
  addressLine2   String?
  city           String?
  gpsLat         Decimal? @db.Decimal(9,6)
  gpsLng         Decimal? @db.Decimal(9,6)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  units          Unit[]
  @@index([organizationId])
}

enum PropertyType {
  RESIDENTIAL
  COMMERCIAL
  MIXED_USE
  LAND
  WAREHOUSE
  APARTMENT_BLOCK
  VILLA
}

enum PropertyStatus {
  ACTIVE
  INACTIVE
  ARCHIVED
}

model PropertyAmenity {
  id         String   @id @default(cuid())
  propertyId String
  property   Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  name       String
  category   String?
  notes      String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([propertyId, name])
  @@index([propertyId])
}

model Unit {
  id             String   @id @default(uuid())
  organizationId String
  propertyId     String
  property       Property @relation(fields: [propertyId], references: [id])
  unitNumber     String
  floor          String?
  bedrooms       Int?
  bathrooms      Int?
  areaSqM        Decimal? @db.Decimal(10,2)
  occupancyStatus UnitOccupancyStatus @default(VACANT)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId])
  @@index([propertyId])
}

enum UnitOccupancyStatus {
  VACANT
  OCCUPIED
  RESERVED
  UNDER_MAINTENANCE
  SOLD
}
```

**`Unit` as shipped** (`backend/src/prisma/schema.prisma`). The target sketch above stays the intent, but the
existing table carries far more (pricing, meter numbers, service charges, `UnitFeature`, standing charges,
security deposits), and three deliberate differences matter to later modules:

| Target | Shipped | Why |
| --- | --- | --- |
| `unitNumber` | `code` (generated, `UNIT-001`) + `name` (the human label, e.g. "Flat 12") | Competitor listings show both. Codes stay unique and stable; names are what people type. |
| `areaSqM` | `areaSqFt` | Every seed and screenshot in this project is sq ft; conversion would silently change every price. |
| `occupancyStatus UnitOccupancyStatus` | `status UnitStatus { VACANT, OCCUPIED, MAINTENANCE, RESERVED }` | `SOLD` is a *property*-level state and belongs on `Property.status` once Module 4 (Sales) lands; `UNDER_MAINTENANCE` renamed to `MAINTENANCE`. |
| — | Occupancy is **derived from `RentalAgreement`**, not user-set | `Unit.status` is kept as a column for indexing and fast lists, but the only way to change it is `PATCH /units/:id/status`, which refuses a transition that contradicts the unit's agreements (e.g. OCCUPIED with no active lease → 409). The leases module re-derives it on agreement create/update/delete. Do not write `Unit.status` directly from another module — call `UnitsService.syncOccupancyStatus()`. |

```prisma
model Unit {
  id             String   @id @default(uuid())
  organizationId String
  propertyId     String
  property       Property @relation(fields: [propertyId], references: [id])
  code           String   @unique
  name           String
  floor          String?
  bedrooms       Int?
  bathrooms      Int?
  areaSqFt       Decimal? @db.Decimal(10,2)
  status         UnitStatus @default(VACANT)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId])
  @@index([propertyId])
  @@index([status])
}

enum UnitStatus {
  VACANT
  OCCUPIED
  RESERVED
  MAINTENANCE
}
```

---

## Domain: Leasing (Module: Lease & Tenancy) — ✅ Resolved 2026-10-03 (see `06-MODULE-lease-tenancy.md`)

**Target vs. shipped.** The sketch below is the intent. Module 5 shipped it with these changes, all in
`backend/src/prisma/schema.prisma`:

| Target | Shipped | Why |
| --- | --- | --- |
| `Tenant { firstName, lastName, emergencyContactName/Phone }` | `surname`/`otherNames`; emergency contacts are their own `TenantEmergencyContact` rows | One contact per tenant is not a list. `Tenant.contactId` links the CRM directory entry (Module 3). |
| `RentalAgreement.billingCycle BillingCycle` | `paymentDay` + `termMonths` + `escalationRate`/`escalationMonth` | Rent is raised monthly by the finance module (a `BillingCycle` enum with no scheduler behind it is decorative). The escalation fields are what make a renewal compute the new rent. |
| `LeaseStatus { DRAFT ACTIVE RENEWED EXPIRED TERMINATED }` | identical, as `AgreementStatus` | Kept exactly as sketched — the gap was enforcement, not values: `status` is no longer settable from the update DTO, only through validated lifecycle actions. |
| — | `renewedToId @unique` / `renewedFromId` (self-relation) | A renewal creates a successor agreement, so the unit's tenancy history is one query instead of a date-range reconstruction. |
| — | `activatedAt`, `terminatedAt`, `terminatedReason`, `expiredAt` | The audit trail the lifecycle actions write; a termination without a recorded reason is how disputes start. |
| — | `LeaseTemplate` | Reusable default terms (checklist item). A template prefills the create form and never becomes the lease, so editing one cannot rewrite a signed agreement. |
| `MoveOutRequest.depositRefundAmount Decimal?` (typed in) | kept as a record of what was paid, **plus** `MoveOutDeduction` rows and `refundedAt`/`refundedById` | The refund is now *derived* — `deposit − Σ(deductions) − unpaid rent` — so the figure on screen can be explained line by line. |
| — | `InspectionReport` + `InspectionItem`, `MoveOutStatus += COMPLETED`, `UserRole += LEASING_OFFICER` | The condition record that settles damage disputes, a real end state for a settled move-out, and an enum value for a role that already existed in the seed. |

```prisma
model RentalAgreement {
  id             String       @id @default(cuid())
  organizationId String
  code           String       @unique // RA-000001
  unitId         String
  tenantId       String
  status         AgreementStatus @default(DRAFT)
  agreementType  AgreementType
  rentAmount     Decimal      @db.Decimal(14, 2)
  securityDeposit Decimal?    @db.Decimal(14, 2)
  currency       String       @default("KES")
  startDate      DateTime
  endDate        DateTime?    // null = rolling monthly
  termMonths     Int?
  paymentDay     Int?
  escalationRate Decimal?     @db.Decimal(5, 2)
  escalationMonth Int?
  noticePeriodDays Int        @default(30)
  renewedToId    String?      @unique
  renewedFromId  String?
  activatedAt    DateTime?
  terminatedAt   DateTime?
  terminatedReason String?
  expiredAt      DateTime?
  depositRefunded Boolean     @default(false)
  @@index([unitId]) @@index([tenantId]) @@index([status])
  @@map("rental_agreements")
}

model MoveOutDeduction {
  id              String         @id @default(cuid())
  moveOutRequestId String
  category        DeductionCategory
  description     String
  amount          Decimal        @db.Decimal(10, 2)
  approvedById    String?
  @@index([moveOutRequestId])
  @@map("move_out_deductions")
}

model InspectionReport {
  id                String           @id @default(cuid())
  unitId            String
  rentalAgreementId String?
  type              InspectionType
  status            InspectionStatus @default(DRAFT)
  scheduledDate     DateTime
  completedAt       DateTime?
  notes             String?          @db.Text
  items             InspectionItem[]
  @@index([unitId]) @@index([rentalAgreementId])
  @@map("inspection_reports")
}

model LeaseTemplate {
  id             String       @id @default(cuid())
  organizationId String
  name           String
  agreementType  AgreementType
  rentAmount     Decimal?     @db.Decimal(10, 2)
  securityDeposit Decimal?    @db.Decimal(10, 2)
  termMonths     Int?
  noticePeriodDays Int        @default(30)
  termsBody      String?      @db.Text
  isActive       Boolean      @default(true)
  @@index([organizationId])
  @@map("lease_templates")
}
```

<details>
<summary>Original target sketch (superseded)</summary>

```prisma
model Tenant {
  id               String   @id @default(uuid())
  organizationId   String
  firstName        String
  lastName         String
  email            String?
  phone            String?
  emergencyContactName  String?
  emergencyContactPhone String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([organizationId])
}

model RentalAgreement {
  id               String   @id @default(uuid())
  organizationId   String
  unitId           String
  tenantId         String
  rentAmount       Decimal  @db.Decimal(14,2)
  depositAmount    Decimal  @db.Decimal(14,2)
  billingCycle     BillingCycle @default(MONTHLY)
  startDate        DateTime
  endDate          DateTime?
  noticePeriodDays Int      @default(30)
  status           LeaseStatus @default(ACTIVE)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([organizationId])
}

enum BillingCycle {
  MONTHLY
  QUARTERLY
  ANNUALLY
}

enum LeaseStatus {
  DRAFT
  ACTIVE
  RENEWED
  EXPIRED
  TERMINATED
}
```
</details>

model MoveOutRequest {
  id               String   @id @default(uuid())
  organizationId   String
  rentalAgreementId String
  requestedDate    DateTime
  status           MoveOutStatus @default(PENDING)
  depositRefundAmount Decimal? @db.Decimal(14,2)
  deductions       Json?    // itemized deductions
  createdAt        DateTime @default(now())
  @@index([organizationId])
}

enum MoveOutStatus {
  PENDING
  APPROVED
  COMPLETED
  REJECTED
}
```

---

## Domain: CRM (Module: CRM) — ✅ Resolved 2026-10-03 (see `04-MODULE-crm.md`)

```prisma
model Lead {
  id             String   @id @default(uuid())
  organizationId String
  source         LeadSource
  contactId      String?
  status         LeadStage @default(NEW)
  interestedPropertyId String?
  assignedAgentId String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId])
}

enum LeadSource {
  WEBSITE
  FACEBOOK
  WALK_IN
  REFERRAL
  OTHER
}

enum LeadStage {
  NEW
  CONTACTED
  VIEWING_SCHEDULED
  NEGOTIATION
  WON
  LOST
}

model Contact {
  id             String   @id @default(uuid())
  organizationId String
  type           ContactType // BUYER, TENANT, LANDLORD, INVESTOR, AGENT, LAWYER
  firstName      String
  lastName       String
  email          String?
  phone          String?
  createdAt      DateTime @default(now())
  @@index([organizationId])
}

enum ContactType {
  BUYER
  TENANT
  LANDLORD
  INVESTOR
  AGENT
  LAWYER
}

model CommunicationLog {
  id             String   @id @default(uuid())
  organizationId String
  contactId      String
  channel        CommChannel // EMAIL, SMS, WHATSAPP, CALL, NOTE, MEETING
  content        String?
  occurredAt     DateTime @default(now())
  @@index([organizationId])
}

enum CommChannel {
  EMAIL
  SMS
  WHATSAPP
  CALL
  NOTE
  MEETING
}
```

**Target vs. shipped.** The sketch above was the intent; Module 3 shipped it with the gaps below closed. The
full Prisma source is `backend/src/prisma/schema.prisma` (migration `20261003145000_module3_crm`).

| Target | Shipped | Why |
| --- | --- | --- |
| `Lead { source, contactId, status, interestedPropertyId, assignedAgentId }` | plus `firstName`/`lastName`/`email`/`phone`/`message`, `sourceDetail`, `lostReason`, `branchId`, `convertedAt` | The sketch had no way to know **who** enquired, so a lead could not be worked at all. `status` became `stage` (`LeadStage`); `contactId` is set on conversion. |
| `Lead` had no lifecycle | `LeadStage { NEW, CONTACTED, VIEWING_SCHEDULED, NEGOTIATION, WON, LOST }` enforced by `lead-pipeline.ts` | WON/LOST are terminal and WON requires a converted contact — the API refuses the move otherwise. `LOST` requires a reason. |
| `LeadSource` | same + `WHATSAPP` | WhatsApp is a real enquiry channel even before the Business API exists (manual logging). |
| `Contact` | same fields + `company`, `notes`, `isActive` | A shared directory across leasing and sales needs a note field and a way to retire someone without deleting history. |
| `CommunicationLog { contactId, channel, content, occurredAt }` | `contactId` **or** `leadId`, plus `direction`, `subject`, `outcome`, `loggedById` | History has to exist before conversion, so a log row may hang off a lead. `outcome` is what makes a call log useful. |
| `Contact.id` only | `Tenant.contactId String? @unique` → `Contact` | **Decided: Tenant stays its own table, the two are linked** (see `04-MODULE-crm.md` for the reasoning). One contact maps to at most one tenant; deleting either side nulls the link rather than cascading into leases or invoices. |
| `organizationId String` everywhere | kept, and every CRM query filters on it | Plus indexes on `stage`, `source`, `type`, `contactId`, `occurredAt`. |

```prisma
model Lead {
  id             String       @id @default(cuid())
  organizationId String
  firstName      String
  lastName       String?
  email          String?
  phone          String?
  message        String?      @db.Text
  source         LeadSource   @default(OTHER)
  sourceDetail   String?
  stage          LeadStage    @default(NEW)
  lostReason     String?
  interestedPropertyId String?
  branchId       String?
  assignedAgentId String?
  contactId      String?
  convertedAt    DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  deletedAt      DateTime?
  @@index([organizationId])
  @@index([stage])
  @@index([source])
  @@map("leads")
}

model Contact {
  id             String       @id @default(cuid())
  organizationId String
  type           ContactType  @default(BUYER)
  firstName      String
  lastName       String
  email          String?
  phone          String?
  company        String?
  notes          String?      @db.Text
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  @@index([organizationId])
  @@index([type])
  @@map("contacts")
}

model CommunicationLog {
  id             String        @id @default(cuid())
  organizationId String
  contactId      String?
  leadId         String?
  channel        CommChannel
  direction      CommDirection @default(OUTBOUND)
  subject        String?
  content        String?       @db.Text
  outcome        String?
  occurredAt     DateTime      @default(now())
  loggedById     String?
  createdAt      DateTime      @default(now())
  @@index([organizationId])
  @@index([contactId])
  @@index([leadId])
  @@map("communication_logs")
}
```

---

## Domain: Sales (Module: Sales Management) — ✅ Resolved 2026-10-03 (see `05-MODULE-sales.md`)

**Target vs. shipped.** The sketch below was the intent; Module 4 shipped it with these additions. The Prisma
source is `backend/src/prisma/schema.prisma` (migration `20261003170000_module4_sales`).

| Target | Shipped | Why |
| --- | --- | --- |
| `SaleTransaction { propertyId, buyerContactId, status, agreedPrice, bookingFee }` | plus `code`, `propertyTitle` snapshot, `leadId`, `agentUserId`, `askingPrice`, `depositAmount`, `currency`, `commissionRate`, a date per stage, `cancellationReason`, soft delete | The sketch could not answer "which sale is this?" (no code) or "what did the agent earn?" (no rate). Stage dates give the audit trail the workflow implies. |
| `propertyId` FK | `onDelete: Restrict` | A property with an open sale must not be deleted out from under it; the API also refuses a second open sale on the same property. |
| `status SaleStage` | `stage SaleStage` | Kept the enum exactly as sketched (QUOTATION → HANDOVER, plus CANCELLED). |
| `Commission { saleTransactionId, rentalAgreementId, agentUserId, amount, splitPercentage, status }` | plus `currency`, `basis`, `notes`, `approvedAt/approvedById`, `paidAt/paidRef`, `REJECTED` status | Approval needs to record *who* approved; payment needs a reference (the API refuses to mark one paid without it). `REJECTED` exists so a rejected split can be corrected and regenerated. |
| — | `SaleInstallment` | The sketch had no place for installment plans. Instalment rows carry `sequence`, `dueDate`, `status` and `invoiceId`. |
| — | `Invoice.saleTransactionId` | Sale invoices are ordinary finance invoices (`transactionClass = 'SALE'`) rather than a parallel billing model, so they reconcile with everything else — hence a nullable link instead of a sales-specific invoice table. |
| `id @default(uuid())` | `@default(cuid())` | Matches the rest of this schema. |
| — | `Commission.agentUserId` is `Restrict` | You cannot delete a user who has unearned commission. |

```prisma
model SaleTransaction {
  id             String       @id @default(cuid())
  organizationId String
  code           String       @unique
  propertyId     String
  property       Property     @relation("PropertySales", fields: [propertyId], references: [id], onDelete: Restrict)
  propertyTitle  String?
  buyerContactId String?
  buyerContact   Contact?     @relation("ContactSales", fields: [buyerContactId], references: [id], onDelete: SetNull)
  leadId         String?
  agentUserId    String?
  stage          SaleStage    @default(QUOTATION)
  askingPrice    Decimal?     @db.Decimal(14, 2)
  agreedPrice    Decimal?     @db.Decimal(14, 2)
  bookingFee     Decimal?     @db.Decimal(14, 2)
  depositAmount  Decimal?     @db.Decimal(14, 2)
  currency       String       @default("KES")
  commissionRate Decimal?     @db.Decimal(5, 2)
  quotationDate   DateTime?
  offerDate       DateTime?
  reservationDate DateTime?
  agreementDate   DateTime?
  paymentDate     DateTime?
  handoverDate    DateTime?
  cancelledAt     DateTime?
  cancellationReason String?
  installments SaleInstallment[]
  commissions  Commission[]
  invoices     Invoice[]
  @@index([organizationId])
  @@index([stage])
  @@map("sale_transactions")
}

model SaleInstallment {
  id                String           @id @default(cuid())
  saleTransactionId String
  saleTransaction   SaleTransaction  @relation(fields: [saleTransactionId], references: [id], onDelete: Cascade)
  sequence          Int
  description       String
  amount            Decimal          @db.Decimal(14, 2)
  dueDate           DateTime
  status            InstallmentStatus @default(SCHEDULED)
  invoiceId         String?          @unique
  invoice           Invoice?         @relation(fields: [invoiceId], references: [id], onDelete: SetNull)
  paidAt            DateTime?
  @@unique([saleTransactionId, sequence])
  @@map("sale_installments")
}

enum SaleStage {
  QUOTATION
  OFFER
  RESERVATION
  AGREEMENT
  PAYMENT
  HANDOVER
  CANCELLED
}

enum InstallmentStatus {
  SCHEDULED
  INVOICED
  PAID
  OVERDUE
  WAIVED
}

enum CommissionStatus {
  PENDING
  APPROVED
  PAID
  REJECTED
}

model Commission {
  id             String       @id @default(cuid())
  organizationId String
  saleTransactionId String?
  saleTransaction   SaleTransaction? @relation(fields: [saleTransactionId], references: [id], onDelete: SetNull)
  rentalAgreementId String?
  rentalAgreement   RentalAgreement? @relation(fields: [rentalAgreementId], references: [id], onDelete: SetNull)
  agentUserId String
  agent       User   @relation("UserCommissions", fields: [agentUserId], references: [id], onDelete: Restrict)
  amount          Decimal  @db.Decimal(14, 2)
  splitPercentage Decimal? @db.Decimal(5, 2)
  currency        String   @default("KES")
  basis           String   @default("SALE")
  status          CommissionStatus @default(PENDING)
  approvedAt DateTime?
  approvedById String?
  paidAt DateTime?
  paidRef String?
  @@index([organizationId])
  @@index([agentUserId])
  @@index([status])
  @@map("commissions")
}
```

---

## Domain: Landlord (Module: Module 6 — Landlord Management) — ✅ Built, verified 2026-10-04

Landed in migration `20261004000000_module6_landlords`. The `Landlord` profile itself predates this module and is
already shaped differently from the target below (single `name` rather than `firstName`/`lastName`, `code` per
organization, and the `status` field borrowed from `TenantStatus`); what this module added is the **management
agreement** and the three owner-money tables. `PayoutStatus` matches the target. `pdfUrl` was dropped: the
statement is rendered on demand from its frozen line snapshot (`GET /owner-statements/:id/document`) rather than
written to storage, so there is no file to point at.

```prisma
// Additions to the existing model
model Landlord {
  // … existing identity, address and bank fields …
  notes String? @db.Text

  // Management agreement — what an owner statement deducts
  managementFeeType   ManagementFeeType @default(PERCENTAGE)
  managementFeeRate   Decimal           @default(0) @db.Decimal(5, 2)   // %
  managementFeeAmount Decimal           @default(0) @db.Decimal(14, 2) // flat, per period
}

enum ManagementFeeType {
  PERCENTAGE
  FIXED
}

/// One period's owner account. Every money column is a frozen snapshot taken at
/// generation time, and `incomeLines`/`expenseLines` hold the itemised
/// breakdown — an ISSUED statement is a document the owner was sent, so it must
/// keep reconciling to its own lines even after an invoice underneath it is
/// edited. Re-issuing means generating a new statement.
model OwnerStatement {
  id              String   @id @default(cuid())
  statementNumber String   @unique               // OST-YYYYMM-NNNN
  organizationId  String?
  landlordId      String
  periodStart     DateTime
  periodEnd       DateTime
  currency        String   @default("KES")

  grossIncome    Decimal @db.Decimal(14, 2)  // rent actually collected in the period
  expenses       Decimal @default(0) @db.Decimal(14, 2)
  managementFee  Decimal @default(0) @db.Decimal(14, 2)
  carriedForward Decimal @default(0) @db.Decimal(14, 2)  // unpaid balance from earlier statements
  netPayout      Decimal @db.Decimal(14, 2)  // gross − expenses − fee − carriedForward

  status   OwnerStatementStatus @default(DRAFT)
  issuedAt DateTime?
  notes    String? @db.Text

  incomeLines  Json
  expenseLines Json

  payouts LandlordPayout[]
  charges LandlordCharge[]
  generatedBy String?

  @@index([organizationId])
  @@index([landlordId])
  @@index([periodStart, periodEnd])
  @@index([status])
  @@map("owner_statements")
}

enum OwnerStatementStatus {
  DRAFT     // calculated, never sent
  ISSUED    // sent to the owner — figures are frozen
  SETTLED   // payouts cover the net amount
  VOID      // retracted; its charges are released for a corrected statement
}

/// Money leaving the company for an owner. v1 records the intent and its outcome —
/// the transfer is made in the bank and the reference is recorded here — because
/// there is no banking integration to call.
model LandlordPayout {
  id             String   @id @default(cuid())
  organizationId String?
  landlordId     String
  ownerStatementId String?          // usually settles one statement; optional for arrears catch-up
  amount   Decimal        @db.Decimal(14, 2)
  currency String         @default("KES")
  method   PaymentMethod  @default(BANK_TRANSFER)
  status   PayoutStatus   @default(PENDING)
  reference String?        // required by the service before a payout can become PAID
  scheduledFor DateTime?
  paidAt       DateTime?
  failureReason String?
  notes          String? @db.Text
  createdBy String?

  @@index([organizationId])
  @@index([landlordId])
  @@index([ownerStatementId])
  @@index([status])
  @@map("landlord_payouts")
}

enum PayoutStatus {
  PENDING
  PROCESSING
  PAID
  FAILED
}

/// A cost charged to an owner: repairs carried out, utilities the company
/// advanced, insurance, legal fees — deducted on their next statement.
/// Deliberately NOT a general expense table: Finance & Accounting (Module 7)
/// owns the ledger and expenses. This is the owner-facing slice, so a statement
/// can be built today without pretending the GL exists. `ownerStatementId` is
/// set when the charge is rolled into a statement; it then belongs to that
/// document and can no longer be edited or deleted.
model LandlordCharge {
  id             String   @id @default(cuid())
  organizationId String?
  landlordId     String
  propertyId     String?              // optional attribution to one of the owner's properties
  category    ChargeCategory
  description String
  amount      Decimal       @db.Decimal(14, 2)
  chargeDate  DateTime      @default(now())
  ownerStatementId String?
  notes          String? @db.Text
  createdBy String?

  @@index([organizationId])
  @@index([landlordId])
  @@index([chargeDate])
  @@index([ownerStatementId])
  @@map("landlord_charges")
}

enum ChargeCategory {
  MAINTENANCE
  REPAIR
  UTILITIES
  INSURANCE
  TAX
  LEGAL
  OTHER
}
```

---

## Domain: Finance & Accounting (Module: Finance & Accounting) — ✅ GL and tax engine landed 2026-10-04, rest still missing

The chart of accounts and general ledger below now exist in `schema.prisma`
(`Account`, `JournalEntry`, `JournalLine`, with the `AccountType`,
`BalanceSide`, `JournalEntrySource` and `JournalEntryStatus` enums). The
Invoice/Payment/Receipt/CreditNote shapes in this section are still the target
design, not the current tables — the live invoice/payment/receipt models are
documented above and differ. Differences worth knowing:

- `Account.code` is unique **per organization**, not globally, and is immutable
  once created: auto-posting resolves accounts by code, so renaming a code would
  rewrite the meaning of posted entries.
- `JournalEntry.sourceRef` is JSON (`{ type, id, number }`) rather than typed
  FKs, so a new source type does not need a migration. It is the hook the
  reversal path queries.
- A reversed entry is kept and marked `REVERSED` with `reversedByEntryId` /
  `reversesEntryId` set; entries are never deleted or edited.

### Tax: configuration, not schema — and not one country

`TaxRule` below is live as of 2026-10-04 (migration
`20261004030000_module7_tax_rules`, with `20261004031000_module7_tax_rate_variants`
and `20261004032000_module7_tax_variant_key` following). It is **country-agnostic
by construction**: the country, the optional sub-national region, the rate, the
ledger account and the validity window are all columns, so adding a market is a
data insert rather than a migration.

Things a future editor should not undo:

- **`rate` is a percentage with four decimals** (16.0000 means 16%), not a
  fraction — fractional rates such as a reduced VAT or a municipal ISS must be
  expressible exactly.
- **`basis` is per rule, not a global switch.** Some jurisdictions quote prices
  inclusive of tax and others exclusive, and some are mixed, so it cannot be an
  organization-level flag.
- **`appliesToCategory` is part of the uniqueness constraint.** A standard and a
  reduced rate of the *same* tax are two rules with the same `code` differing only
  by category; they are not two taxes. Without this column in the key they cannot
  coexist at all, and if they were given different codes instead, both would
  apply to every line and double-charge.
- **`validFrom`/`validTo` mean rate changes are data.** Superseding closes the old
  rule rather than editing it, because an invoice issued last quarter must keep
  citing the rate that applied then.
- **Invoice snapshots are what make issued documents explicable**:
  `Invoice.taxJurisdiction`, `taxBasis` and `taxSummary` (per-rule totals) plus
  `InvoiceItem.taxRuleId`/`taxCode`/`taxBasis`/`taxTreatment`. The money columns
  stay the source of truth; these record what the engine decided and whose rule
  produced it.
- `taxRegistrationNumber` is the VAT/GST registration printed on invoices, and is
  separate from `Organization.taxId` (the company registration).

The only thing *not* modelled here is statutory e-invoicing/fiscal-device
compliance, which differs per jurisdiction and needs a provider-adapter design
plus authority credentials; `Invoice.signOnEfims` is a legacy single-country
boolean that should be replaced by a jurisdiction-driven transmission status
rather than extended.

Live shape (the target sketch further down does not include tax at all, because
tax was modelled there as a hardcoded VAT field):

```prisma
model TaxRule {
  id       String @id @default(cuid())
  code     String            // "VAT", "GST", "SALES_TAX", "WHT" — free text
  name     String
  countryCode String? @db.Char(2)  // ISO-3166-1 alpha-2; null = fallback
  regionCode  String?              // US state, German Bundesland, ...
  basis       TaxBasis  @default(EXCLUSIVE)  // price includes the tax, or not
  treatment   TaxTreatment @default(CHARGED) // billed to customer, or withheld by us
  rate        Decimal @db.Decimal(7, 4)       // percentage: 16.0000 means 16%
  ledgerAccountCode String? @default("2100")   // where the collected tax lands
  isCompound     Boolean @default(false)      // charged on top of another tax
  compoundOnRuleId String?                     // which tax it stacks onto
  appliesToCategory String @default("*")      // '*' = every line; else a category
  validFrom DateTime @default(now())
  validTo   DateTime?
  organizationId String?
  @@unique([organizationId, code, countryCode, regionCode, appliesToCategory, validFrom])
}

enum TaxBasis { EXCLUSIVE INCLUSIVE }
enum TaxTreatment { CHARGED WITHHELD }
```

On `Organization`, the jurisdiction the engine resolves against:
`taxCountryCode String? @db.Char(2)`, `taxRegionCode String?`,
`taxRegistrationNumber String?`.

```prisma
model Account {
  id             String   @id @default(uuid())
  organizationId String
  code           String
  name           String
  type           AccountType // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  parentAccountId String?
  @@index([organizationId])
}

enum AccountType {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}

model JournalEntry {
  id             String   @id @default(uuid())
  organizationId String
  entryDate      DateTime
  description    String?
  lines          JournalLine[]
  createdAt      DateTime @default(now())
  @@index([organizationId])
}

model JournalLine {
  id             String   @id @default(uuid())
  journalEntryId String
  journalEntry   JournalEntry @relation(fields: [journalEntryId], references: [id])
  accountId      String
  debit          Decimal  @db.Decimal(14,2) @default(0)
  credit         Decimal  @db.Decimal(14,2) @default(0)
}

model Invoice {
  id             String   @id @default(uuid())
  organizationId String
  type           InvoiceType // TENANT, BUYER
  rentalAgreementId String?
  contactId      String?
  invoiceNumber  String
  issueDate      DateTime
  dueDate        DateTime
  subtotal       Decimal  @db.Decimal(14,2)
  vatAmount      Decimal  @db.Decimal(14,2) @default(0)
  total          Decimal  @db.Decimal(14,2)
  amountPaid     Decimal  @db.Decimal(14,2) @default(0)
  status         InvoiceStatus @default(UNPAID)
  createdAt      DateTime @default(now())
  @@index([organizationId])
}

enum InvoiceType {
  TENANT
  BUYER
}

enum InvoiceStatus {
  DRAFT
  UNPAID
  PARTIALLY_PAID
  PAID
  OVERDUE
  CANCELLED
}

model CreditNote {
  id             String   @id @default(uuid())
  organizationId String
  invoiceId      String
  amount         Decimal  @db.Decimal(14,2)
  reason         String?
  createdAt      DateTime @default(now())
  @@index([organizationId])
}

model SupplierBill {
  id             String   @id @default(uuid())
  organizationId String
  supplierId     String
  billNumber     String
  amount         Decimal  @db.Decimal(14,2)
  dueDate        DateTime
  status         BillStatus @default(UNPAID)
  @@index([organizationId])
}

enum BillStatus {
  UNPAID
  PAID
  OVERDUE
}
```

---

## Domain: Payments (Module: Payments) — ⚠️ Money handling built 2026-10-04; gateways still absent

The block below is the **target** design, not the current tables. What actually
exists today is documented above (`Payment`, `Receipt`, `ReceiptPayment`), plus
these, added 2026-10-04 in migrations `20261004020000_module8_payments` and
`20261004021000_module8_payment_allocations`:

```prisma
/// What part of a payment settled which invoice. Without this the only record
/// of the split is Invoice.paidAmount, and a refund cannot tell that 5,000 paid
/// 3,000 of a bill and put 2,000 on credit. Every invoice figure is derived
/// from these rows.
model PaymentAllocation {
  id        String  @id @default(cuid())
  paymentId String
  payment   Payment @relation(...)
  invoiceId String
  invoice   Invoice @relation(...)
  amount    Decimal @db.Decimal(12, 2)
  createdAt DateTime @default(now())
  createdBy String?
  @@index([paymentId])
  @@index([invoiceId])
}

/// Money the customer is owed back — an overpayment, an unallocated receipt, a
/// goodwill gesture, or the unspent part of a refunded payment. `appliedAmount`
/// is what has been spent against invoices; the difference is still usable.
model CustomerCredit {
  id            String   @id @default(cuid())
  amount        Decimal  @db.Decimal(12, 2)
  appliedAmount Decimal  @default(0) @db.Decimal(12, 2)
  source        CustomerCreditSource @default(MANUAL) // OVERPAYMENT, UNALLOCATED_RECEIPT, GOODWILL, REFUND_UNSPENT, MANUAL
  status        CreditStatus @default(OPEN)            // OPEN, PARTIALLY_APPLIED, APPLIED, VOID
  tenantId / landlordId / customerName  // at least one — credit is meaningless without an owner
  sourcePaymentId String?
  applications CreditApplication[]
}

model CreditApplication {
  id        String  @id @default(cuid())
  creditId  String
  invoiceId String
  amount    Decimal @db.Decimal(12, 2)
  appliedAt DateTime @default(now())
  appliedBy String?
}

/// A refund records money going *out*; the Payment row is never edited or
/// deleted to represent that. Capped at the payment's unrefunded amount, and
/// each refund issues a CreditNote.
model PaymentRefund {
  id        String @id @default(cuid())
  paymentId String
  amount    Decimal @db.Decimal(12, 2)
  reason    String  @db.Text
  refundReference String?
  processedAt DateTime @default(now())
  creditNoteId String? @unique
}

model CreditNote {
  id              String @id @default(cuid())
  creditNoteNumber String @unique
  invoiceId String?          // the bill it reduces; null for a goodwill note
  refund   PaymentRefund?
  totalAmount Decimal @db.Decimal(12, 2)
  status   CreditNoteStatus @default(ISSUED) // DRAFT, ISSUED, VOID
  lines    CreditNoteLine[]
}
```

Differences from the target block below that matter when continuing:

- There is **no `PaymentStatus`**. Whether a payment is good is expressed by
  `Payment.isReversed` / `reversedAt` / `reversedBy` plus the `PaymentRefund`
  rows, because "this money was reversed" and "this money was returned" are
  different facts with different ledger effects.
- `PaymentMethod` has no `STRIPE`/`CREDIT_CARD`-as-gateway members: the enum is
  CASH, BANK_TRANSFER, CHEQUE, MPESA, CARD, OTHER. A gateway is a `paidFrom`
  value plus a reference, not a method — see the deferred Stripe work.
- `Receipt` here means the rent-receipt document, not a payment receipt; the
  payment-side receipt number lives on the `Payment` rows themselves. **Receipt
  PDF generation does not exist.**

---

## Domain: Accounts Payable (Module: Finance & Accounting) — ✅ landed 2026-10-04

Live as of 2026-10-04 (migrations `20261004040000_module7_accounts_payable` and
`20261004041000_module7_supplier_credit_source`): `Supplier`, `SupplierBill` +
`SupplierBillLine`, `BillPayment`, `SupplierCredit` + `SupplierCreditApplication`,
the `SupplierStatus`/`BillStatus`/`BillCategory`/`SupplierCreditSource` enums,
and `BILL`/`BILL_PAYMENT` journal sources.

The target sketch further down does not exist as written — this domain was built
to mirror the receivable side, and three decisions are worth not undoing:

- **`BillPayment` is its own model, not a reuse of `Payment`.** A bill payment
  settles a `SupplierBill`; `Payment` settles an `Invoice`. One table for both
  is how an AP total ends up wrong.
- **A bill's money columns are derived** from `BillPayment.appliedAmount` plus
  `SupplierCreditApplication` amounts (`syncBill`), never decremented. This is
  the same rule the receivable side uses, for the same reason: a reversal, a
  credit and an overpayment can all move a bill backwards.
- **`SupplierCredit.sourcePaymentId` exists** so reversing an overpaying payment
  can void the credit it produced. Without the link the supplier keeps a credit
  balance that no longer corresponds to any money.

`BillCategory` maps to an expense account in
`accounting/bill-categories.ts` rather than in the schema, so the mapping is
reviewable in one place and an unmapped category is an error rather than a
silent "Other Expense".

---

## Domain: Recurring Billing (Module: Finance & Accounting) — ✅ landed 2026-10-04

Migration `20261004050000_module7_recurring_billing` added `RecurringBillingRun`
with the `RecurringRunStatus` enum, plus two things on `Invoice` that matter
more than the run table:

- **`billingPeriod String?`** — the period a generated invoice bills for,
  e.g. `"2026-10"`. Null on every manually raised invoice.
- **`@@unique([rentalAgreementId, billingPeriod])`** — the idempotency guard.
  A scheduler that runs twice, or two instances, or a pressed button, must not
  bill a tenant twice, and the only reliable place to enforce that is the
  database. Postgres allows many NULLs in a unique index, so manual invoices are
  unaffected.

Because of that constraint, anything that generates invoices must set
`billingPeriod` **in the insert**. Setting it in a follow-up `update` leaves a
window in which two identical invoices both exist.

`RecurringBillingRun` keeps one row per execution with per-lease outcomes in
`details`, because a scheduler that silently does nothing is indistinguishable
from a broken one.

---

## Domain: Notifications (Module: Notifications) — ✅ landed 2026-10-04

Migration `20261004060000_module17_notifications` added `notifications` and
`notification_preferences` with the `NotificationType`, `NotificationChannel`,
`NotificationPriority` and `NotificationStatus` enums.

Three decisions a future editor should not undo:

- **One message to three channels is three rows, not one row with three
  booleans.** Each channel is delivered and failed independently, and one
  provider being down must not lose the others. That is why `status` is on the
  row rather than on the message.
- **`SUPPRESSED` exists as a status distinct from `FAILED`.** "We chose not to
  send this" (no provider configured, or the recipient opted out) is a different
  fact from "we tried and it broke", and an operator reading the trail needs to
  tell them apart.
- **`dedupeKey` plus `@@unique([organizationId, dedupeKey, channel])` is the
  idempotency mechanism.** A reminder job runs daily; the database, not a check
  the scheduler must remember, is what stops the same message going out every
  morning. Postgres allows many NULLs, so one-off messages opt out of dedupe by
  leaving it null.

`NotificationPreference` rows are opt-*out*: a missing row means every channel is
wanted, so nobody is opted out of something they never chose.

---

## Domain: Maintenance (Module: Maintenance Management) — ✅ Built 2026-10-04 (Module 9)

The target sketch below is implemented with the additions the live implementation proved
necessary. Differences worth knowing:

- **`WorkOrder.reference`** (`WO-YYYY-NNNN`, unique per organization) was added — the target had
  only a cuid, and a work order quoted over the phone needs something readable. It is allocated
  sequentially by the service with a retry, because two staff raising a fault in the same second
  must not produce one order and one 500.
- **`CANCELLED`** was added to `WorkOrderStatus`. The target chain has no way to say "not our
  problem", which would force a duplicate report to be *completed* with a resolution note claiming
  nothing happened — a lie in the one field a resident reads.
- **`title`, `priority`, `source`, `accessInstructions`, `estimatedCost`, `actualCost`, `tenantId`,
  `assetId`, `inspectionNote`, `resolutionNote`, `cancellationReason`** were added: the first three
  are what a queue is sorted by, `accessInstructions` is the difference between a visit and a wasted
  one, and the two notes are the fields people actually read (the approver reads the inspection, the
  resident reads the resolution).
- **`WorkOrderTask`** is a new table: the checklist a technician works through and the record of what
  was done. Completion is refused while items are open, because a "completed" repair with an empty
  checklist is how a half-finished job gets closed.
- **`(pmScheduleId, pmDueOn)` is unique** on `WorkOrder`. That is the preventive sweep's idempotency
  guard, in the database rather than in the scheduler's memory — the same lesson as
  `RecurringBillingRun`. Both columns are nullable and NULLs are distinct in a Postgres unique index,
  so ordinary work orders never collide with each other.
- **`PreventiveMaintenanceRun`** records each sweep (considered/created/skipped/failed plus a
  per-schedule detail), mirroring `RecurringBillingRun`, so "was the generator serviced in March?" is
  answerable from a record rather than from inference.
- **`Asset.assetTag`** is unique per organization *when present* — a property with untagged kit still
  accepts rows — and `Asset.status` is a small validated machine where `RETIRED` is terminal, so the
  sweep never services equipment the company no longer owns.
- **`UserRole` gained `MAINTENANCE_MANAGER` and `TECHNICIAN`** so the two seeded roles can actually be
  held (a work order had nobody to assign), and `Property`/`Unit`/`Tenant`/`User` gained the
  back-relations.
- **Money is `Decimal(12,2)`**, not integer cents, matching the other money columns in this schema.
  The integer-cents convention elsewhere in this doc applies to ledger and invoice maths; a repair
  estimate is a figure somebody types, not a total nobody sums.

Migration `20261004155053_module9_maintenance`; the implemented schema lives in
`backend/src/prisma/schema.prisma`. The target sketch is kept below for comparison.

---


```prisma
model WorkOrder {
  id             String   @id @default(uuid())
  organizationId String
  unitId         String?
  propertyId     String?
  category       MaintenanceCategory
  description    String
  status         WorkOrderStatus @default(REQUESTED)
  assignedTechnicianId String?
  createdAt      DateTime @default(now())
  completedAt    DateTime?
  @@index([organizationId])
}

enum MaintenanceCategory {
  PLUMBING
  ELECTRICAL
  CLEANING
  PAINTING
  SECURITY
  OTHER
}

enum WorkOrderStatus {
  REQUESTED
  INSPECTION
  APPROVED
  ASSIGNED
  IN_PROGRESS
  COMPLETED
  CLOSED
}

model Asset {
  id             String   @id @default(uuid())
  organizationId String
  propertyId     String
  type           AssetType // ELEVATOR, GENERATOR, HVAC, WATER_PUMP, CCTV
  name           String
  installedAt    DateTime?
  @@index([organizationId])
}

enum AssetType {
  ELEVATOR
  GENERATOR
  HVAC
  WATER_PUMP
  CCTV
  OTHER
}

model PreventiveMaintenanceSchedule {
  id             String   @id @default(uuid())
  organizationId String
  assetId        String
  frequencyDays  Int
  checklist      Json?
  nextDueAt      DateTime
  @@index([organizationId])
}
```

---

## Domain: Procurement (Module: Procurement) — ✅ Built (Module 10)

As built, with the reasons for each deviation from the sketch above recorded inline. The full
model definitions live in `backend/src/prisma/schema.prisma`; this is the map of what changed
and why, so the next reader does not have to diff it.

```prisma
// The doc's `Supplier` had only a name and a phone. Module 7 (accounts payable) had
// already built a real one — code, contacts, bank details, VAT status — so procurement
// did NOT add a second vendor table. A bill and a purchase order pointing at two
// different "supplier" records is how an AP total goes wrong. Instead the
// procurement-only fields were added to the existing model:
//
//   category             SupplierCategory?  // what they supply, for the RFQ picker
//   rating               Int?               // a buyer's judgement (1-5)
//   contractStartDate / contractEndDate / contractReference
//   rfqInvitations / rfqQuotes / purchaseOrders  // back-relations
//
// SupplierCategory is a third enum, distinct from both PurchaseCategory ("what is
// being bought this time") and BillCategory ("which account does the invoice land
// in"). A plumber is a PLUMBING supplier once and stays one.

enum PurchaseCategory {
  MAINTENANCE_PARTS EQUIPMENT FURNITURE IT_AND_TECH STATIONERY
  CLEANING SECURITY UTILITIES PROFESSIONAL_SERVICES OTHER
}

enum PurchasePriority { LOW NORMAL HIGH URGENT }

enum PurchaseRequestStatus {
  DRAFT PENDING APPROVED REJECTED CANCELLED
}

// PurchaseRequest: reference (unique per org, `PR-2026-0001`), title, category,
// priority, department (free text — see note), neededBy, estimatedAmount (nullable:
// a request is often raised before anyone knows the price, and a fabricated estimate
// is worse than a blank), requestedById, approvalRequestedAt, decisionNote,
// rejectionReason, decidedAt/decidedById.
//   lines PurchaseRequestLine[]  — required, not a description blob: a request with no
//     lines has nothing to compare quotations against, so the API refuses one.
//   rfqs / orders back-relations.

enum RfqStatus { DRAFT ISSUED QUOTES_RECEIVED CLOSED AWARDED CANCELLED }

// Rfq: reference, title, status, currency, quotesDueAt, issuedAt/closedAt/awardedAt,
// purchaseRequestId (nullable — re-quoting last year's contract is legitimate),
// awardedQuoteId (unique — one winner per round, enforced in the database as well as
// in the state machine), cancellationReason.
//   invitations RfqInvitation[]  — NOT a `String[]` as the sketch had. The sketch's
//     `suppliersInvited String[]` has nowhere to put "invited on Tuesday, never
//     replied", and a supplier who is dropped without a record is how a single-source
//     purchase happens without anybody deciding it. RfqInvitation carries status
//     (INVITED/QUOTED/DECLINED), invitedAt, respondedAt and a required declineReason.
//   quotes RfqQuote[]

enum QuoteStatus { SUBMITTED SHORTLISTED REJECTED AWARDED WITHDRAWN }

// RfqQuote: status, totalAmount, currency, leadTimeDays (the comparison's whole reason
// for preferring one quote over another — the cheapest price for something needed next
// week is not the cheapest), validUntil, notes, submittedAt. Unique per [rfqId, supplierId],
// so a supplier who revises their answer replaces it rather than appearing twice.
//   lines RfqQuoteLine[] — purchaseRequestLineId is optional, because a supplier may
//     quote the whole job in one lump and forcing a match would make honest quotations
//     impossible to enter.

enum PurchaseOrderStatus {
  DRAFT SENT ACCEPTED PARTIALLY_RECEIVED RECEIVED CLOSED CANCELLED
}

// PurchaseOrder: reference, supplierId, status, category (copied from the request so an
// order cannot disagree with the document it answers), currency, subtotal, taxAmount,
// totalAmount (always summed from the lines), orderDate, expectedDelivery (the source of
// "overdue", derived on read — never a stored flag), deliveryAddress, terms, notes,
// rfqId/quoteId/purchaseRequestId, supplierBillId (nullable: the bill finance raised
// against this order; the *bill* records the order so a paid bill can always say what it
// settles, and the order points back for convenience. Not unique — a supplier may invoice
// in instalments), sentAt/acceptedAt/receivedAt/closedAt/cancelledAt + cancellationReason.
//   lines PurchaseOrderLine[]   quantity, unitPrice, amount, receivedQuantity (DERIVED from
//     the receipts in the same transaction, never decremented — a correction must be able
//     to move a quantity backwards and a counter that only goes up cannot).
//   deliveries GoodsReceipt[]   goods arrive in instalments; rows rather than a boolean,
//     because a partial delivery that overwrote the line would lose what came when.

model GoodsReceipt {
  // receivedAt, deliveryNote, conditionNote, receivedById
  //   lines GoodsReceiptLine[] — purchaseOrderLineId, quantity, inventoryItemId (nullable, set
  //     when Module 11 books the delivery onto a shelf) and stockInRecordedAt.
  //     Both were deliberately left as empty columns rather than given a speculative FK to a
  //     table that did not exist; Module 11 now fills them, and the unique index on
  //     StockMovement.goodsReceiptLineId is what makes booking a line in twice impossible.
}
```

**Deviations from the sketch, in short:** `Supplier` reused rather than duplicated; `PRStatus` →
`PurchaseRequestStatus` with DRAFT and CANCELLED added (DRAFT because nobody wants half-written
requests in the approval inbox; CANCELLED because "we do not want this" and "we did not approve
this" are different answers); `RFQ.suppliersInvited String[]` → `RfqInvitation[]`; `POStatus`
gained PARTIALLY_RECEIVED and CLOSED (the sketch had no way to say "half of it arrived", which is
the state everybody hits); `departmentId` → free-text `department`, because no departments table
exists and inventing one is a second organization-wide concept for no reporting gain.

---

## Domain: Inventory (Module 11)

**Status: built 2026-10-05.** The sketch was three small tables; four things changed, and in each case
the sketch was under-specified rather than wrong.

```prisma
enum InventoryCategory {
  PAINT, PLUMBING, ELECTRICAL, TILES_FLOORING, BUILDING_MATERIALS, HARDWARE,
  CLEANING, SAFETY, GARDENING, FURNITURE, APPLIANCES, OTHER
}

enum StockMovementType {
  GOODS_RECEIPT,    // always IN,  always has goodsReceiptLineId
  WORK_ORDER_ISSUE, // always OUT, always has workOrderId
  ADJUSTMENT,       // either way, the only type allowed to leave stock negative
  OPENING,          // always IN
  TRANSFER,         // two rows sharing transferGroup, one OUT and one IN
  RETURN            // either way
}

model InventoryItem {
  organizationId + sku   // UNIQUE (organizationId, sku) — not globally: two companies
                         //   both stocking "PTR-20" is normal
  name, description, category, unitOfMeasure  // the label, not a conversion factor table
  unitCost        // LAST KNOWN price — a hint for the reorder estimate and the fallback
  reorderLevel    // 0 = tracked but never auto-alerted
  reorderQuantity // null = "top up to twice the level"
  preferredSupplierId? -> Supplier   // reuses Module 10's table, is not a second vendor
  notes, isActive  // retired, never deleted once movements exist
  // NO quantityOnHand COLUMN. See below.
}

model Warehouse {
  organizationId + code  // UNIQUE (organizationId, code)
  name, address, phone, notes, isActive
  isDefault  // at most one per org; setting one demotes the others in the same transaction
}

model StockMovement {
  organizationId, itemId -> InventoryItem, warehouseId -> Warehouse
  quantity Decimal(12,2)   // SIGNED: positive in, negative out
  type StockMovementType
  unitCost Decimal(14,4)? // snapshot of the price AT THE TIME, not a lookup on the item
  goodsReceiptLineId String? @unique   // the idempotency key for stock-in
  workOrderId String?                 // what a job consumed
  transferGroup String?               // pairs the two halves of a transfer
  reason String?  // required for ADJUSTMENT, enforced in the service
  notes, createdById?, createdAt
  @@index([itemId, warehouseId])  @@index([workOrderId])
}
```

**The one rule this domain is built around: a stock level is the sum of the movements, never a stored
counter.** `backend/src/modules/inventory/stock-ledger.ts` is the only place a stock number is computed,
and it is pure. Two consequences worth knowing before touching these tables:

- **`InventoryItem` has no `quantityOnHand`, `currentStock` or `lastStockedAt`.** This is the same
  conclusion `Invoice.paidAmount` and `PurchaseOrderLine.receivedQuantity` already reached in this
  schema, and for a stronger reason: a store has five kinds of writer (receipts, issues, transfers,
  returns, counts) where an invoice has one. Any of them can leave a counter wrong while the rows stay
  right. The cost of the rule is that **a list cannot be answered from the items table alone** — every
  read pairs the item query with a `groupBy` over the movements.
- **A transfer is two rows, not one.** One row with two warehouses would make each store's balance stop
  being a plain sum, so `transferGroup` pairs an `OUT` from the source with an `IN` at the destination.

**Deviations from the sketch, in short:**

| Sketch | Built | Why |
|---|---|---|
| `quantity Int` | `quantity Decimal(12,2)`, signed | Paint goes in halves and pipe in metres; the module doc's own item list is countable-but-not-whole. Signed so a balance is `sum(quantity)` and nothing else. |
| `reason String?` | required for `ADJUSTMENT` | An adjustment with no explanation is a mystery that never gets solved. |
| no cost field | `unitCost` on item and per movement | The module's scope includes "stock valuation" and there was nothing to value without a price. Snapshotted per movement so a shelf bought at two different prices values as two different things. |
| `Warehouse` with no link from stock | `StockMovement.warehouseId` | Without it "across warehouses" — the stated module goal — is unanswerable. |

Also: `NotificationType += STOCK_LOW`, and `GoodsReceiptLine` gained the `inventoryItemId` FK it had
been holding empty. Master doc issues 82–87 record what is still open (the per-receipt manual mapping,
supplier lead times, the list-read ceiling at issue 84, the import direction, the tenant portal, and the
`UnitStatus` coupling).

---

## Domain: Inventory (Module: Inventory) — ✅ Built 2026-10-05

The original sketch was three tables: `InventoryItem` (id, organizationId, sku, name, unitOfMeasure,
reorderLevel Int), `Warehouse` (id, organizationId, name) and `StockMovement` (id, organizationId,
itemId, warehouseId, quantity Int signed, reason, createdAt).

That sketch is superseded by **Domain: Inventory (Module 11)** above, which documents what was actually
built and every deviation. The three differences a reader is most likely to trip over: `quantity` is
`Decimal(12,2)` rather than `Int` (paint goes in halves), it is the **only** place a stock level comes
from because there is no counter column, and `StockMovement` carries `unitCost` plus a `transferGroup`
because the module's stated scope included stock valuation.

---

## Domain: HR & Payroll (Module: HR & Payroll) — ✅ landed 2026-10-05, wider than the sketch below

The sketch in `13-MODULE-hr-payroll.md`'s source (this domain's target) was three
tables: `Employee`, `LeaveRequest`, `Payslip`. What was built keeps all three and
adds seven more, because each of them answers a question the three cannot:

| Model | Why the sketch could not carry it |
|---|---|
| `Employee` | as sketched, plus `employeeNumber`, `department` (free text, like `PurchaseRequest.department`), `jobTitle`, `employmentType`, `terminationDate`, `isActive`, `basicSalary`, `salaryCurrency`, `payFrequency`/`periodsPerYear`, `preferredLocale`, bank and statutory-identifier fields, `leavePolicyId`, and a **one-to-one `userId`** so an employee can log in without becoming staff-with-company-wide-visibility |
| `EmployeeComponent` | a pension the employee contributes 5% to and the employer 10% of is two figures from one arrangement, so the standing amount is a row per employee per component rather than a column on `Employee`. An employee with no row for a component is simply not on it. |
| `LeavePolicy` | entitlement, carryover cap, minimum notice, whether unpaid is allowed, maximum consecutive days, and which weekend pattern applies — per organization and per jurisdiction, so Kenya's rules and the UK's are both configuration |
| `Holiday` | a public holiday is a working-day fact, not a decoration. `isRecurring` for the fixed-date ones |
| `LeaveRequest` | as sketched, plus `leaveType`, `reason`, `decidedById`/`decidedAt`/`decisionNote`, and `workflowInstanceId` — set when approval ran through Module 18's engine, so the approval history is the engine's record and not a second copy of it here. `CANCELLED` exists as well as `REJECTED` because the employee may withdraw their own request and only an approver may reject it: those are different facts and the audit trail has to be able to tell them apart |
| `PayrollRule` | the whole statutory configuration: country + optional region, one of three arithmetic shapes, the base it reads, which side bears it, period mode, ledger accounts, and a `validFrom..validTo` window. Shaped like `TaxRule` on purpose — payroll and tax change on the same kind of cycle, and a second shape for the same idea is a second thing to learn |
| `PayrollRun` | the run is the document. A payroll is approved and posted **as a unit**, so calculating twelve payslips that can then be approved one at a time is how a company pays a quarter of its staff and not the rest |
| `Payslip` | as sketched, plus `payrollRunId`, `payDate`, `currency`, `basicSalary`, `locale`. **`grossSalary`/`deductions`/`netSalary` as columns were deliberately dropped** — they are the sum of this payslip's own `PayslipLine` rows, computed on read, for the same reason `Invoice.paidAmount` and `InventoryItem.quantityOnHand` are not counters: a stored net that can disagree with gross minus deductions is precisely the bug nobody catches until a tax audit |
| `PayslipLine` | one line per earning, deduction and employer contribution, with the `payrollRuleId` that produced it — so a payslip can be traced back to the rows that decided it rather than to whoever typed it |
| `PayComponent` | the catalogue of allowances and deductions an organization offers, which `EmployeeComponent` points at and which `PayrollRule` amounts post through |

**The absence that is not an oversight:** there is no `Attendance` model. The
module's scope names "check-in/out" and nothing implements it, because a clock is a
product decision (terminal, rounding, overtime) rather than a schema, and leave
already carries the `OFF_DUTY`/`COMPENSATORY` types a time-off-in-lieu arrangement
needs. See issue 91 in `13-MODULE-hr-payroll.md`.

```prisma
model Employee {
  id             String   @id @default(uuid())
  organizationId String
  userId         String?  // link to User if they also log in
  firstName      String
  lastName       String
  departmentId   String?
  hireDate       DateTime
  @@index([organizationId])
}

model LeaveRequest {
  id             String   @id @default(uuid())
  organizationId String
  employeeId     String
  startDate      DateTime
  endDate        DateTime
  status         LeaveStatus @default(PENDING)
  @@index([organizationId])
}

enum LeaveStatus {
  PENDING
  APPROVED
  REJECTED
}

model Payslip {
  id             String   @id @default(uuid())
  organizationId String
  employeeId     String
  periodStart    DateTime
  periodEnd      DateTime
  grossSalary    Decimal  @db.Decimal(14,2)
  deductions     Decimal  @db.Decimal(14,2) @default(0)
  netSalary      Decimal  @db.Decimal(14,2)
  @@index([organizationId])
}
```

---

## Domain: Facilities & Utilities (Modules: Facilities, Utilities) — 🆕 Not started

```prisma
model FacilityBooking {
  id             String   @id @default(uuid())
  organizationId String
  facilityName   String   // clubhouse, meeting room, parking slot
  bookedByContactId String
  startsAt       DateTime
  endsAt         DateTime
  @@index([organizationId])
}

model UtilityMeter {
  id             String   @id @default(uuid())
  organizationId String
  unitId         String
  type           MeterType // WATER, ELECTRICITY, GAS
  meterNumber    String
  @@index([organizationId])
}

enum MeterType {
  WATER
  ELECTRICITY
  GAS
}

model MeterReading {
  id             String   @id @default(uuid())
  organizationId String
  meterId        String
  previousReading Decimal @db.Decimal(12,2)
  currentReading  Decimal @db.Decimal(12,2)
  readingDate    DateTime
  @@index([organizationId])
}
```

---

## Domain: Legal (Module: Documents & Legal) — ⚠️ Partially existing (Document model above), verify

```prisma
model Contract {
  id             String   @id @default(uuid())
  organizationId String
  type           ContractType // LEASE, SALE, VENDOR, MANAGEMENT
  relatedEntityType String
  relatedEntityId String
  expiresAt      DateTime?
  documentId     String?
  @@index([organizationId])
}

enum ContractType {
  LEASE
  SALE
  VENDOR
  MANAGEMENT
}
```

---

## Domain: Notifications (Module: Notifications) — 🆕 Not started

```prisma
model Notification {
  id             String   @id @default(uuid())
  organizationId String
  userId         String
  type           String   // RENT_DUE, LATE_PAYMENT, LEASE_EXPIRY, etc.
  channel        CommChannel
  payload        Json?
  sentAt         DateTime?
  readAt         DateTime?
  createdAt      DateTime @default(now())
  @@index([organizationId])
}
```

---

## Domain: Workflow Engine (Module: Workflow Engine) — ✅ Built 2026-10-04

> The sketch below is what was planned. What shipped is a superset with three
> deliberate differences, all recorded in `19-MODULE-workflow-engine.md`:
> `WorkflowInstance.workflowDefinitionId` is **nullable** (retiring a policy must
> not delete approvals already in flight) and the instance keeps its own frozen
> `steps` copy; `WorkflowStep` and `WorkflowEvent` exist because the inbox,
> delegation and escalation need rows to query and a trail to read; and
> `WorkflowInstance.context` holds the caller's payload, which is what the level
> `condition`s are evaluated against. Migrations
> `20261004122018_module18_workflow_engine`,
> `20261004123401_module18_approval_notification_types`,
> `20261004125302_module18_workflow_instance_context`.

```prisma
model WorkflowDefinition {
  id             String   @id @default(uuid())
  organizationId String?  // null = system default
  entityType     String   // "Lease", "PurchaseOrder", "Expense", "Refund", "WorkOrder"
  steps          Json     // ordered approval steps, conditions, delegation rules
}

model WorkflowInstance {
  id             String   @id @default(uuid())
  organizationId String
  workflowDefinitionId String
  entityId       String
  currentStep    Int      @default(0)
  status         WorkflowInstanceStatus @default(IN_PROGRESS)
  @@index([organizationId])
}

enum WorkflowInstanceStatus {
  IN_PROGRESS
  APPROVED
  REJECTED
  ESCALATED
}
```

---

## Domain: SaaS Administration (Module: SaaS Administration) — 🆕 Not started, NOT tenant-scoped

> These tables live outside normal tenant filtering — they describe tenants, not belong to one.

```prisma
model SubscriptionPlan {
  id             String   @id @default(uuid())
  name           String
  monthlyPrice   Decimal  @db.Decimal(10,2)
  annualPrice    Decimal? @db.Decimal(10,2)
  storageLimitGb Int
  userLimit      Int?
  enabledModules String[] // module keys this plan unlocks
}

model Subscription {
  id             String   @id @default(uuid())
  organizationId String   @unique
  planId         String
  status         SubStatus @default(TRIAL)
  trialEndsAt    DateTime?
  currentPeriodEnd DateTime?
}

enum SubStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  CANCELLED
}

model PlatformInvoice {
  id             String   @id @default(uuid())
  organizationId String
  amount         Decimal  @db.Decimal(10,2)
  status         InvoiceStatus @default(UNPAID)
  issuedAt       DateTime @default(now())
}

model SupportTicket {
  id             String   @id @default(uuid())
  organizationId String
  raisedByUserId String
  subject        String
  status         TicketStatus @default(OPEN)
  createdAt      DateTime @default(now())
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}
```

---

## Migration Notes

- Run every schema change as a named Prisma migration: `npx prisma migrate dev --name <descriptive_name>`.
- Never edit an already-applied migration file. Add a new one.
- Before adding any table above, `grep`/search `schema.prisma` for an existing model with the same or similar name — the owner's description suggests several of these (Property, Unit, Tenant, RentalAgreement, Invoice, Payment, Landlord) likely already exist under the same or a close name. Reconcile field-by-field rather than assuming this doc's shape is exactly right; this doc is the target/reference, the live file is reality.
