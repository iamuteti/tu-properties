import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * Create a Stripe Checkout session for subscribing an organization to a paid plan.
 */
export class CreateCheckoutSessionDto {
  /** The id of the subscription plan to subscribe to. */
  @IsString()
  @IsNotEmpty()
  planId!: string;

  /** ISO-4217 currency code (e.g. "USD", "KES"). Must match a key in the plan's `prices`. */
  @IsString()
  @IsNotEmpty()
  currency!: string;

  /**
   * The organization to subscribe. A tenant admin omits this (their own org is
   * used); a SUPER_ADMIN must supply it, since they belong to no organization.
   */
  @IsOptional()
  @IsString()
  organizationId?: string;

  /** Optional: the URL Stripe should redirect to after successful payment. */
  @IsOptional()
  @IsString()
  successUrl?: string;

  /** Optional: the URL Stripe should redirect to if the customer cancels. */
  @IsOptional()
  @IsString()
  cancelUrl?: string;
}
