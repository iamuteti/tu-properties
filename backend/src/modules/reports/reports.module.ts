import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Module 16 - Reports & Analytics.
 *
 * **No imports at all, and that is the design.** Every number here is derived from rows
 * other modules own, so this module reads and never writes. It does not import Finance
 * and call `InvoicesService`, does not import Leases and call `RentalAgreementsService`,
 * and does not import Maintenance for its work-order figures.
 *
 * The reason is that the alternative is a report whose numbers silently disagree with
 * the screens they came from. A revenue report that asked Finance for a total would get
 * Finance's *filters applied*, and a report that silently inherited somebody's
 * `status != DRAFT` would be a report whose denominator nobody chose. Aggregating in SQL
 * against the same tables the screens read is both cheaper and more honest, and it is
 * why the service uses `$queryRaw` for the month series rather than reaching for a
 * service that cannot answer "group by month".
 *
 * `AuditModule` is deliberately **not** imported, which is the opposite of most modules
 * here: a report is a read, the global interceptor already records reads that matter,
 * and nothing in this module changes state. Importing it would be cargo cult.
 *
 * **Nothing is exported.** No other module should read a report - if a caller needs an
 * aggregate, they should aggregate it themselves against the table, or the aggregate
 * belongs in the service that owns the rows.
 *
 * The rules live in `occupancy.ts`, pure and unit-tested: what "occupied" means, the
 * difference between a snapshot and a trend, and the arithmetic every figure shares.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
