import { Injectable, NotFoundException } from '@nestjs/common';
import { AgreementStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { getPortalTenantId } from '@/common/utils';

/**
 * Tenant self-service portal (Module 5 checklist item, auth work in Module 1).
 *
 * Every query is scoped by the tenant id carried on the authenticated user's
 * session (`User.portalTenantId`) — never by a parameter from the client. That
 * is the whole point: a resident sees their own lease, invoices and receipts,
 * and nothing else, without the API having to trust them.
 */
@Injectable()
export class PortalService {
  constructor(private prisma: PrismaService) {}

  /** Who am I, as far as the portal is concerned. */
  async me(request: any) {
    const tenantId = getPortalTenantId(request);
    const tenant = await this.tenant(tenantId);

    return {
      user: {
        id: request.user.userId,
        email: request.user.email,
      },
      tenant: {
        code: tenant.code,
        accountNumber: tenant.accountNumber,
        surname: tenant.surname,
        otherNames: tenant.otherNames,
        email: tenant.email,
        phone: tenant.phone,
      },
    };
  }

  /**
   * The current lease, read-only: terms, the unit and the property. A resident
   * must not be able to edit it, so there is no write path here at all.
   */
  async currentLease(request: any) {
    const tenantId = getPortalTenantId(request);

    const lease = await this.prisma.rentalAgreement.findFirst({
      where: { tenantId, status: AgreementStatus.ACTIVE },
      orderBy: { startDate: 'desc' },
      include: {
        unit: {
          select: {
            id: true,
            name: true,
            bedrooms: true,
            bathrooms: true,
            areaSqFt: true,
            property: {
              select: { id: true, name: true, code: true, roadStreet: true, estateArea: true },
            },
          },
        },
      },
    });

    if (!lease) {
      throw new NotFoundException('You do not have an active lease.');
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { rentalAgreementId: lease.id },
      include: { payments: { select: { amount: true } } },
    });
    const money = this.summarise(invoices);

    return {
      lease: {
        code: lease.code,
        status: lease.status,
        agreementType: lease.agreementType,
        rentAmount: Number(lease.rentAmount),
        currency: lease.currency,
        startDate: lease.startDate,
        endDate: lease.endDate,
        termMonths: lease.termMonths,
        paymentDay: lease.paymentDay,
        securityDeposit: lease.securityDeposit != null ? Number(lease.securityDeposit) : null,
        noticePeriodDays: lease.noticePeriodDays,
        unit: lease.unit,
      },
      money,
      invoices: invoices
        .map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          status: invoice.status,
          amount: Number(invoice.amount),
          paid: invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
        }))
        .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()),
    };
  }

  /** Invoices raised against this tenant's leases. */
  async invoices(request: any) {
    const tenantId = getPortalTenantId(request);

    return this.prisma.invoice.findMany({
      where: { rentalAgreement: { tenantId } },
      orderBy: { dueDate: 'desc' },
      take: 100,
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        status: true,
        amount: true,
        paidAmount: true,
        balanceAmount: true,
        currency: true,
      },
    });
  }

  /** Receipts issued to this tenant. */
  async receipts(request: any) {
    const tenantId = getPortalTenantId(request);

    return this.prisma.receipt.findMany({
      where: { tenantId },
      orderBy: { recordingDate: 'desc' },
      take: 100,
      select: {
        id: true,
        receiptId: true,
        receiptType: true,
        receiptCategory: true,
        receivedFrom: true,
        paymentMethod: true,
        refNo: true,
        recordingDate: true,
        amountReceived: true,
        notes: true,
        memo: true,
        currency: true,
        // `Receipt` has no `invoice` relation (only payment/receipt-line links),
        // so the portal shows the receipt itself rather than a joined invoice.
        receiptLines: {
          select: { id: true, particular: true, invNo: true, amtDue: true, payment: true },
        },
      },
    });
  }

  /**
   * The one screen a resident actually opens: what they owe, what is overdue,
   * when the lease runs out.
   */
  async summary(request: any) {
    const tenantId = getPortalTenantId(request);
    const lease = await this.prisma.rentalAgreement.findFirst({
      where: { tenantId, status: AgreementStatus.ACTIVE },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        code: true,
        rentAmount: true,
        currency: true,
        startDate: true,
        endDate: true,
        paymentDay: true,
        unit: {
          select: {
            name: true,
            property: { select: { name: true, roadStreet: true, estateArea: true } },
          },
        },
      },
    });

    if (!lease) {
      return {
        hasLease: false,
        tenant: await this.tenant(tenantId),
        money: { invoiced: 0, paid: 0, outstanding: 0, arrears: 0 },
        nextDue: null,
        daysRemaining: null,
      };
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { rentalAgreementId: lease.id },
      include: { payments: { select: { amount: true } } },
    });
    const money = this.summarise(invoices);

    const outstanding = invoices
      .filter((invoice) => invoice.status !== 'PAID')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

    return {
      hasLease: true,
      tenant: await this.tenant(tenantId),
      lease: {
        code: lease.code,
        rentAmount: Number(lease.rentAmount),
        currency: lease.currency,
        startDate: lease.startDate,
        endDate: lease.endDate,
        unit: lease.unit,
      },
      money,
      nextDue: outstanding
        ? {
            invoiceId: outstanding.id,
            invoiceNumber: outstanding.invoiceNumber,
            dueDate: outstanding.dueDate,
            balance: Number(outstanding.balanceAmount ?? outstanding.amount),
            isOverdue: new Date(outstanding.dueDate) < new Date(),
          }
        : null,
      daysRemaining: lease.endDate
        ? Math.ceil((new Date(lease.endDate).getTime() - Date.now()) / 86_400_000)
        : null,
    };
  }

  /** Documents filed against this tenant (leases, receipts, IDs). */
  async documents(request: any) {
    const tenantId = getPortalTenantId(request);

    return this.prisma.document.findMany({
      where: { entityType: 'Tenant', entityId: tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        version: true,
        createdAt: true,
      },
    });
  }

  /**
   * Authorise a document download for this session.
   *
   * The document id arrives in the path, so ownership is checked against the
   * session's tenant before the file is opened — otherwise a resident could
   * iterate ids and download another resident's lease. The file itself is
   * streamed by the caller through the shared storage driver, so the portal
   * does not need a second storage implementation.
   */
  async authorizeDocument(id: string, request: any) {
    const tenantId = getPortalTenantId(request);

    const document = await this.prisma.document.findFirst({
      where: { id, entityType: 'Tenant', entityId: tenantId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        version: true,
        fileUrl: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    return document;
  }

  private async tenant(id: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        code: true,
        accountNumber: true,
        surname: true,
        otherNames: true,
        email: true,
        phone: true,
        status: true,
      },
    });
    return {
      code: tenant.code,
      accountNumber: tenant.accountNumber,
      surname: tenant.surname,
      otherNames: tenant.otherNames,
      email: tenant.email,
      phone: tenant.phone,
      status: tenant.status,
    };
  }

  /**
   * Resident-facing money view. Measured from the recorded payments rather than
   * `Invoice.balanceAmount`, because finance never reconciles that column
   * (master doc issue 41) and a resident would be shown the wrong number.
   */
  private summarise(
    invoices: Array<{
      amount: AmountLike;
      dueDate: Date;
      payments?: Array<{ amount: AmountLike }>;
    }>,
  ) {
    let invoiced = 0;
    let paid = 0;
    let arrears = 0;
    const now = new Date();

    for (const invoice of invoices) {
      const amount = Number(invoice.amount);
      const settled = (invoice.payments ?? []).reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      );
      invoiced += amount;
      paid += settled;
      if (new Date(invoice.dueDate) < now) {
        arrears += Math.max(amount - settled, 0);
      }
    }

    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      invoiced: round(invoiced),
      paid: round(paid),
      outstanding: round(Math.max(invoiced - paid, 0)),
      arrears: round(arrears),
    };
  }
}

/** Decimal | number | string, without importing the Prisma Decimal type. */
type AmountLike = { toString(): string } | number | string;