import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class BillingService {
    constructor(private prisma: PrismaService) { }

    // Generate invoice number
    private generateInvoiceNumber(): string {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `INV-${year}${month}-${random}`;
    }

    // Invoices
    createInvoice(data: {
        invoiceNumber?: string;
        landlordId?: string;
        leaseId?: string;
        transactionClass: string;
        acReceivable?: string;
        billTo?: string;
        issueDate: string | Date;
        dueDate: string | Date;
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
        const invoiceData: Prisma.InvoiceCreateInput = {
            invoiceNumber: data.invoiceNumber || this.generateInvoiceNumber(),
            transactionClass: data.transactionClass,
            acReceivable: data.acReceivable,
            billTo: data.billTo,
            issueDate: new Date(data.issueDate),
            dueDate: new Date(data.dueDate),
            currency: data.currency || 'KES',
            spotRate: data.spotRate || 1,
            lpoNumber: data.lpoNumber,
            signOnEfims: data.signOnEfims || false,
            paymentInfo: data.paymentInfo,
            termsConditions: data.termsConditions,
            memo: data.memo,
            amount: data.amount,
            vatAmount: data.vatAmount,
            totalAmount: data.totalAmount,
            paidAmount: data.paidAmount || 0,
            balanceAmount: data.balanceAmount,
            status: (data.status as any) || 'PENDING',
        };

        // Add landlord relation if provided
        if (data.landlordId) {
            invoiceData.landlord = { connect: { id: data.landlordId } };
        }

        // Add lease relation if provided (backward compatibility)
        if (data.leaseId) {
            invoiceData.lease = { connect: { id: data.leaseId } };
        }

        // Add invoice items if provided
        if (data.invoiceItems && data.invoiceItems.length > 0) {
            invoiceData.invoiceItems = {
                create: data.invoiceItems.map(item => ({
                    description: item.particular || '',
                    revenueExpenseItem: item.revenueExpenseItem,
                    incomeAccount: item.incomeAccount,
                    quantity: item.qty || 1,
                    unitPrice: item.unitCost || 0,
                    amount: item.lineTotal || 0,
                    vatRate: item.taxRate || 0,
                    vatAmount: item.taxAmount || 0,
                    className: item.className,
                })),
            };
        }

        return this.prisma.invoice.create({ data: invoiceData });
    }

    findAllInvoices() {
        return this.prisma.invoice.findMany({
            include: {
                landlord: true,
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
                landlord: true,
                lease: {
                    include: {
                        tenant: true,
                        unit: true,
                    },
                },
            },
        });
    }

    deleteInvoice(id: string) {
        return this.prisma.invoice.delete({
            where: { id },
        });
    }

    async deleteInvoices(ids: string[]) {
        const result = await this.prisma.invoice.deleteMany({
            where: {
                id: { in: ids },
            },
        });
        return { deleted: result.count };
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

    // Get all leases for customer selection
    findAllLeases() {
        return this.prisma.lease.findMany({
            include: {
                tenant: true,
                unit: {
                    include: {
                        property: true,
                    },
                },
            },
            where: {
                status: 'ACTIVE',
            },
        });
    }
}
