import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  // Generate invoice number
  private generateInvoiceNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `INV-${year}${month}-${random}`;
  }

  create(
    data: {
      invoiceNumber?: string;
      landlordId?: string;
      rentalAgreementId?: string;
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
    },
    tenantId?: string,
  ) {
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

    // Add tenant organization if provided
    if (tenantId) {
      invoiceData.organization = { connect: { id: tenantId } };
    }

    // Add landlord relation if provided
    if (data.landlordId) {
      invoiceData.landlord = { connect: { id: data.landlordId } };
    }

    // Add rental agreement relation if provided (backward compatibility)
    if (data.rentalAgreementId) {
      invoiceData.rentalAgreement = { connect: { id: data.rentalAgreementId } };
    }

    // Add invoice items if provided
    if (data.invoiceItems && data.invoiceItems.length > 0) {
      invoiceData.invoiceItems = {
        create: data.invoiceItems.map((item) => ({
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

  async update(
    id: string,
    data: {
      landlordId?: string;
      rentalAgreementId?: string;
      transactionClass?: string;
      acReceivable?: string;
      billTo?: string;
      issueDate?: string | Date;
      dueDate?: string | Date;
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
    tenantId?: string,
  ) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.invoice, {
        id,
        organizationId: tenantId,
      });
    }

    const updateData: Prisma.InvoiceUpdateInput = {};
    if (data.landlordId !== undefined) {
      updateData.landlord = data.landlordId
        ? { connect: { id: data.landlordId } }
        : { disconnect: true };
    }
    if (data.rentalAgreementId !== undefined) {
      updateData.rentalAgreement = data.rentalAgreementId
        ? { connect: { id: data.rentalAgreementId } }
        : { disconnect: true };
    }
    if (data.transactionClass !== undefined)
      updateData.transactionClass = data.transactionClass;
    if (data.acReceivable !== undefined)
      updateData.acReceivable = data.acReceivable;
    if (data.billTo !== undefined) updateData.billTo = data.billTo;
    if (data.issueDate !== undefined)
      updateData.issueDate = new Date(data.issueDate);
    if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.spotRate !== undefined) updateData.spotRate = data.spotRate;
    if (data.lpoNumber !== undefined) updateData.lpoNumber = data.lpoNumber;
    if (data.signOnEfims !== undefined)
      updateData.signOnEfims = data.signOnEfims;
    if (data.paymentInfo !== undefined)
      updateData.paymentInfo = data.paymentInfo;
    if (data.termsConditions !== undefined)
      updateData.termsConditions = data.termsConditions;
    if (data.memo !== undefined) updateData.memo = data.memo;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.vatAmount !== undefined) updateData.vatAmount = data.vatAmount;
    if (data.totalAmount !== undefined)
      updateData.totalAmount = data.totalAmount;
    if (data.paidAmount !== undefined) updateData.paidAmount = data.paidAmount;
    if (data.balanceAmount !== undefined)
      updateData.balanceAmount = data.balanceAmount;
    if (data.status !== undefined) updateData.status = data.status as any;

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        invoiceItems: true,
        payments: true,
        landlord: true,
        rentalAgreement: {
          include: {
            tenant: true,
            unit: true,
          },
        },
      },
    });
  }

  findAll(tenantId?: string) {
    const where = tenantId ? { organizationId: tenantId } : {};
    return this.prisma.invoice.findMany({
      where,
      include: {
        landlord: true,
        rentalAgreement: {
          include: {
            tenant: true,
            unit: true,
          },
        },
        invoiceItems: true,
      },
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.invoice.findFirst({
        where,
        include: {
          invoiceItems: true,
          payments: true,
          landlord: true,
          rentalAgreement: {
            include: {
              tenant: true,
              unit: true,
            },
          },
        },
      }),
      'Invoice',
    );
  }

  async delete(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.invoice, {
        id,
        organizationId: tenantId,
      });
    }
    return this.prisma.invoice.delete({
      where: { id },
    });
  }

  async deleteMany(ids: string[], tenantId?: string) {
    const where = tenantId
      ? { id: { in: ids }, organizationId: tenantId }
      : { id: { in: ids } };
    const result = await this.prisma.invoice.deleteMany({
      where,
    });
    return { deleted: result.count };
  }
}
