import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyStatus } from '@prisma/client';
import { CleanOptional, ToBoolean, ToNumber } from '@/common/dto/transforms';

/**
 * An amenity attached to a property. Amenities are structured rows
 * (`PropertyAmenity`), not a free-text blob, so they can be filtered, grouped
 * and reported on.
 */
export class AmenityInputDto {
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  notes?: string;
}

/**
 * Every editable property field, all optional.
 *
 * Shared by create and update so the two can never drift apart; `code` and
 * `name` are declared as required on `CreatePropertyDto` only. Note that
 * `organizationId` is deliberately absent everywhere — it is always taken from
 * the authenticated user, never from the request body.
 */
export class PropertyFieldsDto {
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  specification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  multiStoryType?: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  numberOfFloors?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @CleanOptional()
  lrNumber?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  dateAcquired?: string;

  /** Pass `null` to disassociate the property from its landlord. */
  @IsOptional()
  @IsString()
  landlordId?: string | null;

  /** Pass `null` to disassociate the property from its branch. */
  @IsOptional()
  @IsString()
  branchId?: string | null;

  // Location & address
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @CleanOptional()
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  estateArea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  areaRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  roadStreet?: string;

  @IsOptional()
  @IsLatitude()
  @ToNumber()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  @ToNumber()
  longitude?: number;

  // Notes & contact info
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  specificContactInfo?: string;

  // Accounting & billing configuration
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  accountLedgerType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  primaryBankAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  alternativeTaxPin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  propertyWorkingTaxPin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  invoicePaymentInfo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  holderPaymentTerms?: string;

  // Mobile money
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @CleanOptional()
  mpesaPropertyPayNumber?: string;

  @IsOptional()
  @ToBoolean()
  disableMpesaStkPush?: boolean;

  @IsOptional()
  @ToBoolean()
  disableMpesaStkNarration?: boolean;

  // Rent penalty configuration
  @IsOptional()
  @ToBoolean()
  lpgExempted?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  penaltyChargeMode?: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  penaltyDay?: number;

  // Landlord banking details
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  landlordDrawerBank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  landlordBankBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  landlordAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  landlordAccountNumber?: string;

  // Communication preferences
  @IsOptional()
  @ToBoolean()
  exemptAllSms?: boolean;

  @IsOptional()
  @ToBoolean()
  exemptInvoiceSms?: boolean;

  @IsOptional()
  @ToBoolean()
  exemptGeneralSms?: boolean;

  @IsOptional()
  @ToBoolean()
  exemptHagueSms?: boolean;

  @IsOptional()
  @ToBoolean()
  exemptBalanceSms?: boolean;

  @IsOptional()
  @ToBoolean()
  exemptAllEmail?: boolean;

  @IsOptional()
  @ToBoolean()
  exemptInvoiceEmail?: boolean;

  @IsOptional()
  @ToBoolean()
  exemptGeneralEmail?: boolean;

  @IsOptional()
  @ToBoolean()
  exemptReceiptEmail?: boolean;

  @IsOptional()
  @ToBoolean()
  exemptBalanceEmail?: boolean;

  @IsOptional()
  @ToBoolean()
  excludeInTwoSummaryReport?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AmenityInputDto)
  amenities?: AmenityInputDto[];
}

export class CreatePropertyDto extends PropertyFieldsDto {
  @IsString()
  @MaxLength(50)
  @CleanOptional()
  code!: string;

  @IsString()
  @MaxLength(200)
  @CleanOptional()
  name!: string;
}

export class UpdatePropertyDto extends PropertyFieldsDto {
  /** The code is unique per organization, so it can be corrected. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @CleanOptional()
  code?: string;
}

/** Replace the whole amenity set of a property. */
export class ReplaceAmenitiesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AmenityInputDto)
  amenities!: AmenityInputDto[];
}

/** CSV bulk import payload. Parsed server-side so there is one parser. */
export class ImportPropertiesDto {
  @IsString()
  csv!: string;

  /** Dry run: validate and report without writing anything. */
  @IsOptional()
  @ToBoolean()
  dryRun?: boolean;
}
