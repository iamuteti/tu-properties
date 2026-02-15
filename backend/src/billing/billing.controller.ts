import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
    constructor(private readonly billingService: BillingService) { }

    @Post('invoices')
    createInvoice(@Body() createInvoiceDto: Prisma.InvoiceCreateInput) {
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

    @Post('payments')
    recordPayment(@Body() createPaymentDto: Prisma.PaymentCreateInput) {
        return this.billingService.recordPayment(createPaymentDto);
    }

    @Get('payments')
    findAllPayments() {
        return this.billingService.findAllPayments();
    }
}
