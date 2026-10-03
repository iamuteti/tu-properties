import {
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AgreementStatus, AgreementType, DeductionCategory } from '@prisma/client';
import { CleanOptional, ToBoolean, ToNumber } from '@/common/dto/transforms';

/**
 * Lease payloads (Module 5).
 *
 * These replace the raw `Prisma.RentalAgreementCreateInput` bodies the leases
 * endpoints used to accept, which let any column be set from the browser and
 * validated nothing.
 */
export class RentalAgreementFieldsDto {
  @IsOptional()
  @IsEnum(AgreementType)
  agreementType?: AgreementType;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @CleanOptional()
  currency?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(1)
  @Max(28)
  paymentDay?: number;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(1)
  @Max(600)
  termMonths?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  securityDeposit?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  @Max(100)
  escalationRate?: number;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(1)
  @Max(365)
  escalationMonth?: number;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(0)
  @Max(365)
  noticePeriodDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;

  // `status` is deliberately absent: the lifecycle moves through
  // /leases/:id/{activate,renew,extend,terminate,expire}, which applies the
  // rules in lease-lifecycle.ts and the occupancy side-effects.
}

export class CreateRentalAgreementDto extends RentalAgreementFieldsDto {
  @IsString()
  unitId!: string;

  @IsString()
  tenantId!: string;

  @IsNumber()
  @ToNumber()
  @Min(0)
  rentAmount!: number;
}

export class UpdateRentalAgreementDto extends RentalAgreementFieldsDto {
  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  rentAmount?: number;
}

/** Extend an existing lease in place (no new agreement row). */
export class ExtendLeaseDto {
  @IsDateString()
  newEndDate!: string;
}

/** Terminate a lease early. */
export class TerminateLeaseDto {
  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  refundDeposit?: boolean;
}

/** Create the successor agreement of a renewal. */
export class RenewLeaseDto {
  @IsOptional()
  @IsDateString()
  @CleanOptional()
  newStartDate?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  newEndDate?: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  rentAmount?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  securityDeposit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @CleanOptional()
  currency?: string;

  /** Carry the previous lease's unscheduled end date when no new one is given. */
  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(1)
  @Max(600)
  termMonths?: number;
}

// ------------------------------------------------------------- move-outs

export class CreateDeductionDto {
  @IsEnum(DeductionCategory)
  category!: DeductionCategory;

  @IsString()
  @MaxLength(300)
  @CleanOptional()
  description!: string;

  @IsNumber()
  @ToNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  notes?: string;
}

export class CreateMoveOutRequestDto {
  @IsString()
  rentalAgreementId!: string;

  @IsDateString()
  moveoutDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  notes?: string;
}

export class ApproveMoveOutDto {
  @IsOptional()
  @IsDateString()
  @CleanOptional()
  approvedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  notes?: string;
}

/** Pay the deposit refund out (records the reference, marks the agreement). */
export class RefundDepositDto {
  @IsString()
  @MaxLength(100)
  paidRef!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  paymentMethod?: string;
}

// ------------------------------------------------------------ inspections

export class InspectionItemInputDto {
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  area!: string;

  @IsString()
  @MaxLength(200)
  @CleanOptional()
  item!: string;

  @IsOptional()
  @IsEnum(['GOOD', 'FAIR', 'POOR', 'DAMAGED'])
  condition?: 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @ToBoolean()
  requiresAction?: boolean;
}

export class CreateInspectionDto {
  @IsString()
  unitId!: string;

  @IsOptional()
  @IsString()
  rentalAgreementId?: string;

  @IsEnum(['MOVE_IN', 'PERIODIC', 'MOVE_OUT', 'ANNUAL'])
  type!: 'MOVE_IN' | 'PERIODIC' | 'MOVE_OUT' | 'ANNUAL';

  @IsDateString()
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionItemInputDto)
  items?: InspectionItemInputDto[];
}

export class UpdateInspectionItemDto {
  @IsOptional()
  @IsEnum(['GOOD', 'FAIR', 'POOR', 'DAMAGED'])
  condition?: 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @ToBoolean()
  requiresAction?: boolean;
}

export class CreateLeaseTemplateDto {
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  name!: string;

  @IsOptional()
  @IsEnum(AgreementType)
  agreementType?: AgreementType;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @CleanOptional()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  securityDeposit?: number;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(1)
  @Max(600)
  termMonths?: number;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(0)
  @Max(365)
  noticePeriodDays?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  @Max(100)
  escalationRate?: number;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(1)
  @Max(28)
  paymentDay?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  @CleanOptional()
  termsBody?: string;

  @IsOptional()
  @ToBoolean()
  isActive?: boolean;
}

export type UpdateLeaseTemplateDto = CreateLeaseTemplateDto;

export interface LeaseFilters {
  status?: string;
  agreementType?: string;
  unitId?: string;
  propertyId?: string;
  tenantId?: string;
  /** Only leases ending within N days (the expiry-reminder stub). */
  expiringInDays?: number;
}

export type { AgreementStatus };