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
import { InventoryCategory, StockMovementType } from '@prisma/client';
import { CleanOptional, ToBoolean, ToNumber } from '@/common/dto/transforms';

/**
 * Module 11 — Inventory DTOs.
 *
 * Two things are deliberately not accepted from a client:
 *
 * 1. **A stock quantity to create an item with.** The level is the sum of the
 *    movements, so the only way to open an item with stock on it is an `OPENING`
 *    movement through `POST /inventory/stock-movements`. An `initialQuantity` on
 *    this DTO would be a second writer of the balance and it would drift.
 * 2. **A movement type that decides its own sign.** `RecordStockMovementDto`
 *    takes a positive `quantity` plus an explicit `direction`, and the service
 *    derives the sign — so a `GOODS_RECEIPT` recorded with -5 cannot reach the
 *    ledger at all.
 *
 * `StockMovementType` on its own is not settable either: the types that carry a
 * reference (`GOODS_RECEIPT`, `WORK_ORDER_ISSUE`) are only ever written by the
 * module that owns that reference, through its own endpoint. This DTO covers the
 * three a person records by hand — opening balance, adjustment, return.
 */
export class CreateInventoryItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  sku!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @IsEnum(InventoryCategory)
  category?: InventoryCategory;

  /** "litre", "roll", "box", "metre". Free text on purpose — see the schema. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @CleanOptional()
  unitOfMeasure?: string;

  /** Last known price per unit. A hint for the reorder estimate, not a price. */
  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  /** Zero means "tracked, but never reordered automatically". */
  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  /** Null means "top up to twice the reorder level" — see `stock-ledger.ts`. */
  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0.01)
  reorderQuantity?: number;

  /** Cross-checked against the caller's organization in the service: an id from
   *  another tenant must not become a link to somebody else's supplier. */
  @IsOptional()
  @IsString()
  @CleanOptional()
  preferredSupplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;
}

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @CleanOptional()
  sku?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @CleanOptional()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @IsEnum(InventoryCategory)
  @CleanOptional()
  category?: InventoryCategory;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @CleanOptional()
  unitOfMeasure?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0.01)
  reorderQuantity?: number;

  @IsOptional()
  @IsString()
  @CleanOptional()
  preferredSupplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;

  /** Retiring keeps the movements intact; a deleted item would leave the ledger
   *  unsummable for every movement that referenced it. */
  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isActive?: boolean;
}

export class CreateWarehouseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @CleanOptional()
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @CleanOptional()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isActive?: boolean;
}

/**
 * One line of a transfer.
 *
 * Quantity is positive; the service writes the negative half from the source and
 * the positive half into the destination, sharing a `transferGroup`.
 */
export class TransferLineDto {
  @IsString()
  itemId!: string;

  @ToNumber()
  @IsNumber()
  @Min(0.01)
  quantity!: number;
}

export class TransferStockDto {
  @IsString()
  fromWarehouseId!: string;

  @IsString()
  toWarehouseId!: string;

  @IsArray()
  @ArrayMaxSize(200, { message: 'A transfer of 200 lines is a data-entry error, not a delivery.' })
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

/**
 * A movement a person records by hand.
 *
 * The direction is explicit rather than inferred from a signed quantity, because
 * the two mistakes a signed field invites (a receipt booked negative, an issue
 * booked positive) are exactly the ones `checkMovement` exists to refuse — and
 * they are much easier to refuse when the caller never chooses the sign.
 *
 * `GOODS_RECEIPT` and `WORK_ORDER_ISSUE` are **not** in this enum by design:
 * those carry a reference to another module's record and are written through
 * `POST /inventory/stock-movements/from-receipts` and
 * `POST /maintenance/work-orders/:id/issue-stock` respectively.
 */
export enum ManualMovementType {
  OPENING = 'OPENING',
  ADJUSTMENT = 'ADJUSTMENT',
  RETURN = 'RETURN',
}

export class RecordStockMovementDto {
  @IsString()
  itemId!: string;

  @IsString()
  warehouseId!: string;

  @IsEnum(ManualMovementType)
  type!: ManualMovementType;

  /** Always positive — `direction` says which way it goes. */
  @ToNumber()
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsEnum(['IN', 'OUT'])
  direction?: 'IN' | 'OUT';

