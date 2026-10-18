import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PlatformOrganizationsController } from './platform-organizations.controller';
import { PlatformSignupController } from './platform-signup.controller';
import { PlatformContactController } from './platform-contact.controller';
import { PlatformImpersonationController } from './platform-impersonation.controller';
import { PlatformSupportController } from './platform-support.controller';
import { SupportTicketsController } from './support-tickets.controller';
import { PlatformService } from './platform.service';
import { TrialSignupService } from './trial-signup.service';
import { ContactService } from './contact.service';
import { SupportTicketsService } from './support-tickets.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

/**
 * SaaS administration (Module 19) — the platform owner's surface, kept separate from
 * the tenant modules by both its route prefix (`/platform/...`) and its guard.
 *
 * Shares no controller with a tenant module, which is the structural part of the
 * master doc's §2 rule: there is no tenant filter to accidentally forget here,
 * because the whole surface is, by definition, where the filter is deliberately
 * absent — and `SUPER_ADMIN` on the class-level `@Roles` is the only way in.
 *
 * `JwtModule` is imported (not taken from `AuthModule`, which does not export
 * it) for one purpose: minting impersonation bearer tokens in `PlatformService`.
 */
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'superSecretKey',
        signOptions: { expiresIn: '60m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    PlatformOrganizationsController,
    PlatformSignupController,
    PlatformContactController,
    PlatformImpersonationController,
    PlatformSupportController,
    SupportTicketsController,
  ],
  providers: [
    PlatformService,
    TrialSignupService,
    ContactService,
    SupportTicketsService,
  ],
  exports: [PlatformService, SupportTicketsService],
})
export class PlatformModule {}
