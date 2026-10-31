import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { EmailVerificationService } from './email-verification.service';

/**
 * Email verification for public trial signup.
 *
 * `GET  /auth/verify-email?token=` — the link inside the verification email.
 * Verifies the token and returns a JSON success response. The frontend page
 * at /auth/verify-email calls this and then redirects the browser to login.
 *
 * `POST /auth/resend-verification` — re-sends the confirmation link to an
 * unverified address (rate-limited, no enumeration).
 */
@Controller('auth')
export class EmailVerificationController {
  constructor(private readonly verify: EmailVerificationService) {}

  @Get('verify-email')
  @Public()
  async verifyEmail(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Verification token is required');
    }
    await this.verify.verifyToken(token);
    return { message: 'Email verified successfully' };
  }

  @Post('resend-verification')
  @Public()
  @RateLimit({
    limit: 5,
    ttl: 60 * 60 * 1000,
    message: 'Too many verification resend requests. Try again in an hour.',
  })
  async resendVerification(@Body() body: { email: string }) {
    return this.verify.resendVerification(body.email);
  }
}
