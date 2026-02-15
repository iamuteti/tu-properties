-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'USER');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('VACANT', 'OCCUPIED', 'MAINTENANCE', 'RESERVED');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'MPESA', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landlords" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "alternativePhone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "taxPin" TEXT,
    "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "landlords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateAcquired" TIMESTAMP(3),
    "lrNumber" TEXT,
    "country" TEXT,
    "estateArea" TEXT,
    "areaRegion" TEXT,
    "roadStreet" TEXT,
    "specification" TEXT,
    "multiStoryType" TEXT,
    "numberOfFloors" INTEGER,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "notes" TEXT,
    "specificContactInfo" TEXT,
    "landlordId" TEXT,
    "categoryId" TEXT,
    "propertyTypeId" TEXT,
    "accountLedgerType" TEXT,
    "primaryBankAccount" TEXT,
    "alternativeTaxPin" TEXT,
    "propertyWorkingTaxPin" TEXT,
    "invoicePaymentInfo" TEXT,
    "holderPaymentTerms" TEXT,
    "mpesaPropertyPayNumber" TEXT,
    "disableMpesaStkPush" BOOLEAN NOT NULL DEFAULT false,
    "disableMpesaStkNarration" BOOLEAN NOT NULL DEFAULT false,
    "tenantReceiptAccountCodeCounter" INTEGER DEFAULT 0,
    "lpgExempted" BOOLEAN NOT NULL DEFAULT false,
    "penaltyChargeMode" TEXT,
    "penaltyDay" INTEGER,
    "landlordDrawerBank" TEXT,
    "landlordBankBranch" TEXT,
    "landlordAccountName" TEXT,
    "landlordAccountNumber" TEXT,
    "exemptAllSms" BOOLEAN NOT NULL DEFAULT false,
    "exemptInvoiceSms" BOOLEAN NOT NULL DEFAULT false,
    "exemptGeneralSms" BOOLEAN NOT NULL DEFAULT false,
    "exemptHagueSms" BOOLEAN NOT NULL DEFAULT false,
    "exemptBalanceSms" BOOLEAN NOT NULL DEFAULT false,
    "exemptAllEmail" BOOLEAN NOT NULL DEFAULT false,
    "exemptInvoiceEmail" BOOLEAN NOT NULL DEFAULT false,
    "exemptGeneralEmail" BOOLEAN NOT NULL DEFAULT false,
    "exemptReceiptEmail" BOOLEAN NOT NULL DEFAULT false,
    "exemptBalanceEmail" BOOLEAN NOT NULL DEFAULT false,
    "excludeInTwoSummaryReport" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER,
    "propertyId" TEXT NOT NULL,
    "quotedPrice" DECIMAL(10,2),
    "baseRent" DECIMAL(10,2),
    "basePerUnitArea" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "areaSqFt" DECIMAL(10,2),
    "chargePlan" TEXT,
    "floor" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "furnished" BOOLEAN NOT NULL DEFAULT false,
    "outSourceParking" TEXT,
    "unitTypeId" TEXT,
    "ownerOccupied" BOOLEAN NOT NULL DEFAULT false,
    "electricityAcno" TEXT,
    "waterAcno" TEXT,
    "electricityMeethno" TEXT,
    "waterMeethno" TEXT,
    "takeOnLettingDate" TIMESTAMP(3),
    "tenantResidentCodeCounter" INTEGER DEFAULT 0,
    "apartmentNotes" TEXT,
    "status" "UnitStatus" NOT NULL DEFAULT 'VACANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_service_charges" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "serviceUtilityAmenity" TEXT NOT NULL,
    "costPerArea" DECIMAL(10,2),
    "totalCost" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_service_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_meter_numbers" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "meterNo" TEXT NOT NULL,
    "readingSetup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_meter_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_features" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "featureType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_standing_charges" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "chargeUtility" TEXT NOT NULL,
    "chargeMode" TEXT NOT NULL,
    "billingCurrency" TEXT NOT NULL DEFAULT 'KES',
    "costPerArea" DECIMAL(10,2),
    "chargeValue" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(5,2),
    "excludesWithRent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_standing_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_security_deposits" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "ofRentBillingAmount" BOOLEAN NOT NULL DEFAULT false,
    "ofInitialRent" BOOLEAN NOT NULL DEFAULT false,
    "ofLastEscalation" BOOLEAN NOT NULL DEFAULT false,
    "excludesWithRent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_security_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tenantType" TEXT,
    "surname" TEXT NOT NULL,
    "otherNames" TEXT,
    "gender" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "town" TEXT,
    "sendMobileNumber" BOOLEAN NOT NULL DEFAULT false,
    "idNoRegNo" TEXT,
    "taxPin" TEXT,
    "postalAddress" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_emergency_contacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leases" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "rentAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "paymentDay" INTEGER NOT NULL DEFAULT 1,
    "securityDeposit" DECIMAL(10,2),
    "status" "LeaseStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "vatAmount" DECIMAL(10,2),
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balanceAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(5,2),
    "vatAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentReference" TEXT,
    "mpesaReceiptNumber" TEXT,
    "mpesaPhoneNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity");

