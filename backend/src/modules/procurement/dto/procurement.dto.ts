import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PurchaseCategory,
  PurchasePriority,
  QuoteStatus,
  SupplierCategory,
  SupplierStatus,
} from '@prisma/client';
import { CleanOptional, ToBoolean, ToNumber } from '@/common/dto/transforms';

/**
 * Module 10 — Procurement DTOs.
 *
 * `status` is absent from every update DTO on purpose. A purchase request, an
 * RFQ and a purchase order each have a state machine with gates in
 * `procurement-lifecycle.ts`, and a `status` on an update body would walk
 * straight past all of them — the same rule the work-order and lease modules
 * settled on.
 *
 * Money arrives as a number and is converted to Decimal by the service; the
 * schema's Decimal(14,2) columns are the storage convention, not something a
 * browser should have to know about.
 */

// ─────────────────────────────────────────── Purchase request lines

export class PurchaseRequestLineDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  specification?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CreatePurchaseRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  description?: string;

  @IsEnum(PurchaseCategory)
  category!: PurchaseCategory;

  @IsOptional()
  @IsEnum(PurchasePriority)
  priority?: PurchasePriority;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  department?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  neededBy?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  estimatedAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @CleanOptional()
  currency?: string;

  /**
   * Required. A request with no lines has nothing to compare quotations
   * against, which is the entire point of asking suppliers to quote — so it is
   * refused at the boundary rather than creating an empty draft that cannot
   * leave DRAFT.
   */
  @IsArray()
  @ArrayMinSize(1, {
    message:
      'Add at least one line — a request with nothing on it cannot be quoted for.',
  })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineDto)
  lines!: PurchaseRequestLineDto[];

  /** Skip the approval round entirely and save as a draft. */
  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  saveAsDraft?: boolean;
}

export class UpdatePurchaseRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @CleanOptional()
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @IsEnum(PurchaseCategory)
  @CleanOptional()
  category?: PurchaseCategory;

  @IsOptional()
  @IsEnum(PurchasePriority)
  @CleanOptional()
  priority?: PurchasePriority;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  department?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  neededBy?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  estimatedAmount?: number;
}

/** Replacing the whole line set. Only a DRAFT or REOPENED request accepts this. */
export class ReplacePurchaseRequestLinesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'A request needs at least one line.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineDto)
  lines!: PurchaseRequestLineDto[];
}

export class SubmitPurchaseRequestDto {
  /** What the approver reads instead of the title. Optional; the title is the
   *  fallback, because requiring a justification on every submission would just
   *  produce "as per request" a hundred times a week. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  note?: string;
}

export class RejectPurchaseRequestDto {
  /** Required. It is what the person who raised the request reads. */
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;
}

export class CancelPurchaseRequestDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;
}

// ─────────────────────────────────────────────────────────────── RFQs

export class InviteSuppliersDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Invite at least one supplier.' })
  @ArrayMaxSize(50)
  @IsString({ each: true })
  supplierIds!: string[];

  /** Per-supplier decline reasons recorded at invite time are pointless, so
   *  declining is its own endpoint rather than a flag here. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;
}

export class CreateRfqDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  purchaseRequestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @CleanOptional()
  currency?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  quotesDueAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  supplierIds?: string[];
}

export class RfqQuoteLineDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description!: string;

  @ToNumber()
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @ToNumber()
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  /** Which requested line this answers. Optional — a supplier may quote the
   *  whole job in one line, and forcing a match would make honest quotations
   *  impossible to enter. */
  @IsOptional()
  @IsString()
  @CleanOptional()
  purchaseRequestLineId?: string;
}

export class RecordQuoteDto {
  @IsString()
  supplierId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'A quotation needs at least one line.' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RfqQuoteLineDto)
  lines!: RfqQuoteLineDto[];

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(0)
  @Max(3650)
  leadTimeDays?: number;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;

  /** Supplies tax the round did not ask for. Defaults to false, because the
   *  common case in this market is an inclusive quote. */
  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  taxInclusive?: boolean;
}

export class DeclineInvitationDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;
}

export class AwardQuoteDto {
  @IsString()
  quoteId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  note?: string;
}

export class CancelRfqDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;
}

export class SetQuoteStatusDto {
  @IsEnum(QuoteStatus)
  status!: QuoteStatus;
}

// ──────────────────────────────────────────────── Purchase orders

export class PurchaseOrderLineDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  specification?: string;

  @ToNumber()
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @ToNumber()
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  /** Which requested line this order line answers, when it came from one. */
  @IsOptional()
  @IsString()
  @CleanOptional()
  purchaseRequestLineId?: string;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId!: string;

  /**
   * Required unless the order comes from an awarded quotation or an approved
   * request, in which case the category is copied from whichever it came from —
   * an order that disagrees with the request it answers is how a maintenance
   * purchase posts to office expenses six weeks later.
   */
  @IsOptional()
  @IsEnum(PurchaseCategory)
  category?: PurchaseCategory;

  /**
   * Required unless the order is raised from an awarded quotation, where the
   * lines come from the quote so the two cannot disagree. Checked in the
   * service rather than here, because which of the two rules applies is decided
   * by `quoteId` and a class validator cannot express that.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];

  /** From the awarded quotation. The lines are then *derived* from the quote,
   *  so the two routes cannot disagree. */
  @IsOptional()
  @IsString()
  @CleanOptional()
  quoteId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  purchaseRequestId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  rfqId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @CleanOptional()
  currency?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  expectedDelivery?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  terms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @CleanOptional()
  @IsDateString()
  expectedDelivery?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  terms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;
}

export class PurchaseOrderActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  note?: string;
}

export class CancelPurchaseOrderDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;
}

export class GoodsReceiptLineDto {
  @IsString()
  purchaseOrderLineId!: string;

  @ToNumber()
  @IsNumber()
  @Min(0.01)
  quantity!: number;
}

export class RecordGoodsReceiptDto {
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Record what arrived — a receipt with no lines records nothing.',
  })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  deliveryNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  conditionNote?: string;
}

/** Raise the supplier bill for what has been received. */
export class CreateBillFromOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  supplierReference?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  billDate?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0.01)
  amount?: number;
}

// ─────────────────────────────────────────────────────────── Suppliers

export class UpdateSupplierProcurementDto {
  @IsOptional()
  @IsEnum(SupplierCategory)
  @CleanOptional()
  category?: SupplierCategory;

  /** 1–5. A human judgement, kept next to the derived performance figures
   *  rather than replacing them. */
  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  contractStartDate?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  contractEndDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  contractReference?: string;

  @IsOptional()
  @IsEnum(SupplierStatus)
  @CleanOptional()
  status?: SupplierStatus;
}

// ──────────────────────────────────────────────────────────── Filters

export interface PurchaseRequestFilters {
  status?: string;
  category?: string;
  priority?: string;
  requestedById?: string;
  department?: string;
  open?: boolean;
  search?: string;
}

export interface RfqFilters {
  status?: string;
  supplierId?: string;
  purchaseRequestId?: string;
  overdue?: boolean;
  open?: boolean;
  search?: string;
}

export interface PurchaseOrderFilters {
  status?: string;
  supplierId?: string;
  purchaseRequestId?: string;
  rfqId?: string;
  category?: string;
  overdue?: boolean;
  open?: boolean;
  hasBill?: boolean;
  search?: string;
}

export interface SupplierFilters {
  status?: string;
  category?: string;
  /** 'hasContracts' limits to suppliers inside a contract window. */
  contractOnly?: boolean;
  search?: string;
}
