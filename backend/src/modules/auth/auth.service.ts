import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

const COOKIE_NAME = 'auth_token';
const RESET_EXPIRES_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (user && (await bcrypt.compare(pass, user.passwordHash))) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * Issue a JWT and store it in an httpOnly, SameSite=strict cookie.
   * The token is never returned in the response body, so it is not readable
   * by client-side JavaScript (closes the XSS token-theft vector).
   */
  async login(user: any, res: Response) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      organizationId: user.organizationId,
    };
    const token = this.jwtService.sign(payload);

    this.setAuthCookie(res, token);

    // Best-effort audit log. Never let a failed audit write break login.
    try {
      await this.auditService.logAction({
        user: { connect: { id: user.id } },
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        details: 'User logged in',
      });
    } catch (err) {
      this.logger.warn('Failed to write login audit log', err as Error);
    }

    return { user };
  }

  async register(data: Prisma.UserCreateInput, res: Response) {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(data.passwordHash, salt);

    const newUser = await this.usersService.create({
      ...data,
      passwordHash: hashedPassword,
    });

    return this.login(newUser, res);
  }

  /** Fetch the full user (incl. organization) for the current session. */
  async getProfile(userId: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const { passwordHash, ...result } = user;
    return result;
  }

  /** Clear the auth cookie (used on logout). */
  clearAuthCookie(res: Response) {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }

  logout(res: Response) {
    this.clearAuthCookie(res);
    return { message: 'Logged out' };
  }

  private setAuthCookie(res: Response, token: string) {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 1000, // 1 hour, matching JWT expiry
    });
  }

  // ---------------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------------

  async forgotPassword(email: string) {
    const user = await this.usersService.findOneByEmail(email);
    // Always return success to avoid user enumeration.
    if (!user) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_EXPIRES_MS);

    await this.usersService.update(user.id, {
      resetPasswordToken: tokenHash,
      resetPasswordExpires: expiresAt,
    } as any);

    // In a real product this would email the token. For now we return it in
    // the response so the flow can be exercised end-to-end in development.
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log('Password reset token issued for ' + user.email);
    }
    return {
      message: 'If that email exists, a reset link has been sent.',
      ...(process.env.NODE_ENV !== 'production' && { resetToken: token }),
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.usersService.findOneByResetToken(tokenHash);
    if (!user) {
      throw new UnauthorizedException('Reset token is invalid or expired');
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new UnauthorizedException('Reset token is invalid or expired');
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await this.usersService.update(user.id, {
      passwordHash: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    } as any);

    return { message: 'Password has been reset' };
  }
}
