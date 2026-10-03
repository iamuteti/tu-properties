import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '@/prisma/prisma.service';
import { TOTP, Secret } from 'otpauth';

/**
 * Auth flow tests — the pattern to follow for future modules:
 * real NestJS testing module, service under test is the real thing,
 * every collaborator is a hand-rolled mock (no DB, no network).
 *
 * Covers: session issuance/revocation, MFA enrollment + login challenge,
 * and the password-reset-kills-sessions rule.
 */
describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    session: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let usersService: {
    findOne: jest.Mock;
    findOneByEmail: jest.Mock;
    findOneByResetToken: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let auditService: { logAction: jest.Mock };

  const mfaUser: any = {
    id: 'user-1',
    email: 'admin@rohi.co.ke',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
    organizationId: 'org-1',
    passwordHash: 'hash',
    mfaSecret: 'ABCDEFGHIJKLMNOPQRSTUVWX',
    mfaEnabled: true,
    isActive: true,
  };

  const plainUser: any = { ...mfaUser, mfaSecret: null, mfaEnabled: false };

  const mockRes = () => ({
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  });

  beforeEach(async () => {
    usersService = {
      findOne: jest.fn(),
      findOneByEmail: jest.fn(),
      findOneByResetToken: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('signed-jwt'),
      verify: jest.fn(),
    };
    auditService = { logAction: jest.fn().mockResolvedValue({}) };
    prisma = {
      session: {
        create: jest.fn().mockResolvedValue({ id: 'sess-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: AuditService, useValue: auditService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('login (MFA disabled)', () => {
    it('issues a session row, sets the cookie, and sanitizes the user', async () => {
      const res = mockRes();
      const result = await service.login(plainUser, res as any);

      // Cookie set with the signed JWT
      expect(res.cookie).toHaveBeenCalledWith(
        'auth_token',
        'signed-jwt',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );

      // JWT payload carries sub + jti (session linkage)
      const signCall = jwtService.sign.mock.calls[0][0];
      expect(signCall.sub).toBe('user-1');
      expect(signCall.role).toBe('ADMIN');
      expect(typeof signCall.jti).toBe('string');

      // Session row persisted against the same jti
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      const sessionData = prisma.session.create.mock.calls[0][0].data;
      expect(sessionData.jti).toBe(signCall.jti);
      expect(sessionData.userId).toBe('user-1');
      expect(sessionData.organizationId).toBe('org-1');
      expect(sessionData.expiresAt.getTime() - Date.now()).toBeGreaterThan(0);

      // Response user is sanitized
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('mfaSecret');
      expect(result.mfaRequired).toBeUndefined();
      expect((result as { sessionId?: string }).sessionId).toBe(signCall.jti);

      // Login is audited with the tenant scope
      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN',
          entity: 'User',
          organization: { connect: { id: 'org-1' } },
        }),
      );
    });
  });

  describe('login (MFA enabled)', () => {
    it('returns a 5-minute challenge token and no session', async () => {
      const res = mockRes();
      const result = await service.login(mfaUser, res as any);

      expect(result.mfaRequired).toBe(true);
      expect(typeof result.mfaToken).toBe('string');
      expect(res.cookie).not.toHaveBeenCalled();
      expect(prisma.session.create).not.toHaveBeenCalled();

      const [payload, options] = jwtService.sign.mock.calls[0];
      expect(payload).toEqual({
        sub: 'user-1',
        email: 'admin@rohi.co.ke',
        mfa: 'verify',
      });
      expect(options).toEqual({ expiresIn: 300 });
    });
  });

  describe('verifyMfa', () => {
    const secret = 'ABCDEFGHIJKLMNOPQRSTUVWX';

    function freshCode(secretValue: string): string {
      return new TOTP({
        secret: Secret.fromBase32(secretValue),
        period: 30,
        digits: 6,
      }).generate();
    }

    it('accepts a valid TOTP code and issues the session', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', mfa: 'verify' });
      usersService.findOne.mockResolvedValue({ ...mfaUser, mfaSecret: secret });
      const res = mockRes();

      const result = await service.verifyMfa(
        'challenge-token',
        freshCode(secret),
        res as any,
      );

      expect(result.sessionId).toEqual(expect.any(String));
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      expect(res.cookie).toHaveBeenCalled();
    });

    it('rejects a wrong TOTP code with 401', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', mfa: 'verify' });
      usersService.findOne.mockResolvedValue({ ...mfaUser, mfaSecret: secret });

      await expect(
        service.verifyMfa('challenge-token', '000000', mockRes() as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('rejects an expired/invalid challenge token with 401', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        service.verifyMfa('garbage', '123456', mockRes() as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the account no longer has MFA enabled', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', mfa: 'verify' });
      usersService.findOne.mockResolvedValue({
        ...mfaUser,
        mfaEnabled: false,
        mfaSecret: null,
      });

      await expect(
        service.verifyMfa('challenge-token', '123456', mockRes() as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('MFA enrollment', () => {
    it('mfaSetup returns a secret + otpauth URL and rejects if already enabled', async () => {
      usersService.findOne.mockResolvedValue(plainUser);
      const setup = await service.mfaSetup('user-1');
      expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
      expect(setup.otpauthUrl).toContain('otpauth://totp/');
      expect(setup.otpauthUrl).toContain(setup.secret);

      usersService.findOne.mockResolvedValue(mfaUser);
      await expect(service.mfaSetup('user-1')).rejects.toThrow(
        'already enabled',
      );
    });

    it('mfaEnable persists the secret only after a valid code', async () => {
      usersService.findOne.mockResolvedValue(plainUser);
      const setup = await service.mfaSetup('user-1');
      const code = new TOTP({
        secret: Secret.fromBase32(setup.secret),
        period: 30,
        digits: 6,
      }).generate();

      await expect(
        service.mfaEnable('user-1', setup.secret, '000000'),
      ).rejects.toThrow(UnauthorizedException);
      expect(usersService.update).not.toHaveBeenCalled();

      await service.mfaEnable('user-1', setup.secret, code);
      expect(usersService.update).toHaveBeenCalledWith('user-1', {
        mfaSecret: setup.secret,
        mfaEnabled: true,
      });
    });

    it('mfaDisable requires a valid code and clears the secret', async () => {
      usersService.findOne.mockResolvedValue(mfaUser);
      const code = freshCode(mfaUser.mfaSecret);

      await expect(service.mfaDisable('user-1', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
      await service.mfaDisable('user-1', code);
      expect(usersService.update).toHaveBeenCalledWith('user-1', {
        mfaSecret: null,
        mfaEnabled: false,
      });
    });
  });

  function freshCode(secretValue: string): string {
    return new TOTP({
      secret: Secret.fromBase32(secretValue),
      period: 30,
      digits: 6,
    }).generate();
  }

  describe('session revocation', () => {
    it('logout revokes the current session and clears the cookie', async () => {
      const res = mockRes();
      await service.logout('jti-123', res as any);

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { jti: 'jti-123', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(res.clearCookie).toHaveBeenCalledWith(
        'auth_token',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('revokeOtherSessions revokes everything except the current jti', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.revokeOtherSessions('user-1', 'current-jti');

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          jti: { not: 'current-jti' },
          revokedAt: null,
        },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(result.revoked).toBe(3);
      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SESSIONS_REVOKED' }),
      );
    });

    it('listSessions returns only active sessions and flags the current one', async () => {
      prisma.session.findMany.mockResolvedValue([
        {
          id: 's2',
          jti: 'j2',
          createdAt: new Date(),
          expiresAt: new Date(),
          ipAddress: '1.2.3.4',
          userAgent: 'ua',
        },
        {
          id: 's1',
          jti: 'j1',
          createdAt: new Date(),
          expiresAt: new Date(),
          ipAddress: '1.2.3.4',
          userAgent: 'ua',
        },
      ]);
      const sessions = await service.listSessions('user-1', 'j2');

      expect(prisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            revokedAt: null,
            expiresAt: { gt: expect.any(Date) },
          },
        }),
      );
      expect(sessions).toHaveLength(2);
      expect(sessions.find((s) => s.id === 's2')?.isCurrent).toBe(true);
      expect(sessions.find((s) => s.id === 's1')?.isCurrent).toBe(false);
    });
  });

  describe('password reset', () => {
    it('resetPassword updates the hash and revokes every session for the account', async () => {
      usersService.findOneByResetToken.mockResolvedValue({
        ...mfaUser,
        resetPasswordExpires: new Date(Date.now() + 60_000),
      });

      const result = await service.resetPassword(
        'token-value',
        'NewPassword123!',
      );

      expect(result.message).toBe('Password has been reset');
      expect(usersService.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          passwordHash: expect.any(String),
          resetPasswordToken: null,
          resetPasswordExpires: null,
        }),
      );
      // All sessions (no jti filter) get revoked.
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSWORD_RESET' }),
      );
    });

    it('resetPassword rejects an expired token', async () => {
      usersService.findOneByResetToken.mockResolvedValue({
        ...mfaUser,
        resetPasswordExpires: new Date(Date.now() - 60_000),
      });
      await expect(
        service.resetPassword('token-value', 'NewPassword123!'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
