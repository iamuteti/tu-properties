import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReceiptsService {
    constructor(private prisma: PrismaService) { }

    // Generate receipt number
    private generateReceiptNumber(): string {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `REC-${year}${month}-${random}`;
    }

    create(data: {
        receiptId?: string;
        receiptType?: 'ApplyToInvoice' | 'CashReceipt';
        receiptCategory?: 'Rent' | 'General';
        receivedFrom: string;
        paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'MPESA' | 'CARD' | 'OTHER';
        depositIntoAc?: string;
        refNo?: string;
        chequeNo?: string;
        chequeDate?: string;
        recordingDate?: string | Date;
        amountReceived: number;
        notes?: string;
        tenantId?: string;
        landlordId?: string;
        recordDate?: string | Date;
        bankingDate?: string | Date;
        paymentRefNo?: string;
        amountVatInclusive?: boolean;
        receiptTo?: 'Landlord' | 'GeneralLedger';
        drtOrDrf?: 'DirectReceipt' | 'DepositRefund';
        memo?: string;
        paymentBank?: string;
        currency?: string;
        spotRate?: number;
        receiptLines?: {
            date: string | Date;
            invNo?: string;
            particular: string;
            invoiceTotal: number;
            prevReceipts?: number;
            amtDue: number;
            payment: number;
            newBalance: number;
            whtTax?: number;
        }[];
        payments?: {
            invoiceId?: string;
            leaseId?: string;
            paymentDate: string | Date;
            amount: number;
            currency?: string;
            spotRate?: number;
            paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'MPESA' | 'CARD' | 'OTHER';
            paymentReference?: string;
            payee?: string;
            paidFrom?: string;
            paidTo?: string;
            paymentType?: 'ApplyToBill' | 'CashPayment';
            chequeNumber?: string;
            chequeDate?: string;
            mpesaReceiptNumber?: string;
            mpesaPhoneNumber?: string;
            notes?: string;
            attachments?: string;
        }[];
        recordedBy?: string;
    }, tenantId?: string) {
        const receiptData: Prisma.ReceiptCreateInput = {
            receiptId: data.receiptId || this.generateReceiptNumber(),
            receiptType: (data.receiptType as any) || 'ApplyToInvoice',
            receiptCategory: (data.receiptCategory as any) || 'Rent',
            receivedFrom: data.receivedFrom,
            paymentMethod: data.paymentMethod as any,
            depositIntoAc: data.depositIntoAc,
            refNo: data.refNo,
            chequeNo: data.chequeNo,
            chequeDate: data.chequeDate ? new Date(data.chequeDate) : undefined,
            recordingDate: data.recordingDate ? new Date(data.recordingDate) : new Date(),
            amountReceived: data.amountReceived,
            notes: data.notes,
            recordDate: data.recordDate ? new Date(data.recordDate) : undefined,
            bankingDate: data.bankingDate ? new Date(data.bankingDate) : undefined,
            paymentRefNo: data.paymentRefNo,
            amountVatInclusive: data.amountVatInclusive ?? true,
            receiptTo: (data.receiptTo as any) || 'Landlord',
            drtOrDrf: (data.drtOrDrf as any) || 'DepositRefund',
            memo: data.memo,
            paymentBank: data.paymentBank,
            currency: data.currency || 'KES',
            spotRate: data.spotRate || 1,
            recordedBy: data.recordedBy,
        };

        // Add tenant organization if provided
        if (tenantId) {
            receiptData.organization = { connect: { id: tenantId } };
        }

        // Add tenant relation if provided
        if (data.tenantId) {
            receiptData.tenant = { connect: { id: data.tenantId } };
        }

        // Add landlord relation if provided
        if (data.landlordId) {
            receiptData.landlord = { connect: { id: data.landlordId } };
        }

        // Add receipt lines if provided
        if (data.receiptLines && data.receiptLines.length > 0) {
            receiptData.receiptLines = {
                create: data.receiptLines.map(line => ({
                    date: new Date(line.date),
                    invNo: line.invNo,
                    particular: line.particular,
                    invoiceTotal: line.invoiceTotal,
                    prevReceipts: line.prevReceipts || 0,
                    amtDue: line.amtDue,
                    payment: line.payment,
                    newBalance: line.newBalance,
                    whtTax: line.whtTax || 0,
                })),
            };
        }

        // Add payments if provided
        if (data.payments && data.payments.length > 0) {
            receiptData.payments = {
                create: data.payments.map(payment => ({
                    paymentDate: new Date(payment.paymentDate),
                    amount: payment.amount,
                    currency: payment.currency || 'KES',
                    spotRate: payment.spotRate || 1,
                    paymentMethod: payment.paymentMethod as any,
                    paymentReference: payment.paymentReference,
                    payee: payment.payee,
                    paidFrom: payment.paidFrom,
                    paidTo: payment.paidTo,
                    paymentType: (payment.paymentType as any) || 'ApplyToBill',
                    chequeNumber: payment.chequeNumber,
                    chequeDate: payment.chequeDate ? new Date(payment.chequeDate) : undefined,
                    mpesaReceiptNumber: payment.mpesaReceiptNumber,
                    mpesaPhoneNumber: payment.mpesaPhoneNumber,
                    notes: payment.notes,
                    attachments: payment.attachments,
                    recordedBy: data.recordedBy,
                    // Add tenant organization if provided
                    ...(tenantId && { organization: { connect: { id: tenantId } } }),
                    // Add invoice relation if provided
                    ...(payment.invoiceId && { invoice: { connect: { id: payment.invoiceId } } }),
                    // Add lease relation if provided
                    ...(payment.leaseId && { lease: { connect: { id: payment.leaseId } } }),
                })),
            };
        }

        return this.prisma.receipt.create({ data: receiptData });
    }

    findAll(tenantId?: string) {
        const where = tenantId ? { organizationId: tenantId } : {};
        return this.prisma.receipt.findMany({
            where,
            include: {
                tenant: true,
                payments: {
                    include: {
                        invoice: true,
                        lease: true,
                    },
                },
                receiptLines: true,
            },
        });
    }

    findOne(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.receipt.findUnique({
            where,
            include: {
                tenant: true,
                payments: {
                    include: {
                        invoice: true,
                        lease: true,
                    },
                },
                receiptLines: true,
            },
        });
    }

    delete(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.receipt.delete({
            where,
        });
    }

    async deleteMany(ids: string[], tenantId?: string) {
        const where = tenantId
            ? { id: { in: ids }, organizationId: tenantId }
            : { id: { in: ids } };
        const result = await this.prisma.receipt.deleteMany({
            where,
        });
        return { deleted: result.count };
    }
}
