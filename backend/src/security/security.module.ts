import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { CorsAllowlistService } from './cors.service';
import { AuditInterceptor } from './audit.interceptor';

@Module({
  imports: [ConfigModule],
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