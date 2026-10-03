import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OwnerStatementStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getUserId, requireTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import {
  OwnerStatementsService,
  type PaginationParams,
} from './owner-statements.service';
import {
  GenerateStatementDto,
  type StatementFilters,
} from './dto/statement.dto';
import { renderStatementDocument } from './statement-document';

const STATEMENT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.ACCOUNTANT,
];

/**
 * Owner statements (Module 6).
 *
 * Generation is one POST with the landlord and the period; the money is
 * derived. `preview` runs the identical calculation without writing, so the UI
 * can show an operator exactly what a period will produce before committing.
 */
@UseGuards(JwtAuthGuard)
@Controller('owner-statements')
export class OwnerStatementsController {
  constructor(private readonly statements: OwnerStatementsService) {}

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('landlordId') landlordId?: string,
    @Query('status') status?: string,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
  ) {
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: StatementFilters = {
      landlordId,
      status: status as OwnerStatementStatus,
      periodStart,
      periodEnd,
    };
    return this.statements.findAll(requireTenantId(req), params, filters);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="owner-statements.csv"')
  async export(
    @Request() req,
    @Res() res: Response,
    @Query('landlordId') landlordId?: string,
    @Query('status') status?: string,
  ) {
    const csv = await this.statements.exportCsv(requireTenantId(req), {
      landlordId,
      status: status as OwnerStatementStatus,
    });
    res.send(csv);
  }

  /** Dry run: the numbers a period would produce, with nothing written. */
  @Get('preview')
  @Roles(...STATEMENT_ROLES)
  @Permissions('owner_statements.view')
  preview(
    @Request() req,
    @Query('landlordId') landlordId: string,
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
  ) {
    return this.statements.previewFor(
      landlordId,
      periodStart,
      periodEnd,
      requireTenantId(req),
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.statements.findOne(id, requireTenantId(req));
  }

  /**
   * The printable statement. Served as HTML with print CSS so the browser's own
   * print dialog produces the PDF — there is no PDF library in the stack to
   * fight with. `?download=1` sends it as a file instead of opening it.
   */
  @Get(':id/document')
  async document(
    @Param('id') id: string,
    @Request() req,
    @Res() res: Response,
    @Query('download') download?: string,
  ) {
    const tenantId = requireTenantId(req);
    const statement = await this.statements.findOne(id, tenantId);
    const html = await this.statements.renderDocument(id, tenantId);

    if (download === 'true' || download === '1') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${statement.statementNumber}.html"`,
      );
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Post()
  @Roles(...STATEMENT_ROLES)
  @Permissions('owner_statements.create')
  generate(@Body() dto: GenerateStatementDto, @Request() req) {
    return this.statements.generate(dto, requireTenantId(req), getUserId(req));
  }

  @Post(':id/issue')
  @Roles(...STATEMENT_ROLES)
  @Permissions('owner_statements.update')
  issue(@Param('id') id: string, @Request() req) {
    return this.statements.issue(id, requireTenantId(req));
  }

  @Post(':id/void')
  @Roles(...STATEMENT_ROLES)
  @Permissions('owner_statements.update')
  void(
    @Param('id') id: string,
    @Request() req,
    @Body() body: { reason?: string },
  ) {
    return this.statements.void(id, requireTenantId(req), body?.reason);
  }

  @Delete(':id')
  @Roles(...STATEMENT_ROLES)
  @Permissions('owner_statements.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.statements.remove(id, requireTenantId(req));
  }
}
