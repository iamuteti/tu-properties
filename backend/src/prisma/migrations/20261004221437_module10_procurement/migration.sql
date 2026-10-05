-- CreateEnum
CREATE TYPE "SupplierCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'MECHANICAL', 'BUILDING_MATERIALS', 'FURNITURE', 'IT_AND_TECH', 'CLEANING', 'SECURITY', 'PEST_CONTROL', 'LANDSCAPING', 'PROFESSIONAL_SERVICES', 'GENERAL');

-- CreateEnum
CREATE TYPE "PurchaseCategory" AS ENUM ('MAINTENANCE_PARTS', 'EQUIPMENT', 'FURNITURE', 'IT_AND_TECH', 'STATIONERY', 'CLEANING', 'SECURITY', 'UTILITIES', 'PROFESSIONAL_SERVICES', 'OTHER');

-- CreateEnum
CREATE TYPE "PurchasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('DRAFT', 'ISSUED', 'QUOTES_RECEIVED', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RfqInvitationStatus" AS ENUM ('INVITED', 'QUOTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('SUBMITTED', 'SHORTLISTED', 'REJECTED', 'AWARDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PROCUREMENT_OFFICER';

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "category" "SupplierCategory",
ADD COLUMN     "contractEndDate" TIMESTAMP(3),
ADD COLUMN     "contractReference" TEXT,
ADD COLUMN     "contractStartDate" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER;

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "PurchaseCategory" NOT NULL,
    "priority" "PurchasePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "department" TEXT,
    "neededBy" TIMESTAMP(3),
    "estimatedAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "requestedById" TEXT,
    "approvalRequestedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "rejectionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "specification" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2),
    "estimatedAmount" DECIMAL(14,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfqs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "purchaseRequestId" TEXT,
    "status" "RfqStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "quotesDueAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "awardedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "awardedQuoteId" TEXT,
    "raisedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "RfqInvitationStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,

    CONSTRAINT "rfq_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_quotes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'SUBMITTED',
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "leadTimeDays" INTEGER,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfq_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_quote_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "purchaseRequestLineId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rfq_quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "category" "PurchaseCategory" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDelivery" TIMESTAMP(3),
    "deliveryAddress" TEXT,
    "terms" TEXT,
    "notes" TEXT,
    "rfqId" TEXT,
    "quoteId" TEXT,
    "purchaseRequestId" TEXT,
    "supplierBillId" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "raisedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "specification" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "receivedQuantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryNote" TEXT,
    "conditionNote" TEXT,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "inventoryItemId" TEXT,
    "stockInRecordedAt" TIMESTAMP(3),

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_requests_organizationId_idx" ON "purchase_requests"("organizationId");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

-- CreateIndex
CREATE INDEX "purchase_requests_category_idx" ON "purchase_requests"("category");

-- CreateIndex
CREATE INDEX "purchase_requests_requestedById_idx" ON "purchase_requests"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_organizationId_reference_key" ON "purchase_requests"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "purchase_request_lines_organizationId_idx" ON "purchase_request_lines"("organizationId");

-- CreateIndex
CREATE INDEX "purchase_request_lines_purchaseRequestId_idx" ON "purchase_request_lines"("purchaseRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_awardedQuoteId_key" ON "rfqs"("awardedQuoteId");

-- CreateIndex
CREATE INDEX "rfqs_organizationId_idx" ON "rfqs"("organizationId");

-- CreateIndex
CREATE INDEX "rfqs_status_idx" ON "rfqs"("status");

-- CreateIndex
CREATE INDEX "rfqs_purchaseRequestId_idx" ON "rfqs"("purchaseRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_organizationId_reference_key" ON "rfqs"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "rfq_invitations_organizationId_idx" ON "rfq_invitations"("organizationId");

-- CreateIndex
CREATE INDEX "rfq_invitations_supplierId_idx" ON "rfq_invitations"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_invitations_rfqId_supplierId_key" ON "rfq_invitations"("rfqId", "supplierId");

-- CreateIndex
CREATE INDEX "rfq_quotes_organizationId_idx" ON "rfq_quotes"("organizationId");

-- CreateIndex
CREATE INDEX "rfq_quotes_rfqId_idx" ON "rfq_quotes"("rfqId");

-- CreateIndex
CREATE INDEX "rfq_quotes_supplierId_idx" ON "rfq_quotes"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_quotes_rfqId_supplierId_key" ON "rfq_quotes"("rfqId", "supplierId");

-- CreateIndex
CREATE INDEX "rfq_quote_lines_organizationId_idx" ON "rfq_quote_lines"("organizationId");

-- CreateIndex
CREATE INDEX "rfq_quote_lines_quoteId_idx" ON "rfq_quote_lines"("quoteId");

-- CreateIndex
CREATE INDEX "rfq_quote_lines_purchaseRequestLineId_idx" ON "rfq_quote_lines"("purchaseRequestLineId");

-- CreateIndex
CREATE INDEX "purchase_orders_organizationId_idx" ON "purchase_orders"("organizationId");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_rfqId_idx" ON "purchase_orders"("rfqId");

-- CreateIndex
CREATE INDEX "purchase_orders_purchaseRequestId_idx" ON "purchase_orders"("purchaseRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organizationId_reference_key" ON "purchase_orders"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "purchase_order_lines_organizationId_idx" ON "purchase_order_lines"("organizationId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_purchaseOrderId_idx" ON "purchase_order_lines"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "goods_receipts_organizationId_idx" ON "goods_receipts"("organizationId");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseOrderId_idx" ON "goods_receipts"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_organizationId_idx" ON "goods_receipt_lines"("organizationId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_goodsReceiptId_idx" ON "goods_receipt_lines"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchaseOrderLineId_idx" ON "goods_receipt_lines"("purchaseOrderLineId");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_awardedQuoteId_fkey" FOREIGN KEY ("awardedQuoteId") REFERENCES "rfq_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_invitations" ADD CONSTRAINT "rfq_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_invitations" ADD CONSTRAINT "rfq_invitations_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_invitations" ADD CONSTRAINT "rfq_invitations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_quote_lines" ADD CONSTRAINT "rfq_quote_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_quote_lines" ADD CONSTRAINT "rfq_quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "rfq_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_quote_lines" ADD CONSTRAINT "rfq_quote_lines_purchaseRequestLineId_fkey" FOREIGN KEY ("purchaseRequestLineId") REFERENCES "purchase_request_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "rfq_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES "supplier_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
