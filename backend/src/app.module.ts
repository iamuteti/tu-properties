import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { PublicGuard } from './common/guards/public.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { UsersModule } from './modules/users/users.module';
import { UnitsModule } from './modules/units/units.module';
import { LeasesModule } from './modules/leases/leases.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { FinanceModule } from './modules/finance/finance.module';
import { LandlordsModule } from './modules/landlords/landlords.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    PropertiesModule,
    UsersModule,
    UnitsModule,
    TenantsModule,
    LeasesModule,
    FinanceModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    LandlordsModule,
  ],
  controllers: [AppController],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: PublicGuard,
    },
    AppService
  ],
})
export class AppModule { }
