# TU Properties — Database Schema (Target, Postgres via Prisma 7)

> Read `00-MASTER-ARCHITECTURE.md` first. **Database engine is PostgreSQL — non-negotiable.**
>
> **Before touching this doc's contents:** open `backend/src/prisma/schema.prisma` and treat it as the current source of truth. The schema currently has **20 Prisma models** (`schema.prisma` lines 17–905), verified by a full codebase audit — more than this doc's "believed existing" tables below account for individually, because several accounting/integration fields already exist on models below as placeholder columns with no logic behind them yet. Specifically verified as already present but **unwired**:
> - `acReceivable`, `incomeAccount`, `spotRate` (accounting/GL-adjacent fields, likely on Property/Invoice/Account-like models) — no chart of accounts or GL engine consumes them yet.
> - `Property.mpesaPropertyPayNumber` — a payment gateway config field exists, but no live payment gateway integration, reconciliation logic exists.
> - `Invoice.signOnEfims` — a boolean flag referencing local tax compliance (eTIMS/KRA), but no actual tax compliance transmission/QR/ETR integration exists.
> - `Receipt.bankingDate` — field exists, reconciliation logic doesn't.
> - `exemptAllSms` — an SMS opt-out flag with no SMS sending system behind it yet.
>
> **Do not add duplicate fields for any of the above** — extend/wire the existing ones. Also verified: `AuditLog` model exists and a `logAction()` service exists (`backend/src/modules/audit/audit.service.ts`), but `logAction` is **never called anywhere in the codebase** — it needs to be wired into every create/update/delete on tenant data, not rebuilt.
>
> Tables below marked "✅ Believed existing" should be reconciled field-by-field against the live file — treat this doc as the *target* shape, not a guaranteed-accurate mirror of today's schema.
>
> **Drift watch (2026-10-03):** the live `schema.prisma` was verified against the live DB via `migrate deploy` — the DB was behind the schema (users table lacked the password-reset columns), and catch-up migration `20261003082158_add_password_reset_fields` was created and applied. After any schema edit, run `npx prisma migrate dev` so the migrations directory stays the source of truth for the DB; a fresh DB is built with `npx prisma migrate deploy` + `npx prisma db seed` (seed now includes the full demo dataset — see `Testing.md`).

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
  uploadedById   String
  createdAt      DateTime @default(now())
  @@index([organizationId])
  @@index([entityType, entityId])
}
```

---

## Domain: Property (Module: Property Management) — ✅ Believed existing, verify & extend

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
  ARCHIVED
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

---

## Domain: Leasing (Module: Lease & Tenancy) — ✅ Believed existing, verify & extend

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

## Domain: CRM (Module: CRM) — 🆕 Not started

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

---

## Domain: Sales (Module: Sales Management) — 🆕 Not started

```prisma
model SaleTransaction {
  id             String   @id @default(uuid())
  organizationId String
  propertyId     String
  buyerContactId String
  status         SaleStage @default(QUOTATION)
  agreedPrice    Decimal? @db.Decimal(14,2)
  bookingFee     Decimal? @db.Decimal(14,2)
  createdAt      DateTime @default(now())
  @@index([organizationId])
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

model Commission {
  id             String   @id @default(uuid())
  organizationId String
  saleTransactionId String?
  rentalAgreementId String?
  agentUserId    String
  amount         Decimal  @db.Decimal(14,2)
  splitPercentage Decimal? @db.Decimal(5,2)
  status         CommissionStatus @default(PENDING)
  @@index([organizationId])
}

enum CommissionStatus {
  PENDING
  APPROVED
  PAID
}
```

---

## Domain: Landlord (Module: Landlord Management) — ⚠️ Partially existing, verify

```prisma
model Landlord {
  id             String   @id @default(uuid())
  organizationId String
  firstName      String
  lastName       String
  email          String?
  phone          String?
  bankAccountName   String?
  bankAccountNumber String?
  bankName       String?
  taxId          String?
  createdAt      DateTime @default(now())
  @@index([organizationId])
}

model OwnerStatement {
  id             String   @id @default(uuid())
  organizationId String
  landlordId     String
  periodStart    DateTime
  periodEnd      DateTime
  rentalIncome   Decimal  @db.Decimal(14,2)
  expenses       Decimal  @db.Decimal(14,2)
  managementFee  Decimal  @db.Decimal(14,2)
  netPayout      Decimal  @db.Decimal(14,2)
  pdfUrl         String?
  createdAt      DateTime @default(now())
  @@index([organizationId])
}

model LandlordPayout {
  id             String   @id @default(uuid())
  organizationId String
  landlordId     String
  ownerStatementId String?
  amount         Decimal  @db.Decimal(14,2)
  method         PaymentMethod
  status         PayoutStatus @default(PENDING)
  paidAt         DateTime?
  @@index([organizationId])
}

enum PayoutStatus {
  PENDING
  PROCESSING
  PAID
  FAILED
}
```

---

## Domain: Finance & Accounting (Module: Finance & Accounting) — ⚠️ Partially existing, verify

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

## Domain: Payments (Module: Payments) — ⚠️ Partially existing, verify

```prisma
model Payment {
  id             String   @id @default(uuid())
  organizationId String
  invoiceId      String?
  amount         Decimal  @db.Decimal(14,2)
  method         PaymentMethod
  reference      String?  // payment gateway reference, cheque number, etc.
  status         PaymentStatus @default(COMPLETED)
  paidAt         DateTime @default(now())
  @@index([organizationId])
}

enum PaymentMethod {
  BANK_TRANSFER
  STRIPE
  MPESA
  CREDIT_CARD
  CASH
  CHEQUE
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
}

model Receipt {
  id             String   @id @default(uuid())
  organizationId String
  paymentId      String
  receiptNumber  String
  pdfUrl         String?
  createdAt      DateTime @default(now())
  @@index([organizationId])
}
```

---

## Domain: Maintenance (Module: Maintenance Management) — 🆕 Not started

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

## Domain: Procurement (Module: Procurement) — 🆕 Not started

```prisma
model Supplier {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  contactEmail   String?
  contactPhone   String?
  @@index([organizationId])
}

model PurchaseRequest {
  id             String   @id @default(uuid())
  organizationId String
  departmentId   String?
  requestedById  String
  status         PRStatus @default(PENDING)
  createdAt      DateTime @default(now())
  @@index([organizationId])
}

enum PRStatus {
  PENDING
  APPROVED
  REJECTED
}

model RFQ {
  id             String   @id @default(uuid())
  organizationId String
  purchaseRequestId String
  suppliersInvited String[] // supplier IDs
  @@index([organizationId])
}

model PurchaseOrder {
  id             String   @id @default(uuid())
  organizationId String
  supplierId     String
  status         POStatus @default(DRAFT)
  totalAmount    Decimal  @db.Decimal(14,2)
  @@index([organizationId])
}

enum POStatus {
  DRAFT
  SENT
  ACCEPTED
  DELIVERED
  CANCELLED
}
```

---

## Domain: Inventory (Module: Inventory) — 🆕 Not started

```prisma
model InventoryItem {
  id             String   @id @default(uuid())
  organizationId String
  sku            String
  name           String
  unitOfMeasure  String
  reorderLevel   Int      @default(0)
  @@index([organizationId])
}

model Warehouse {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  @@index([organizationId])
}

model StockMovement {
  id             String   @id @default(uuid())
  organizationId String
  itemId         String
  warehouseId    String
  quantity       Int      // positive = in, negative = out
  reason         String?
  createdAt      DateTime @default(now())
  @@index([organizationId])
}
```

---

## Domain: HR & Payroll (Module: HR & Payroll) — 🆕 Not started

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

## Domain: Workflow Engine (Module: Workflow Engine) — 🆕 Not started

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
