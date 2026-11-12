import {
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Create a subscription plan — one row in the catalog the platform sells.
 * Every field except `name` has a sensible default, so a plan can be created
 * with just a name and filled in later. A price of `0` is a real (free) plan.
 *
 * Prices are stored as a map of ISO-4217 currency code -> amount, so a single
 * plan can be sold in multiple currencies (e.g. USD + KES).
 */
export class CreateSubscriptionPlanDto {
  /** Display name. Must be unique — two plans with the same name confuse the UI. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** URL-safe key. Defaults to a slug of the name; used in APIs and links. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug?: string;

  /** Human-readable blurb shown on the pricing card. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /**
   * Prices keyed by ISO-4217 currency code (e.g. { "USD": 10, "KES": 1500 }).
   * A value of `0` is a free plan in that currency.
   */
  @IsOptional()
  prices?: Record<string, number>;

  /** "month" or "year". */
  @IsOptional()
  @IsString()
  @IsIn(['month', 'year'])
  interval?: string;

  /** Seats included in the plan. Enforced when a user is invited. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUsers?: number;

  /** Buildings included in the plan. Enforced when a property is registered. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxProperties?: number;

  /** Feature strings shown on the pricing card. Stored as JSON. */
  @IsOptional()
  @IsString({ each: true })
  enabledModules?: string[];

  /** Feature strings shown on the pricing card. Stored as JSON. */
  @IsOptional()
  @IsString({ each: true })
  features?: string[];

  /** Stripe Price IDs keyed by currency code (e.g. { "USD": "price_...", "KES": "price_..." }). */
  @IsOptional()
  @IsObject()
  stripePrices?: Record<string, string>;

  /** Whether this plan can be newly assigned to an organization. */
  @IsOptional()
  @IsEnum([true, false])
  isActive?: boolean;

  /** Badged "most popular" on the pricing page. */
  @IsOptional()
  @IsEnum([true, false])
  isPopular?: boolean;

  /** Whether this plan is shown on the public pricing page. Custom/enterprise
   * plans set this to false so only admins can see and assign them. */
  @IsOptional()
  @IsEnum([true, false])
  isPublic?: boolean;

  /** Lower sorts first. */
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
