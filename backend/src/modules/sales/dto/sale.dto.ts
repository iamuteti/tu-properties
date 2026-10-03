import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CommissionStatus, SaleStage } from '@prisma/client';
import { CleanOptional, ToNumber } from '@/common/dto/transforms';

/** One row of a commission split. */
export class CommissionSplitDto {
  @IsString()
  agentUserId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @ToNumber()
  @Min(0)
  @Max(100)
  splitPercentage!: number;
}

/**
 * Every editable sale field, all optional, shared by create and update.
 * `stage` is deliberately absent: it only moves through
 * `PATCH /sales/:id/stage`, which enforces the pipeline gates in
 * `sale-stage.ts`, so it cannot be set from the generic form.
 */
export class SaleFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  propertyTitle?: string;

  /** `null` clears the link. */
  @IsOptional()
  @IsString()
  buyerContactId?: string | null;

  @IsOptional()
  @IsString()
  leadId?: string | null;

  /** `null` clears the link. */
  @IsOptional()
  @IsString()
  agentUserId?: string | null;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  askingPrice?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  agreedPrice?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  bookingFee?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  depositAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @CleanOptional()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;
}

export class CreateSaleDto extends SaleFieldsDto {
  @IsString()
  propertyId!: string;
}

export class UpdateSaleDto extends SaleFieldsDto {}

export class UpdateSaleStageDto {
  @IsEnum(SaleStage)
  stage!: SaleStage;

  /** Required when cancelling. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  reason?: string;
}

/** Generate a payment schedule for a sale. */
export class CreateInstallmentPlanDto {
  /** Number of equal instalments (1–24). */
  @IsNumber()
  @ToNumber()
  @Min(1)
  @Max(24)
  installments!: number;

  /** First instalment due date; the rest follow one month apart by default. */
  @IsDateString()
  firstDueDate!: string;

  /**
   * Installment added on top of the equal split, typically the booking fee or
   * deposit collected at reservation.
   */
  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  upfrontAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  upfrontDescription?: string;

  /** Days between instalments, when the default monthly cadence does not fit. */
  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(1)
  @Max(365)
  intervalDays?: number;
}

/** Raise a Finance invoice for one instalment. */
export class CreateInstallmentInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  memo?: string;
}

/** Create (or replace) the commission rows for a sale. */
export class GenerateCommissionsDto {
  /** Overrides the sale's own `commissionRate`. */
  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  /** Replaces the whole split; must add up to 100%. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CommissionSplitDto)
  participants?: CommissionSplitDto[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  basis?: string;
}

export class UpdateCommissionStatusDto {
  @IsEnum(CommissionStatus)
  status!: CommissionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  paidRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  notes?: string;
}
