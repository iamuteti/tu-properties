import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ApportionmentMethod,
  MeterReadingSource,
  MeterScope,
  UtilityType,
} from '@prisma/client';
import { ToBoolean, ToNumber } from '@/common/dto/transforms';

/**
 * Module 14 - Utilities DTOs.
 *
 * Four things are deliberately absent from every DTO in this file, and all four are
 * the module's design rather than omissions:
 *
 * 1. **No `status` on any update.** A meter is retired through a named action
 *    (`retire`), a charge is reversed through `void`. A `PATCH` that could set
 *    `status` directly would skip those gates - and the gates are where the money
 *    and the history are protected.
 *
 * 2. **No `organizationId`.** It is never accepted from a caller in this module -
 *    the tenant comes from the JWT - so a DTO declaring it would only create the
 *    illusion that it could be set.
 *
 * 3. **No `digitWrapAt` without `digits`, and neither without the other.** A meter
 *    that declares a digit count but no wrap point is the configuration that breaks
 *    consumption arithmetic, and the database refuses it
 *    (`utility_meters_rollover_consistent`). The service also refuses it, because a
 *    DTO cannot express a cross-field rule and a 500 from a constraint violation is
 *    not an answer a user can act on.
 *
 * 4. **No `consumption`, `previousReading`, or `amount` on a create.** Those are
 *    derived - by `meter-rates.ts` from the two readings and the tariff. Accepting
 *    them would let a client post a bill, which is the one thing this module exists
 *    to prevent.
 */

/** Meter readings and rates are ISO-8601 date strings on the wire. */
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

export class CreateMeterDto {
  /** The property the device is bolted to. Required even for a sub-meter. */
  @IsString()
  @MinLength(1)
  propertyId!: string;

  /** Required when `scope` is `SUBMETER`; must be absent when it is `BULK`. */
  @IsOptional()
  @IsString()
  unitId?: string;

  @IsEnum(UtilityType)
  type!: UtilityType;

  /** The number the utility company bills against. Unique per org and type. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  meterNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serialNumber?: string;

  /** Defaults to `MANUAL`; `SMART` has no writer until the integration lands. */
  @IsOptional()
  @IsEnum(MeterReadingSource)
  source?: MeterReadingSource;

  @IsOptional()
  @IsEnum(MeterScope)
  scope?: MeterScope;

  /**
   * Required by the database when `scope = BULK`, and refused by it on a
   * sub-meter. There is no default, because a default is a decision nobody made -
   * see the module doc.
   */
  @IsOptional()
  @IsEnum(ApportionmentMethod)
  apportionmentMethod?: ApportionmentMethod;

  /** Required when `apportionmentMethod = MANUAL`. */
  @IsOptional()
  @IsObject()
  apportionmentWeights?: Record<string, number>;

  /** Digits on the register. Omit both this and `digitWrapAt` for a meter that does not roll. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  digits?: number;

  /** Must be exactly `10 ** digits`; the service recomputes it rather than trusting it. */
  @IsOptional()
  @IsInt()
  @Min(10)
  digitWrapAt?: number;

  @IsOptional()
  @IsDateString()
  lastBilledThrough?: string;

  /** Carried over from the `UnitMeterNumber` table this replaces. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  readingSetup?: string;
}

export class UpdateMeterDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  propertyId?: string;

  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsEnum(UtilityType)
  type?: UtilityType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  meterNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serialNumber?: string;

  @IsOptional()
  @IsEnum(MeterReadingSource)
  source?: MeterReadingSource;

  @IsOptional()
  @IsEnum(MeterScope)
  scope?: MeterScope;

  @IsOptional()
  @IsEnum(ApportionmentMethod)
  apportionmentMethod?: ApportionmentMethod;

  @IsOptional()
  @IsObject()
  apportionmentWeights?: Record<string, number>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  digits?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  digitWrapAt?: number;

  @IsOptional()
  @IsDateString()
  lastBilledThrough?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  readingSetup?: string;
}

/** Clear rollover configuration: both columns are set to null together. */
export class ClearMeterRolloverDto {
  @IsBoolean()
  @ToBoolean()
  confirm!: boolean;
}

export class CreateReadingDto {
  @IsString()
  @MinLength(1)
  meterId!: string;

  @IsDateString()
  @Matches(ISO_DATE, {
    message: 'readingDate must be an ISO-8601 date or timestamp',
  })
  readingDate!: string;

  /** The value the register showed. Negative is refused by the service. */
  @IsNumber()
  @Min(0)
  reading!: number;

  @IsOptional()
  @IsEnum(MeterReadingSource)
  source?: MeterReadingSource;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /**
   * The earlier reading on the same meter this figure was assumed from. Makes an
   * estimate checkable rather than merely declared — "the same as last month" is a
   * claim a reader can go and check.
   */
  @IsOptional()
  @IsString()
  estimatedFromReadingId?: string;

