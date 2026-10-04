import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TaxBasis,
  TaxRule as TaxRuleModel,
  TaxTreatment,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { AccountingService } from '../accounting/accounting.service';
import {
  ApplicableTax,
  ComputedInvoice,
  TaxableLine,
  computeInvoiceTax,
  orderTaxRules,
} from './tax-calculator';

type Tx = Prisma.TransactionClient;

/** A rule as the queries below load it: with the tax it compounds onto. */
type ResolvedRule = TaxRuleModel & { compoundsOn: { code: string }[] };

export interface TaxContext {
  countryCode: string | null;
  regionCode: string | null;
  currency: string;
  registrationNumber: string | null;
  /** Rules resolved for this context, ordered so compound taxes come last. */
  rules: ApplicableTax[];
}

/**
 * Module 7 — Finance & Accounting: the configurable tax rules engine.
 *
 * Everything country-specific lives in data. `TaxRule` rows carry the country,
 * region, code, rate, whether the price includes the tax, and which ledger
 * account collects it; an organization says which country (and optionally
 * region) it operates in. This service resolves the rules that apply at a point
 * in time and hands them to the pure calculator.
 *
 * Resolution order for an organization, most specific first:
 *   1. a rule for the org's country **and** region,
 *   2. a rule for the org's country,
 *   3. a rule with no country at all (the organization's fallback).
 *
 * Two rules of the same code never both apply — a jurisdiction has one rate per
 * tax at a time, so the more specific rule wins rather than stacking.
 */
