import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { TrialSignupDto } from './dto/trial-signup.dto';
import {
  TrialSignupService,
  type TrialSignupResult,
} from './trial-signup.service';

/**
 * Public trial signup (Module 19) — deliberately NOT on `PlatformOrganizationsController`.
 *
 * That controller carries class-level `@Roles(SUPER_ADMIN)`, and a public route
 * cannot live under it: one edit to the class decorator would either lock out the
 * marketing site or open the whole platform surface. The split is structural —
 * this controller holds the single unauthenticated write, heavily rate-limited
 * (an org per submit is cheap to create and expensive to abuse), and everything
 * else stays behind the Super Admin guard with no `@Public()` on it.
 */
@Controller('platform/signup')
export class PlatformSignupController {
  constructor(private readonly trialSignup: TrialSignupService) {}

  /**
   * Start a 14-day STARTER trial: org + first admin + TRIALING subscription.
   *
   * Returns the slug and trial end so the site can point at the login page with
   * "sign in with the email you just used" — never the password, which the
   * server hashed and forgot. 5 submits per IP per hour: a human retries a
   * typo'd email within that, a script farming orgs does not.
   */
  @Post()
  @Public()
  @RateLimit({
    limit: 5,
    ttl: 60 * 60 * 1000,
    message: 'Too many trial signups from this address. Try again in an hour.',
  })
  @HttpCode(201)
  signup(@Body() dto: TrialSignupDto): Promise<TrialSignupResult> {
    return this.trialSignup.signup(dto);
  }
}
