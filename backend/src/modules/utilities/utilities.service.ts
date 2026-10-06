import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  ApportionmentMethod,
  MeterScope,
  MeterStatus,
  Prisma,
  UtilityChargeStatus,
  UtilityType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { InvoicesService } from '@/modules/finance/invoices/invoices.service';
import {
  apportion,
  calculateCharge,
  consumptionBetween,
  presentReading,
  resolveRate,
  utcPeriodWindow,
  type ApportionableUnit,
  type RateInput,
  type RolloverConfig,
} from './meter-rates';
import type {
  BillPeriodDto,
  ChargeQueryDto,
  CreateMeterDto,
  CreateRateDto,
  CreateReadingDto,
  MeterQueryDto,
  RateQueryDto,
  ReadingQueryDto,
  UpdateMeterDto,
  UpdateReadingDto,
  VoidChargeDto,
} from './dto/utilities.dto';

/**
 * Module 14 - Utilities.
 *
 * Three jobs, kept in one service because they share the same correctness rules and
 * splitting them would put half of each rule in each file:
 *
 * 1. **The meter register.** A meter belongs to a property, optionally serves one
 *    unit, and is either a sub-meter or a bulk meter whose consumption has to be
 *    divided before anybody can be billed for it.
 * 2. **Readings.** One register value at one moment. Consumption is derived by
 *    pairing a reading with the one before it, never stored.
 * 3. **Billing.** Resolve the tariff, apportion a bulk meter, price it, and raise a
 *    real `Invoice` through `Finance`'s `InvoicesService`.
 *
 * Two structural decisions the rest of this file depends on:
 *
 * **Consumption bills go through `InvoicesService.create`, never a direct
 * `invoice.create`.** The same seam procurement's supplier bills and sales
 * instalments use, so tax, numbering and the GL posting all happen the same way for
 * a utility bill as for a rent bill. What the utility module then does *not* do is
 * set `Invoice.billingPeriod`: `invoices` carries
 * `@@unique([rentalAgreementId, billingPeriod])` because a lease has one rent bill
 * per month, and `recurring-billing.service.ts` relies on a duplicate being reported
 * as *skipped*. A utility invoice claiming that key would make the rent run skip the
 * month and the resident never be billed rent at all. The period lives on
 * `UtilityCharge.billingPeriod` instead, and the charge is what the invoice links
 * back to.
 *
 * **The exactly-once guard is a database index, not a check.** `billPeriod` reads
 * the period first so it can name the conflict in a sentence, but two concurrent
 * runs both pass that read, and `utility_charges_meterId_unitId_billingPeriod_key`
 * is what actually makes it impossible to hand a resident two bills for one month's
 * water. The service check exists to explain; the constraint is what enforces.
 */
