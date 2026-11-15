import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PRICED_CURRENCIES } from '@/common/pricing-currencies';

/**
 * Public trial signup (Module 19) — what the marketing site's form may hand in.
 *
 * Deliberately narrower than `OnboardOrganizationDto`: a stranger on the internet
 * chooses no `subdomain`, no `trialDays`, and — critically — no `slug`.
 * The slug is derived server-side from the name (see `TrialSignupService`), because a
 * client-chosen slug is a squatting vector and a client-retried 409 loop is a
 * shape the API should not need.
 *
 * `planId` references a row in `subscription_plans` (the catalog). When provided,
 * the organization starts on that plan; otherwise it defaults to `STARTER`.
 */
export class TrialSignupDto {
  /** Public name shown in the dashboard and on printouts. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** The company administrator's login, created with the same transaction. */
  @IsEmail()
  adminEmail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  adminFirstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  adminLastName!: string;

  /** Initial password. Length enforced so a shipped account is never trivially weak. */
  @IsString()
  @MinLength(10)
  @MaxLength(120)
  adminPassword!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  /** The id of the plan the visitor picked on the pricing page. */
  @IsOptional()
  @IsString()
  planId?: string;

  /**
   * Billing currency the visitor picked on the pricing page: KES or USD.
   *
   * Optional because the pricing page is not the only way in, and the column
   * defaults to KES. Rejecting anything else here is what keeps a trial
   * organization from being created in a currency no plan row prices — this is
   * a pricing constraint, not a limit on the countries the platform supports.
   */
  @IsOptional()
  @IsString()
  @IsIn(PRICED_CURRENCIES as unknown as string[])
  currency?: string;
}
