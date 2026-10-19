import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { UtilityPricingService } from '@/modules/utilities/utility-pricing.service';
import {
  renderReceiptDocument,
  type ReceiptDocumentInput,
} from '@/modules/finance/receipts/receipt-document';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface TenantFilters {
  gender?: string;
  status?: string;
  agreementType?: string;
  propertyId?: string;
  withDeposit?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class TenantsService {
  constructor(
    private prisma: PrismaService,
    private pricing: UtilityPricingService,
  ) {}

  async create(data: any, tenantId?: string) {
    if (tenantId) {
      data.organization = { connect: { id: tenantId } };
    }

    // Generate unique account number and code
    const count = await this.prisma.tenant.count();
    const nextNumber = count + 1;
    const accountNumber = `TEN-${String(nextNumber).padStart(3, '0')}`;
    const code = `T${String(nextNumber).padStart(3, '0')}`;

    data.accountNumber = accountNumber;
    data.code = code;

    // Handle emergency contacts
    if (data.emergencyContacts) {
      data.emergencyContacts = {
        create: data.emergencyContacts
          .filter((contact: any) => contact.contactName)
          .map((contact: any, index: number) => ({
            ...contact,
            priority: index + 1,
          })),
      };
    }

    return this.prisma.tenant.create({
      data: data as Prisma.TenantCreateInput,
      include: {
        emergencyContacts: true,
      },
    });
  }

  findAll(
    tenantId?: string,
    params?: PaginationParams,
    filters?: TenantFilters,
  ): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params || {};
    const skip = (page - 1) * limit;

    const where: any = tenantId ? { organizationId: tenantId } : {};

    if (search) {
      where.OR = [
        { surname: { contains: search, mode: 'insensitive' } },
        { otherNames: { contains: search, mode: 'insensitive' } },
        { accountNumber: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const agreementType = filters?.agreementType || 'RENTAL';

    where.agreements = {
      some: {
        agreementType: agreementType,
      },
    };

    if (filters) {
      if (filters.status) where.status = filters.status;
      if (filters.gender) where.gender = filters.gender;
      if (filters.propertyId) {
        where.agreements = {
          ...where.agreements,
          some: {
            ...where.agreements.some,
            unit: {
              propertyId: filters.propertyId,
            },
          },
        };
      }
      if (filters.withDeposit !== undefined) {
        where.agreements = {
          ...where.agreements,
          some: {
            ...where.agreements.some,
            securityDeposit: filters.withDeposit
              ? { not: null }
              : { equals: null },
          },
        };
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.tenant.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            agreements: {
              include: {
                unit: {
                  include: {
                    property: true,
                  },
                },
                invoices: true,
              },
            },
          },
        }),
        tx.tenant.count({ where }),
      ]);

      // Format data to include agreement as single object instead of array
      const formattedData = data.map((tenant) => {
        const agreement =
          tenant.agreements?.sort(
            (a, b) =>
              new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
          )[0] || null;
        const lastPaidInvoice =
          agreement?.invoices
            ?.filter((inv) => inv.status === 'PAID')
            ?.sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )[0] || null;

        return {
          ...tenant,
          agreement,
          lastPaidInvoice,
        };
      });

      return {
        data: formattedData,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  /**
   * Everything about one tenant, in one query.
   *
   * This is the "resident file" - the single page somebody opens to answer a
   * question about a person: what they owe, what they have paid, what they have
   * been charged for, what they have asked for, and what has gone wrong in their
   * home. Every relation the tenant has is loaded here rather than being fetched
   * from a dozen endpoints the page then stitches together, because the stitch is
   * where the gaps come from: a relation that was not included simply does not
   * appear, and a resident whose water bill is missing looks like a resident with
   * no water bill.
   *
   * The relations that carry money are loaded **with their own children** -
   * a receipt without its `receiptLines` is an amount with no particulars, and an
   * invoice without its `invoiceItems` is a total with no breakdown. Those are the
   * two that made this page useless on its own.
   */
  async findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };

    const tenant = await requireRecord(
      this.prisma.tenant.findFirst({
        where,
        include: {
          agreements: {
            include: {
              unit: {
                include: {
                  property: true,
                },
              },
              invoices: {
                include: {
                  invoiceItems: true,
                },
                orderBy: { issueDate: 'desc' },
              },
              payments: {
                include: {
                  invoice: true,
                  allocations: true,
                },
                orderBy: { paymentDate: 'desc' },
              },
              // Module 14. The charges hang off the agreement, not the tenant, so
              // without this a resident's water and electricity history simply does
              // not exist on their page.
              utilityCharges: {
                include: {
                  meter: {
                    select: {
                      id: true,
                      meterNumber: true,
                      type: true,
                      scope: true,
                    },
                  },
                  unit: {
                    select: { id: true, code: true, name: true },
                  },
                  invoice: {
                    select: {
                      id: true,
                      invoiceNumber: true,
                      status: true,
                      totalAmount: true,
                      dueDate: true,
                    },
                  },
                },
                orderBy: [{ billingPeriod: 'desc' }, { createdAt: 'desc' }],
              },
              inspections: {
                include: { items: true },
                orderBy: { scheduledDate: 'desc' },
              },
              contracts: {
                orderBy: { createdAt: 'desc' },
              },
              moveOutRequests: {
                include: { deductions: true },
                orderBy: { moveoutDate: 'desc' },
              },
            },
            orderBy: { startDate: 'desc' },
          },
          emergencyContacts: {
            orderBy: { priority: 'asc' },
          },
          // A receipt is a document, and the document is its particulars. Without
          // `receiptLines` and `payments` this is a list of amounts.
          receipts: {
            include: {
              receiptLines: { orderBy: { date: 'asc' } },
              payments: {
                include: {
                  invoice: true,
                  allocations: true,
                },
              },
            },
            orderBy: { recordingDate: 'desc' },
          },
          moveOutRequests: {
            include: {
              deductions: true,
            },
            orderBy: { moveoutDate: 'desc' },
          },
          credits: {
            orderBy: { createdAt: 'desc' },
          },
          creditNotes: {
            orderBy: { issueDate: 'desc' },
          },
          workOrders: {
            orderBy: { reportedAt: 'desc' },
          },
          facilityBookings: {
            orderBy: { startsAt: 'desc' },
          },
          accessCards: {
            orderBy: { issuedAt: 'desc' },
          },
          visitorVisits: {
            orderBy: { createdAt: 'desc' },
          },
          requests: {
            orderBy: { createdAt: 'desc' },
          },
          notifications: {
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
          // The shared people-directory entry (Module 3). A tenant keeps its own
          // financial identity, but the contact record holds the communication
          // history, and a file that showed one without the other would be half
          // a record.
          contact: true,
          // The organization's money and calendar settings. Every record carries
          // its own currency, but the page has to *format* money and dates
          // somewhere, and the answer to "in which currency, in which locale" is
          // a property of the organization, not a constant in the code.
          organization: {
            select: {
              id: true,
              name: true,
              currency: true,
              timezone: true,
              defaultLocale: true,
              taxCountryCode: true,
            },
          },
        },
      }),
      'Tenant',
    );

    await this.priceUtilityCharges(tenant, tenantId);
    return tenant;
  }

  /**
   * Attach the priced money to each utility charge.
   *
   * A `UtilityCharge` stores the *inputs* to its price - which two readings, which
   * share, which rate - and never a copy of the answer, so the answer has to be
   * recomputed from the rows it names every time it is read. The recomputation
   * lives in `UtilityPricingService` so there is exactly one implementation of it
   * in the product; this method only batches the calls.
   */
  private async priceUtilityCharges(
    tenant: {
      organizationId?: string | null;
      agreements: Array<{
        utilityCharges: Array<{
          id: string;
          fromReadingId: string;
          toReadingId: string;
          meterId: string;
          ratePerUnit: Prisma.Decimal;
          currency: string;
          vatRate: Prisma.Decimal | null;
          allocationShare: Prisma.Decimal;
          incomeAccount?: string | null;
          revenueExpenseItem?: string | null;
        }>;
      }>;
    },
    tenantId?: string,
  ) {
    const organizationId = tenantId ?? tenant.organizationId;
    if (!organizationId) return;

    const charges = tenant.agreements.flatMap((a) => a.utilityCharges);
    if (charges.length === 0) return;

    const priced = await this.pricing.priceStoredCharges(
      organizationId,
      charges,
    );
    const byId = new Map(priced.map((p) => [p.chargeId, p]));

    for (const agreement of tenant.agreements) {
      for (const charge of agreement.utilityCharges) {
        const result = byId.get(charge.id);
        Object.assign(charge, {
          pricing: result?.pricing ?? null,
          pricingError: result?.error ?? null,
        });
      }
    }
  }

  /**
   * The printable receipt for one of this tenant's receipts.
   *
   * Served as HTML with print CSS so the browser's own print dialog produces the
   * PDF - there is no PDF library in the stack to fight with, and the owner
   * statement already set the precedent.
   *
   * The receipt is fetched **through the tenant** (`tenantId` on the row), not by
   * organization alone, so a receipt belonging to somebody else cannot be printed
   * by guessing its id under a tenant's URL.
   */
  async renderReceiptDocument(
    tenantRecordId: string,
    receiptId: string,
    tenantId?: string,
  ): Promise<{ html: string; receiptNumber: string }> {
    const receipt = await requireRecord(
      this.prisma.receipt.findFirst({
        where: {
          id: receiptId,
          tenantId: tenantRecordId,
          ...(tenantId ? { organizationId: tenantId } : {}),
        },
        include: {
          receiptLines: { orderBy: { date: 'asc' } },
          payments: {
            include: { invoice: true, agreement: true },
            orderBy: { paymentDate: 'asc' },
          },
          tenant: true,
          organization: true,
        },
      }),
      'Receipt',
    );

    const payer = receipt.tenant;
    const name = payer
      ? `${payer.surname} ${payer.otherNames ?? ''}`.trim()
      : receipt.receivedFrom;

    const input: ReceiptDocumentInput = {
      receiptNumber: receipt.receiptId,
      receiptType: receipt.receiptType,
      receiptCategory: receipt.receiptCategory,
      recordingDate: receipt.recordingDate.toISOString(),
      recordDate: receipt.recordDate?.toISOString() ?? null,
      bankingDate: receipt.bankingDate?.toISOString() ?? null,
      receivedFrom: receipt.receivedFrom,
      paymentMethod: receipt.paymentMethod,
      refNo: receipt.refNo,
      paymentRefNo: receipt.paymentRefNo,
      chequeNo: receipt.chequeNo,
      chequeDate: receipt.chequeDate?.toISOString() ?? null,
      paymentBank: receipt.paymentBank,
      depositIntoAc: receipt.depositIntoAc,
      currency: receipt.currency,
      spotRate: receipt.spotRate ? Number(receipt.spotRate) : null,
      amountReceived: Number(receipt.amountReceived),
      amountVatInclusive: receipt.amountVatInclusive,
      receiptTo: receipt.receiptTo,
      memo: receipt.memo,
      notes: receipt.notes,
      // The organization's own money and calendar settings. The receipt carries
      // its own currency; the *rendering* of that currency and of the dates
      // around it follows the organization, because the reader is in the
      // organization's country and not in the server's.
      locale: receipt.organization?.defaultLocale ?? null,
      timezone: receipt.organization?.timezone ?? null,
      lines: receipt.receiptLines.map((line) => ({
        date: line.date.toISOString(),
        invNo: line.invNo,
        particular: line.particular,
        invoiceTotal: Number(line.invoiceTotal),
        prevReceipts: Number(line.prevReceipts),
        amtDue: Number(line.amtDue),
        payment: Number(line.payment),
        newBalance: Number(line.newBalance),
        whtTax: Number(line.whtTax),
      })),
      payments: receipt.payments.map((payment) => ({
        date: payment.paymentDate.toISOString(),
        invoiceNumber: payment.invoice?.invoiceNumber ?? null,
        invoiceId: payment.invoiceId,
        agreementCode: payment.agreement?.code ?? null,
        method: payment.paymentMethod,
        reference: payment.paymentReference,
        amount: Number(payment.amount),
        appliedAmount: Number(payment.appliedAmount),
      })),
      tenant: {
        code: payer?.code ?? '—',
        accountNumber: payer?.accountNumber ?? null,
        name,
        phone: payer?.phone ?? null,
        email: payer?.email ?? null,
      },
      organization: {
        name: receipt.organization?.name ?? 'Property Management',
        legalName: receipt.organization?.legalName,
        contactEmail: receipt.organization?.contactEmail,
        contactPhone: receipt.organization?.contactPhone,
        taxId: receipt.organization?.taxId,
      },
    };

    return {
      html: renderReceiptDocument(input),
      receiptNumber: receipt.receiptId,
    };
  }

  async update(id: string, data: Prisma.TenantUpdateInput, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.tenant, {
        id,
        organizationId: tenantId,
      });
    }
    return this.prisma.tenant.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.tenant, {
        id,
        organizationId: tenantId,
      });
    }
    return this.prisma.tenant.delete({ where: { id } });
  }
}
