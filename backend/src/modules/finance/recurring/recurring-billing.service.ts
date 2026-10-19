import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AgreementStatus,
  Prisma,
  RecurringRunStatus,
  UtilityChargeStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { UtilityPricingService } from '@/modules/utilities/utility-pricing.service';
import { round2 } from '../invoice-allocation';

/** "2026-10" for a date — the unit a billing period is identified by. */
export function billingPeriodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

interface LeaseToBill {
  id: string;
  rentAmount: Prisma.Decimal;
  currency: string;
  startDate: Date;
  endDate: Date | null;
  paymentDay: number;
  escalationRate: Prisma.Decimal | null;
  escalationMonth: number | null;
  status: AgreementStatus;
  organizationId: string | null;
  tenantId: string;
  tenant?: {
    surname: string;
    otherNames: string | null;
  } | null;
  unit?: {
    id: string;
    code: string | null;
    name: string | null;
    property?: { name: string; bundleUtilitiesWithRent: boolean } | null;
    serviceCharges?: {
      serviceUtilityAmenity: string;
      totalCost: Prisma.Decimal;
    }[];
  } | null;
}

/**
 * Module 7 — Finance & Accounting: recurring rent billing.
 *
 * A scheduler that runs monthly and might run twice — because two instances
 * deployed, because someone pressed the button, because a deploy restarted the
 * process mid-run — must not bill a tenant twice. So idempotency is enforced by
 * the database, not by the job being careful: every generated invoice carries a
 * `billingPeriod`, and there is a unique constraint on
 * `(agreementId, billingPeriod)`. A second attempt fails that constraint
 * and is reported as *skipped*, which is the correct outcome rather than an
 * error to retry.
 *
 * Leases bill on their own `paymentDay`, so the job runs daily and asks which
 * leases are due today — a single monthly run on the 1st would bill everyone on
 * the 1st regardless of what they agreed.
 */
