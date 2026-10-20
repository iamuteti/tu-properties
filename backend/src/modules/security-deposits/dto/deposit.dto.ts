import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CleanOptional, ToNumber } from '@/common/dto/transforms';
import { DEPOSIT_BASIS } from '../deposit-rule';

/**
 * The deposit rule for one kind of unit.
 *
 * One number, or a number of months of the rent. A rule of **zero** is a
 * decision — "this kind of unit takes no deposit" — and it is stored as a rule
 * of zero rather than as the absence of one, because the absence of a rule
 * means "nobody has decided yet" and the agreement screen refuses to guess.
 */
export class SetDepositRuleDto {
  /** The deposit, when the basis is a fixed sum. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @ToNumber()
  amount?: number;

  /** FIXED or RENT_MONTHS. */
  @IsOptional()
  @IsString()
  @IsIn([DEPOSIT_BASIS.FIXED, DEPOSIT_BASIS.RENT_MONTHS])
  @CleanOptional()
  basis?: string;

  /** How many months of rent, when the basis is RENT_MONTHS. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @ToNumber()
  months?: number;
}
