import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  PayrollBearer,
  PayrollCalculationBase,
  PayrollPeriodMode,
  PayrollRuleType,
  Prisma,
  type PayrollRule,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import {
  bestPerCode,
  describeJurisdiction,
  isInForceAt,
  jurisdictionLabel,
  type Jurisdiction,
} from '@/common/jurisdiction';
import { num, computePayslip, type PayrollRuleInput } from './payroll-calc';
import type { CreatePayrollRuleDto, UpdatePayrollRuleDto } from './dto/hr.dto';

type Tx = Prisma.TransactionClient;

/**
 * The generic accounts the engine posts to unless a rule names its own.
 *
 * `NET_PAYABLE` is `2340` and not one of the statutory accounts, which is the
 * whole reason that account exists. It was `2310` to begin with — the same code
 * the NSSF rule posts to — so net pay and the social fund merged into one
 * account: the journal entry still balanced, because the credit went *somewhere*,
 * and the net-pay figure simply disappeared into the middle of the pension
 * liability. A balance check cannot catch that, because nothing is missing from
 * the debit side. `coverageFor` now refuses the collision instead of merging.
 */
export const PAYROLL_ACCOUNTS = {
  /** The employer's total cost of employing people: gross plus employer contributions. */
  SALARY_EXPENSE: '5090',
  /** What the organization owes its own staff, net of everything withheld. */
  NET_PAYABLE: '2340',
  /** Where a rule with no account of its own lands. Deliberately generic: the
   *  pre-existing `2300 PAYE Payable` names one country's instrument, and a
   *  German payroll has no business posting to it. */
  STATUTORY_FALLBACK: '2310',
} as const;

const RULE_EXPORT_HEADERS = [
  'code',
  'name',
  'country',
  'region',
  'scope',
  'type',
  'base',
  'bearer',
  'ratePercent',
  'minimumBaseAmount',
  'maximumBaseAmount',
  'exemptBelowBaseAmount',
  'periodMode',
  'periodsPerYear',
  'ledgerAccountCode',
  'validFrom',
  'validTo',
  'isActive',
];

/**
 * Module 12 — the configurable payroll rules engine.
 *
 * A structural twin of `TaxService`, and deliberately so. Both answer "which of
 * these rule rows apply to this organization, here and now", and both do it the
 * same way: jurisdiction columns on the rule, an effective window, most-specific
 * wins per code, and a pure calculator downstream that is told nothing about the
 * country. The scoring itself is not copied — it lives in
 * `common/jurisdiction.ts`, because a subtly-wrong specificity score does not
 * throw, it quietly applies the wrong rate.
 *
 * Two differences from the tax engine, both forced by what payroll is:
 *
 * 1. **The payroll jurisdiction falls back to the tax jurisdiction.** Almost every
 *    organization pays its staff where it is registered. A group that does not
 *    overrides the payroll country and region, because a field that has to be set
 *    twice is a field that will be set once and left wrong.
 * 2. **An unconfigured jurisdiction is a visible gap, not a zero.** `resolveRules`
 *    returns an empty list and `coverageFor` explains why, because a jurisdiction
 *    with no rules produces a payslip with no tax withheld — which looks like a
 *    successful run and is the worst possible failure.
 */
@Injectable()
export class PayrollRulesService {
  constructor(private prisma: PrismaService) {}

  // =============================================================== resolution

  /**
   * Where this organization pays people.
   *
   * Falls back to the tax jurisdiction when the payroll one is unset, so the
   * common case needs no second field and the unusual case can still be said out
   * loud.
   */
  async jurisdictionOf(
    organizationId: string,
    tx: Tx = this.prisma,
  ): Promise<
    Jurisdiction & { currency: string; label: string; inherited: boolean }
  > {
    const org = await requireRecord(
      tx.organization.findUnique({
        where: { id: organizationId },
        select: {
          payrollCountryCode: true,
          payrollRegionCode: true,
          taxCountryCode: true,
          taxRegionCode: true,
          currency: true,
        },
      }),
      'Organization',
    );

    const inherited = !org.payrollCountryCode && Boolean(org.taxCountryCode);

    const countryCode = org.payrollCountryCode ?? org.taxCountryCode ?? null;
    const regionCode = org.payrollCountryCode
      ? org.payrollRegionCode
      : org.taxRegionCode;

    return {
      countryCode,
      regionCode,
      currency: org.currency,
      label: jurisdictionLabel({ countryCode, regionCode }),
      inherited,
    };
  }

