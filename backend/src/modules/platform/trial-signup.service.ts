import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { PlatformService, type OnboardConflictCause } from './platform.service';
import { TrialSignupDto } from './dto/trial-signup.dto';
import { EmailVerificationService } from '@/modules/auth/email-verification.service';

export interface TrialSignupResult {
  organizationId: string;
  name: string;
  slug: string;
  adminEmail: string;
  plan: string;
  trialEndsAt: Date | null;
  /** True when the account must confirm its email before it can log in. */
  emailVerificationRequired: boolean;
}

/**
 * Public trial signup (Module 19) — the one unauthenticated write in the platform
 * surface, and therefore kept in its own service rather than as a branch of the
 * SUPER_ADMIN-only `PlatformService.onboard`.
 *
 * signup now creates the account unverified (`emailVerified = false`), mints a
 * confirmation token, mails it, and reports `emailVerificationRequired` so the
 * caller shows "check your inbox" instead of logging the visitor straight in.
 */
@Injectable()
export class TrialSignupService {
  constructor(
    private readonly platformService: PlatformService,
    private readonly prisma: PrismaService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  async signup(dto: TrialSignupDto): Promise<TrialSignupResult> {
    const base = slugify(dto.name);

    // Bounded: five attempts, then the caller sees the conflict honestly rather
    // than the server looping forever on a pathological namespace.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug =
        attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      try {
        const org = await this.platformService.onboard(
          {
            name: dto.name,
            slug,
            plan: 'STARTER',
            adminEmail: dto.adminEmail,
            adminFirstName: dto.adminFirstName,
            adminLastName: dto.adminLastName,
            adminPassword: dto.adminPassword,
            trialDays: 14,
            contactEmail: dto.contactEmail,
          },
          undefined,
        );
        // `onboard` just created this row inside its own transaction; a null here
        // would mean the read failed, not that the org is missing.
        if (!org) {
          throw new InternalServerErrorException(
            'Trial organization was created but could not be read back',
          );
        }
        // The admin user was created inside the same transaction; read it back to
        // bind the verification token to its row.
        const admin = await this.prisma.user.findUnique({
          where: { email: dto.adminEmail },
          select: { id: true, emailVerified: true },
        });
        if (!admin) {
          throw new InternalServerErrorException(
            'Trial organization was created but its admin user could not be read back',
          );
        }
        if (!admin.emailVerified) {
          await this.emailVerification.initiateVerification(
            admin.id,
            dto.adminEmail,
          );
        }

        return {
          organizationId: org.id,
          name: org.name,
          slug: org.slug,
          adminEmail: dto.adminEmail,
          plan: org.plan,
          trialEndsAt: org.subscription?.trialEndsAt ?? null,
          emailVerificationRequired: !admin.emailVerified,
        };
      } catch (err) {
        // A slug clash retries with a fresh suffix; everything else — including
        // an email that already exists — is the caller's to fix. The branch reads
        // the exception's `cause`, not its message: matching on the message is
        // what made this retry dead code in production (the message once named
        // the wrong field while the spec stayed green).
        const cause = (err as { cause?: unknown }).cause as
          | OnboardConflictCause
          | undefined;
        if (
          attempt < 4 &&
          err instanceof ConflictException &&
          cause?.conflictField === 'slug'
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException(
      'Could not derive a unique organization address, try a different name',
    );
  }
}

/**
 * URL-safe slug from a free-text organization name.
 *
 * `OnboardOrganizationDto` enforces `^[a-z0-9][a-z0-9-]*$` (max 60), so this
 * produces exactly that shape rather than letting the insert be the validator:
 * lowercase, runs of anything else folded to one hyphen, no leading/trailing
 * hyphens, and a fallback for names with no ASCII alphanumerics at all
 * (which would otherwise fail the "starts with alnum" rule).
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return /^[a-z0-9]/.test(slug) ? slug : 'org';
}
