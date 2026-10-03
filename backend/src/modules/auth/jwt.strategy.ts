import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '@/prisma/prisma.service';

const AUTH_COOKIE_NAME = 'auth_token';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly secretKey: string;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET') || 'superSecretKey';
    super({
      // JWT now lives in an httpOnly cookie, so extract it from there rather
      // than from the Authorization header.
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => request?.cookies?.[AUTH_COOKIE_NAME],
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
    this.secretKey = secret;
  }

  async validate(payload: any) {
    if (!payload.sub) {
      this.logger.error('Invalid token payload: missing sub');
      throw new UnauthorizedException('Invalid token payload');
    }

    try {
      const user = await this.usersService.findOne(payload.sub);
      if (!user || !user.isActive) {
        this.logger.error(
          'User not found (or inactive) for id: ' + payload.sub,
        );
        throw new UnauthorizedException();
      }

      // Session check: every issued token carries a jti that maps to a
      // server-side session row. A token whose session has been revoked
      // (logout / revoke-others / password reset) or expired is rejected
      // here — this is what makes session revocation real.
      // Tokens issued before the Session table existed have no jti and are
      // rejected too (fail closed → re-login required after a deploy).
      const jti = payload.jti as string | undefined;
      if (!jti) {
        throw new UnauthorizedException(
          'Session missing — please log in again',
        );
      }
      const session = await this.prisma.session.findUnique({
        where: { jti },
        select: { revokedAt: true, expiresAt: true },
      });
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new UnauthorizedException(
          'Session has been revoked or expired — please log in again',
        );
      }

      return {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId || user.organizationId,
        // Read from the *user row*, not the token: if a user is unlinked from a
        // tenant (or their portal access is revoked) the change takes effect on
        // their next request instead of persisting until the token expires.
        portalTenantId: user.portalTenantId ?? null,
        isTenantPortal: Boolean(user.portalTenantId),
        jti,
      };
    } catch (error: any) {
      this.logger.error(
        'Error validating user: ' + (error?.message || 'Unknown error'),
      );
      throw new UnauthorizedException('User validation failed');
    }
  }
}
