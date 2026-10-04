import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Delete,
  Patch,
  Request,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Permissions('invoices.view')
@Controller('finance/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @Permissions('invoices.create')
  create(
    @Body()
    createInvoiceDto: {
      invoiceNumber?: string;
      landlordId?: string;
      rentalAgreementId?: string;
      transactionClass: string;
      acReceivable?: string;
      billTo?: string;
      issueDate: string;
      dueDate: string;
      currency?: string;
      spotRate?: number;
      lpoNumber?: string;
      signOnEfims?: boolean;
      paymentInfo?: string;
      termsConditions?: string;
      memo?: string;
      amount: number;
      vatAmount?: number;
      totalAmount: number;
      paidAmount?: number;
      balanceAmount: number;
      status?: string;
      invoiceItems?: {
        revenueExpenseItem?: string;
        particular?: string;
        incomeAccount?: string;
        unitCost?: number;
        qty?: number;
        taxRate?: number;
        taxAmount?: number;
        lineTotal?: number;
        className?: string;
      }[];
    },
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.invoicesService.create(createInvoiceDto, tenantId);
  }

  @Get()
  findAll(@Request() req) {
    const tenantId = getTenantId(req);
    return this.invoicesService.findAll(tenantId);
  }

  /**
   * Who owes what, and how stale: arrears by tenant and by property, bucketed by
   * days past due. The receivable mirror of the AP aging report, and what a
   * collections conversation actually needs.
   */
  @Get('arrears')
  @Permissions('invoices.view')
  arrears(
    @Request() req,
    @Query('asOf') asOf?: string,
    @Query('propertyId') propertyId?: string,
  ) {
    return this.invoicesService.arrears(
      getTenantId(req),
      asOf ? new Date(asOf) : undefined,
      propertyId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.invoicesService.findOne(id, tenantId);
  }

  @Patch(':id')
  @Permissions('invoices.update')
  update(
    @Param('id') id: string,
    @Body()
    updateInvoiceDto: {
      landlordId?: string;
      rentalAgreementId?: string;
      transactionClass?: string;
      acReceivable?: string;
      billTo?: string;
      issueDate?: string;
      dueDate?: string;
      currency?: string;
      spotRate?: number;
      lpoNumber?: string;
      signOnEfims?: boolean;
      paymentInfo?: string;
      termsConditions?: string;
      memo?: string;
      amount?: number;
      vatAmount?: number;
      totalAmount?: number;
      paidAmount?: number;
      balanceAmount?: number;
      status?: string;
    },
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.invoicesService.update(id, updateInvoiceDto, tenantId);
  }

  @Delete(':id')
  @Permissions('invoices.delete')
  delete(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.invoicesService.delete(id, tenantId);
  }

  @Post('bulk-delete')
  @Permissions('invoices.delete')
  deleteMany(@Body() body: { ids: string[] }, @Request() req) {
    const tenantId = getTenantId(req);
    return this.invoicesService.deleteMany(body.ids, tenantId);
  }
}
