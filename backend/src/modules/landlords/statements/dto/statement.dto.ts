import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ManagementFeeType, OwnerStatementStatus } from '@prisma/client';
import { CleanOptional, ToNumber } from '@/common/dto/transforms';

/**
 * Generate an owner statement for one period.
 *
 * Only the landlord and the period come from the caller. Every money figure is
 * derived (Module 6), so there is deliberately no `grossIncome`/`netPayout` on
 * this DTO: an operator cannot hand an owner a number they made up.
 *
 * `managementFeeType`/`managementFeeRate`/`managementFeeAmount` are optional
 * overrides for one-off cases ("this month was a flat 30,000") — the landlord's
 * agreed terms are used when they are absent.
 */
export class GenerateStatementDto {
  @IsString()
  @MaxLength(64)
  @CleanOptional()
  landlordId!: string;

  @IsDateString({}, { message: 'periodStart must be an ISO date' })
  periodStart!: string;

  @IsDateString({}, { message: 'periodEnd must be an ISO date' })
  periodEnd!: string;

  @IsOptional()
  @IsEnum(ManagementFeeType)
  managementFeeType?: ManagementFeeType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @ToNumber()
  managementFeeRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @ToNumber()
  managementFeeAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

export interface StatementFilters {
  landlordId?: string;
  status?: OwnerStatementStatus;
  periodStart?: string;
  periodEnd?: string;
}
