import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TenantRequestType } from '@prisma/client';
import { CleanOptional } from '@/common/dto/transforms';

/** Payload fields that matter per request type. Validated in the service. */
export class RenewalPayloadDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  termMonths?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentAmount?: number;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  newEndDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

export class CreateTenantRequestDto {
  @IsEnum(TenantRequestType)
  type!: TenantRequestType;

  /**
   * Optional: defaults to the tenant's current active lease. A resident can
   * only ever submit against their own lease — the service resolves it from the
   * session tenant.
   */
  @IsOptional()
  @IsString()
  rentalAgreementId?: string;

  /** Requested date, e.g. when they want to move out. */
  @IsOptional()
  @CleanOptional()
  @IsDateString()
  preferredDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  note?: string;

  /** Type-specific detail (e.g. `{ termMonths, rentAmount }` for a renewal). */
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class DecideTenantRequestDto {
  @IsEnum(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  /** Required for a rejection — it is what the resident reads. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  decisionNote?: string;
}