import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ChargeCategory } from '@prisma/client';
import { CleanOptional, ToNumber } from '@/common/dto/transforms';

/**
 * A cost charged to an owner (repairs carried out, utilities advanced,
 * insurance). Deducted from the next owner statement.
 *
 * Not a general expense table — Finance & Accounting (Module 7) owns the ledger
 * and expenses. This is only the owner-facing slice, so a statement can be
 * built today without pretending the GL exists.
 */
export class CreateChargeDto {
  @IsString()
  @MaxLength(64)
  @CleanOptional()
  landlordId!: string;

  /** Optional: attribute the cost to one of the owner's properties. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @CleanOptional()
  propertyId?: string;

  @IsEnum(ChargeCategory)
  category!: ChargeCategory;

  @IsString()
  @MaxLength(300)
  @CleanOptional()
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'A charge must be for a positive amount' })
  @ToNumber()
  amount!: number;

  @IsOptional()
  @IsDateString({}, { message: 'chargeDate must be an ISO date' })
  @CleanOptional()
  chargeDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

export class UpdateChargeDto {
  @IsOptional()
  @IsEnum(ChargeCategory)
  category?: ChargeCategory;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'A charge must be for a positive amount' })
  @ToNumber()
  amount?: number;

  @IsOptional()
  @IsDateString({}, { message: 'chargeDate must be an ISO date' })
  @CleanOptional()
  chargeDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

export interface ChargeFilters {
  landlordId?: string;
  propertyId?: string;
  category?: ChargeCategory;
  /** Only charges not yet rolled into an issued statement. */
  unstated?: boolean;
  from?: string;
  to?: string;
}
