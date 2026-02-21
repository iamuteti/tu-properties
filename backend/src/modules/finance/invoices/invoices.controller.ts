import { Controller, Get, Post, Body, Param, UseGuards, Delete, Request } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';

@UseGuards(JwtAuthGuard)
@Controller('finance/invoices')
export class InvoicesController {
    constructor(private readonly invoicesService: InvoicesService) { }

    @Post()
    create(@Body() createInvoiceDto: {
        invoiceNumber?: string;
        landlordId?: string;
        leaseId?: string;
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
    }, @Request() req) {
        const tenantId = getTenantId(req);
        return this.invoicesService.create(createInvoiceDto, tenantId);
    }

    @Get()
    findAll(@Request() req) {
        const tenantId = getTenantId(req);
        return this.invoicesService.findAll(tenantId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.invoicesService.findOne(id, tenantId);
    }

    @Delete(':id')
    delete(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.invoicesService.delete(id, tenantId);
    }

    @Post('bulk-delete')
    deleteMany(@Body() body: { ids: string[] }, @Request() req) {
        const tenantId = getTenantId(req);
        return this.invoicesService.deleteMany(body.ids, tenantId);
    }
}
