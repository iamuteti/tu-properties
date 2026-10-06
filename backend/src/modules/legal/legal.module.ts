import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

/**
 * Module 15 - Documents & Legal.
 *
 * **One import, and that it is only `AuditModule` is the design.**
 *
 * The Document Center already exists (`src/modules/documents/`, with local and S3
 * storage behind one interface) and is left alone. This module reads the `Document`
 * table to resolve a contract's authoritative scan and its attachments, and imports
 * nothing to do it - `documents` holds no state that contracts need to reach through a
 * service call, only rows.
 *
 * That restraint is deliberate. The schema has already committed the opposite mistake
 * twice: `landlordId`/`tenantId` standing in for a real owner relationship, and
 * `Supplier` being invented alongside `Contact`. A second file store beside the
 * Document Center would be the same error wearing different clothes, and the first
 * symptom would be an organization whose contracts and whose documents disagree about
 * which file is the signed one.
 *
 * What the module *does* import is `AuditModule`, because filing and deleting a
 * contract are actions whose trail should be asserted rather than assumed - deleting a
 * row from a legal register is not something a permission check alone explains six
 * months later.
 *
 * **Nothing is exported.** No other module needs to read a contract. The one thing
 * that might look like it wants a seam - the reminder sweep needing to know what is
 * expiring - is deliberately *not* one: it lives in `NotificationsModule` and reads the
 * table through its own query, because a notification that fails because a legal module
 * failed to load is a notification nobody gets.
 *
 * The rules live in one pure file, `contract-expiry.ts`, with no database and no Nest
 * in it: derived status, notice deadlines, warning bands, renewal-chain walking and the
 * human sentences for a malformed contract. The **database** carries the guarantee that
 * a contract points at exactly one counterparty - or none, for a `COMPLIANCE`
 * certificate - and that the type matches it. See the migration.
 */
@Module({
  imports: [AuditModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class LegalModule {}
