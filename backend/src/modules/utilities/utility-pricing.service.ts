import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { calculateCharge, consumptionBetween } from './meter-rates';
import type { ChargeCalculation } from './meter-rates';

/**
 * What a stored utility charge is worth.
 *
 * **This lives in its own module because of what it is, not because of how small
 * it is.** The recurring rent run needs to price a metered charge when a property
 * bundles utilities onto the rent invoice, and `UtilitiesService` - which raises
 * utility invoices through `InvoicesService` - is therefore needed *by* Finance.
 * Had the pricing stayed on `UtilitiesService`, Utilities would import Finance
 * (to raise invoices) while Finance imported Utilities (to price a charge), and
 * the two would deadlock each other's dependency graph.
 *
 * Pricing itself needs neither side: a charge holds the *inputs* - which two
 * readings, which share, which rate - and the money is recomputed from those
 * rows every time it is read. So the price is a leaf: `PrismaService` and the
 * pure rules in `meter-rates.ts`, and nothing else. `UtilitiesModule` and
 * `RecurringBillingModule` can both depend on it without either depending on
 * the other.
 *
 * The same rule the whole module follows: a charge stores its inputs, never a
 * copy of the answer, so the answer cannot drift from the readings it came from.
 */
@Injectable()
export class UtilityPricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute a stored charge's money from the rows it names.
   *
   * Typed as a structural minimum rather than a full Prisma payload so both call
   * sites (the charge ledger and the billing run) can pass what they happen to
   * have loaded.
   */
  async priceStoredCharge(
    tenantId: string,
    charge: {
      fromReadingId: string;
      toReadingId: string;
      meterId: string;
      ratePerUnit: Prisma.Decimal;
      currency: string;
      vatRate: Prisma.Decimal | null;
      allocationShare: Prisma.Decimal;
      incomeAccount?: string | null;
      revenueExpenseItem?: string | null;
    },
  ) {
    // Recomputed from the two readings rather than carried on the charge: the
    // consumption is a derivation of those rows, and storing a copy would be a
    // second thing to keep in step with them. The charge stores the *inputs* (which
    // readings, which share, which rate) precisely so this can be reconstructed.
    const [from, to, meter] = await Promise.all([
      this.prisma.meterReading.findFirst({
        where: { id: charge.fromReadingId, organizationId: tenantId },
      }),
      this.prisma.meterReading.findFirst({
        where: { id: charge.toReadingId, organizationId: tenantId },
      }),
      this.prisma.utilityMeter.findFirst({
        where: { id: charge.meterId, organizationId: tenantId },
      }),
    ]);

    if (!from || !to || !meter) {
      throw new ConflictException(
        'The readings this charge was priced from are no longer both present, so the consumption cannot be recomputed. Void the charge and price the period again.',
      );
    }

    const consumption = consumptionBetween(
      Number(from.reading),
      Number(to.reading),
      { digits: meter.digits, digitWrapAt: meter.digitWrapAt },
    );
    if (!consumption.ok) {
      throw new ConflictException(consumption.message);
    }

    const calculated = calculateCharge({
      meterConsumption: consumption.consumption,
      allocationShare: Number(charge.allocationShare),
      rate: {
        currency: charge.currency,
        ratePerUnit: Number(charge.ratePerUnit),
        vatRate: charge.vatRate === null ? null : Number(charge.vatRate),
        incomeAccount: charge.incomeAccount,
        revenueExpenseItem: charge.revenueExpenseItem,
      },
    });

    if (!calculated.ok) {
      throw new ConflictException(calculated.message);
    }

    return calculated.value;
  }

  /**
   * Price many stored charges at once.
   *
   * `priceStoredCharge` costs three queries per charge - the two readings and the
   * meter - because it is called one at a time from the billing run, where there is
   * exactly one charge in hand. A tenant's history is a different shape: one
   * agreement can carry two years of monthly charges, and pricing those one at a
   * time turns a single page into a hundred round trips.
   *
   * So the inputs are loaded once, in two queries, and the arithmetic is the same
   * `consumptionBetween` + `calculateCharge` the single-charge path uses - this is a
   * batching wrapper, not a second implementation of the rules.
   *
   * A charge that cannot be priced (a reading was deleted, the register went
   * backwards) is reported as an error **on that charge** rather than failing the
   * whole page. A tenant whose February charge is unpriceable still has a readable
   * history, and the row says why it is blank.
   */
  async priceStoredCharges(
    tenantId: string,
    charges: Array<{
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
    }>,
  ): Promise<
    Array<{
      chargeId: string;
      pricing: ChargeCalculation | null;
      error: string | null;
    }>
  > {
    if (charges.length === 0) return [];

    const readingIds = [
      ...new Set(charges.flatMap((c) => [c.fromReadingId, c.toReadingId])),
    ];
    const meterIds = [...new Set(charges.map((c) => c.meterId))];

    const [readings, meters] = await Promise.all([
      this.prisma.meterReading.findMany({
        where: { id: { in: readingIds }, organizationId: tenantId },
      }),
      this.prisma.utilityMeter.findMany({
        where: { id: { in: meterIds }, organizationId: tenantId },
      }),
    ]);

    const readingById = new Map(readings.map((r) => [r.id, r]));
    const meterById = new Map(meters.map((m) => [m.id, m]));

    return charges.map((charge) => {
      const from = readingById.get(charge.fromReadingId);
      const to = readingById.get(charge.toReadingId);
      const meter = meterById.get(charge.meterId);

      if (!from || !to || !meter) {
        return {
          chargeId: charge.id,
          pricing: null,
          error:
            'The readings this charge was priced from are no longer both present, so the consumption cannot be recomputed. Void the charge and price the period again.',
        };
      }

      const consumption = consumptionBetween(
        Number(from.reading),
        Number(to.reading),
        { digits: meter.digits, digitWrapAt: meter.digitWrapAt },
      );
      if (!consumption.ok) {
        return {
          chargeId: charge.id,
          pricing: null,
          error: consumption.message,
        };
      }

      const calculated = calculateCharge({
        meterConsumption: consumption.consumption,
        allocationShare: Number(charge.allocationShare),
        rate: {
          currency: charge.currency,
          ratePerUnit: Number(charge.ratePerUnit),
          vatRate: charge.vatRate === null ? null : Number(charge.vatRate),
          incomeAccount: charge.incomeAccount,
          revenueExpenseItem: charge.revenueExpenseItem,
        },
      });

      if (!calculated.ok) {
        return {
          chargeId: charge.id,
          pricing: null,
          error: calculated.message,
        };
      }

      return { chargeId: charge.id, pricing: calculated.value, error: null };
    });
  }
}
