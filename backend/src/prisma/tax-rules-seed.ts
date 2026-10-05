import { PrismaClient, TaxBasis, TaxTreatment } from '@prisma/client';

/**
 * Example tax rule sets, one per jurisdiction.
 *
 * These are **starting points for an accountant to confirm**, not legal
 * advice, and nothing in the engine depends on them existing — an organization
 * with no rules for its country simply has no tax on its invoices, which is the
 * correct behaviour for a jurisdiction this list has not heard of yet.
 *
 * They exist to demonstrate that tax really is configuration: the same engine
 * bills Kenya, Germany and California from three different rows, and swapping
 * jurisdictions is a change to the organization's country code, not to code.
 */
interface SeedTaxRule {
  countryCode: string;
  regionCode?: string;
  code: string;
  name: string;
  rate: number;
  basis: TaxBasis;
  treatment: TaxTreatment;
  ledgerAccountCode: string;
  compoundsOn?: string;
  /** Variants of one tax share a code and differ only by this. */
  appliesToCategory?: string;
}

export const EXAMPLE_TAX_RULES: SeedTaxRule[] = [
  // Kenya — VAT on standard-rated residential rent.
  {
    countryCode: 'KE',
    code: 'VAT',
    name: 'Value Added Tax',
    rate: 16,
    basis: TaxBasis.EXCLUSIVE,
    treatment: TaxTreatment.CHARGED,
    ledgerAccountCode: '2100',
  },
  {
    countryCode: 'KE',
    code: 'WHT',
    name: 'Withholding Tax (rent)',
    rate: 5,
    basis: TaxBasis.EXCLUSIVE,
    treatment: TaxTreatment.WITHHELD,
    ledgerAccountCode: '2200',
  },

  // United Kingdom — VAT quoted inclusive, as consumer bills must be.
  {
    countryCode: 'GB',
    code: 'VAT',
    name: 'Value Added Tax',
    rate: 20,
    basis: TaxBasis.INCLUSIVE,
    treatment: TaxTreatment.CHARGED,
    ledgerAccountCode: '2100',
  },

  // Germany — a standard rate plus a reduced rate for residential letting.
  // Both are the same tax (code `VAT`), differing only by category, so a line
  // picks one or the other. Two rules with different codes would be two
  // different taxes and both would apply.
  {
    countryCode: 'DE',
    code: 'VAT',
    name: 'Umsatzsteuer',
    rate: 19,
    basis: TaxBasis.EXCLUSIVE,
    treatment: TaxTreatment.CHARGED,
    ledgerAccountCode: '2100',
  },
  {
    countryCode: 'DE',
    code: 'VAT',
    name: 'Umsatzsteuer (ermäßigter Satz)',
    rate: 7,
    basis: TaxBasis.EXCLUSIVE,
    treatment: TaxTreatment.CHARGED,
    ledgerAccountCode: '2100',
    appliesToCategory: 'residential_rent',
  },

  // United States — no federal VAT; sales tax varies by state, so it is a
  // sub-national rule. California is the example, purely to show the region
  // mechanism working.
  {
    countryCode: 'US',
    regionCode: 'CA',
    code: 'SALES_TAX',
    name: 'California Sales Tax',
    rate: 8.75,
    basis: TaxBasis.EXCLUSIVE,
    treatment: TaxTreatment.CHARGED,
    ledgerAccountCode: '2100',
  },
  {
    countryCode: 'US',
    regionCode: 'TX',
    code: 'SALES_TAX',
    name: 'Texas Sales Tax',
    rate: 8.25,
    basis: TaxBasis.EXCLUSIVE,
    treatment: TaxTreatment.CHARGED,
    ledgerAccountCode: '2100',
  },
];

/**
 * Install the example rules that apply to an organization's own jurisdiction.
 * Shared (country-less) rules are created once; rules already present are left
 * alone, so running this again is harmless.
 */
export async function seedTaxRulesForOrganization(
  prisma: PrismaClient,
  organizationId: string,
): Promise<number> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { taxCountryCode: true, taxRegionCode: true },
  });
  if (!org?.taxCountryCode) return 0;

  const applicable = EXAMPLE_TAX_RULES.filter(
    (rule) =>
      rule.countryCode === org.taxCountryCode &&
      (!rule.regionCode || rule.regionCode === org.taxRegionCode),
  );
  if (applicable.length === 0) return 0;

  let created = 0;
  for (const rule of applicable) {
    const existing = await prisma.taxRule.findFirst({
      where: {
        organizationId,
        code: rule.code,
        countryCode: rule.countryCode,
        regionCode: rule.regionCode ?? null,
        appliesToCategory: rule.appliesToCategory ?? '*',
      },
    });
    if (existing) continue;

    let compoundOnRuleId: string | undefined;
    if (rule.compoundsOn) {
      const base = await prisma.taxRule.findFirst({
        where: {
          organizationId,
          code: rule.compoundsOn,
          countryCode: rule.countryCode,
        },
      });
      compoundOnRuleId = base?.id;
    }

    await prisma.taxRule.create({
      data: {
        organizationId,
        countryCode: rule.countryCode,
        regionCode: rule.regionCode ?? null,
        code: rule.code,
        name: rule.name,
        rate: rule.rate,
        appliesToCategory: rule.appliesToCategory ?? '*',
        basis: rule.basis,
        treatment: rule.treatment,
        isCompound: Boolean(rule.compoundsOn),
        compoundOnRuleId: compoundOnRuleId ?? null,
        ledgerAccountCode: rule.ledgerAccountCode,
        isActive: true,
        validFrom: new Date('2020-01-01'),
      },
    });
    created += 1;
  }

  return created;
}
