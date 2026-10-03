import { Global, Module } from '@nestjs/common';
import { PermissionsService } from '@/security/permissions.service';

/**
 * Global module exposing the structured-RBAC resolver. Global so every
 * controller/service can check permissions without importing it, and so the
 * global PermissionsGuard (registered in AppModule) can resolve it without
 * any module cycle (SecurityModule already imports AuditModule, which
 * imports UsersModule).
 */
@Global()
@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
