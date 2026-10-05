import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  EmploymentType,
  LeaveStatus,
  LeaveType,
  PayrollBearer,
  PayrollCalculationBase,
  PayrollLineDirection,
  PayrollPeriodMode,
  PayrollRuleType,
  PayFrequency,
} from '@prisma/client';
import { CleanOptional, ToBoolean, ToNumber } from '@/common/dto/transforms';

/**
 * Module 12 — HR & Payroll DTOs.
 *
 * Two things are deliberately absent from every DTO in this file, and both are
 * the module's design rather than omissions:
 *
 * 1. **No salary-derived figures.** There is no `netSalary` to post, no
 *    `deductionsTotal` to type in. A payslip's figures are the sum of its own
 *    lines, computed by `payroll-calc.ts`, for the same reason Module 11 stores no
 *    stock level: a stored total that can disagree with its own detail is the bug
 *    nobody catches until a tax audit.
 * 2. **No `status` on an update.** A payroll run moves DRAFT → CALCULATED →
 *    APPROVED → PAID through gated actions only. `PUT /payroll/runs/:id` cannot
 *    jump a run to PAID, which is the entire point of having states.
 */

const ISO_COUNTRY = /^[A-Z]{2}$/;

// ───────────────────────────────────────────────────────────── Employees

export class CreateEmployeeDto {
  /** Unique within the organization, and human-quotable — it goes on a payslip. */
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  employeeNumber!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName!: string;

  /** Printed on the payslip instead of a legal name they do not use. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  preferredName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  @CleanOptional()
  preferredLocale?: string;

  /** Free text, like `PurchaseRequest.department`. There is no departments table. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @CleanOptional()
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  jobTitle?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsDateString()
  hireDate!: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  terminationDate?: string;

  @ToNumber()
  @IsNumber()
  @Min(0)
  basicSalary!: number;

  /** ISO-4217. Per employee, because a group may pay a remote contractor in
   *  another currency and a single organization currency would force one of the
   *  two to be wrong. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'A currency is a three-letter ISO-4217 code.',
  })
  @CleanOptional()
  salaryCurrency?: string;

  @IsOptional()
  @IsEnum(PayFrequency)
  payFrequency?: PayFrequency;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(366)
  periodsPerYear?: number;

  // ── Statutory identifiers, all optional and all free text ────────────────
  //
  // "National ID", "NIN", "SIN", "National Insurance Number" and "CPF" are one
  // field with five names, and an enum of them would mean a migration every time
  // the company hires in a new country.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  socialSecurityNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  bankBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  bankCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @CleanOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  leavePolicyId?: string;

  /**
   * Links an employment record to a login.
   *
   * Optional on purpose and cross-checked against the caller's organization in the
   * service: a caretaker on the payroll may have no login at all, and a property
   * manager is an employee *and* holds a role granting far more than
   * self-service. Those are two facts about one person, not one role.
   */
  @IsOptional()
  @IsString()
  @CleanOptional()
  userId?: string;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @CleanOptional()
  employeeNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @CleanOptional()
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @CleanOptional()
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  preferredName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  @CleanOptional()
  preferredLocale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @CleanOptional()
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  jobTitle?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  @CleanOptional()
  employmentType?: EmploymentType;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  hireDate?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  terminationDate?: string;

  @ToNumber()
  @IsNumber()
  @Min(0)
  basicSalary?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'A currency is a three-letter ISO-4217 code.',
  })
  @CleanOptional()
  salaryCurrency?: string;

  @IsOptional()
  @IsEnum(PayFrequency)
  @CleanOptional()
  payFrequency?: PayFrequency;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(366)
  periodsPerYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  socialSecurityNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  bankBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  bankCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @CleanOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  leavePolicyId?: string;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isActive?: boolean;
}

/** A standing allowance or deduction on one employee's payslip. */
export class EmployeeComponentDto {
  @IsString()
  payComponentId!: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  percentage?: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'A currency is a three-letter ISO-4217 code.',
  })
  @CleanOptional()
  currency?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  effectiveFrom?: string;
}

// ───────────────────────────────────────────────────────── Payroll rules

export class PayrollBandDto {
  /** Cumulative upper bound. `null` on the last band, and it must be last. */
  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  upTo?: number | null;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  @Max(100)
  ratePercent?: number;

  /** For a banded fixed rule, the amount charged on this slice. */
  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class CreatePayrollRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  /** Free text and never translated by the application — see the schema note. A
   *  Brazilian administrator names the INSS rule "INSS Trabalhista" and it is
   *  stored exactly as typed. */
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  description?: string;

  /** ISO-3166-1 alpha-2. Omit for a rule that applies anywhere. */
  @IsOptional()
  @IsString()
  @Matches(ISO_COUNTRY, {
    message: 'A country is two letters, ISO-3166-1 alpha-2.',
  })
  @CleanOptional()
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @CleanOptional()
  regionCode?: string;

  @IsOptional()
  @IsEnum(PayrollRuleType)
  type?: PayrollRuleType;

  @IsOptional()
  @IsEnum(PayrollCalculationBase)
  base?: PayrollCalculationBase;

  @IsOptional()
  @IsEnum(PayrollBearer)
  bearer?: PayrollBearer;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  @Max(100)
  ratePercent?: number;

