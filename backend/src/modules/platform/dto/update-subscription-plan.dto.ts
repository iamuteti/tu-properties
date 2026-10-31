import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Update a subscription plan. Every field is optional — a missing field keeps
 * its current value. A plan can be archived (isActive = false) but not hard
 * deleted while subscriptions reference it. A price of `0` is a free plan.
 *
 * Prices are stored as a map of ISO-4217 currency code -> amount.
 */
export class UpdateSubscriptionPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  prices?: Record<string, number>;

  @IsOptional()
  @IsString()
  @IsIn(['month', 'year'])
  interval?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxProperties?: number;

  @IsOptional()
  @IsString({ each: true })
  enabledModules?: string[];

  @IsOptional()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsEnum([true, false])
  isActive?: boolean;

  @IsOptional()
  @IsEnum([true, false])
  isPopular?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