@Injectable()
export class UtilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  // ---------------------------------------------------------------- meters

  async createMeter(tenantId: string, dto: CreateMeterDto) {
    const propertyId = await this.requireProperty(tenantId, dto.propertyId);
    const unitId = dto.unitId
      ? await this.requireUnitForProperty(tenantId, dto.unitId, propertyId)
      : null;
    const scope = dto.scope ?? MeterScope.SUBMETER;

    // The shape rule, refused in a sentence rather than by a constraint violation.
    // `utility_meters_bulk_needs_method` enforces exactly this in the database; the
    // service check exists so the caller gets a reason rather than a 500.
    this.assertScopeShape(scope, unitId, dto.apportionmentMethod);
    this.assertRolloverShape(dto.digits, dto.digitWrapAt);
    if (
      dto.apportionmentMethod === ApportionmentMethod.MANUAL &&
      !dto.apportionmentWeights
    ) {
      throw new BadRequestException(
        'A negotiated split has to record the split. Add the weights per unit, or choose a different method.',
      );
    }

    const duplicate = await this.prisma.utilityMeter.findFirst({
      where: {
        organizationId: tenantId,
        type: dto.type,
        meterNumber: dto.meterNumber,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `Meter number ${dto.meterNumber} is already registered against a ${dto.type.toLowerCase()} meter. A meter number is issued by the utility company and identifies one physical device, so registering it twice is how a building's consumption ends up looking like double what it is.`,
      );
    }

    return this.prisma.utilityMeter.create({
      data: {
        organizationId: tenantId,
        propertyId,
        unitId,
        type: dto.type,
        meterNumber: dto.meterNumber,
        serialNumber: dto.serialNumber,
        source: dto.source,
        scope,
        apportionmentMethod:
          scope === MeterScope.BULK ? dto.apportionmentMethod : null,
        apportionmentWeights: dto.apportionmentWeights as
          | Prisma.InputJsonValue
          | undefined,
        digits: dto.digits,
        digitWrapAt: dto.digitWrapAt,
        lastBilledThrough: dto.lastBilledThrough
          ? new Date(dto.lastBilledThrough)
          : null,
        readingSetup: dto.readingSetup,
      },
      include: this.meterInclude(),
    });
  }

  async findAllMeters(tenantId: string, query: MeterQueryDto) {
    const where: Prisma.UtilityMeterWhereInput = {
      organizationId: tenantId,
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.status ? { status: query.status as MeterStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { meterNumber: { contains: query.search, mode: 'insensitive' } },
              { serialNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const meters = await this.prisma.utilityMeter.findMany({
      where,
      include: {
        ...this.meterInclude(),
        _count: { select: { readings: true, charges: true } },
      },
      orderBy: [{ propertyId: 'asc' }, { type: 'asc' }, { meterNumber: 'asc' }],
    });

    return meters.map((m) => this.shapeMeter(m));
  }

  async findOneMeter(tenantId: string, id: string) {
    const meter = await requireRecord(
      this.prisma.utilityMeter.findFirst({
        where: { id, organizationId: tenantId },
        include: {
          ...this.meterInclude(),
          _count: { select: { readings: true, charges: true } },
        },
      }),
      'Meter',
    );

    const readings = await this.prisma.meterReading.findMany({
      where: { meterId: id, organizationId: tenantId },
      orderBy: { readingDate: 'desc' },
      take: 24,
    });

    const shaped = this.shapeMeter(meter);
    const rollover: RolloverConfig = {
      digits: meter.digits,
      digitWrapAt: meter.digitWrapAt,
    };

    // The derived pair the module doc asked for, presented rather than stored: each
    // reading is shown against the one before it, with the consumption between them.
    const chronologically = [...readings].reverse();
    const ledger = chronologically.map((reading, i) =>
      presentReading(
        i === 0
          ? null
          : {
              reading: Number(chronologically[i - 1].reading),
              readingDate: chronologically[i - 1].readingDate,
            },
        { reading: Number(reading.reading), readingDate: reading.readingDate },
        rollover,
      ),
    );

    return { ...shaped, readings: ledger.reverse() };
  }

  async updateMeter(tenantId: string, id: string, dto: UpdateMeterDto) {
    const existing = await requireRecord(
      this.prisma.utilityMeter.findFirst({
        where: { id, organizationId: tenantId },
      }),
      'Meter',
    );

    const propertyId = dto.propertyId
      ? await this.requireProperty(tenantId, dto.propertyId)
      : existing.propertyId;
    const unitId = dto.unitId !== undefined ? dto.unitId : existing.unitId;
    const scope = dto.scope ?? existing.scope;
    const method =
      dto.apportionmentMethod !== undefined
        ? dto.apportionmentMethod
        : existing.apportionmentMethod;
    const weights =
      dto.apportionmentWeights !== undefined
        ? dto.apportionmentWeights
        : existing.apportionmentWeights;

    // Both columns are read from the *merged* row rather than the DTO, because
    // clearing one and setting the other is exactly the configuration the database
    // refuses, and it has to be refused whichever order the client sent them in.
    const digits = dto.digits !== undefined ? dto.digits : existing.digits;
    const digitWrapAt =
      dto.digitWrapAt !== undefined ? dto.digitWrapAt : existing.digitWrapAt;
    this.assertScopeShape(
      scope,
      scope === MeterScope.SUBMETER ? unitId : null,
      method,
    );
    this.assertRolloverShape(digits, digitWrapAt);
    if (method === ApportionmentMethod.MANUAL && !weights) {
      throw new BadRequestException(
        'A negotiated split has to record the split.',
      );
    }

    if (unitId && scope === MeterScope.SUBMETER) {
      await this.requireUnitForProperty(tenantId, unitId, propertyId);
    }

    if (dto.meterNumber && dto.meterNumber !== existing.meterNumber) {
      const type = dto.type ?? existing.type;
      const duplicate = await this.prisma.utilityMeter.findFirst({
        where: {
          organizationId: tenantId,
          type,
          meterNumber: dto.meterNumber,
          NOT: { id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          `Meter number ${dto.meterNumber} is already registered against a ${type.toLowerCase()} meter.`,
        );
      }
    }

    return this.prisma.utilityMeter.update({
      where: { id },
      data: {
        propertyId,
        unitId: scope === MeterScope.BULK ? null : unitId,
        type: dto.type,
        meterNumber: dto.meterNumber,
        serialNumber: dto.serialNumber,
        source: dto.source,
        scope,
        apportionmentMethod: scope === MeterScope.BULK ? method : null,
        apportionmentWeights: weights as Prisma.InputJsonValue | undefined,
        digits,
        digitWrapAt,
        lastBilledThrough: dto.lastBilledThrough
          ? new Date(dto.lastBilledThrough)
          : null,
        readingSetup: dto.readingSetup,
      },
      include: this.meterInclude(),
    });
  }

  /** Retire a meter through a named action, so `status` is not in any update DTO. */
  async retireMeter(tenantId: string, id: string) {
    const meter = await requireRecord(
      this.prisma.utilityMeter.findFirst({
        where: { id, organizationId: tenantId },
      }),
      'Meter',
    );

    if (meter.scope === MeterScope.BULK && meter.status === 'ACTIVE') {
      const unbilled = await this.prisma.utilityCharge.count({
        where: { meterId: id, status: UtilityChargeStatus.PENDING },
      });
      if (unbilled > 0) {
        throw new ConflictException(
          `This meter has ${unbilled} period${unbilled === 1 ? '' : 's'} priced but not yet invoiced. Bill or void ${unbilled === 1 ? 'it' : 'them'} first - retiring the meter would leave the consumption measured and nothing explaining what it cost.`,
        );
      }
    }

    return this.prisma.utilityMeter.update({
      where: { id },
      data: { status: 'RETIRED' },
      include: this.meterInclude(),
    });
  }

  // -------------------------------------------------------------- readings

  async createReading(
    tenantId: string,
    dto: CreateReadingDto,
    userId?: string,
  ) {
    const meter = await this.requireMeter(tenantId, dto.meterId);

    if (meter.status === 'RETIRED') {
      throw new ConflictException(
        'This meter has been retired, so it is no longer read. Retire it in the register only once the last bill that depends on it has been raised.',
      );
    }

    const readingDate = new Date(dto.readingDate);

    const clash = await this.prisma.meterReading.findUnique({
      where: { meterId_readingDate: { meterId: meter.id, readingDate } },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        `A reading for this meter on ${readingDate.toISOString().slice(0, 10)} already exists. Correct that reading rather than adding a second one - two readings on one day is how a period gets billed twice.`,
      );
    }

    const reading = await this.prisma.meterReading.create({
      data: {
        organizationId: tenantId,
        meterId: meter.id,
        readingDate,
        reading: new Prisma.Decimal(dto.reading),
        source: dto.source,
        note: dto.note,
        recordedByUserId: userId,
      },
    });

    return this.shapeReading(reading, meter);
  }

  async createReadingsBulk(
    tenantId: string,
    dtos: CreateReadingDto[],
    userId?: string,
  ) {
    // Per-row outcomes rather than all-or-nothing: a clipboard of forty meters
    // failing entirely because one meter number was mistyped is not a useful result,
    // and the caller needs to know which row to fix.
    const created: unknown[] = [];
    const failed: Array<{
      readingDate: string;
      meterId: string;
      message: string;
    }> = [];

    for (const dto of dtos) {
      try {
        created.push(await this.createReading(tenantId, dto, userId));
      } catch (err) {
        failed.push({
          readingDate: dto.readingDate,
          meterId: dto.meterId,
          message:
            (err as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ?? 'Could not record this reading.',
        });
      }
    }

    return { created: created.length, failed, readings: created };
  }

  async findAllReadings(tenantId: string, query: ReadingQueryDto) {
    const readings = await this.prisma.meterReading.findMany({
      where: {
        organizationId: tenantId,
        ...(query.meterId ? { meterId: query.meterId } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.from ? { readingDate: { gte: new Date(query.from) } } : {}),
        ...(query.to ? { readingDate: { lte: new Date(query.to) } } : {}),
      },
      include: {
        meter: {
          select: {
            id: true,
            meterNumber: true,
            type: true,
            digits: true,
            digitWrapAt: true,
            propertyId: true,
          },
        },
      },
      orderBy: [{ readingDate: 'desc' }],
      take: 500,
    });

    return readings.map((r) => this.shapeReading(r, r.meter));
  }

  async updateReading(tenantId: string, id: string, dto: UpdateReadingDto) {
    await requireRecord(
      this.prisma.meterReading.findFirst({
        where: { id, organizationId: tenantId },
      }),
      'Reading',
    );
    const meter = await requireRecord(
      this.prisma.utilityMeter.findFirst({
        where: { readings: { some: { id } }, organizationId: tenantId },
      }),
      'Meter',
    );

    const readingDate = dto.readingDate ? new Date(dto.readingDate) : undefined;
    if (readingDate) {
      const clash = await this.prisma.meterReading.findUnique({
        where: { meterId_readingDate: { meterId: meter.id, readingDate } },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException(
          `This meter already has a reading on ${readingDate.toISOString().slice(0, 10)}.`,
        );
      }
    }

    // A charge that already quoted this reading cannot have its input edited: the
    // invoice line carries the consumption and the rate that were derived from it,
    // and a corrected reading would silently disagree with a document a resident has
    // already been sent.
    const invoiced = await this.prisma.utilityCharge.count({
      where: {
        status: UtilityChargeStatus.INVOICED,
        OR: [{ fromReadingId: id }, { toReadingId: id }],
      },
    });
    if (invoiced > 0) {
      throw new ConflictException(
        `This reading has already been billed on ${invoiced} invoice${invoiced === 1 ? '' : 's'}. Void ${invoiced === 1 ? 'that charge' : 'those charges'} first, then correct the reading and bill again - otherwise the corrected figure and the resident's invoice would disagree.`,
      );
    }

    const reading = await this.prisma.meterReading.update({
      where: { id },
      data: {
        reading:
          dto.reading !== undefined
            ? new Prisma.Decimal(dto.reading)
            : undefined,
        readingDate,
        source: dto.source,
        note: dto.note,
      },
    });

    return this.shapeReading(reading, meter);
  }

  // ----------------------------------------------------------------- rates

  async createRate(tenantId: string, dto: CreateRateDto) {
    if (dto.meterId) await this.requireMeter(tenantId, dto.meterId);
    if (dto.propertyId) await this.requireProperty(tenantId, dto.propertyId);

    if (
      dto.spotRate !== undefined &&
      (!dto.purchaseCurrency || dto.purchaseCurrency === dto.currency)
    ) {
      throw new BadRequestException(
        'A spot rate is only meaningful when the utility company bills the estate in a different currency from the one residents are billed in.',
      );
    }

    const validFrom = new Date(dto.validFrom);

    const overlapping = await this.prisma.utilityRate.findFirst({
      where: {
        organizationId: tenantId,
        type: dto.type,
        meterId: dto.meterId ?? null,
        propertyId: dto.propertyId ?? null,
        validTo: null,
        validFrom: { lte: validFrom },
      },
      select: { id: true },
    });
    if (overlapping) {
      throw new ConflictException(
        'Another tariff is already open for this utility and scope. Supersede it instead of adding a second open rate - two open rates make every bill ambiguous.',
      );
    }

    return this.prisma.utilityRate.create({
      data: {
        organizationId: tenantId,
        meterId: dto.meterId ?? null,
        propertyId: dto.propertyId ?? null,
        type: dto.type,
        currency: dto.currency ?? 'KES',
        ratePerUnit: new Prisma.Decimal(dto.ratePerUnit),
        standingCharge: new Prisma.Decimal(dto.standingCharge ?? 0),
        prorateStandingCharge: dto.prorateStandingCharge ?? false,
        purchaseCurrency: dto.purchaseCurrency,
        spotRate:
          dto.spotRate !== undefined ? new Prisma.Decimal(dto.spotRate) : null,
        vatRate:
          dto.vatRate !== undefined ? new Prisma.Decimal(dto.vatRate) : null,
        incomeAccount: dto.incomeAccount,
        revenueExpenseItem: dto.revenueExpenseItem,
        validFrom,
      },
    });
  }

  /**
   * Supersede a tariff: close the open one and open its replacement.
   *
   * The old row is never edited in place. A bill raised in March must still be
   * explicable after the April tariff, which is the same rule `TaxRule` and
   * `PayrollRule` follow.
   */
  async supersedeRate(
    tenantId: string,
    id: string,
    ratePerUnit: number,
    validTo: string,
  ) {
    const rate = await requireRecord(
      this.prisma.utilityRate.findFirst({
        where: { id, organizationId: tenantId },
      }),
      'Rate',
    );
    const cutoff = new Date(validTo);

    if (cutoff.getTime() <= rate.validFrom.getTime()) {
      throw new BadRequestException(
        'A tariff cannot stop applying before it started applying.',
      );
    }

    const next = await this.prisma.$transaction(async (tx) => {
      await tx.utilityRate.update({ where: { id }, data: { validTo: cutoff } });
      return tx.utilityRate.create({
        data: {
          organizationId: tenantId,
          meterId: rate.meterId,
          propertyId: rate.propertyId,
          type: rate.type,
          currency: rate.currency,
          ratePerUnit: new Prisma.Decimal(ratePerUnit),
          standingCharge: rate.standingCharge,
          prorateStandingCharge: rate.prorateStandingCharge,
          purchaseCurrency: rate.purchaseCurrency,
          spotRate: rate.spotRate,
          vatRate: rate.vatRate,
          incomeAccount: rate.incomeAccount,
          revenueExpenseItem: rate.revenueExpenseItem,
          validFrom: cutoff,
        },
      });
    });

    return { superseded: rate.id, rate: next };
  }

  async findAllRates(tenantId: string, query: RateQueryDto) {
    return this.prisma.utilityRate.findMany({
      where: {
        organizationId: tenantId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.meterId ? { meterId: query.meterId } : {}),
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
        ...(query.at
          ? {
              validFrom: { lte: new Date(query.at) },
              OR: [{ validTo: null }, { validTo: { gt: new Date(query.at) } }],
            }
          : {}),
      },
      include: {
        meter: { select: { id: true, meterNumber: true } },
        property: { select: { id: true, name: true } },
      },
      orderBy: [{ type: 'asc' }, { validFrom: 'desc' }],
    });
  }

  // --------------------------------------------------------------- billing

  /**
   * Price one meter's consumption for one period and raise the invoice.
   *
   * The acceptance criterion, end to end: a reading exists, a tariff exists, the two
   * readings that bracket the period are found, consumption is derived, a bulk
   * meter is apportioned, and the result is put on a real invoice through Finance.
   */
  async billPeriod(tenantId: string, dto: BillPeriodDto, userId?: string) {
    const meter = await this.requireMeter(tenantId, dto.meterId);

    const window = periodFromPeriodKey(dto.billingPeriod);
    const { from: periodFrom, to: periodTo } = window;

    const bracket = await this.readingsBracketing(
      tenantId,
      meter.id,
      periodFrom,
      periodTo,
    );
    if (!bracket.opening) {
      throw new ConflictException(
        `There is no reading at or before ${dto.billingPeriod}-01 to measure ${dto.billingPeriod} from. Record this meter's opening reading for the period and run billing again - consumption is the difference between two readings, so one reading alone prices nothing.`,
      );
    }
    if (!bracket.closing) {
      throw new ConflictException(
        `There is no reading at or before ${dto.billingPeriod}-01 to measure ${dto.billingPeriod} up to. Record the closing reading for the period and run billing again.`,
      );
    }
    if (bracket.opening.id === bracket.closing.id) {
      // The inclusive bounds mean a lone reading serves as both ends of the window,
      // so this is the "no measurement at all" case rather than a period of zero
      // consumption. Billing it would raise a nil invoice that looks like a real one.
      throw new ConflictException(
        `The only reading of this meter on or before the end of ${dto.billingPeriod} is the one taken on ${bracket.opening.readingDate.toISOString().slice(0, 10)}, so nothing in ${dto.billingPeriod} has actually been measured. Consumption is the difference between two readings - record the closing one and run billing again.`,
      );
    }

    const rollover: RolloverConfig = {
      digits: meter.digits,
      digitWrapAt: meter.digitWrapAt,
    };
    const consumption = consumptionBetween(
      Number(bracket.opening.reading),
      Number(bracket.closing.reading),
      rollover,
    );
    if (!consumption.ok) {
      throw new ConflictException(consumption.message);
    }

    const targets = await this.billingTargets(
      tenantId,
      meter,
      dto.billingPeriod,
      dto.unitId,
    );

    const priced: Array<{
      unitId: string | null;
      share: number;
      total: number;
    }> = [];
    for (const target of targets) {
      const rate = await this.rateInForce(tenantId, meter, periodFrom);
      if (!rate) {
        throw new ConflictException(
          `No tariff applies to this meter on ${dto.billingPeriod}-01, so ${consumption.consumption} units of ${meter.type.toLowerCase()} cannot be priced. Set a rate for the utility and run billing again.`,
        );
      }

      const calculated = calculateCharge({
        meterConsumption: consumption.consumption,
        allocationShare: target.share,
        rate,
      });
      if (!calculated.ok) {
        throw new ConflictException(calculated.message);
      }

      // The read-then-insert here names the conflict; the unique index below is what
      // makes it impossible under concurrency.
      const existing = await this.prisma.utilityCharge.findFirst({
        where: {
          meterId: meter.id,
          unitId: target.unitId,
          billingPeriod: dto.billingPeriod,
        },
        select: { id: true, status: true, invoiceId: true },
      });
      if (existing) {
        throw new ConflictException(
          `This meter's ${dto.billingPeriod} consumption for the unit has already been charged (${existing.status.toLowerCase()}${existing.invoiceId ? ', on an invoice' : ', not yet invoiced'}). Void that charge first if the figures were wrong.`,
        );
      }

      // The unique index below is what makes this exactly-once; this read exists only
      // so the refusal can name the charge that already exists.
      await this.prisma.utilityCharge.create({
        data: {
          organizationId: tenantId,
          meterId: meter.id,
          unitId: target.unitId,
          rentalAgreementId: target.rentalAgreementId,
          fromReadingId: bracket.opening.id,
          toReadingId: bracket.closing.id,
          rateId: rate.id ?? null,
          ratePerUnit: new Prisma.Decimal(rate.ratePerUnit),
          currency: rate.currency,
          spotRate:
            rate.spotRate !== undefined
              ? new Prisma.Decimal(rate.spotRate)
              : null,
          vatRate: rate.vatRate ?? null,
          incomeAccount: rate.incomeAccount ?? null,
          revenueExpenseItem: rate.revenueExpenseItem ?? null,
          allocationShare: new Prisma.Decimal(target.share),
          allocationBasis: target.basis,
          billingPeriod: dto.billingPeriod,
          createdByUserId: userId,
        },
      });

      priced.push({
        unitId: target.unitId,
        share: target.share,
        total: calculated.value.total,
      });
    }

    return {
      billingPeriod: dto.billingPeriod,
      meter: {
        id: meter.id,
        meterNumber: meter.meterNumber,
        type: meter.type,
        scope: meter.scope,
      },
      meterConsumption: consumption.consumption,
      rolledOver: consumption.rolledOver,
      periodFrom: periodFrom.toISOString(),
      periodTo: periodTo.toISOString(),
      charges: priced,
    };
  }

  /**
   * Price the period *and* put it on an invoice.
   *
   * Two actions rather than one, because they can fail independently: a charge can
   * be priced and reviewed before money is asked for, which is also what makes a
   * wrong bill correctable without a credit note.
   */
  async billAndInvoice(tenantId: string, dto: BillPeriodDto, userId?: string) {
    const priced = await this.billPeriod(tenantId, dto, userId);

    const charges = await this.prisma.utilityCharge.findMany({
      where: {
        organizationId: tenantId,
        billingPeriod: dto.billingPeriod,
        meterId: priced.meter.id,
        status: UtilityChargeStatus.PENDING,
      },
      include: {
        meter: { select: { id: true, meterNumber: true, type: true } },
        unit: { select: { id: true, code: true, name: true } },
      },
    });

    const invoiced: Array<{
      chargeId: string;
      invoiceId: string;
      invoiceNumber: string;
      total: number;
      unitCode: string | null;
    }> = [];
    const unbilled: Array<{
      chargeId: string;
      unitCode: string | null;
      reason: string;
    }> = [];

    for (const charge of charges) {
      const lease = charge.rentalAgreementId
        ? await this.prisma.rentalAgreement.findUnique({
            where: { id: charge.rentalAgreementId },
            select: {
              id: true,
              tenant: { select: { surname: true, otherNames: true } },
            },
          })
        : null;

      if (!lease) {
        // The consumption was measured and priced; there is simply nobody under a
        // lease to ask for it. Reported rather than silently dropped, because a
        // vacant unit's water is a real cost that somebody has to decide about -
        // see open item 7 in the module doc.
        unbilled.push({
          chargeId: charge.id,
          unitCode: charge.unit?.code ?? null,
          reason:
            'The unit has no active rental agreement, so there is nobody to invoice. The charge is priced and waiting.',
        });
        continue;
      }

      const calculation = await this.priceStoredCharge(tenantId, charge);

      const issueDate = new Date();
      const dueDate = new Date(
        issueDate.getTime() + (dto.dueInDays ?? 14) * 86_400_000,
      );

      const unitLabel = charge.unit ? `${charge.unit.code} units` : 'units';
      const billTo =
        [lease.tenant?.surname, lease.tenant?.otherNames]
          .filter(Boolean)
          .join(' ')
          .trim() || undefined;

      const invoice = await this.invoicesService.create(
        {
          rentalAgreementId: lease.id,
          // The class the frontend's invoice filters can recognise. Deliberately NOT
          // `billingPeriod` - see the file header: setting it would make the
          // recurring rent run skip this month.
          transactionClass: 'UTILITY',
          issueDate,
          dueDate,
          currency: charge.currency,
          billTo,
          memo: `${charge.meter.type} consumption for ${charge.billingPeriod} - meter ${charge.meter.meterNumber}${charge.unit ? ` (${charge.unit.code})` : ''}`,
          amount: calculation.subtotal,
          vatAmount: calculation.vatAmount || undefined,
          totalAmount: calculation.total,
          balanceAmount: calculation.total,
          invoiceItems: [
            {
              // The particular reads on the invoice a resident actually receives, so
              // it names the consumption and the rate rather than just the utility.
              particular: `${charge.meter.type} consumption - ${calculation.billableConsumption} ${unitLabel} at ${Number(charge.ratePerUnit)} ${charge.currency}`,
              qty: calculation.billableConsumption,
              unitCost: Number(charge.ratePerUnit),
              lineTotal: calculation.consumptionAmount,
              taxRate:
                charge.vatRate === null ? undefined : Number(charge.vatRate),
              taxAmount: calculation.vatAmount || undefined,
              incomeAccount: charge.incomeAccount ?? undefined,
              className: charge.revenueExpenseItem ?? undefined,
            },
          ],
        },
        tenantId,
      );

      await this.prisma.utilityCharge.update({
        where: { id: charge.id },
        data: { invoiceId: invoice.id, status: UtilityChargeStatus.INVOICED },
      });

      invoiced.push({
        chargeId: charge.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        total: calculation.total,
        unitCode: charge.unit?.code ?? null,
      });
    }

    return { ...priced, invoices: invoiced, unbilled };
  }

  // --------------------------------------------------------------- charges

  async findAllCharges(tenantId: string, query: ChargeQueryDto) {
    const charges = await this.prisma.utilityCharge.findMany({
      where: {
        organizationId: tenantId,
        ...(query.unitId ? { unitId: query.unitId } : {}),
        ...(query.billingPeriod ? { billingPeriod: query.billingPeriod } : {}),
        ...(query.status
          ? { status: query.status as UtilityChargeStatus }
          : {}),
      },
      include: {
        meter: {
          select: { id: true, meterNumber: true, type: true, scope: true },
        },
        unit: { select: { id: true, code: true, name: true } },
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
    });

    // The money is recomputed from the two readings the charge names, not read off a
    // column - which is why a charge stores its readings and its share rather than
    // its own copy of the arithmetic.
    const shaped: Array<Record<string, unknown>> = [];
    for (const charge of charges) {
      const priced = await this.priceStoredCharge(tenantId, charge);
      shaped.push({ ...this.shapeCharge(charge), ...priced });
    }

    return shaped;
  }

  async voidCharge(
    tenantId: string,
    id: string,
    dto: VoidChargeDto,
    userId?: string,
  ) {
    const charge = await requireRecord(
      this.prisma.utilityCharge.findFirst({
        where: { id, organizationId: tenantId },
        include: {
          invoice: { select: { id: true, invoiceNumber: true, status: true } },
        },
      }),
      'Charge',
    );

    if (charge.status === UtilityChargeStatus.VOID) {
      throw new ConflictException(
        `This charge was already voided${charge.voidedAt ? ` on ${charge.voidedAt.toISOString().slice(0, 10)}` : ''}${charge.voidReason ? `: "${charge.voidReason}"` : ''}.`,
      );
    }

    if (charge.status === UtilityChargeStatus.INVOICED && charge.invoice) {
      // Voiding a charge that is already on a document is not this module's call.
      // Finance owns cancelling an invoice and reversing its GL entry, and the two
      // would otherwise drift apart.
      throw new ConflictException(
        `This charge is on invoice ${charge.invoice.invoiceNumber}. Cancel that invoice in Finance first - a void here cannot reverse the journal entry the invoice posted.`,
      );
    }

    // The reason is stored rather than validated and dropped, so the write-off still
    // explains itself long after whoever approved it has moved on.
    return this.prisma.utilityCharge.update({
      where: { id },
      data: {
        status: UtilityChargeStatus.VOID,
        voidReason: dto.reason,
        voidedAt: new Date(),
        voidedByUserId: userId ?? null,
      },
      include: {
        meter: {
          select: { id: true, meterNumber: true, type: true, scope: true },
        },
      },
    });
  }

  // --------------------------------------------------------------- exports

  async metersCsv(tenantId: string, query: MeterQueryDto): Promise<string> {
    const rows = await this.findAllMeters(tenantId, query);
    return toCsv(
      [
        'Meter',
        'Type',
        'Scope',
        'Property',
        'Unit',
        'Status',
        'Readings',
        'Charges',
        'Billed to',
      ],
      rows.map((m) => ({
        Meter: m.meterNumber,
        Type: m.type,
        Scope: m.scope,
        Property: m.propertyName,
        Unit: m.unitCode ?? '',
        Status: m.status,
        Readings: m.readingCount,
        Charges: m.chargeCount,
        'Billed to': m.billsTo,
      })),
    );
  }

  async readingsCsv(tenantId: string, query: ReadingQueryDto): Promise<string> {
    const rows = await this.findAllReadings(tenantId, query);
    return toCsv(
      [
        'Date',
        'Meter',
        'Type',
        'Reading',
        'Previous',
        'Consumption',
        'Rolled over',
        'Source',
        'Note',
      ],
      rows.map((r) => ({
        Date: r.readingDate,
        Meter: r.meterNumber,
        Type: r.type,
        Reading: r.currentReading,
        Previous: r.previousReading ?? '',
        Consumption: r.consumption ?? '',
        'Rolled over': r.rolledOver ? 'yes' : 'no',
        Source: r.source,
        Note: r.note ?? '',
      })),
    );
  }

  async chargesCsv(tenantId: string, query: ChargeQueryDto): Promise<string> {
    const rows = await this.findAllCharges(tenantId, query);
    return toCsv(
      [
        'Period',
        'Meter',
        'Type',
        'Unit',
        'Share',
        'Basis',
        'Consumption',
        'Rate',
        'Currency',
        'Subtotal',
        'VAT',
        'Total',
        'Status',
        'Invoice',
      ],
      rows.map((c) => ({
        Period: c.billingPeriod,
        Meter: c.meterNumber,
        Type: c.type,
        Unit: c.unitCode ?? '',
        Share: c.allocationShare,
        Basis: c.allocationBasis ?? '',
        Consumption: c.billableConsumption,
        Rate: c.ratePerUnit,
        Currency: c.currency,
        Subtotal: c.subtotal,
        VAT: c.vatAmount,
        Total: c.total,
        Status: c.status,
        Invoice: c.invoiceNumber ?? '',
      })),
    );
  }

  // ------------------------------------------------------------- internals

  private meterInclude() {
    return {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, code: true, name: true, areaSqFt: true } },
    } as const;
  }

  private async requireMeter(tenantId: string, id: string) {
    return requireRecord(
      this.prisma.utilityMeter.findFirst({
        where: { id, organizationId: tenantId },
        include: this.meterInclude(),
      }),
      'Meter',
    );
  }

  private async requireProperty(tenantId: string, id: string) {
    await requireRecord(
      this.prisma.property.findFirst({
        where: { id, organizationId: tenantId },
        select: { id: true },
      }),
      'Property',
    );
    return id;
  }

  /**
   * `Unit` carries no `organizationId` (master doc issue 25), so a unit is scoped
   * through its property - which is also the check that stops a meter being attached
   * to a unit belonging to somebody else's estate.
   */
  private async requireUnitForProperty(
    tenantId: string,
    unitId: string,
    propertyId: string,
  ) {
    await requireRecord(
      this.prisma.unit.findFirst({
        where: {
          id: unitId,
          property: { organizationId: tenantId, id: propertyId },
        },
        select: { id: true },
      }),
      'Unit',
    );
    return unitId;
  }

  private assertScopeShape(
    scope: MeterScope,
    unitId: string | null | undefined,
    method: ApportionmentMethod | null | undefined,
  ) {
    if (scope === MeterScope.BULK) {
      if (unitId) {
        throw new BadRequestException(
          'A bulk meter feeds many units, so it cannot be attached to one. Clear the unit, or register this as a sub-meter if it serves a single unit.',
        );
      }
      if (!method) {
        throw new BadRequestException(
          'A bulk meter needs to say how its consumption is divided before it can be billed. Choose area, equal split, occupancy days or a negotiated split - the module will not pick one for you, because each produces a different bill.',
        );
      }
    } else if (method) {
      throw new BadRequestException(
        'A sub-meter serves one unit, so there is nothing to divide and no apportionment method belongs on it.',
      );
    }
  }

  private assertRolloverShape(
    digits: number | null | undefined,
    digitWrapAt: number | null | undefined,
  ) {
    if (
      (digits === null || digits === undefined) &&
      (digitWrapAt === null || digitWrapAt === undefined)
    )
      return;

    if (
      digits === null ||
      digits === undefined ||
      digitWrapAt === null ||
      digitWrapAt === undefined
    ) {
      throw new BadRequestException(
        'Rollover is set with both a digit count and a wrap point or with neither. A meter that declares its digits but not where the register wraps makes consumption arithmetic divide by nothing.',
      );
    }

    const expected = 10 ** digits;
    if (digitWrapAt !== expected) {
      throw new BadRequestException(
        `A ${digits}-digit register wraps at ${expected}, not ${digitWrapAt}. The wrap point is what makes a rolled-over reading add back up instead of going negative.`,
      );
    }
  }

  /**
   * The two readings that bracket a period.
   *
   * Both bounds are **inclusive** (`lte`), which is the opposite of the half-open
   * `[from, to)` convention every other time range in this codebase uses, and it is
   * deliberate. A meter is read on the first of the month, and that reading *is* the
   * month it opens: August's consumption is the reading on 1 September minus the
   * reading on 1 August, not minus whatever happened to be read in mid-July.
   *
   * This double-counts nothing, which is the objection an inclusive bound invites. One
   * reading is the closing of one period and the opening of the next, but the two
   * deltas are *adjacent*, not overlapping - July is (1 Aug - 1 Jul) and August is
   * (1 Sep - 1 Aug) - so every unit is counted exactly once.
   *
   * Found by live verification: with exclusive bounds, a pair of readings on the 1st
   * of consecutive months could not price the month between them, because the opening
   * reading fell outside the window. The failure was a 409 that told an operator to go
   * and record an opening reading they had in fact already recorded.
   */
  private async readingsBracketing(
    tenantId: string,
    meterId: string,
    from: Date,
    to: Date,
  ) {
    const [opening, closing] = await Promise.all([
      this.prisma.meterReading.findFirst({
        where: {
          meterId,
          organizationId: tenantId,
          readingDate: { lte: from },
        },
        orderBy: { readingDate: 'desc' },
      }),
      this.prisma.meterReading.findFirst({
        where: { meterId, organizationId: tenantId, readingDate: { lte: to } },
        orderBy: { readingDate: 'desc' },
      }),
    ]);

    return { opening, closing };
  }

  /** Who this meter's consumption is billed to, and in what proportion. */
  private async billingTargets(
    tenantId: string,
    meter: {
      id: string;
      scope: MeterScope;
      unitId: string | null;
      propertyId: string;
      apportionmentMethod: ApportionmentMethod | null;
      apportionmentWeights: unknown;
    },
    billingPeriod: string,
    requestedUnitId?: string,
  ): Promise<
    Array<{
      unitId: string | null;
      share: number;
      basis: string;
      rentalAgreementId: string | null;
    }>
  > {
    if (meter.scope === MeterScope.SUBMETER) {
      if (requestedUnitId && requestedUnitId !== meter.unitId) {
        throw new BadRequestException(
          `This is a sub-meter serving one unit, so it cannot bill a different unit. It bills ${meter.unitId ? 'the unit it is registered to' : 'nobody, because it has no unit attached'}.`,
        );
      }
      const lease = meter.unitId
        ? await this.activeLeaseFor(tenantId, meter.unitId)
        : null;
      return [
        {
          unitId: meter.unitId,
          share: 1,
          basis: 'Sub-meter',
          rentalAgreementId: lease?.id ?? null,
        },
      ];
    }

    const units = await this.prisma.unit.findMany({
      where: { propertyId: meter.propertyId },
      select: { id: true, areaSqFt: true },
    });

    const weights = (meter.apportionmentWeights ?? null) as Record<
      string,
      number
    > | null;
    const apportionable: ApportionableUnit[] = units.map((u) => ({
      id: u.id,
      areaSqFt: u.areaSqFt === null ? null : Number(u.areaSqFt),
    }));

    const split = apportion(meter.apportionmentMethod, apportionable, {
      weights,
      // The denominator is the month being billed, not the month we happen to be in:
      // billing October's period in November must prorate against 31 days.
      periodDays: daysInPeriodKey(billingPeriod),
    });

    if (!split.ok) {
      throw new ConflictException(split.message);
    }

    const wanted = requestedUnitId
      ? [requestedUnitId]
      : Object.keys(split.shares);

    const targets: Array<{
      unitId: string | null;
      share: number;
      basis: string;
      rentalAgreementId: string | null;
    }> = [];
    for (const unitId of wanted) {
      const share = split.shares[unitId];
      if (share === undefined) {
        throw new BadRequestException(
          `Unit ${unitId} is not fed by this bulk meter.`,
        );
      }
      // A unit with a zero share is skipped rather than charged at 0.00: a nil-rated
      // line on a resident's statement reads like a mistake, and there is nothing to
      // recover from it.
      if (share <= 0) continue;
      const lease = await this.activeLeaseFor(tenantId, unitId);
      targets.push({
        unitId,
        share,
        basis: split.basis,
        rentalAgreementId: lease?.id ?? null,
      });
    }

    return targets;
  }

  private async activeLeaseFor(tenantId: string, unitId: string) {
    const now = new Date();
    return this.prisma.rentalAgreement.findFirst({
      where: {
        unitId,
        unit: { property: { organizationId: tenantId } },
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
  }

  private async rateInForce(
    tenantId: string,
    meter: { id: string; type: UtilityType; propertyId: string },
    at: Date,
  ) {
    const candidates = await this.prisma.utilityRate.findMany({
      where: { organizationId: tenantId, type: meter.type },
    });

    const resolved = resolveRate(
      candidates.map((r) => ({
        currency: r.currency,
        ratePerUnit: Number(r.ratePerUnit),
        standingCharge: Number(r.standingCharge),
        prorateStandingCharge: r.prorateStandingCharge,
        vatRate: r.vatRate === null ? null : Number(r.vatRate),
        incomeAccount: r.incomeAccount,
        revenueExpenseItem: r.revenueExpenseItem,
        spotRate: r.spotRate === null ? undefined : Number(r.spotRate),
        id: r.id,
        meterId: r.meterId,
        propertyId: r.propertyId,
        validFrom: r.validFrom,
        validTo: r.validTo,
      })),
      { meterId: meter.id, propertyId: meter.propertyId, at },
    );

    if (!resolved) return null;

    const full = await this.prisma.utilityRate.findUnique({
      where: { id: (resolved as RateInput & { id: string }).id },
    });
    return full
      ? {
          id: full.id,
          currency: full.currency,
          ratePerUnit: Number(full.ratePerUnit),
          standingCharge: Number(full.standingCharge),
          prorateStandingCharge: full.prorateStandingCharge,
          vatRate: full.vatRate === null ? null : Number(full.vatRate),
          incomeAccount: full.incomeAccount,
          revenueExpenseItem: full.revenueExpenseItem,
          spotRate: full.spotRate === null ? undefined : Number(full.spotRate),
        }
      : null;
  }

  /**
   * Recompute a stored charge's money from the rows it names.
   *
   * Consumption and amount are derived rather than stored, so this is where a saved
   * charge's figures come from every time they are read. The charge holds the
   * *inputs* - which two readings, which share, which rate - precisely so this can be
   * reconstructed; a charge that also held its own copy of the answer would be a second
   * thing to keep in step with the readings.
   *
   * Typed as a structural minimum rather than a full Prisma payload so both call sites
   * (the charge ledger and the billing run) can pass what they happen to have loaded.
   */
  private async priceStoredCharge(
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
   * A meter's live state, with the two things a register has to show and the columns
   * cannot: whether it is a meter that can be billed at all right now, and why.
   */
  private shapeMeter(m: {
    id: string;
    meterNumber: string;
    type: UtilityType;
    scope: MeterScope;
    status: string;
    unitId: string | null;
    digits: number | null;
    digitWrapAt: number | null;
    apportionmentMethod: ApportionmentMethod | null;
    property?: { id: string; name: string } | null;
    unit?: { id: string; code: string; name: string } | null;
    _count?: { readings: number; charges: number };
  }) {
    return {
      ...m,
      propertyName: m.property?.name ?? null,
      unitCode: m.unit?.code ?? null,
      unitName: m.unit?.name ?? null,
      readingCount: m._count?.readings ?? 0,
      chargeCount: m._count?.charges ?? 0,
      // A retired meter keeps its readings so old invoices still explain themselves,
      // and the register says so rather than hiding the row.
      isTerminal: m.status === 'RETIRED',
      canBeBilled:
        m.status === 'ACTIVE' &&
        (m.scope === MeterScope.SUBMETER || m.apportionmentMethod !== null),
      billsTo:
        m.scope === MeterScope.SUBMETER
          ? (m.unit?.code ?? 'no unit attached')
          : `bulk meter, divided between the units of ${m.property?.name ?? 'its property'}`,
    };
  }

  private shapeReading(
    r: {
      id: string;
      reading: Prisma.Decimal;
      readingDate: Date;
      source: string;
      note: string | null;
    },
    meter: {
      meterNumber: string;
      type: UtilityType;
      digits: number | null;
      digitWrapAt: number | null;
    },
  ) {
    const presented = presentReading(
      null,
      { reading: Number(r.reading), readingDate: r.readingDate },
      { digits: meter.digits, digitWrapAt: meter.digitWrapAt },
    );
    return {
      // The id is on the wire because a reading row is the unit of correction - the
      // client corrects a reading by id. Omitting it made every `PATCH
      // /utilities/readings/:id` issued from the list screen a 404, which live
      // verification caught.
      id: r.id,
      readingDate: r.readingDate,
      meterNumber: meter.meterNumber,
      type: meter.type,
      currentReading: presented.currentReading,
      // A single reading has nothing to be a delta from, so the list reports no
      // consumption rather than zero - zero would claim the meter did not move.
      previousReading: presented.previousReading,
      consumption: presented.consumption,
      rolledOver: presented.rolledOver,
      source: r.source,
      note: r.note,
    };
  }

  private shapeCharge(c: {
    id: string;
    billingPeriod: string;
    status: string;
    allocationShare: Prisma.Decimal;
    allocationBasis: string | null;
    ratePerUnit: Prisma.Decimal;
    currency: string;
    meter: {
      id: string;
      meterNumber: string;
      type: UtilityType;
      scope: MeterScope;
    };
    unit?: { id: string; code: string; name: string } | null;
    invoice?: {
      id: string;
      invoiceNumber: string;
      status: string;
      totalAmount: Prisma.Decimal;
      dueDate: Date;
    } | null;
  }) {
    return {
      id: c.id,
      billingPeriod: c.billingPeriod,
      status: c.status,
      meterId: c.meter.id,
      meterNumber: c.meter.meterNumber,
      type: c.meter.type,
      meterScope: c.meter.scope,
      unitId: c.unit?.id ?? null,
      unitCode: c.unit?.code ?? null,
      unitName: c.unit?.name ?? null,
      allocationShare: Number(c.allocationShare),
      allocationBasis: c.allocationBasis,
      ratePerUnit: Number(c.ratePerUnit),
      currency: c.currency,
      invoiceId: c.invoice?.id ?? null,
      invoiceNumber: c.invoice?.invoiceNumber ?? null,
      invoiceStatus: c.invoice?.status ?? null,
    };
  }
}

/**
 * `"2026-10"` -> the window it covers, in **UTC**.
 *
 * UTC rather than local, because this is used to range-query stored readings and the
 * stored readings are UTC (`TIMESTAMP WITHOUT TIME ZONE`, written by Prisma). Using
 * local midnight here put the period's start hours *before* the 1st of the month, so
 * a reading taken on the 1st fell outside the period it opens - caught by live
 * verification, and the same root cause as master doc issue 97.
 */
function periodFromPeriodKey(key: string): { from: Date; to: Date } {
  const [year, month] = key.split('-').map(Number);
  return utcPeriodWindow(year, month);
}

/** Days in the month a period key names - the denominator `OCCUPANCY` prorates by. */
function daysInPeriodKey(key: string): number {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}
