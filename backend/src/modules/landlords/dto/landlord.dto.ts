import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ManagementFeeType, TenantStatus } from '@prisma/client';
import { CleanOptional, ToBoolean, ToNumber } from '@/common/dto/transforms';

/**
 * Landlord profile fields, all optional, shared by create and update so the
 * two cannot drift apart.
 *
 * `organizationId` is deliberately absent: the tenant always comes from the
 * authenticated user, never from the body. `managementFeeRate` /
 * `managementFeeAmount` are the management agreement terms (Module 6) and are
 * what the owner statement deducts — see `statements/statement-calculator.ts`.
 */
export class LandlordFieldsDto {
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @CleanOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  alternativePhone?: string;

  // Address
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @CleanOptional()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @CleanOptional()
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @CleanOptional()
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @CleanOptional()
  postalCode?: string;

  // Banking details — where payouts are sent
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  bankBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  accountNumber?: string;

  // Tax information
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  taxPin?: string;

  @IsOptional()
  @ToBoolean()
  vatRegistered?: boolean;

  // Management agreement
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

export class CreateLandlordDto extends LandlordFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @CleanOptional()
  code?: string;

  @IsString()
  @MaxLength(200)
  @CleanOptional()
  name!: string;
}

export class UpdateLandlordDto extends LandlordFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  name?: string;
}

export interface LandlordFilters {
  status?: TenantStatus;
  managementFeeType?: ManagementFeeType;
  /** Landlords owning at least one property. */
  hasProperties?: boolean;
}