@Injectable()
export class TaxService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
  ) {}

  /**
   * Rules that apply to an organization on a given date.
   *
   * `validFrom`/`validTo` mean a rate change is a data edit: an invoice dated
   * last quarter still resolves the rate that was in force then, with no
   * migration and no historical rewriting.
   */
  async resolveRules(
    organizationId: string,
    at: Date = new Date(),
    tx: Tx = this.prisma,
  ): Promise<ApplicableTax[]> {
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: {
        taxCountryCode: true,
        taxRegionCode: true,
        currency: true,
        taxRegistrationNumber: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');

    return this.rulesFor(
      {
        countryCode: org.taxCountryCode,
        regionCode: org.taxRegionCode,
      },
      organizationId,
      at,
      tx,
    );
  }

  /** The country/region an organization invoices under, as a short label. */
  async jurisdictionOf(organizationId: string, tx: Tx = this.prisma) {
    const org = await requireRecord(
      tx.organization.findUnique({
        where: { id: organizationId },
        select: {
          taxCountryCode: true,
          taxRegionCode: true,
          currency: true,
          taxRegistrationNumber: true,
        },
      }),
      'Organization',
    );
    return {
      countryCode: org.taxCountryCode,
      regionCode: org.taxRegionCode,
      currency: org.currency,
      registrationNumber: org.taxRegistrationNumber,
      label: org.taxRegionCode
        ? `${org.taxCountryCode}-${org.taxRegionCode}`
        : (org.taxCountryCode ?? ''),
    };
  }

  /**
   * Resolve the applicable rules for an explicit country/region. Exposed so a
   * quote or a multi-entity group can price for a jurisdiction other than the
   * organization's own.
   */
  async rulesFor(
    jurisdiction: { countryCode: string | null; regionCode: string | null },
    organizationId: string,
    at: Date = new Date(),
    tx: Tx = this.prisma,
  ): Promise<ApplicableTax[]> {
    const countryFilter: Prisma.TaxRuleWhereInput = jurisdiction.countryCode
      ? {
          OR: [
            { countryCode: jurisdiction.countryCode },
            { countryCode: null },
          ],
        }
      : {};

    const candidates = await tx.taxRule.findMany({
      where: {
        AND: [
          { OR: [{ organizationId }, { organizationId: null }] },
          { isActive: true },
          countryFilter,
        ],
      },
      include: { compoundsOn: { select: { code: true } } },
    });

    const matching = candidates.filter(
      (rule) =>
        rule.validFrom <= at && (rule.validTo === null || rule.validTo > at),
    );

    // Most specific wins per tax code: org+region beats org+country beats the
    // shared fallback.
    const bestByCode = new Map<string, ResolvedRule>();
    for (const rule of matching) {
      const score = this.specificity(rule, jurisdiction);
      const current = bestByCode.get(rule.code);
      if (!current || score > this.specificity(current, jurisdiction)) {
        bestByCode.set(rule.code, rule);
      }
    }

    return orderTaxRules(
      [...bestByCode.values()].map((rule) => this.toApplicable(rule)),
    );
  }

  private specificity(
    rule: TaxRuleModel,
    jurisdiction: { countryCode: string | null; regionCode: string | null },
  ): number {
    let score = 0;
    if (rule.countryCode && rule.countryCode === jurisdiction.countryCode)
      score += 2;
    if (rule.countryCode === null) score -= 1;
    if (rule.regionCode && rule.regionCode === jurisdiction.regionCode)
      score += 4;
    if (rule.regionCode && rule.regionCode !== jurisdiction.regionCode)
      return -1;
    // An org-specific rule beats the shared one at the same specificity.
    if (rule.organizationId) score += 1;
    return score;
  }

  private toApplicable(rule: ResolvedRule): ApplicableTax {
    return {
      id: rule.id,
      code: rule.code,
      name: rule.name,
      ratePercent: Number(rule.rate),
      basis: rule.basis,
      treatment: rule.treatment,
      isCompound: rule.isCompound,
      compoundOnCode: rule.compoundsOn[0]?.code,
      ledgerAccountCode: rule.ledgerAccountCode ?? undefined,
      appliesToCategory: rule.appliesToCategory,
    };
  }

  /**
   * Price an invoice under the organization's rules.
   *
   * Returns the per-line split and the per-rule summary the ledger needs. The
   * caller decides what to do with it — `InvoicesService` uses it to fill the
   * invoice, but a quote can use the same function without writing anything.
   */
  async computeFor(
    organizationId: string,
    lines: TaxableLine[],
    options?: {
      at?: Date;
      jurisdiction?: { countryCode: string | null; regionCode: string | null };
    },
    tx: Tx = this.prisma,
  ): Promise<
    ComputedInvoice & { jurisdiction: string; rules: ApplicableTax[] }
  > {
    const at = options?.at ?? new Date();
    const jurisdiction =
      options?.jurisdiction ?? (await this.jurisdictionOf(organizationId, tx));
    const rules = await this.rulesFor(jurisdiction, organizationId, at, tx);
    const computed = computeInvoiceTax(lines, rules);

    return {
      ...computed,
      jurisdiction: jurisdiction.regionCode
        ? `${jurisdiction.countryCode}-${jurisdiction.regionCode}`
        : (jurisdiction.countryCode ?? ''),
      rules,
    };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  findAll(
    organizationId?: string,
    filters?: { countryCode?: string; at?: Date },
  ) {
    const where: Prisma.TaxRuleWhereInput = organizationId
      ? { OR: [{ organizationId }, { organizationId: null }] }
      : {};
    if (filters?.countryCode) where.countryCode = filters.countryCode;
    if (filters?.at) {
      where.validFrom = { lte: filters.at };
      where.AND = [
        { OR: [{ validTo: null }, { validTo: { gt: filters.at } }] },
      ];
    }

    return this.prisma.taxRule.findMany({
      where,
      include: { compoundOnRule: true, compoundsOn: true },
      orderBy: [{ countryCode: 'asc' }, { code: 'asc' }, { validFrom: 'desc' }],
    });
  }

  async findOne(id: string, organizationId?: string) {
    const rule = await requireRecord(
      this.prisma.taxRule.findFirst({
        where: { id, ...(organizationId && { organizationId }) },
        include: { compoundOnRule: true, compoundsOn: true },
      }),
      'Tax rule',
    );
    return rule;
  }

  /**
   * Create or replace a rule.
   *
   * Changing a rate closes the old rule with a `validTo` and opens a new one,
   * rather than editing in place — an invoice issued under the old rate must
   * keep citing it. Passing the existing `id` is how the UI says "supersede".
   */
  async create(
    data: {
      id?: string;
      code: string;
      name: string;
      description?: string;
      countryCode?: string | null;
      regionCode?: string | null;
      basis?: TaxBasis;
      treatment?: TaxTreatment;
      appliesToCategory?: string;
      isCompound?: boolean;
      compoundOnRuleId?: string | null;
      ratePercent: number;
      ledgerAccountCode?: string;
      validFrom?: Date | string;
      validTo?: Date | string;
    },
    organizationId?: string,
  ) {
    const rate = Number(data.ratePercent);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new BadRequestException(
        `Tax rate must be a percentage between 0 and 100, received ${data.ratePercent}`,
      );
    }
    if (data.countryCode && !/^[A-Za-z]{2}$/.test(data.countryCode)) {
      throw new BadRequestException(
        'Country must be an ISO-3166-1 alpha-2 code, e.g. KE, GB, DE, US',
      );
    }

    const validFrom = data.validFrom ? new Date(data.validFrom) : new Date();
    const validTo = data.validTo ? new Date(data.validTo) : null;
    if (validTo && validTo <= validFrom) {
      throw new BadRequestException('validTo must be after validFrom');
    }
    if (data.isCompound && !data.compoundOnRuleId) {
      throw new BadRequestException(
        'A compound tax must name the tax it is calculated on top of',
      );
    }

    const base = {
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      description: data.description,
      countryCode: data.countryCode ? data.countryCode.toUpperCase() : null,
      regionCode: data.regionCode ? data.regionCode.toUpperCase() : null,
      basis: data.basis ?? TaxBasis.EXCLUSIVE,
      treatment: data.treatment ?? TaxTreatment.CHARGED,
      appliesToCategory: data.appliesToCategory ?? '*',
      isCompound: data.isCompound ?? false,
      compoundOnRuleId: data.isCompound ? data.compoundOnRuleId : null,
      rate,
      ledgerAccountCode: data.ledgerAccountCode ?? '2100',
      isActive: true,
      organizationId: organizationId ?? null,
    };

    // Supersede: close the previous rule rather than rewriting it.
    if (data.id) {
      const previous = await this.findOne(data.id, organizationId);
      await this.prisma.taxRule.update({
        where: { id: previous.id },
        data: { validTo: validFrom },
      });
    }

    return this.prisma.taxRule.create({
      data: { ...base, validFrom, validTo },
      include: { compoundOnRule: true },
    });
  }

  /**
   * Record tax remitted to the authority.
   *
   * Kept in the tax module because that is where the question lives, but it moves
   * money, so it posts through `AccountingService` like everything else — the
   * ledger has exactly one write path and this is not an exception to it.
   */
  async remit(
    data: {
      amount: number;
      remittanceDate?: string;
      /** Which liability is being settled — VAT, withholding tax, … */
      code?: string;
      clearsWithholding?: boolean;
      bankAccountCode?: string;
      reference?: string;
    },
    organizationId: string,
  ) {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Remittance amount must be greater than zero',
      );
    }

    // A numeric code is already an account code; a tax code like "VAT" is
    // resolved to whichever account the organization's rules say collects it.
    const isAccountCode = (data.code ?? '').match(/^\d+$/) !== null;
    const payableAccountCode = isAccountCode
      ? data.code
      : await this.accountCodeFor(data.code ?? '', organizationId);

    const entry = await this.accountingService.postTaxRemittance(
      {
        amount,
        remittanceDate: data.remittanceDate
          ? new Date(data.remittanceDate)
          : new Date(),
        payableAccountCode,
        fromAccountCode: data.bankAccountCode,
        description: `${data.code ?? 'Tax'} remitted`,
        reference: data.reference,
        sourceRef: { type: 'TAX_REMITTANCE', code: data.code ?? null },
      },
      organizationId,
    );

    return entry;
  }

  /**
   * Map a tax code to the ledger account that collects it, using the rules in
   * force for the organization's jurisdiction. Returns undefined when no rule
   * matches, in which case the caller must name the account explicitly rather
   * than guess.
   */
  async accountCodeFor(
    code: string,
    organizationId?: string,
    tx: Tx = this.prisma,
  ): Promise<string | undefined> {
    if (!organizationId) return undefined;
    const rules = await this.resolveRules(organizationId, new Date(), tx);
    return rules.find((rule) => rule.code === code)?.ledgerAccountCode;
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
      validTo?: Date | string;
    },
    organizationId?: string,
  ) {
    await this.findOne(id, organizationId);
    // Rate, country, region and basis are deliberately immutable — changing any
    // of them changes what past documents meant, so it goes through `create`
    // with the same `id` to supersede.
    return this.prisma.taxRule.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        validTo: data.validTo ? new Date(data.validTo) : undefined,
      },
    });
  }

  async remove(id: string, organizationId?: string) {
    const rule = await this.findOne(id, organizationId);
    const used = await this.prisma.invoiceItem.count({
      where: { taxRuleId: rule.id },
    });
    if (used > 0) {
      throw new BadRequestException(
        `This rule has been used on ${used} invoice line(s) and cannot be deleted — close it with an end date instead`,
      );
    }
    return this.prisma.taxRule.delete({ where: { id: rule.id } });
  }

  /** Set the country (and optional region) an organization invoices under. */
  async setJurisdiction(
    organizationId: string,
    data: {
      countryCode?: string | null;
      regionCode?: string | null;
      taxRegistrationNumber?: string | null;
    },
  ) {
    if (data.countryCode && !/^[A-Za-z]{2}$/.test(data.countryCode)) {
      throw new BadRequestException(
        'Country must be an ISO-3166-1 alpha-2 code, e.g. KE, GB, DE, US',
      );
    }
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        taxCountryCode: data.countryCode
          ? data.countryCode.toUpperCase()
          : (data.countryCode ?? undefined),
        taxRegionCode: data.regionCode
          ? data.regionCode.toUpperCase()
          : (data.regionCode ?? undefined),
        taxRegistrationNumber: data.taxRegistrationNumber,
      },
      select: {
        id: true,
        taxCountryCode: true,
        taxRegionCode: true,
        taxRegistrationNumber: true,
        currency: true,
      },
    });
  }
}
