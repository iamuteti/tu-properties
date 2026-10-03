import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  LeadsController,
  PublicLeadsController,
  CrmWebhookGuard,
} from './leads.controller';
import { LeadsService } from './leads.service';

/**
 * Module 3 — CRM. Leads and contacts share the CRM module because conversion
 * spans them and the contact detail view shows the lead history.
 */
@Module({
  imports: [ConfigModule],
  controllers: [LeadsController, PublicLeadsController],
  providers: [LeadsService, CrmWebhookGuard],
  exports: [LeadsService],
})
export class CrmLeadsModule {}
