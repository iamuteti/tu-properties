import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import nodemailer from 'nodemailer';

const VERIFY_EXPIRES_MS_DEFAULT = 24 * 60 * 60 * 1000; // 24 hours

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/**
 * Module 19 — email verification for public trial signup.
 *
 * A fresh account is created with `emailVerified = false`. This service mints a
 * single-use, time-bound token, stores its hash on the user row, and mails a
 * confirmation link. Clicking it flips `emailVerified` and clears the token;
 * until then the JWT strategy refuses to issue a session, so an unverified
 * address can never log in.
 *
 * Email goes out over *system* SMTP (`SMTP_*` env vars), not the per-org
 * notification channel: a brand-new trial organization has no SMTP configured
 * yet, and a verification email must be able to send before one exists.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private smtp(): SmtpConfig {
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 2525);
    return {
      host: this.config.get<string>('SMTP_HOST') ?? '127.0.0.1',
      port,
      secure:
        (this.config.get<string>('SMTP_SECURE') ?? String(port === 465)) ===
        'true',
      user: this.config.get<string>('SMTP_USER') ?? undefined,
      pass: this.config.get<string>('SMTP_PASS') ?? undefined,
      from:
        this.config.get<string>('SMTP_FROM') ??
        'TU Properties <noreply@example.invalid>',
    };
  }

  private transport() {
    const { host, port, secure, user, pass } = this.smtp();
    return nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass } } : {}),
    });
  }

  private verifyLink(token: string): string {
    const base =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3007';
    return `${base.replace(/\/$/, '')}/auth/verify-email?token=${token}`;
  }

  /** Mint a raw token and its SHA-256 hash, plus an expiry. */
  private mintToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(
      Date.now() +
        Number(
          this.config.get<string>('EMAIL_VERIFICATION_EXPIRES_MS') ??
            String(VERIFY_EXPIRES_MS_DEFAULT),
        ),
    );
    return { token, tokenHash, expiresAt };
  }

  /** HTML body for the verification email. */
  private verificationHtml(email: string, url: string): string {
    return `
<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2933; margin: 0; padding: 0; background-color: #f3f4f6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <tr>
        <td align="center" style="background-color: #f59e0b; padding: 32px 24px;">
          <h1 style="margin: 0; font-size: 20px; color: #ffffff; font-weight: 700; letter-spacing: -0.02em;">TU Properties</h1>
        </td>
      </tr>
      <tr>
        <td style="padding: 32px 24px;">
          <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #111827; font-weight: 600;">Verify your email address</h2>
          <p style="margin: 0 0 24px 0; color: #4b5563;">
            You signed up <strong>${email}</strong> for a 14-day free trial. Before you can sign in, please confirm this address by clicking the button below.
          </p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td align="center">
                <a href="${url}" style="display: inline-block; background-color: #f59e0b; color: #ffffff; text-decoration: none; border-radius: 8px; padding: 14px 28px; font-size: 15px; font-weight: 600;">Verify email address</a>
              </td>
            </tr>
          </table>
          <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 13px;">
            This link expires in 24 hours. If you did not sign up, you can safely ignore this email.
          </p>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 20px 24px; color: #9ca3af; font-size: 11px; border-top: 1px solid #e5e7eb;">
          TU Properties &middot; This is an automated message, please do not reply.
        </td>
      </tr>
    </table>
  </body>
</html>
`;
  }

  /** Plain-text body for the verification email. */
  private verificationText(email: string, url: string): string {
    return `Verify your email address

You signed up ${email} for a 14-day free trial. Before you can sign in, please confirm this address:

${url}

This link expires in 24 hours. If you did not sign up, you can safely ignore this email.

TU Properties
`;
  }

  /**
   * Generate a verification token for `user`, persist its hash + expiry, and
   * send the confirmation email. Returns the raw token only in non-production
   * environments (so the flow can be exercised end-to-end without an SMTP
   * server); in production the token travels only by email.
   */
  async initiateVerification(
    userId: string,
    email: string,
  ): Promise<{ token?: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.emailVerified) {
      return {};
    }

    const { token, tokenHash, expiresAt } = this.mintToken();

    await this.prisma.user.update({
      where: { id: userId },
      data: { verifyEmailToken: tokenHash, verifyEmailExpires: expiresAt },
    });

    const url = this.verifyLink(token);
    const smtp = this.smtp();
    try {
      await this.transport().sendMail({
        from: smtp.from,
        to: email,
        subject: 'Verify your email address — TU Properties',
        text: this.verificationText(email, url),
        html: this.verificationHtml(email, url),
      });
    } catch (err) {
      // A transient mail failure must not strand the account: the token is
      // already stored, so resend can retry. Log and continue.
      this.logger.warn(
        `Verification email to ${email} could not be sent: ${(err as Error).message}`,
      );
    }

    const result: { token?: string } = {};
    if (process.env.NODE_ENV !== 'production') {
      result.token = token;
    }
    return result;
  }

  /**
   * Confirm a verification token. Sets `emailVerified = true` and clears the
   * token so it can only be used once.
   */
  async verifyToken(token: string): Promise<{ userId: string; email: string }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findFirst({
      where: { verifyEmailToken: tokenHash },
    });
    if (!user) {
      throw new UnauthorizedException(
        'Verification token is invalid or already used',
      );
    }
    if (!user.verifyEmailExpires || user.verifyEmailExpires < new Date()) {
      throw new UnauthorizedException('Verification token has expired');
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verifyEmailToken: null,
        verifyEmailExpires: null,
      },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          user: { connect: { id: user.id } },
          ...(user.organizationId
            ? { organization: { connect: { id: user.organizationId } } }
            : {}),
          action: 'EMAIL_VERIFIED',
          entity: 'User',
          entityId: user.id,
          details: 'User verified their email address',
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to write email-verified audit log for ${user.id}: ${(err as Error).message}`,
      );
    }

    return { userId: user.id, email: user.email };
  }

  /**
   * Re-send the verification email to an unverified address. Safe to call
   * repeatedly; returns success even if the address has no account (to avoid
   * enumerating registered emails).
   */
  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) {
      return {
        message:
          'If that address has an unverified account, a new confirmation link has been sent.',
      };
    }
    await this.initiateVerification(user.id, email);
    return {
      message:
        'If that address has an unverified account, a new confirmation link has been sent.',
    };
  }
}
