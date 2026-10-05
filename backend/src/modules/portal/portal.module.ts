import { Module } from '@nestjs/common';
import { StorageModule } from '@/modules/documents/storage.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

/**
 * Tenant self-service portal.
 *
 * Imports `StorageModule` so document downloads stream through the same driver
 * as the Document Center rather than a second implementation.
 */
@Module({
  imports: [StorageModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
