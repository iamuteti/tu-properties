import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { PublicGuard } from './security/guards/public.guard';
import { RolesGuard } from './security/guards/roles.guard';
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
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SecurityModule,
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
      // Only active on routes decorated with @RateLimit() — auth endpoints.
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    AppService,
  ],
})
export class AppModule {}
