import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditModule } from '../modules/audit/audit.module';
import { CorsAllowlistService } from './cors.service';
import { AuditInterceptor } from './audit.interceptor';

@Module({
  imports: [ConfigModule, AuditModule],
  providers: [
    CorsAllowlistService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [CorsAllowlistService],
})
export class SecurityModule {}