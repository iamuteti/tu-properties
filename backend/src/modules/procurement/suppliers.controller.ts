import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { SupplierStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, requireTenantId } from '@/common/utils';
import { ProcurementSuppliersService } from './suppliers.service';
import { UpdateSupplierProcurementDto } from './dto/procurement.dto';

const PROCUREMENT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROCUREMENT_OFFICER,
  UserRole.ACCOUNTANT,
  UserRole.PROPERTY_MANAGER,
];

const VIEW_ROLES = [
  ...PROCUREMENT_ROLES,
  UserRole.LEASING_OFFICER,
  UserRole.MAINTENANCE_MANAGER,
];

/**
 * Module 10 — suppliers, from procurement's side.
 *
 * A supplier record itself is created and edited by accounts payable
 * (`/finance/payables/suppliers`), and this controller deliberately does not
 * duplicate those routes — two create paths for one entity is how two supplier
 * codes get allocated for the same plumber. What lives here is the procurement
 * view of the same rows: performance figures, contract windows, and the spend
 * report.
 *
 * Both controllers read the same table, so a supplier created by the accountant
 * appears in the buyer's RFQ picker without anybody doing a second entry.
 */
@UseGuards(JwtAuthGuard)
@Controller('procurement/suppliers')
export class ProcurementSuppliersController {
  constructor(private readonly suppliers: ProcurementSuppliersService) {}

  @Get()
  @Roles(...VIEW_ROLES)
  @Permissions('suppliers.view')
  findAll(
    @Request() req,
    @Query('status') status?: SupplierStatus,
    @Query('category') category?: string,
    @Query('contractOnly') contractOnly?: string,
    @Query('search') search?: string,
  ) {
    return this.suppliers.findAll(getTenantId(req), {
      ...(status ? { status } : {}),
      category,
      contractOnly: contractOnly === 'true' ? true : undefined,
      search,
    });
  }

  /** Spend per supplier over a period — "who are we actually buying from". */
  @Get('spend')
  @Roles(...VIEW_ROLES)
  @Permissions('suppliers.view')
  spend(
    @Request() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.suppliers.spendReport(
      getTenantId(req),
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  @Permissions('suppliers.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.suppliers.findOne(id, getTenantId(req));
  }

  /**
   * Update the procurement fields only.
   *
   * Name, contact and bank details belong to accounts payable's endpoint. A
   * second editor for the same column is how one of them ends up disagreeing
   * with the supplier's invoice.
   */
  @Patch(':id')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('suppliers.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierProcurementDto,
    @Request() req,
  ) {
    return this.suppliers.update(id, dto, requireTenantId(req));
  }
}