  /**
   * The Prisma filter for a jurisdiction.
   *
   * The null-jurisdiction case is the one that matters and the one that is easy
   * to get wrong: an organization that has not declared where it pays people must
   * get **only the rules with no country** — the universal fallback — and not an
   * empty `where`, which silently matches *every country's rules at once* and
   * hands a Kenyan payroll a German social-insurance rate. An unconfigured
   * jurisdiction has to look unconfigured.
   */
  private countryFilter(
    jurisdiction: Jurisdiction,
  ): Prisma.PayrollRuleWhereInput {
    return jurisdiction.countryCode
      ? {
          OR: [
            { countryCode: jurisdiction.countryCode },
            { countryCode: null },
          ],
        }
      : { countryCode: null };
  }

  /**
   * The rules in force for an organization on a given date.
   *
   * A rate change is a **new row with a later `validFrom`**, never an edit. That
   * is what lets a payslip from eighteen months ago be explained without
   * re-running a rule that has since been replaced — and it is the same decision
   * `TaxRule` already made for the same reason.
   */
  async resolveRules(
    organizationId: string,
    at: Date = new Date(),
    tx: Tx = this.prisma,
  ): Promise<PayrollRuleInput[]> {
    const jurisdiction = await this.jurisdictionOf(organizationId, tx);

    const candidates = await tx.payrollRule.findMany({
      where: {
        AND: [
          { OR: [{ organizationId }, { organizationId: null }] },
          { isActive: true },
          this.countryFilter(jurisdiction),
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });

    const inForce = candidates.filter((rule) => isInForceAt(rule, at));

    return bestPerCode(inForce, jurisdiction).map((rule) => this.toInput(rule));
  }

  /**
   * Whether this jurisdiction is actually configured, and what is missing.
   *
   * Exists because the failure this module most needs to prevent is a silent one:
   * a jurisdiction with no rules pays everybody, nothing is withheld, and the
   * run reports success. `NO_RULES_RESOLVED` on every payslip says it plainly, and
   * this is what the rules screen reads to show the same warning before anyone
   * presses Calculate.
   */
  async coverageFor(organizationId: string, tx: Tx = this.prisma) {
    const jurisdiction = await this.jurisdictionOf(organizationId, tx);
    const rules = await this.resolveRules(organizationId, new Date(), tx);

    const ruleAccounts = [
      ...new Set(
        rules
          .map((rule) => rule.ledgerAccountCode)
          .filter((code): code is string => Boolean(code)),
      ),
    ];

    // The union of what the engine needs and what the rules name. Checking only
    // the engine's own two would report every rule's account as unknown — which
    // reads as a serious misconfiguration and is entirely a bug in the check.
    const required = [
      ...new Set([
        PAYROLL_ACCOUNTS.SALARY_EXPENSE,
        PAYROLL_ACCOUNTS.NET_PAYABLE,
        ...ruleAccounts,
      ]),
    ];

    const accounts = await tx.account.findMany({
      where: { organizationId, code: { in: required } },
      select: { code: true },
    });
    const accountCodes = new Set(accounts.map((account) => account.code));

    const missingAccounts = [
      PAYROLL_ACCOUNTS.SALARY_EXPENSE,
      PAYROLL_ACCOUNTS.NET_PAYABLE,
    ].filter((code) => !accountCodes.has(code));

    // A rule pointing at an account that does not exist posts nothing and leaves
    // the money unbalanced, which is worth catching here rather than at approval.
    const unknownAccounts = ruleAccounts.filter(
      (code) => !accountCodes.has(code),
    );

    /**
     * Liability accounts that more than one thing posts to.
     *
     * Two failure modes, and they are not equally serious:
     *
     * 1. A rule posting to **`NET_PAYABLE`** — always wrong. Net pay is computed
     *    by the engine from gross less deductions, so a rule posting there merges
     *    two unrelated quantities into one account, and the journal entry still
     *    balances because the credit went *somewhere*. This is the check that
     *    would have caught the original bug.
     * 2. **Two rules sharing one code** — also wrong, and also invisible to every
     *    balance check: the entry balances, no account is missing, and one
     *    liability just absorbs the other's figures. Two remittances then come out
     *    of one balance.
     *
     * A rule posting to the `STATUTORY_FALLBACK` code is **not** flagged on its
     * own: that code is only applied to rules with no account of their own, so
     * naming it explicitly is harmless as long as nothing else is on it. Flagging
     * it anyway would be a warning people learn to ignore, which is worse than no
     * warning.
     */
    const netPayCollisions = ruleAccounts.filter(
      (code) => code === PAYROLL_ACCOUNTS.NET_PAYABLE,
    );

    const byCode = new Map<string, string[]>();
    for (const rule of rules) {
      const code = rule.ledgerAccountCode;
      if (!code) continue;
      const existing = byCode.get(code);
      if (existing) existing.push(rule.code);
      else byCode.set(code, [rule.code]);
    }
    const sharedAccounts = [...byCode.entries()]
      .filter(([, codes]) => codes.length > 1)
      .map(([code, codes]) => `${code} (${codes.join(', ')})`);

    return {
      jurisdiction,
      configured: rules.length > 0,
      ruleCount: rules.length,
      codes: rules.map((rule) => rule.code),
      missingAccounts,
      unknownAccounts,
      netPayCollisions,
      sharedAccounts,
      /**
       * A single sentence the UI can put at the top of the screen. Null when
       * everything is in place — a green tick nobody has to reason about.
       */
      warning: this.coverageWarning(
        jurisdiction,
        rules.length,
        missingAccounts,
        unknownAccounts,
        netPayCollisions,
        sharedAccounts,
      ),
    };
  }

  private coverageWarning(
    jurisdiction: Jurisdiction & { label: string; inherited: boolean },
    ruleCount: number,
    missingAccounts: string[],
    unknownAccounts: string[],
    netPayCollisions: string[],
    sharedAccounts: string[],
  ): string | null {
    const parts: string[] = [];

    if (!jurisdiction.countryCode) {
      parts.push(
        'No payroll jurisdiction is set for this organization, so no statutory rules can be resolved. Set one on the organization, or add rules with no country as a fallback.',
      );
    } else if (ruleCount === 0) {
      parts.push(
        `No payroll rules are configured for ${describeJurisdiction(jurisdiction)}, so payslips would be produced with nothing withheld. Configure them before running payroll.`,
      );
    }

    if (missingAccounts.length > 0) {
      parts.push(
        `The chart of accounts is missing ${missingAccounts.join(
          ', ',
        )}. The ledger entry cannot be balanced without ${missingAccounts.join(' and ')}.`,
      );
    }

    if (unknownAccounts.length > 0) {
      parts.push(
        `These rules point at accounts that do not exist: ${unknownAccounts.join(
          ', ',
        )}. Their deductions would post nowhere.`,
      );
    }

    if (netPayCollisions.length > 0) {
      parts.push(
        `A rule posts to ${netPayCollisions.join(
          ', ',
        )}, which is the net-pay account the engine computes itself. The two would merge and the journal entry would still balance, so the wrong figure would only surface at bank reconciliation.`,
      );
    }

    if (sharedAccounts.length > 0) {
      parts.push(
        `More than one rule posts to the same account: ${sharedAccounts.join(
          '; ',
        )}. Their balances merge into one another, so a remittance drawn from it cannot say which liability it paid.`,
      );
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  // =================================================================== reads

  async findAll(
    organizationId: string | undefined,
    filters: {
      countryCode?: string;
      at?: string;
      includeInactive?: string;
    } = {},
    tx: Tx = this.prisma,
  ) {
    return tx.payrollRule.findMany({
      where: {
        ...(organizationId
          ? { OR: [{ organizationId }, { organizationId: null }] }
          : {}),
        ...(filters.includeInactive === 'true' ? {} : { isActive: true }),
        ...(filters.countryCode
          ? {
              OR: [{ countryCode: filters.countryCode }, { countryCode: null }],
            }
          : {}),
      },
      orderBy: [{ countryCode: 'asc' }, { code: 'asc' }, { validFrom: 'desc' }],
      take: 500,
    });
  }

  async findOne(
    id: string,
    organizationId: string | undefined,
    tx: Tx = this.prisma,
  ) {
    return requireRecord(
      tx.payrollRule.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
      }),
      'Payroll rule',
    );
  }

  /**
   * Run the engine over a hypothetical salary.
   *
   * This is the feature that makes the rules engine safe to configure: an
   * administrator can see what a rule does to a real number before anybody is
   * paid on the strength of it. It reads only — nothing is written, no payroll run
   * is touched, and it works for a jurisdiction the organization does not operate
   * in, which is what makes it useful for planning a new country.
   */
  async preview(
    input: {
      gross: number;
      basic?: number;
      periodsPerYear?: number;
      countryCode?: string | null;
      regionCode?: string | null;
      at?: Date;
    },
    organizationId: string,
  ) {
    const jurisdiction: Jurisdiction = input.countryCode
      ? {
          countryCode: input.countryCode,
          regionCode: input.regionCode ?? null,
        }
      : await this.jurisdictionOf(organizationId);

    const rules = await this.rulesForJurisdiction(
      jurisdiction,
      organizationId,
      input.at ?? new Date(),
    );

    const basic = input.basic ?? input.gross;
    const result = computePayslip(
      {
        basicSalary: basic,
        periodsPerYear: input.periodsPerYear,
        earnings:
          input.gross > basic
            ? [
                {
                  code: 'PREVIEW_ALLOWANCE',
                  name: 'The rest of the stated gross',
                  amount: input.gross - basic,
                },
              ]
            : [],
      },
      rules,
    );

    return {
      jurisdiction,
      ruleCount: rules.length,
      lines: result.lines,
      totals: result.totals,
      warnings: result.warnings,
    };
  }

  async rulesForJurisdiction(
    jurisdiction: Jurisdiction,
    organizationId: string,
    at: Date = new Date(),
    tx: Tx = this.prisma,
  ): Promise<PayrollRuleInput[]> {
    const candidates = await tx.payrollRule.findMany({
      where: {
        AND: [
          { OR: [{ organizationId }, { organizationId: null }] },
          { isActive: true },
          this.countryFilter(jurisdiction),
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });

    const inForce = candidates.filter((rule) => isInForceAt(rule, at));
    return bestPerCode(inForce, jurisdiction).map((rule) => this.toInput(rule));
  }

  async exportCsv(
    organizationId: string | undefined,
    filters: { countryCode?: string } = {},
  ): Promise<string> {
    const rows = await this.findAll(organizationId, {
      ...filters,
      includeInactive: 'true',
    });

    return toCsv(
      RULE_EXPORT_HEADERS,
      rows.map((rule) => ({
        code: rule.code,
        name: rule.name,
        country: rule.countryCode ?? '(any)',
        region: rule.regionCode ?? '',
        scope: rule.organizationId ? 'this organization' : 'shared template',
        type: rule.type,
        base: rule.base,
        bearer: rule.bearer,
        ratePercent: rule.ratePercent == null ? '' : num(rule.ratePercent),
        minimumBaseAmount:
          rule.minimumBaseAmount == null ? '' : num(rule.minimumBaseAmount),
        maximumBaseAmount:
          rule.maximumBaseAmount == null ? '' : num(rule.maximumBaseAmount),
        exemptBelowBaseAmount:
          rule.exemptBelowBaseAmount == null
            ? ''
            : num(rule.exemptBelowBaseAmount),
        periodMode: rule.periodMode,
        periodsPerYear: rule.periodsPerYear,
        ledgerAccountCode: rule.ledgerAccountCode ?? '',
        validFrom: rule.validFrom.toISOString().slice(0, 10),
        validTo: rule.validTo ? rule.validTo.toISOString().slice(0, 10) : '',
        isActive: rule.isActive ? 'yes' : 'no',
      })),
    );
  }

  // ================================================================== writes

  async create(dto: CreatePayrollRuleDto, organizationId: string) {
    this.assertCoherent(dto);

    try {
      return await this.prisma.payrollRule.create({
        data: {
          organization: { connect: { id: organizationId } },
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim(),
          countryCode: dto.countryCode?.toUpperCase() ?? null,
          regionCode: dto.regionCode?.trim() || null,
          type: dto.type ?? PayrollRuleType.PERCENTAGE,
          base: dto.base ?? PayrollCalculationBase.GROSS,
          bearer: dto.bearer ?? PayrollBearer.EMPLOYEE,
          ratePercent:
            dto.ratePercent == null
              ? undefined
              : new Prisma.Decimal(dto.ratePercent),
          minimumBaseAmount:
            dto.minimumBaseAmount == null
              ? undefined
              : new Prisma.Decimal(dto.minimumBaseAmount),
          maximumBaseAmount:
            dto.maximumBaseAmount == null
              ? undefined
              : new Prisma.Decimal(dto.maximumBaseAmount),
          exemptBelowBaseAmount:
            dto.exemptBelowBaseAmount == null
              ? undefined
              : new Prisma.Decimal(dto.exemptBelowBaseAmount),
          bands: (dto.bands ?? undefined) as unknown as Prisma.InputJsonValue,
          periodMode: dto.periodMode ?? PayrollPeriodMode.PERIOD,
          periodsPerYear: dto.periodsPerYear ?? 12,
          sortOrder: dto.sortOrder ?? 100,
          amount:
            dto.amount == null ? undefined : new Prisma.Decimal(dto.amount),
          ledgerAccountCode: dto.ledgerAccountCode?.trim() || null,
          expenseAccountCode:
            dto.expenseAccountCode?.trim() || PAYROLL_ACCOUNTS.SALARY_EXPENSE,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
          validTo: dto.validTo ? new Date(dto.validTo) : null,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A rule "${dto.code.trim().toUpperCase()}" for that country, region and start date already exists. A new version of a rate needs a later start date, not a second row with the same one.`,
        );
      }
      throw error;
    }
  }

  /**
   * Edit a rule — but only by **closing it off and opening a new one**.
   *
   * A rate change must not rewrite history, so an in-force rule whose figures
   * already reached a payslip is refused and the caller is told to create a new
   * version with a later `validFrom`. The fields that are safe to touch are the
   * descriptive ones: a rule's name being corrected does not move any money.
   */
  async update(id: string, dto: UpdatePayrollRuleDto, organizationId: string) {
    const existing = await this.record(id, organizationId);

    const touchesMoney =
      dto.ratePercent !== undefined ||
      dto.base !== undefined ||
      dto.bearer !== undefined ||
      dto.type !== undefined ||
      dto.bands !== undefined ||
      dto.minimumBaseAmount !== undefined ||
      dto.maximumBaseAmount !== undefined ||
      dto.exemptBelowBaseAmount !== undefined ||
      dto.periodMode !== undefined ||
      dto.periodsPerYear !== undefined ||
      dto.ledgerAccountCode !== undefined;

    const inForce =
      existing.validTo === null && existing.validFrom <= new Date();

    if (touchesMoney && inForce) {
      throw new ConflictException(
        `"${existing.name}" is in force and may already have been used to calculate a payslip. Changing its figures would silently rewrite those payslips. Close it with a validTo date and create a new rule with a later validFrom instead.`,
      );
    }

    return this.prisma.payrollRule.update({
      where: { id },
      data: {
        ...(dto.code !== undefined
          ? { code: dto.code.trim().toUpperCase() }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.ratePercent !== undefined
          ? {
              ratePercent:
                dto.ratePercent == null
                  ? null
                  : new Prisma.Decimal(dto.ratePercent),
            }
          : {}),
        ...(dto.base !== undefined ? { base: dto.base } : {}),
        ...(dto.bearer !== undefined ? { bearer: dto.bearer } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.bands !== undefined
          ? { bands: dto.bands as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.amount !== undefined
          ? {
              amount:
                dto.amount == null ? null : new Prisma.Decimal(dto.amount),
            }
          : {}),
        ...(dto.minimumBaseAmount !== undefined
          ? {
              minimumBaseAmount:
                dto.minimumBaseAmount == null
                  ? null
                  : new Prisma.Decimal(dto.minimumBaseAmount),
            }
          : {}),
        ...(dto.maximumBaseAmount !== undefined
          ? {
              maximumBaseAmount:
                dto.maximumBaseAmount == null
                  ? null
                  : new Prisma.Decimal(dto.maximumBaseAmount),
            }
          : {}),
        ...(dto.exemptBelowBaseAmount !== undefined
          ? {
              exemptBelowBaseAmount:
                dto.exemptBelowBaseAmount == null
                  ? null
                  : new Prisma.Decimal(dto.exemptBelowBaseAmount),
            }
          : {}),
        ...(dto.periodMode !== undefined ? { periodMode: dto.periodMode } : {}),
        ...(dto.periodsPerYear !== undefined
          ? { periodsPerYear: dto.periodsPerYear }
          : {}),
        ...(dto.ledgerAccountCode !== undefined
          ? { ledgerAccountCode: dto.ledgerAccountCode?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Close a rule off, keeping the rows that reference it.
   *
   * Payslip lines point at the rule they were calculated from, so deleting one
   * would strip a payslip of its explanation. Retiring it and setting `validTo` is
   * the operation that means "this stopped applying", and it is reversible.
   */
  async retire(id: string, organizationId: string, validTo?: Date) {
    const existing = await this.record(id, organizationId);

    return this.prisma.payrollRule.update({
      where: { id },
      data: {
        isActive: false,
        validTo: validTo ?? existing.validTo ?? new Date(),
      },
    });
  }

  async record(
    id: string,
    organizationId: string | undefined,
    tx: Tx = this.prisma,
  ) {
    return requireRecord(
      tx.payrollRule.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
      }),
      'Payroll rule',
    );
  }

  // ================================================================= helpers

  /**
   * A rule that cannot be computed is refused at write time.
   *
   * A percentage rule with no rate, or a banded rule with no ladder, does not
   * throw when a payslip runs — it produces zero, quietly, which is the specific
   * outcome this module is built to prevent.
   */
  private assertCoherent(dto: CreatePayrollRuleDto) {
    const type = dto.type ?? PayrollRuleType.PERCENTAGE;

    if (type === PayrollRuleType.PERCENTAGE && dto.ratePercent == null) {
      throw new BadRequestException(
        'A percentage rule needs a rate. Without one it silently deducts nothing.',
      );
    }

    if (type === PayrollRuleType.PROGRESSIVE_BANDS) {
      const bands = dto.bands;
      if (!Array.isArray(bands) || bands.length === 0) {
        throw new BadRequestException(
          'A banded rule needs a ladder of bands. Without one it silently deducts nothing.',
        );
      }
      if (!bands.some((band) => (band.upTo ?? null) === null)) {
        throw new BadRequestException(
          'The ladder needs a final band with no upper limit, or income above the last band is never taxed.',
        );
      }
      let previous = 0;
      for (const band of bands) {
        // `upTo` is optional on the DTO so `null` survives class-transformer, which
        // would strip an absent value and make "the open-ended band" unreadable.
        // An absent limit is the same as an explicit null.
        const limit = band.upTo ?? null;
        if (limit !== null) {
          if (limit <= previous) {
            throw new BadRequestException(
              'Band limits must increase. A ladder that goes backwards means part of the income is taxed twice and part of it never.',
            );
          }
          previous = limit;
        }
      }
    }

    if (
      type === PayrollRuleType.FIXED &&
      dto.ratePercent != null &&
      !dto.bands
    ) {
      throw new BadRequestException(
        'A fixed rule charges a fixed amount. A rate belongs on a percentage rule.',
      );
    }

    if (type === PayrollRuleType.FIXED && dto.amount == null && !dto.bands) {
      throw new BadRequestException(
        'A fixed rule needs an amount. Without one it silently deducts nothing, which looks like a working rule on the list.',
      );
    }

    if (
      dto.minimumBaseAmount != null &&
      dto.maximumBaseAmount != null &&
      dto.minimumBaseAmount > dto.maximumBaseAmount
    ) {
      throw new BadRequestException(
        'The minimum base is above the maximum base, so every salary is below the floor or above the ceiling and the rule can never apply as written.',
      );
    }

    if (dto.validFrom && dto.validTo && dto.validTo <= dto.validFrom) {
      throw new BadRequestException(
        'The end of the window is before its start.',
      );
    }
  }

  private toInput(rule: PayrollRule): PayrollRuleInput {
    return {
      id: rule.id,
      code: rule.code,
      name: rule.name,
      type: rule.type,
      base: rule.base,
      bearer: rule.bearer,
      ratePercent: rule.ratePercent == null ? null : Number(rule.ratePercent),
      amount: rule.amount == null ? null : Number(rule.amount),
      minimumBaseAmount:
        rule.minimumBaseAmount == null ? null : Number(rule.minimumBaseAmount),
      maximumBaseAmount:
        rule.maximumBaseAmount == null ? null : Number(rule.maximumBaseAmount),
      exemptBelowBaseAmount:
        rule.exemptBelowBaseAmount == null
          ? null
          : Number(rule.exemptBelowBaseAmount),
      bands: (rule.bands as unknown as PayrollRuleInput['bands']) ?? null,
      periodMode: rule.periodMode,
      periodsPerYear: rule.periodsPerYear,
      kind: 'STATUTORY',
      ledgerAccountCode: rule.ledgerAccountCode,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('payroll_rules_organizationId_code_countryCode') ||
      (message.includes('Unique constraint') && message.includes('code'))
    );
  }
}
