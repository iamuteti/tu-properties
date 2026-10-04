import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  BillCategory,
  BillStatus,
  SupplierStatus,
  UserRole,
} from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId } from '@/common/utils';
import { PayablesService } from './payables.service';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Controller('finance/payables')
export class PayablesController {
  constructor(private readonly payablesService: PayablesService) {}

  // ── Suppliers ─────────────────────────────────────────────────────────────

  @Get('suppliers')
  @Permissions('payables.view')
  findSuppliers(@Request() req, @Query('status') status?: SupplierStatus) {
    return this.payablesService.findSuppliers(getTenantId(req), { status });
  }

  @Get('suppliers/:id')
  @Permissions('payables.view')
  findSupplier(@Param('id') id: string, @Request() req) {
    return this.payablesService.findSupplier(id, getTenantId(req));
  }

  @Post('suppliers')
  @Permissions('payables.create')
  createSupplier(@Body() body: Record<string, never>, @Request() req) {
    return this.payablesService.createSupplier(
      body as never,
      getTenantId(req),
    );
  }

  @Patch('suppliers/:id')
  @Permissions('payables.update')
  updateSupplier(
    @Param('id') id: string,
    @Body() body: Record<string, never>,
    @Request() req,
  ) {
    return this.payablesService.updateSupplier(
      id,
      body as never,
      getTenantId(req),
    );
  }

  @Delete('suppliers/:id')
  @Permissions('payables.delete')
  deleteSupplier(@Param('id') id: string, @Request() req) {
    return this.payablesService.deleteSupplier(id, getTenantId(req));
  }

  // ── Bills ─────────────────────────────────────────────────────────────────

  @Get('bills')
  @Permissions('payables.view')
  findBills(
    @Request() req,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: BillStatus,
    @Query('overdueOnly') overdueOnly?: string,
  ) {
    return this.payablesService.findBills(getTenantId(req), {
      supplierId,
      status,
      overdueOnly: overdueOnly === 'true',
    });
  }

  @Get('bills/:id')
  @Permissions('payables.view')
  findBill(@Param('id') id: string, @Request() req) {
    return this.payablesService.findBill(id, getTenantId(req));
  }

  /**
   * Record a supplier bill. Tax is priced by the configured rules for the
   * organization's jurisdiction unless `taxAmount` is supplied, in which case
   * the supplied figures win — an accountant transcribing a document must be
   * able to.
   */
  @Post('bills')
  @Permissions('payables.create')
  createBill(
    @Body()
    body: {
      billNumber?: string;
      supplierId: string;
      supplierReference?: string;
      billDate?: string;
      dueDate?: string;
      currency?: string;
      category?: BillCategory;
      subtotal?: number;
      taxAmount?: number;
      totalAmount?: number;
      calculateTax?: boolean;
      notes?: string;
      lines: {
        description: string;
        quantity?: number;
        unitPrice: number;
        amount?: number;
        taxRate?: number;
        taxAmount?: number;
        expenseAccountCode?: string;
      }[];
    },
    @Request() req,
  ) {
    return this.payablesService.createBill(
      { ...body, createdBy: getUserId(req) },
      getTenantId(req),
    );
  }

  @Post('bills/:id/void')
  @Permissions('payables.void')
  voidBill(@Param('id') id: string, @Request() req) {
    return this.payablesService.voidBill(id, getTenantId(req), getUserId(req));
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  @Get('payments')
  @Permissions('payables.view')
  findPayments(@Request() req, @Query('billId') billId?: string) {
    return this.payablesService.findPayments(getTenantId(req), { billId });
  }

  @Post('payments')
  @Permissions('payables.create')
  createPayment(
    @Body()
    body: {
      billId: string;
      amount: number;
      paymentDate?: string;
      method?: string;
      reference?: string;
      notes?: string;
      unallocated?: boolean;
    },
    @Request() req,
  ) {
    return this.payablesService.createPayment(
      { ...body, createdBy: getUserId(req) },
      getTenantId(req),
    );
  }

  @Post('payments/:id/allocate')
  @Permissions('payables.update')
  allocate(
    @Param('id') id: string,
    @Body() body: { billIds?: string[] },
    @Request() req,
  ) {
    return this.payablesService.allocatePayment(
      id,
      { billIds: body.billIds },
      getTenantId(req),
    );
  }

  @Post('payments/:id/reverse')
  @Permissions('payables.update')
  reversePayment(@Param('id') id: string, @Request() req) {
    return this.payablesService.reversePayment(
      id,
      getTenantId(req),
      getUserId(req),
    );
  }

  // ── Supplier credit ───────────────────────────────────────────────────────

  @Get('credits')
  @Permissions('payables.view')
  findCredits(@Request() req, @Query('supplierId') supplierId?: string) {
    return this.payablesService.findCredits(getTenantId(req), { supplierId });
  }

  @Post('credits/:id/apply')
  @Permissions('payables.update')
  applyCredit(
    @Param('id') id: string,
    @Body() body: { billIds?: string[]; amount?: number },
    @Request() req,
  ) {
    return this.payablesService.applyCredit(
      id,
      { ...body, appliedBy: getUserId(req) },
      getTenantId(req),
    );
  }

  // ── Reporting ─────────────────────────────────────────────────────────────

  /** What we owe, by age and by supplier. */
  @Get('aging')
  @Permissions('payables.view')
  aging(@Request() req) {
    return this.payablesService.aging(getTenantId(req));
  }
}