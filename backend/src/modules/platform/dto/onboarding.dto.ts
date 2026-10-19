import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * SaaS administration (Module 19) - onboarding a tenant.
 *
 * Deliberately small, because the threat it defends against is a blanket
 * `Prisma.UserCreateInput`: the legacy `POST /organizations` and `POST /auth/register`
 * both accepted the raw Prisma shape, so any column — including `role`,
 * `organizationId`, `isActive` — was writable from the browser. The only things a
 * Super Admin may hand to this endpoint are listed here, and `ValidationPipe`
 * (whitelist) discards the rest.
 */
export class OnboardOrganizationDto {
  /** Public name shown in the dashboard and on printouts. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** URL-safe slug. Uniqueness is `@unique` on the column, surfaced as a 409. */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'slug must be lowercase letters, digits and hyphens only',
  })
  @MaxLength(60)
  slug!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/)
  @MaxLength(60)
  subdomain?: string;

  /** The plan this org *starts* on. Only the handful of real tiers, not free text. */
  @IsOptional()
  @IsString()
  @IsIn(['AGENCY', 'OWNER'])
  organizationType?: 'AGENCY' | 'OWNER';

  /** The plan this org *starts* on. Only the handful of real tiers, not free text. */
  @IsOptional()
  @IsIn(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
  plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

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

  /** When the free window ends; defaults to 14 days. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  trialDays?: number;

  /** Module keys this organization starts with enabled. Defaults to none ([]). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class SuspendOrganizationDto {
  /** Required so a suspension is a decision with a reason, not a bare click. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  reason!: string;
}
