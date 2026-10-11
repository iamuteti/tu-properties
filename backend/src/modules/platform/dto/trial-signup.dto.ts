import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Public trial signup (Module 19) — what the marketing site's form may hand in.
 *
 * Deliberately narrower than `OnboardOrganizationDto`: a stranger on the internet
 * chooses no `plan`, no `subdomain`, no `trialDays`, and — critically — no `slug`.
 * The slug is derived server-side from the name (see `TrialSignupService`), because a
 * client-chosen slug is a squatting vector and a client-retried 409 loop is a
 * shape the API should not need. `plan` is always STARTER and the trial always 14
 * days; anything else is a sales conversation, not a form field.
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
}
