import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { PublicGuard } from './security/guards/public.guard';
import { RolesGuard } from './security/guards/roles.guard';
import { PermissionsGuard } from './security/guards/permissions.guard';
import { RateLimitGuard } from './security/guards/rate-limit.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { UsersModule } from './modules/users/users.module';
import { UnitsModule } from './modules/units/units.module';
import { RentalAgreementsModule } from './modules/leases/rental-agreements.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { MoveoutsModule } from './modules/moveouts/moveouts.module';
import { FinanceModule } from './modules/finance/finance.module';
import { LandlordsModule } from './modules/landlords/landlords.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BranchesModule } from './modules/branches/branches.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { CrmLeadsModule } from './modules/crm/leads/leads.module';
import { CrmContactsModule } from './modules/crm/contacts/contacts.module';
import { SalesModule } from './modules/sales/sales.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { PortalModule } from './modules/portal/portal.module';
import { TenantRequestsModule } from './modules/tenant-requests/tenant-requests.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SecurityModule,
    PermissionsModule,
    PropertiesModule,
    UsersModule,
    UnitsModule,
    TenantsModule,
    MoveoutsModule,
    RentalAgreementsModule,
    FinanceModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    DashboardModule,
    BranchesModule,
    DocumentsModule,
    CrmLeadsModule,
    CrmContactsModule,
    SalesModule,
    InspectionsModule,
    PortalModule,
    TenantRequestsModule,
  ],
  controllers: [AppController],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: PublicGuard,
    },
    {
      // Runs after PublicGuard (authentication) — order of APP_GUARD
      // providers matters; keep auth first.
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      // Structured (JSON) role permissions; only active on routes with
      // @Permissions(). Runs after RolesGuard (name-based fallback).
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      // Only active on routes decorated with @RateLimit() — auth endpoints.
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    AppService,
  ],
})
export class AppModule {}
