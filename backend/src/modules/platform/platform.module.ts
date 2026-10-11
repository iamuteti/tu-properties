import { Module } from '@nestjs/common';
import { PlatformOrganizationsController } from './platform-organizations.controller';
import { PlatformSignupController } from './platform-signup.controller';
import { PlatformContactController } from './platform-contact.controller';
import { PlatformService } from './platform.service';
import { TrialSignupService } from './trial-signup.service';
import { ContactService } from './contact.service';
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
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    PlatformOrganizationsController,
    PlatformSignupController,
    PlatformContactController,
  ],
  providers: [
    PlatformService,
    TrialSignupService,
    ContactService,
  ],
  exports: [PlatformService],
})
export class PlatformModule {}
