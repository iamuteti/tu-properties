import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PlatformService, type OnboardConflictCause } from './platform.service';
import { TrialSignupDto } from './dto/trial-signup.dto';

export interface TrialSignupResult {
  organizationId: string;
  name: string;
  slug: string;
  adminEmail: string;
  plan: string;
  trialEndsAt: Date | null;
}

/**
 * Public trial signup (Module 19) — the one unauthenticated write in the platform
 * surface, and therefore kept in its own service rather than as a branch of the
 * SUPER_ADMIN-only `PlatformService.onboard`.
 *
 * Two decisions live here. First, the slug is derived from the organization name,
 * not chosen: a caller-supplied slug is taken verbatim by `onboard()` (whose other
 * caller is a Super Admin choosing deliberately), while a public form handing out
 * slugs is how `acme` gets squatted before Acme Ltd arrives. Second, a slug clash
 * retries with a random suffix instead of asking the visitor to invent another
 * name — but an *email* clash is rethrown untouched, because that address already
 * owns an account and saying "pick another slug" would be the wrong answer.
 */
@Injectable()
export class TrialSignupService {
  constructor(private readonly platformService: PlatformService) {}

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
        return {
          organizationId: org.id,
          name: org.name,
          slug: org.slug,
          adminEmail: dto.adminEmail,
          plan: org.plan,
          trialEndsAt: org.subscription?.trialEndsAt ?? null,
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