  /** Required for an adjustment (checked in the service, which knows the type). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  reason?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

/**
 * A stock take.
 *
 * Separate from a movement because it reads completely differently: the caller
 * states the quantity **they counted**, and the service derives the difference and
 * writes one adjustment. Taking a count as "the balance is now 40" is what makes
 * a stock take repeatable by somebody else; making it a movement by hand means
 * every count is a subtraction somebody has to get right.
 *
 * Lines with no counted quantity are skipped rather than zeroed — leaving a line
 * out of a count means "I did not count this", which is not "there is none of
 * this".
 */
export class StockTakeLineDto {
  @IsString()
  itemId!: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ToNumber()
  @IsNumber()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  reason?: string;
}

export class RecordStockTakeDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StockTakeLineDto)
  lines!: StockTakeLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

/**
 * Book received goods into the store.
 *
 * `lines` are `{ goodsReceiptLineId, inventoryItemId, warehouseId }` triples
 * rather than a flat list, because a purchase order line and an inventory item
 * are two different vocabularies: "6 × 20mm compression coupling" only becomes
 * stock once somebody says it is SKU `PLMB-0042`. That mapping is a human
 * judgement, so it is passed in per line and never guessed from a description.
 */
export class BookStockInLineDto {
  @IsString()
  goodsReceiptLineId!: string;

  @IsString()
  inventoryItemId!: string;

  @IsString()
  warehouseId!: string;
}

export class BookStockInDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BookStockInLineDto)
  lines!: BookStockInLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

/**
 * The stock-in endpoint's own body.
 *
 * `purchaseOrderId` is declared here rather than sliced out of a wider object at
 * the controller, because the global `ValidationPipe` runs `whitelist: true` —
 * an undeclared property is *stripped*, so a hand-typed `purchaseOrderId` on an
 * undecorated field arrives as `undefined` and the endpoint fails on the order
 * rather than on the id. Every field a body carries has to be a declared one.
 */
export class BookStockInRequestDto extends BookStockInDto {
  @IsString()
  @MinLength(1)
  purchaseOrderId!: string;
}

/**
 * "This receipt line is not stock."
 *
 * The third answer for a receipt line, and without it the pending list never
 * empties. A laptop bought for the office, a printer, a desk — the goods really
 * did arrive and really are not on a shelf, and recording that is honest. Leaving
 * it undecided means the same line is raised as a question every morning for the
 * life of the order.
 */
export class MarkNotStockDto {
  @IsString()
  @MinLength(1)
  goodsReceiptLineId!: string;
}

export class IssueStockLineDto {
  @IsString()
  inventoryItemId!: string;

  @IsString()
  warehouseId!: string;

  @ToNumber()
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

/** Issue material against a work order — the other half of a goods receipt. */
export class IssueStockDto {
  @IsArray()
  @ArrayMaxSize(200, { message: 'A job consuming 200 lines is a data-entry error, not a repair.' })
  @ValidateNested({ each: true })
  @Type(() => IssueStockLineDto)
  lines!: IssueStockLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

/**
 * Put issued material back.
 *
 * A `movementIds` list rather than a fresh issue with a negative quantity: the
 * point is to name the *original* issue being undone, so the ledger carries both
 * rows and a reader can see what went out and what came back. A reverse entered
 * as new numbers would leave the original issue on the record as though it were
 * still true.
 */
export class ReturnStockDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose the issues to put back.' })
  @ArrayMaxSize(100)
  @IsString({ each: true })
  movementIds!: string[];
}

// ────────────────────────────────────────────────────────────── Filters

export interface InventoryItemFilters {
  category?: string;
  warehouseId?: string;
  /** 'belowReorder' | 'outOfStock' | 'ok' — all derived, all from the ledger. */
  status?: string;
  search?: string;
  /** Show retired items as well. Off by default: a retired item is history. */
  includeRetired?: boolean;
}

export interface StockMovementFilters {
  itemId?: string;
  warehouseId?: string;
  type?: string;
  workOrderId?: string;
  goodsReceiptId?: string;
  /** 'in' | 'out' | 'transfer' | 'adjustment' */
  direction?: string;
  from?: string;
  to?: string;
  search?: string;
}