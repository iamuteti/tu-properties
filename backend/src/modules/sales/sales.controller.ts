import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CommissionStatus,
  InstallmentStatus,
  SaleStage,
  UserRole,
} from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { requireTenantId, getUserId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import {
  SalesService,
  type CommissionFilters,
  type PaginationParams,
  type SaleFilters,
} from './sales.service';
import {
  CreateInstallmentInvoiceDto,
  CreateInstallmentPlanDto,
  CreateSaleDto,
  GenerateCommissionsDto,
  UpdateCommissionStatusDto,
  UpdateSaleDto,
  UpdateSaleStageDto,
} from './dto/sale.dto';

const SALES_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
];

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @Roles(...SALES_WRITE_ROLES)
  @Permissions('sales.create')
  create(@Body() dto: CreateSaleDto, @Request() req) {
    return this.salesService.create(dto, requireTenantId(req));
  }

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('stage') stage?: string,
    @Query('propertyId') propertyId?: string,
    @Query('agentUserId') agentUserId?: string,
    @Query('buyerContactId') buyerContactId?: string,
  ) {
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: SaleFilters = {
      stage,
      propertyId,
      agentUserId,
      buyerContactId,
    };
    return this.salesService.findAll(requireTenantId(req), params, filters);
  }

  /** Pipeline board feed: open sales only. */
  @Get('pipeline')
  pipeline(@Request() req, @Query('agentUserId') agentUserId?: string) {
    return this.salesService.pipeline(requireTenantId(req), { agentUserId });
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sales.csv"')
  async export(
    @Request() req,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('stage') stage?: string,
    @Query('propertyId') propertyId?: string,
    @Query('agentUserId') agentUserId?: string,
  ) {
    const csv = await this.salesService.exportCsv(
      requireTenantId(req),
      { stage, propertyId, agentUserId },
      search,
    );
    res.send(csv);
  }

  // ------------------------------------------------------------- commissions

  /** Per-agent commission report (acceptance criterion for this module). */
  @Get('commissions')
  commissions(
    @Request() req,
    @Query('agentUserId') agentUserId?: string,
    @Query('status') status?: string,
    @Query('saleTransactionId') saleTransactionId?: string,
  ) {
    const filters: CommissionFilters = {
      agentUserId,
      status,
      saleTransactionId,
    };
    return this.salesService.commissionReport(requireTenantId(req), filters);
  }

  @Patch('commissions/:id/status')
  @Roles(...SALES_WRITE_ROLES)
  @Permissions('sales.update')
  setCommissionStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCommissionStatusDto,
    @Request() req,
  ) {
    return this.salesService.setCommissionStatus(
      id,
      dto.status,
      requireTenantId(req),
      getUserId(req),
      { paidRef: dto.paidRef, notes: dto.notes },
    );
  }

  // ------------------------------------------------------------------- sales

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.salesService.findOne(id, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...SALES_WRITE_ROLES)
  @Permissions('sales.update')
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto, @Request() req) {
    return this.salesService.update(id, dto, requireTenantId(req));
  }

  /** Move a sale through the pipeline; the gates live server-side. */
  @Patch(':id/stage')
  @Roles(...SALES_WRITE_ROLES)
  @Permissions('sales.update')
  setStage(
    @Param('id') id: string,
    @Body() dto: UpdateSaleStageDto,
    @Request() req,
  ) {
    return this.salesService.setStage(
      id,
      dto.stage,
      requireTenantId(req),
      dto.reason,
    );
  }

  @Delete(':id')
  @Roles(...SALES_WRITE_ROLES)
  @Permissions('sales.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.salesService.remove(id, requireTenantId(req));
  }

  // ------------------------------------------------------------ instalments

  @Post(':id/installments/plan')
  @Roles(...SALES_WRITE_ROLES)
  @Permissions('sales.update')
  createInstallmentPlan(
    @Param('id') id: string,
    @Body() dto: CreateInstallmentPlanDto,
    @Request() req,
  ) {
    return this.salesService.createInstallmentPlan(
      id,
      dto,
      requireTenantId(req),
    );
  }

  /** Raise a Finance invoice for one instalment (reuses InvoicesService). */
  @Post(':id/installments/:installmentId/invoice')
  @Roles(...SALES_WRITE_ROLES)
  // The permission vocabulary is module + {view,create,update,delete}; raising
  // an invoice is a create against the sale's billing state.
  @Permissions('sales.create')
  invoiceInstallment(
    @Param('id') id: string,
    @Param('installmentId') installmentId: string,
    @Body() dto: CreateInstallmentInvoiceDto,
    @Request() req,
  ) {
    return this.salesService.invoiceInstallment(
      id,
      installmentId,
      dto.description,
      dto.memo,
      requireTenantId(req),
    );
  }

  @Patch(':id/installments/:installmentId/status')
  @Roles(...SALES_WRITE_ROLES)
  @Permissions('sales.update')
  setInstallmentStatus(
    @Param('id') id: string,
    @Param('installmentId') installmentId: string,
    @Query('status') status: string,
    @Request() req,
  ) {
    return this.salesService.setInstallmentStatus(
      id,
      installmentId,
      status as InstallmentStatus,
      requireTenantId(req),
    );
  }

  /** Re-derive instalment statuses from their invoices (payments live in Finance). */
  @Post(':id/installments/refresh')
  @Roles(...SALES_WRITE_ROLES)
  @Permissions('sales.update')
  refreshInstallments(@Param('id') id: string, @Request() req) {
    return this.salesService.refreshInstallmentStatus(id, requireTenantId(req));
  }

  /** Create the commission rows for a sale (split support). */
  @Post(':id/commissions')
  @Roles(...SALES_WRITE_ROLES)
  @Permissions('sales.create')
  generateCommissions(
    @Param('id') id: string,
    @Body() dto: GenerateCommissionsDto,
    @Request() req,
  ) {
    return this.salesService.generateCommissions(id, dto, requireTenantId(req));
  }
}

export const SALES_STAGES = Object.values(SaleStage);
export const SALES_COMMISSION_STATUSES = Object.values(CommissionStatus);
