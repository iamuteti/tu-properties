import { Controller, Get, Post, Body, Param, UseGuards, Delete } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
    constructor(private readonly billingService: BillingService) { }

    @Post('invoices')
    createInvoice(@Body() createInvoiceDto: {
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
    }) {
        return this.billingService.createInvoice(createInvoiceDto);
    }

    @Get('invoices')
    findAllInvoices() {
        return this.billingService.findAllInvoices();
    }

    @Get('invoices/:id')
    findOneInvoice(@Param('id') id: string) {
        return this.billingService.findOneInvoice(id);
    }

    @Delete('invoices/:id')
    deleteInvoice(@Param('id') id: string) {
        return this.billingService.deleteInvoice(id);
    }

    @Post('invoices/bulk-delete')
    deleteInvoices(@Body() body: { ids: string[] }) {
        return this.billingService.deleteInvoices(body.ids);
    }

    @Get('leases')
    findAllLeases() {
        return this.billingService.findAllLeases();
    }

    @Post('payments')
    recordPayment(@Body() createPaymentDto: Prisma.PaymentCreateInput) {
        return this.billingService.recordPayment(createPaymentDto);
    }

    @Get('payments')
    findAllPayments() {
        return this.billingService.findAllPayments();
    }
}