  /** A `FIXED` rule's flat amount. Null on every other type. */
  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  minimumBaseAmount?: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  maximumBaseAmount?: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  exemptBelowBaseAmount?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60, {
    message: 'A sixty-band ladder is a sign the bands are monthly, not annual.',
  })
  @ValidateNested({ each: true })
  @Type(() => PayrollBandDto)
  bands?: PayrollBandDto[];

  @IsOptional()
  @IsEnum(PayrollPeriodMode)
  periodMode?: PayrollPeriodMode;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(366)
  periodsPerYear?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @CleanOptional()
  ledgerAccountCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @CleanOptional()
  expenseAccountCode?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isActive?: boolean;
}

export class UpdatePayrollRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @CleanOptional()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  @Max(100)
  ratePercent?: number;

  /** A `FIXED` rule's flat amount. Null on every other type. */
  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsEnum(PayrollCalculationBase)
  @CleanOptional()
  base?: PayrollCalculationBase;

  @IsOptional()
  @IsEnum(PayrollBearer)
  @CleanOptional()
  bearer?: PayrollBearer;

  @IsOptional()
  @IsEnum(PayrollRuleType)
  @CleanOptional()
  type?: PayrollRuleType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollBandDto)
  bands?: PayrollBandDto[];

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  minimumBaseAmount?: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  maximumBaseAmount?: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  exemptBelowBaseAmount?: number;

  @IsOptional()
  @IsEnum(PayrollPeriodMode)
  @CleanOptional()
  periodMode?: PayrollPeriodMode;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(366)
  periodsPerYear?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @CleanOptional()
  ledgerAccountCode?: string;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isActive?: boolean;
}

/**
 * What a rule does to a number, before anybody is paid on the strength of it.
 *
 * Read-only. It writes nothing and touches no payroll run, which is what makes it
 * safe to point at a jurisdiction the organization does not yet operate in.
 */
export class PreviewPayrollDto {
  @ToNumber()
  @IsNumber()
  @Min(0)
  gross!: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  basic?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(366)
  periodsPerYear?: number;

  /** Price a jurisdiction the organization is not registered in. */
  @IsOptional()
  @IsString()
  @Matches(ISO_COUNTRY)
  @CleanOptional()
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @CleanOptional()
  regionCode?: string;

  /** Resolve the rules as they stood on this date rather than today. */
  @IsOptional()
  @IsDateString()
  @CleanOptional()
  at?: string;
}

// ─────────────────────────────────────────────────────────────── Leave

export class CreateLeaveRequestDto {
  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsEnum(LeaveType)
  leaveType?: LeaveType;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  reason?: string;
}

export class DecisionLeaveRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  note?: string;
}

export class CreateLeavePolicyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_COUNTRY)
  @CleanOptional()
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @CleanOptional()
  regionCode?: string;

  @ToNumber()
  @IsNumber()
  @Min(0)
  @Max(366)
  annualEntitlementDays!: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  @Max(366)
  carryoverLimitDays?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(0)
  @Max(365)
  minNoticeDays?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(0)
  @Max(365)
  minNoticeWaivedDays?: number;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  unpaidAllowed?: boolean;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(366)
  maxConsecutiveDays?: number;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isDefault?: boolean;
}

export class CreateHolidayDto {
  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  /** Omit for an organization's own closure; set to inherit a jurisdiction's. */
  @IsOptional()
  @IsString()
  @Matches(ISO_COUNTRY)
  @CleanOptional()
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @CleanOptional()
  regionCode?: string;

  /** A country's New Year recurs; a one-off public holiday does not. Getting
   *  this wrong is why "public holidays" tables go wrong two years in. */
  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isRecurring?: boolean;
}

// ───────────────────────────────────────────────────────────── Payroll runs

export class CreatePayrollRunDto {
  @IsString()
  @Matches(/^PR-\d{4}-[A-Za-z0-9]{1,12}$/, {
    message: 'A run reference looks like PR-2026-03.',
  })
  reference!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsDateString()
  payDate!: string;

  /** ISO-4217. Defaults to the organization's currency. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  @CleanOptional()
  currency?: string;

  /**
   * Which employees to include.
   *
   * Defaults to every active, employed employee. Narrowing it is deliberate
   * rather than a convenience: a run for one department is normal, and a run that
   * silently missed somebody because a hire date was wrong is not.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  employeeIds?: string[];
}

export class VoidPayrollRunDto {
  @IsString()
  @MinLength(10, {
    message: 'Say why. A voided payroll is a document somebody will ask about.',
  })
  @MaxLength(2000)
  reason!: string;
}

export class PayPayrollRunDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  paymentReference?: string;
}

/** One earning or deduction line added to a payslip by hand. */
export class PayslipAdjustmentDto {
  @IsEnum(PayrollLineDirection)
  direction!: PayrollLineDirection;

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ToNumber()
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @CleanOptional()
  accountCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  notes?: string;
}

// ───────────────────────────────────────────────────────────────── Filters

export interface EmployeeFilters {
  search?: string;
  department?: string;
  employmentType?: string;
  status?: string;
  /** Show staff who have left. Off by default: a leaver is history. */
  includeInactive?: boolean;
  /** Only staff with a login. */
  hasUser?: string;
}

export interface LeaveRequestFilters {
  employeeId?: string;
  status?: string;
  leaveType?: string;
  from?: string;
  to?: string;
  /** 'mine' resolves to the caller's own employee record. */
  scope?: string;
}

export interface PayrollRunFilters {
  status?: string;
  year?: string;
  search?: string;
}

export type { LeaveStatus };