-- CreateIndex
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "landlords_code_key" ON "landlords"("code");

-- CreateIndex
CREATE INDEX "landlords_code_idx" ON "landlords"("code");

-- CreateIndex
CREATE INDEX "landlords_email_idx" ON "landlords"("email");

-- CreateIndex
CREATE UNIQUE INDEX "property_categories_name_key" ON "property_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "property_categories_code_key" ON "property_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "property_types_name_key" ON "property_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "property_types_code_key" ON "property_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "properties_code_key" ON "properties"("code");

-- CreateIndex
CREATE INDEX "properties_landlordId_idx" ON "properties"("landlordId");

-- CreateIndex
CREATE INDEX "properties_categoryId_idx" ON "properties"("categoryId");

-- CreateIndex
CREATE INDEX "properties_propertyTypeId_idx" ON "properties"("propertyTypeId");

-- CreateIndex
CREATE INDEX "properties_code_idx" ON "properties"("code");

-- CreateIndex
CREATE UNIQUE INDEX "unit_types_name_key" ON "unit_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE INDEX "units_propertyId_idx" ON "units"("propertyId");

-- CreateIndex
CREATE INDEX "units_unitTypeId_idx" ON "units"("unitTypeId");

-- CreateIndex
CREATE INDEX "units_status_idx" ON "units"("status");

-- CreateIndex
CREATE INDEX "unit_service_charges_unitId_idx" ON "unit_service_charges"("unitId");

-- CreateIndex
CREATE INDEX "unit_meter_numbers_unitId_idx" ON "unit_meter_numbers"("unitId");

-- CreateIndex
CREATE INDEX "unit_features_unitId_idx" ON "unit_features"("unitId");

-- CreateIndex
CREATE INDEX "property_standing_charges_propertyId_idx" ON "property_standing_charges"("propertyId");

-- CreateIndex
CREATE INDEX "property_security_deposits_propertyId_idx" ON "property_security_deposits"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_accountNumber_key" ON "tenants"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");

-- CreateIndex
CREATE INDEX "tenants_accountNumber_idx" ON "tenants"("accountNumber");

-- CreateIndex
CREATE INDEX "tenants_code_idx" ON "tenants"("code");

-- CreateIndex
CREATE INDEX "tenants_email_idx" ON "tenants"("email");

-- CreateIndex
CREATE INDEX "tenants_phone_idx" ON "tenants"("phone");

-- CreateIndex
CREATE INDEX "tenant_emergency_contacts_tenantId_idx" ON "tenant_emergency_contacts"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "leases_code_key" ON "leases"("code");

-- CreateIndex
CREATE INDEX "leases_unitId_idx" ON "leases"("unitId");

-- CreateIndex
CREATE INDEX "leases_tenantId_idx" ON "leases"("tenantId");

-- CreateIndex
CREATE INDEX "leases_status_idx" ON "leases"("status");

-- CreateIndex
CREATE INDEX "leases_startDate_idx" ON "leases"("startDate");

-- CreateIndex
CREATE INDEX "leases_endDate_idx" ON "leases"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_leaseId_idx" ON "invoices"("leaseId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptNumber_key" ON "payments"("receiptNumber");

-- CreateIndex
CREATE INDEX "payments_leaseId_idx" ON "payments"("leaseId");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_paymentDate_idx" ON "payments"("paymentDate");

-- CreateIndex
CREATE INDEX "payments_paymentMethod_idx" ON "payments"("paymentMethod");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "property_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_propertyTypeId_fkey" FOREIGN KEY ("propertyTypeId") REFERENCES "property_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "unit_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_service_charges" ADD CONSTRAINT "unit_service_charges_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_meter_numbers" ADD CONSTRAINT "unit_meter_numbers_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_features" ADD CONSTRAINT "unit_features_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_standing_charges" ADD CONSTRAINT "property_standing_charges_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_security_deposits" ADD CONSTRAINT "property_security_deposits_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_emergency_contacts" ADD CONSTRAINT "tenant_emergency_contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
