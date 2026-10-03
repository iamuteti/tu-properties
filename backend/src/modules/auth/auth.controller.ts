import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PublicGuard } from '@/common/guards/public.guard';
import { Public } from '@/common/decorators/public.decorator';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { Response } from 'express';

/**
 * Auth endpoints.
 *
 * Rate limits (per client IP, in-memory):
 * - login / register / forgot-password / reset-password are the brute-force
 *   and enumeration surface, so they get tight windows.
 */
@Controller('auth')
@UseGuards(PublicGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @RateLimit({
    limit: 10,
    ttl: 5 * 60 * 1000,
    message: 'Too many login attempts. Try again in a few minutes.',
  })
  async login(@Body() req, @Request() request) {
    const validUser = await this.authService.validateUser(
      req.email,
      req.password,
    );
    if (!validUser) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(validUser, request.res as Response, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Post('register')
  @Public()
  @RateLimit({
    limit: 5,
    ttl: 60 * 60 * 1000,
    message: 'Too many registrations from this address.',
  })
  async register(@Body() userData: Prisma.UserCreateInput, @Request() request) {
    return this.authService.register(userData, request.res as Response);
  }

  @Post('forgot-password')
  @Public()
  @RateLimit({
    limit: 5,
    ttl: 15 * 60 * 1000,
    message: 'Too many password reset requests. Try again later.',
  })
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  @Public()
  @RateLimit({
    limit: 5,
    ttl: 15 * 60 * 1000,
    message: 'Too many password reset attempts. Try again later.',
  })
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Request() request) {
    // Revoke the session row so the cookie stops working immediately,
    // then clear it from the browser.
    return this.authService.logout(request.user?.jti, request.res as Response);
  }

  // ---------------------------------------------------------------------------
  // Sessions (revocation)
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Get('login-history')
  loginHistory(@Request() req) {
    // Self-scoped: any authenticated user may see their own login/security
    // history. Org-wide history remains on /audit (ADMIN+).
    return this.authService.getLoginHistory(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  listSessions(@Request() req) {
    return this.authService.listSessions(req.user.userId, req.user.jti);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/revoke-others')
  revokeOthers(@Request() req) {
    return this.authService.revokeOtherSessions(req.user.userId, req.user.jti);
  }

  // ---------------------------------------------------------------------------
  // TOTP multi-factor auth
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  mfaSetup(@Request() req) {
    return this.authService.mfaSetup(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/enable')
  mfaEnable(@Request() req, @Body() body: { secret: string; code: string }) {
    return this.authService.mfaEnable(req.user.userId, body.secret, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  mfaDisable(@Request() req, @Body() body: { code: string }) {
    return this.authService.mfaDisable(req.user.userId, body.code);
  }

  @Post('mfa/verify')
  @Public()
  @RateLimit({
    limit: 10,
    ttl: 5 * 60 * 1000,
    message: 'Too many MFA attempts. Try again in a few minutes.',
  })
  mfaVerify(
    @Body() body: { mfaToken: string; code: string },
    @Request() request,
  ) {
    if (!body.mfaToken || !body.code) {
      throw new UnauthorizedException(
        'MFA challenge token and code are required',
      );
    }
    return this.authService.verifyMfa(
      body.mfaToken,
      body.code,
      request.res as Response,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
    );
  }
}
