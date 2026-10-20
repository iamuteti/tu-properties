import {
  IsEnum,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

/**
 * The plan tiers. `FREE` is the schema default and is a real tier (a tenant
 * that was never sold anything); the other three are what the platform sells.
 */
export const SUBSCRIPTION_PLANS = [
  'FREE',
  'STARTER',
  'PROFESSIONAL',
  'ENTERPRISE',
] as const;

export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/**
 * Edit one organization's subscription.
 *
 * Every field is optional: this is a patch, and the caller sends only the
 * terms it is changing. A field left out keeps its current value; a date sent
 * as `null` is cleared.
 *
 * The plan and the seat/property limits live on the `Organization` row while
 * the status and the dates live on the `Subscription` row, because that is
 * where the schema put them — the service writes both rows in one transaction
 * so the two can never claim two different relationships at once.
 */
export class UpdateSubscriptionDto {
  /** The tier. Mirrored onto `Organization.plan` and `Subscription.plan`. */
  @IsOptional()
  @IsIn(SUBSCRIPTION_PLANS)
  plan?: SubscriptionPlan;

  /**
   * The relationship's state. Moving a tenant out of TRIALING/ACTIVE into
   * SUSPENDED or CANCELLED blocks their access (and needs a reason); moving
   * them back needs one too, for the same reason `activate` does.
   */
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  /** When the free window ends. `null` clears it. */
  @IsOptional()
  @IsISO8601()
  trialEndsAt?: string | null;

  /** When the current paid period next renews. `null` clears it. */
  @IsOptional()
  @IsISO8601()
  renewsAt?: string | null;

  /** Why the subscription is in its current state. `null` clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  statusReason?: string | null;

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
}
