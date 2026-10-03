import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PayoutStatus, PaymentMethod } from '@prisma/client';
import { CleanOptional, ToNumber } from '@/common/dto/transforms';

/**
 * Record a payout to an owner.
 *
 * `status` is absent here on purpose: a new payout starts PENDING and only
 * moves through `PATCH /landlord-payouts/:id/status`, which applies the
 * state machine in `payout-status.ts`. The transfer itself happens in the bank
 * — this records the intent and its outcome, so the reference is what makes it
 * auditable.
 */
export class CreatePayoutDto {
  @IsString()
  @MaxLength(64)
  @CleanOptional()
  landlordId!: string;

  /** The statement this payout settles. Optional for arrears catch-up payments. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @CleanOptional()
  ownerStatementId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'A payout must be for a positive amount' })
  @ToNumber()
  amount!: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @CleanOptional()
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  reference?: string;

  @IsOptional()
  @IsDateString({}, { message: 'scheduledFor must be an ISO date' })
  @CleanOptional()
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

/** The only mutable part of a payout: where it is in the payout state machine. */
export class UpdatePayoutStatusDto {
  @IsEnum(PayoutStatus)
  status!: PayoutStatus;

  /** Required to mark a payout PAID. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  reference?: string;

  /** Required to mark a payout FAILED. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @CleanOptional()
  failureReason?: string;

  @IsOptional()
  @IsDateString({}, { message: 'paidAt must be an ISO date' })
  @CleanOptional()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

export interface PayoutFilters {
  landlordId?: string;
  ownerStatementId?: string;
  status?: PayoutStatus;
  method?: PaymentMethod;
  paidFrom?: string;
  paidTo?: string;
}