  /** The basis in words, for the cases a reference cannot express. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  estimationMethod?: string;
}

/**
 * Correcting a reading is an `update`, never a second row.
 *
 * `MeterReading` is unique on `(meterId, readingDate)` precisely so that a
 * correction has somewhere to go; a DTO that let a caller post "the same reading
 * again" would be a DTO inviting the double-billing the constraint prevents.
 */
export class UpdateReadingDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  reading?: number;

  @IsOptional()
  @IsDateString()
  @Matches(ISO_DATE, {
    message: 'readingDate must be an ISO-8601 date or timestamp',
  })
  readingDate?: string;

  @IsOptional()
  @IsEnum(MeterReadingSource)
  source?: MeterReadingSource;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateRateDto {
  /** All three null = the organization default for this utility. */
  @IsOptional()
  @IsString()
  meterId?: string;

  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsEnum(UtilityType)
  type!: UtilityType;

  /** ISO 4217. The currency the resident is billed in. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  /**
   * Price of one unit, to four decimals.
   *
   * `ToNumber` rather than `@IsInt`, because a gas tariff per MMBtu and a water
   * tariff per 1000 litres are both quoted finer than two decimals and truncating
   * the rate moves money every month.
   */
  @IsNumber()
  @ToNumber()
  @Min(0)
  ratePerUnit!: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  standingCharge?: number;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  prorateStandingCharge?: boolean;

  /** The currency the utility company bills the estate in, which is often not the resident's. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  purchaseCurrency?: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  spotRate?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  incomeAccount?: string;

  /** `INCOME_ACCOUNTS` "3" - Utility Income. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  revenueExpenseItem?: string;

  @IsDateString()
  @Matches(ISO_DATE, {
    message: 'validFrom must be an ISO-8601 date or timestamp',
  })
  validFrom!: string;
}

/**
 * Supersede a tariff: close the current window and open a new one.
 *
 * `UpdateRateDto` deliberately cannot set `validTo`, because "change this rate"
 * and "stop this rate applying from March" are different intents with different
 * consequences for invoices already issued under it.
 */
export class SupersedeRateDto {
  @IsNumber()
  @ToNumber()
  @Min(0)
  ratePerUnit!: number;

  @IsDateString()
  @Matches(ISO_DATE, {
    message: 'validTo must be an ISO-8601 date or timestamp',
  })
  validTo!: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(0)
  standingCharge?: number;

  /** Why the tariff is changing. Free text, because the reason is not enumerable. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

/**
 * Bill one meter's consumption for one period.
 *
 * `"2026-10"`, matching `Invoice.billingPeriod`'s form. A bare month is enough
 * because a meter's consumption is measured between the readings that bracket it;
 * the service finds those readings rather than being told which two rows to use,
 * so a caller cannot pair readings from different periods.
 */
export class BillPeriodDto {
  @IsString()
  @MinLength(1)
  meterId!: string;

  @IsString()
  @Matches(/^[0-9]{4}-(0[1-9]|1[0-2])$/, {
    message: 'billingPeriod must look like 2026-10',
  })
  billingPeriod!: string;

  /**
   * Bill this unit instead of the meter's own.
   *
   * Only meaningful on a bulk meter, and the reason it exists: a run that bills
   * "meter X for 2026-10" has to be told which unit's share to raise, or it will
   * raise twenty identical invoices. Omitted, every unit the meter feeds with a
   * non-zero share is charged.
   */
  @IsOptional()
  @IsString()
  unitId?: string;

  /** Invoice terms in days. Defaults to 14. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  dueInDays?: number;
}

/**
 * Void a charge: write off what a resident owes for a meter's consumption.
 *
 * A reason is required, not optional. Voiding is the one action here that erases
 * money somebody was asked for, and an unexplained write-off is indistinguishable
 * from an error three months later.
 */
export class VoidChargeDto {
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  reason!: string;
}

/** CSV export filter. All optional; omitting one means "every". */
export class ExportQueryDto {
  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsEnum(UtilityType)
  type?: UtilityType;

  @IsOptional()
  @IsString()
  billingPeriod?: string;
}

export class MeterQueryDto {
  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsEnum(UtilityType)
  type?: UtilityType;

  @IsOptional()
  @IsEnum(MeterScope)
  scope?: MeterScope;

  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ReadingQueryDto {
  @IsOptional()
  @IsString()
  meterId?: string;

  @IsOptional()
  @IsEnum(MeterReadingSource)
  source?: MeterReadingSource;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ChargeQueryDto {
  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsString()
  billingPeriod?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class RateQueryDto {
  @IsOptional()
  @IsEnum(UtilityType)
  type?: UtilityType;

  @IsOptional()
  @IsString()
  meterId?: string;

  @IsOptional()
  @IsString()
  propertyId?: string;

  /** ISO date. Resolves the tariff in force on that day. */
  @IsOptional()
  @IsDateString()
  at?: string;
}

/**
 * Batch reading entry: what a clipboard of meter numbers becomes.
 *
 * Bounded, because a bulk meter on a large estate can feed hundreds of units and an
 * unbounded array is an unbounded transaction.
 */
export class BulkReadingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  readings!: CreateReadingDto[];
}
