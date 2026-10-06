import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { REPORTS_VIEW_ROLES } from './reports-roles';
import { ReportsService } from './reports.service';

/**
 * Module 16 - reports.
 *
 * One controller and one permission, on purpose - see `reports-roles.ts` for why the
 * categories are not split into separate permission modules.
 *
 * **Every literal route is declared before `/landlords/:id`**, and the CSV routes come
 * before both. That ordering is not tidiness: `/reports/occupancy/export` is two
 * segments and would match nothing that comes after it, but `/reports/financial/export`
 * would be matched by a `:id` route declared first, so the export would come back as a
 * landlord id. It is the Module 13 shadowing bug in a new place, and the reason
 * `routing.spec.ts` exists.
 *
 * No POST, no PATCH, no DELETE. A report is a function of rows that already exist, and
 * an endpoint that could write one would be a place to put a number nobody derived.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  /** Occupancy now, by property, plus the units whose flag disagrees with its lease. */
  @Get('occupancy')
  @Roles(...REPORTS_VIEW_ROLES)
  @Permissions('reports.view')
  occupancy(
    @Query('on') on?: string,
    @Query('propertyId') propertyId?: string,
    @Request() req?: any,
  ) {
    return this.service.occupancy({ on, propertyId }, req);
  }

  /** Month-end occupancy over a window. A different query from the snapshot above. */
  @Get('occupancy/trend')
  @Roles(...REPORTS_VIEW_ROLES)
  @Permissions('reports.view')
  occupancyTrend(
    @Query('months') months?: string,
    @Query('propertyId') propertyId?: string,
    @Request() req?: any,
  ) {
    return this.service.occupancyTrend(
      { months: months ? Number(months) : undefined, propertyId },
      req,
    );
  }

  /** Invoiced, collected, outstanding and net, aggregated in the database. */
  @Get('financial')
  @Roles(...REPORTS_VIEW_ROLES)
  @Permissions('reports.view')
  financial(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Request() req?: any,
  ) {
    return this.service.financial({ from, to }, req);
  }

  /** Sales value, stage breakdown, agent performance and lead conversion. */
  @Get('sales')
  @Roles(...REPORTS_VIEW_ROLES)
  @Permissions('reports.view')
  sales(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Request() req?: any,
  ) {
    return this.service.sales({ from, to }, req);
  }

  /** Throughput, average completion time and cost, split by source. */
  @Get('maintenance')
  @Roles(...REPORTS_VIEW_ROLES)
  @Permissions('reports.view')
  maintenance(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('propertyId') propertyId?: string,
    @Request() req?: any,
  ) {
    return this.service.maintenance({ from, to, propertyId }, req);
  }

  /** One landlord's return. `null` rather than a 404 body when the id is not theirs. */
  @Get('landlords/:id/roi')
  @Roles(...REPORTS_VIEW_ROLES)
  @Permissions('reports.view')
  landlordRoi(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Request() req?: any,
  ) {
    return this.service.landlordRoi(id, { from, to }, req);
  }

  /**
   * CSV export, one route per report.
   *
   * `text/csv` with a `Content-Disposition` filename rather than JSON, because the
   * point of an export is that it lands in a spreadsheet. The file is the *detail* rows,
   * not the headline totals - see the service.
   *
   * These are declared before `/landlords/:id` for the reason in the class comment.
   */
  @Get('occupancy/export')
  @Roles(...REPORTS_VIEW_ROLES)
  @Permissions('reports.view')
  @Header('Content-Type', 'text/csv')
  async occupancyCsv(
    @Res() res: Response,
    @Query('on') on?: string,
    @Query('propertyId') propertyId?: string,
    @Request() req?: any,
  ) {
    const csv = await this.service.exportCsv(
      'occupancy',
      { on, propertyId },
      req,
    );
    sendCsv(res, csv, `occupancy-${stamp()}.csv`);
  }

  @Get('financial/export')
  @Roles(...REPORTS_VIEW_ROLES)
  @Permissions('reports.view')
  @Header('Content-Type', 'text/csv')
  async financialCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Request() req?: any,
  ) {
    const csv = await this.service.exportCsv('financial', { from, to }, req);
    sendCsv(res, csv, `financial-${stamp()}.csv`);
  }

  @Get('sales/export')
  @Roles(...REPORTS_VIEW_ROLES)
  @Permissions('reports.view')
  @Header('Content-Type', 'text/csv')
  async salesCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Request() req?: any,
  ) {
    const csv = await this.service.exportCsv('sales', { from, to }, req);
    sendCsv(res, csv, `sales-${stamp()}.csv`);
  }

  @Get('maintenance/export')
  @Roles(...REPORTS_VIEW_ROLES)
  @Permissions('reports.view')
  @Header('Content-Type', 'text/csv')
  async maintenanceCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('propertyId') propertyId?: string,
    @Request() req?: any,
  ) {
    const csv = await this.service.exportCsv(
      'maintenance',
      { from, to, propertyId },
      req,
    );
    sendCsv(res, csv, `maintenance-${stamp()}.csv`);
  }
}

/**
 * Write the CSV with a download filename.
 *
 * `Content-Disposition` rather than relying on the browser to guess, because a file
 * called `report.csv` is useless when four of them land in a downloads folder and the
 * reader cannot tell which estate or which month it covers.
 */
function sendCsv(res: Response, csv: string, filename: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

/** Date stamp for a filename - `2026-10-06`, which sorts and reads correctly. */
function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}
