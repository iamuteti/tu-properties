import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitStatus } from '@prisma/client';
import { CleanOptional, ToBoolean, ToNumber } from '@/common/dto/transforms';

/** A unit feature/amenity row (`UnitFeature`). */
export class UnitFeatureInputDto {
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  featureType?: string;
}

/** A recurring service charge / utility attached to a unit. */
export class UnitServiceChargeInputDto {
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  serviceUtilityAmenity!: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  costPerArea?: number;

  @IsNumber()
  @ToNumber()
  totalCost!: number;
}

/** A meter number attached to a unit. */
export class UnitMeterNumberInputDto {
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  meterNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  readingSetup?: string;
}

/**
 * Every editable unit field, all optional, shared by create and update.
 * `name` and `propertyId` are declared on the subclasses.
 */
export class UnitFieldsDto {
  @IsOptional()
  @IsInt()
  @ToNumber()
  sequence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  chargePlan?: string;

  // Pricing
  @IsOptional()
  @IsNumber()
  @ToNumber()
  quotedPrice?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  baseRent?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  basePerUnitArea?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @CleanOptional()
  currency?: string;

  // Area / space management
  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  areaSqFt?: number;

  // Specifications
  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(0)
  @Max(200)
  floor?: number;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(0)
  @Max(50)
  bedrooms?: number;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(0)
  @Max(50)
  bathrooms?: number;

  @IsOptional()
  @ToBoolean()
  furnished?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  outSourceParking?: string;

  @IsOptional()
  @ToBoolean()
  ownerOccupied?: boolean;

  // Utility account / meter numbers
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @CleanOptional()
  electricityAcno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @CleanOptional()
  waterAcno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @CleanOptional()
  electricityMeethno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @CleanOptional()
  waterMeethno?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  takeOnLettingDate?: string;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(0)
  tenantResidentCodeCounter?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  apartmentNotes?: string;

  // Occupancy status is intentionally NOT editable here: it changes through
  // `PATCH /units/:id/status`, which validates the transition against the
  // unit's rental agreements. Accepting a raw status would bypass that.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UnitFeatureInputDto)
  features?: UnitFeatureInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UnitServiceChargeInputDto)
  serviceCharges?: UnitServiceChargeInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => UnitMeterNumberInputDto)
  meterNumbers?: UnitMeterNumberInputDto[];
}

export class CreateUnitDto extends UnitFieldsDto {
  @IsString()
  propertyId!: string;

  @IsString()
  @MaxLength(120)
  @CleanOptional()
  name!: string;

  /**
   * Accepted for clarity but only `VACANT` is allowed: occupancy is a function
   * of the unit's rental agreements, not a value you type in on creation.
   */
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;
}

export class UpdateUnitDto extends UnitFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  name?: string;

  @IsOptional()
  @IsString()
  propertyId?: string;
}

/**
 * Occupancy status transition. Validated against the unit's rental
 * agreements by the service — see `occupancy.ts` for the rules.
 */
export class SetUnitStatusDto {
  @IsEnum(UnitStatus)
  status!: UnitStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  reason?: string;
}

/** CSV bulk import payload for units. */
export class ImportUnitsDto {
  @IsString()
  csv!: string;

  /** Create the parent property when a row references an unknown property. */
  @IsOptional()
  @ToBoolean()
  createMissingProperties?: boolean;

  @IsOptional()
  @ToBoolean()
  dryRun?: boolean;
}
