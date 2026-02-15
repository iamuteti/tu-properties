import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@/prisma/generated/prisma';

@Injectable()
export class BillingService {
    constructor(private prisma: PrismaService) { }

    // Invoices
    createInvoice(data: Prisma.InvoiceCreateInput) {
        return this.prisma.invoice.create({ data });
    }

    findAllInvoices() {
        return this.prisma.invoice.findMany({
            include: {
                lease: {
                    include: {
                        tenant: true,
                        unit: true,
                    }
                },
                invoiceItems: true,
            },
        });
    }

    findOneInvoice(id: string) {
        return this.prisma.invoice.findUnique({
            where: { id },
            include: {
                invoiceItems: true,
                payments: true,
            },
        });
    }

    // Payments
    recordPayment(data: Prisma.PaymentCreateInput) {
        return this.prisma.payment.create({ data });
    }

    findAllPayments() {
        return this.prisma.payment.findMany({
            include: {
                invoice: true,
                lease: true,
            },
        });
    }
}