@Injectable()
export class RecurringBillingService {
  private readonly logger = new Logger(RecurringBillingService.name);

  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private pricing: UtilityPricingService,
  ) {}

  /**
   * Bill every organization whose leases are due on `onDate`.
   *
   * Called daily by the scheduler and available as an endpoint, because the
   * first run of a new month should not have to wait for 02:05 — and because
   * running it by hand for one organization is how you recover from a missed
   * day without billing everyone twice (the unique constraint makes that safe).
   */
  async runForAllOrganizations(
    onDate: Date = new Date(),
    triggeredBy?: string,
  ) {
    const organizations = await this.prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const results: Awaited<
      ReturnType<RecurringBillingService['runForOrganization']>
    >[] = [];
    for (const organization of organizations) {
      results.push(
        await this.runForOrganization(organization.id, onDate, triggeredBy),
      );
    }
    return results;
  }

  /**
   * Bill the leases of one organization that fall due on `onDate`.
   *
   * Returns the run record, including a per-lease outcome. One lease failing
   * never aborts the run — a single malformed lease must not stop every other
   * tenant from being billed, which is the difference between a scheduler and a
   * liability.
   */
  async runForOrganization(
    organizationId: string | undefined,
    onDate: Date = new Date(),
    triggeredBy?: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException(
        'A tenant scope is required to bill leases',
      );
    }
    const billingDate = startOfDay(onDate);
    const billingPeriod = billingPeriodOf(billingDate);

    const run = await this.prisma.recurringBillingRun.create({
      data: {
        organizationId,
        billingDate,
        billingPeriod,
        status: RecurringRunStatus.RUNNING,
        triggeredBy,
      },
    });

    const details: Record<string, string> = {};
    let created = 0;
    let skipped = 0;
    let failed = 0;

    const leases = await this.leasesDueOn(organizationId, billingDate);

    for (const lease of leases) {
      const skipReason = this.skipReason(lease, billingDate, billingPeriod);
      if (skipReason) {
        details[lease.id] = `skipped: ${skipReason}`;
        skipped += 1;
        continue;
      }

      try {
        const outcome = await this.billAgreement(
          lease,
          billingDate,
          billingPeriod,
        );
        details[lease.id] = outcome.created
          ? `invoiced ${outcome.invoiceNumber}`
          : 'skipped: already billed for this period';
        if (outcome.created) created += 1;
        else skipped += 1;
      } catch (error) {
        // A unique-constraint failure is the idempotency guard doing its job,
        // not a failure worth alarming anyone about — but only if it is *our*
        // constraint. The invoice-number constraint also exists, and treating a
        // number collision as "already billed" silently loses a tenant's invoice
        // until someone notices the shortfall.
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('billingPeriod')) {
          details[lease.id] = 'skipped: already billed for this period';
          skipped += 1;
        } else {
          details[lease.id] = `failed: ${message.slice(0, 200)}`;
          failed += 1;
        }
      }
    }

    const finished = await this.prisma.recurringBillingRun.update({
      where: { id: run.id },
      data: {
        invoicesCreated: created,
        leasesSkipped: skipped,
        leasesFailed: failed,
        details: details as Prisma.InputJsonObject,
        status:
          failed > 0 ? RecurringRunStatus.FAILED : RecurringRunStatus.COMPLETED,
        finishedAt: new Date(),
        errorMessage: failed > 0 ? `${failed} lease(s) failed` : undefined,
      },
    });

    this.logger.log(
      `Recurring billing ${organizationId} ${billingPeriod}: ${created} created, ${skipped} skipped, ${failed} failed`,
    );

    return finished;
  }

  /**
   * Daily, early: leases bill on their own `paymentDay`, so the job asks which
   * leases are due rather than assuming everyone bills on the 1st.
   */
  @Cron('0 5 2 * * *')
  async scheduledRun() {
    try {
      await this.runForAllOrganizations(new Date());
    } catch (error) {
      this.logger.error(
        `Scheduled recurring billing failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async leasesDueOn(organizationId: string, onDate: Date) {
    return this.prisma.agreement.findMany({
      where: {
        organizationId,
        status: { in: [AgreementStatus.ACTIVE, AgreementStatus.DRAFT] },
        paymentDay: onDate.getDate(),
      },
      include: {
        tenant: { select: { surname: true, otherNames: true } },
        unit: {
          select: {
            id: true,
            code: true,
            name: true,
            property: { select: { name: true, bundleUtilitiesWithRent: true } },
            serviceCharges: {
              select: { serviceUtilityAmenity: true, totalCost: true },
            },
          },
        },
      },
    }) as unknown as Promise<LeaseToBill[]>;
  }

  /**
   * Whether this lease should be billed for this period.
   *
   * The cases that matter in practice: a lease that starts mid-period is billed
   * for the whole period anyway (nobody pro-rates a first month), and a lease
   * that ended before the period began is not billed at all.
   */
  private skipReason(
    lease: LeaseToBill,
    onDate: Date,
    billingPeriod: string,
  ): string | null {
    const periodStart = new Date(
      Number(billingPeriod.slice(0, 4)),
      Number(billingPeriod.slice(5, 7)) - 1,
      1,
    );

    if (lease.startDate > periodStart && startOfDay(lease.startDate) > onDate) {
      return 'lease has not started yet';
    }
    if (lease.endDate && lease.endDate < periodStart)
      return 'lease had already ended';
    if (lease.status === AgreementStatus.EXPIRED) return 'lease expired';
    if (Number(lease.rentAmount) <= 0) return 'no rent on the lease';
    return null;
  }

  /** Build and post one agreement's invoice for the period. */
  private async billAgreement(
    lease: LeaseToBill,
    billingDate: Date,
    billingPeriod: string,
  ): Promise<{ created: boolean; invoiceNumber: string }> {
    const rent = round2(this.rentFor(lease, billingDate));

    const invoiceItems: Array<{
      particular: string;
      revenueExpenseItem: string;
      qty: number;
      unitCost: number;
      lineTotal: number;
    }> = [
      {
        particular: `Rent — ${billingPeriod}`,
        revenueExpenseItem: 'residential_rent',
        qty: 1,
        unitCost: rent,
        lineTotal: rent,
      },
      ...(lease.unit?.serviceCharges ?? [])
        .filter((charge) => Number(charge.totalCost) > 0)
        .map((charge) => ({
          particular: charge.serviceUtilityAmenity,
          revenueExpenseItem: 'service_charge',
          qty: 1,
          unitCost: round2(Number(charge.totalCost)),
          lineTotal: round2(Number(charge.totalCost)),
        })),
    ];

    const utilityChargeIds: string[] = [];

    // When the property bundles metered utilities onto the rent invoice, price
    // each pending utility charge for this agreement's unit and period and append
    // it as a line on this same document. A single combined invoice is created, so
    // the `(agreementId, billingPeriod)` uniqueness guard is never violated: there
    // is one rent invoice per period, utility lines ride on it, and the charges are
    // marked INVOICED against it rather than raised as separate UTILITY invoices.
    if (lease.unit?.property?.bundleUtilitiesWithRent && lease.unit?.id) {
      const charges = await this.prisma.utilityCharge.findMany({
        where: {
          organizationId: lease.organizationId ?? undefined,
          agreementId: lease.id,
          unitId: lease.unit.id,
          billingPeriod,
          status: UtilityChargeStatus.PENDING,
        },
        include: {
          meter: { select: { type: true, meterNumber: true } },
          unit: { select: { code: true, name: true } },
        },
        orderBy: [{ meter: { type: 'asc' } }],
      });

      for (const charge of charges) {
        const priced = await this.pricing.priceStoredCharge(
          lease.organizationId!,
          {
            fromReadingId: charge.fromReadingId,
            toReadingId: charge.toReadingId,
            meterId: charge.meterId,
            ratePerUnit: charge.ratePerUnit,
            currency: charge.currency,
            vatRate: charge.vatRate,
            allocationShare: charge.allocationShare,
            incomeAccount: charge.incomeAccount ?? undefined,
            revenueExpenseItem: charge.revenueExpenseItem ?? undefined,
          },
        );

        const unitLabel = charge.unit ? `${charge.unit.code} units` : 'units';
        invoiceItems.push({
          particular: `${charge.meter.type} consumption - ${priced.billableConsumption ?? priced.meterConsumption} ${unitLabel} at ${Number(charge.ratePerUnit)} ${charge.currency}`,
          revenueExpenseItem: charge.revenueExpenseItem ?? 'utility',
          qty: priced.billableConsumption ?? priced.meterConsumption ?? 0,
          unitCost: round2(Number(charge.ratePerUnit)),
          lineTotal: round2(priced.consumptionAmount ?? priced.subtotal ?? 0),
        });

        utilityChargeIds.push(charge.id);
      }
    }

    const subtotal = round2(
      invoiceItems.reduce((sum, item) => sum + item.lineTotal, 0),
    );

    // Tax is priced by the rules engine (this jurisdiction's rates), so the
    // invoice total is whatever the organization is actually liable to charge.
    const invoice = await this.invoicesService.create(
      {
        transactionClass: 'RENT',
        agreementId: lease.id,
        issueDate: billingDate,
        // Rent falls due on the day it bills, which is the lease's payment day.
        dueDate: billingDate,
        currency: lease.currency,
        billTo: [lease.tenant?.surname, lease.tenant?.otherNames]
          .filter(Boolean)
          .join(' '),
        amount: subtotal,
        totalAmount: subtotal,
        balanceAmount: subtotal,
        memo: `${lease.unit?.property?.name ?? ''} ${lease.unit?.name ?? ''} — ${billingPeriod}`.trim(),
        billingPeriod,
        invoiceItems,
      },
      lease.organizationId ?? undefined,
    );

    // Mark the bundled utility charges INVOICED against this combined document so
    // they are not re-priced or re-billed by the standalone utility billing run.
    if (utilityChargeIds.length > 0) {
      await this.prisma.utilityCharge.updateMany({
        where: { id: { in: utilityChargeIds } },
        data: {
          status: UtilityChargeStatus.INVOICED,
          invoiceId: invoice.id,
        },
      });
    }

    return { created: true, invoiceNumber: invoice.invoiceNumber };
  }

  /**
   * Rent for the period, after any escalation the lease calls for.
   *
   * Escalation is applied only once the lease has been running a full year and
   * only in the month it nominates, so a lease activated in March does not
   * silently jump in its first October.
   */
  private rentFor(lease: LeaseToBill, billingDate: Date): number {
    const base = Number(lease.rentAmount);
    const rate = Number(lease.escalationRate ?? 0);
    const month = billingDate.getMonth() + 1;

    if (
      rate <= 0 ||
      !lease.escalationMonth ||
      lease.escalationMonth !== month
    ) {
      return base;
    }

    const monthsRunning =
      (billingDate.getFullYear() - lease.startDate.getFullYear()) * 12 +
      (month - (lease.startDate.getMonth() + 1));
    if (monthsRunning < 12) return base;

    return round2(base * (1 + rate / 100));
  }

  findRuns(organizationId?: string, limit = 50) {
    return this.prisma.recurringBillingRun.findMany({
      where: organizationId ? { organizationId } : {},
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}
