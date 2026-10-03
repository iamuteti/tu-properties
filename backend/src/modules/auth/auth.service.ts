import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '@/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { TOTP, Secret } from 'otpauth';

const COOKIE_NAME = 'auth_token';
const RESET_EXPIRES_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour, matches JWT expiry
const MFA_CHALLENGE_TTL_SEC = 5 * 60; // 5 minutes to complete MFA verify

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditService: AuditService,
    private prisma: PrismaService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (
      user &&
      user.isActive &&
      (await bcrypt.compare(pass, user.passwordHash))
    ) {
      const { passwordHash, mfaSecret, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * Entry point for the login route.
   * - MFA disabled: issues the session cookie immediately.
   * - MFA enabled: returns a short-lived challenge token so the client can
   *   call /auth/mfa/verify with a TOTP code. No session cookie is set
   *   until the code is verified.
   */
  async login(
    user: any,
    res: Response,
    meta?: { ip?: string; userAgent?: string },
  ) {
    if (user.mfaEnabled) {
      const mfaToken = this.jwtService.sign(
        { sub: user.id, email: user.email, mfa: 'verify' },
        { expiresIn: MFA_CHALLENGE_TTL_SEC },
      );
      return { user: this.sanitizeUser(user), mfaRequired: true, mfaToken };
    }
    return {
      user: this.sanitizeUser(user),
      ...(await this.issueSession(user, res, meta)),
    };
  }

  /**
   * Issue a JWT + httpOnly cookie and persist the server-side session row
   * that backs it. The `jti` claim ties the token to exactly one session,
   * so revoking the session row invalidates the token.
   */
  private async issueSession(
    user: any,
    res: Response,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const jti = crypto.randomUUID();
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      organizationId: user.organizationId,
      // Tenant portal identity (Module 5, auth work here in Module 1): present
      // only for a self-service login, and the *only* thing /portal endpoints
      // scope by. Staff sessions carry no `portalTenantId`.
      portalTenantId: user.portalTenantId ?? null,
      jti,
    };
    const token = this.jwtService.sign(payload);

    await this.prisma.session.create({
      data: {
        jti,
        userId: user.id,
        organizationId: user.organizationId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    this.setAuthCookie(res, token);

    // Best-effort audit log. Never let a failed audit write break login.
    try {
      await this.auditService.logAction({
        user: { connect: { id: user.id } },
        ...(user.organizationId
          ? { organization: { connect: { id: user.organizationId } } }
          : {}),
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        details: 'User logged in',
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      });
    } catch (err) {
      this.logger.warn('Failed to write login audit log', err as Error);
    }

    return { sessionId: jti };
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
    const { passwordHash, mfaSecret, ...result } = user;
    return result;
  }

  /**
   * The caller's own recent security events (login history UI). Always
   * self-scoped — no admin involvement, so it's safe for any role.
   */
  async getLoginHistory(userId: string, limit = 20) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        userId,
        action: {
          in: [
            'LOGIN',
            'MFA_ENABLED',
            'MFA_DISABLED',
            'SESSIONS_REVOKED',
            'PASSWORD_RESET',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return rows.map((row) => ({
      action: row.action,
      details: row.details,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      at: row.createdAt,
    }));
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

  /**
   * Logout: revoke the current session server-side so the cookie stops
   * working immediately (not just when the JWT expires), then clear it.
   */
  async logout(jti: string | undefined, res: Response) {
    if (jti) {
      await this.prisma.session
        .updateMany({
          where: { jti, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch((err) =>
          this.logger.warn('Failed to revoke session on logout', err as Error),
        );
    }
    this.clearAuthCookie(res);
    return { message: 'Logged out' };
  }

  // ---------------------------------------------------------------------------
  // Session management (revocation)
  // ---------------------------------------------------------------------------

  /** Active sessions for the current user (most recent first). */
  async listSessions(userId: string, currentJti?: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      isCurrent: s.jti === currentJti,
    }));
  }

  /** Revoke every active session except the current one. */
  async revokeOtherSessions(userId: string, currentJti: string) {
    const result = await this.prisma.session.updateMany({
      where: { userId, jti: { not: currentJti }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    try {
      await this.auditService.logAction({
        user: { connect: { id: userId } },
        action: 'SESSIONS_REVOKED',
        entity: 'Session',
        entityId: userId,
        details: `User revoked ${result.count} other active session(s)`,
      });
    } catch (err) {
      this.logger.warn(
        'Failed to write sessions-revoked audit log',
        err as Error,
      );
    }
    return { revoked: result.count };
  }

  /**
   * Kill every active session for a user — used after a password reset so
   * any cookie still held by the account holder's other devices stops
   * working immediately.
   */
  async revokeAllSessionsForUser(userId: string) {
    await this.prisma.session
      .updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch((err) =>
        this.logger.warn(
          'Failed to revoke sessions after password reset',
          err as Error,
        ),
      );
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
  // TOTP multi-factor auth
  // ---------------------------------------------------------------------------

  /**
   * Step 1 of MFA enrollment: mint a fresh TOTP secret. The secret is shown
   * to the user once (they scan/enter it into an authenticator app) and is
   * only persisted when /auth/mfa/enable succeeds with a valid code.
   */
  async mfaSetup(userId: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled for this account');
    }

    const issuer = process.env.MFA_ISSUER || 'TU Properties';
    const totp = new TOTP({
      issuer,
      label: user.email,
      period: 30,
      digits: 6,
    });
    return {
      secret: totp.secret.base32,
      otpauthUrl: totp.toString(),
      issuer,
    };
  }

  /**
   * Step 2: confirm enrollment with a valid 6-digit code for the secret.
   * Persists the secret and flips mfaEnabled.
   */
  async mfaEnable(userId: string, secret: string, code: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (!this.verifyTotpCode(secret, code)) {
      throw new UnauthorizedException('Invalid verification code');
    }
    await this.usersService.update(userId, {
      mfaSecret: secret,
      mfaEnabled: true,
    });
    try {
      await this.auditService.logAction({
        user: { connect: { id: userId } },
        ...(user.organizationId
          ? { organization: { connect: { id: user.organizationId } } }
          : {}),
        action: 'MFA_ENABLED',
        entity: 'User',
        entityId: userId,
        details: 'User enabled TOTP multi-factor authentication',
      });
    } catch (err) {
      this.logger.warn('Failed to write MFA audit log', err as Error);
    }
    return { message: 'MFA enabled' };
  }

  /**
   * Disable MFA. Requires the current TOTP code so a stolen password alone
   * cannot strip the second factor.
   */
  async mfaDisable(userId: string, code: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled for this account');
    }
    if (!this.verifyTotpCode(user.mfaSecret, code)) {
      throw new UnauthorizedException('Invalid verification code');
    }
    await this.usersService.update(userId, {
      mfaSecret: null,
      mfaEnabled: false,
    });
    try {
      await this.auditService.logAction({
        user: { connect: { id: userId } },
        ...(user.organizationId
          ? { organization: { connect: { id: user.organizationId } } }
          : {}),
        action: 'MFA_DISABLED',
        entity: 'User',
        entityId: userId,
        details: 'User disabled TOTP multi-factor authentication',
      });
    } catch (err) {
      this.logger.warn('Failed to write MFA audit log', err as Error);
    }
    return { message: 'MFA disabled' };
  }

  /**
   * Complete an MFA-protected login: verify the challenge token + TOTP
   * code, then issue the session exactly like a normal login.
   */
  async verifyMfa(
    mfaToken: string,
    code: string,
    res: Response,
    meta?: { ip?: string; userAgent?: string },
  ) {
    let payload: any;
    try {
      payload = this.jwtService.verify(mfaToken);
    } catch {
      throw new UnauthorizedException('MFA challenge is invalid or expired');
    }
    if (payload?.mfa !== 'verify' || !payload.sub) {
      throw new UnauthorizedException('Invalid MFA challenge token');
    }

    const user = await this.usersService.findOne(payload.sub);
    if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('MFA is not enabled for this account');
    }
    if (!this.verifyTotpCode(user.mfaSecret, code)) {
      throw new UnauthorizedException('Invalid verification code');
    }

    return this.issueSession(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      res,
      meta,
    );
  }

  private verifyTotpCode(secret: string, code: string): boolean {
    const totp = new TOTP({
      secret: Secret.fromBase32(secret),
      period: 30,
      digits: 6,
    });
    // window: 1 allows the previous and next 30s tick (clock skew tolerance).
    return totp.validate({ token: code, window: 1 }) !== null;
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

    // A password reset must invalidate every live session for this account.
    await this.revokeAllSessionsForUser(user.id);

    try {
      await this.auditService.logAction({
        user: { connect: { id: user.id } },
        ...(user.organizationId
          ? { organization: { connect: { id: user.organizationId } } }
          : {}),
        action: 'PASSWORD_RESET',
        entity: 'User',
        entityId: user.id,
        details: 'User reset their password; all sessions revoked',
      });
    } catch (err) {
      this.logger.warn(
        'Failed to write password-reset audit log',
        err as Error,
      );
    }

    return { message: 'Password has been reset' };
  }

  private sanitizeUser(user: any) {
    const { passwordHash, mfaSecret, ...safe } = user;
    return safe;
  }
}
