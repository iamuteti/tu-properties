/**
 * The single source of copy for the public landing page.
 *
 * Every claim in here is traceable to code, seed data or a module document.
 * The rule that governs this file: **no claim without a source**. If a number,
 * role name, country or capability cannot be traced, it does not belong here.
 *
 * `MARKETS` is copied by hand from `backend/src/prisma/jurisdictions.ts` (the
 * backend owns the jurisdiction profiles). It is deliberately *not* imported —
 * the frontend must not depend on backend source — so the two files have to be
 * kept in step by hand. The values below are the ones the seeder uses.
 */

export interface MarketProfile {
  /** ISO-3166-1 alpha-2. */
  code: string;
  country: string;
  /** The seeded organization for this market (`corporateNames[0]` in the profile). */
  organization: string;
  /** ISO-4217. */
  currency: string;
  /** BCP-47. */
  locale: string;
  /** IANA. */
  timezone: string;
  /** Consumption tax rate as a percentage. The United States has no national rate. */
  vatRate: number;
  /** What the consumption tax is called in this market. */
  taxName: string;
  /** What the tax card says — the derived rate, or the reason there is no rate. */
  taxLabel: string;
  /** The label the landlord's tax identifier carries. */
  taxIdLabel: string;
  /** An identifier in this market's real shape. */
  taxIdExample: string;
  /** E.164 country code. */
  phoneCountryCode: string;
  /** A tenant number in this market's real format. */
  phoneExample: string;
  /** Monthly residential rent band, in the local currency. */
  rentMin: number;
  rentMax: number;
  /** The utility tariffs the seeder installs for this market. */
  electricity: { unit: string; rate: number };
  water: { unit: string; rate: number };
  gas: { unit: string; rate: number };
  /** The city the market organization sits in. */
  city: string;
  /** Four illustrative properties, named from the market's own prefixes/suffixes. */
  properties: { name: string; unitCount: number; type: string; occupancy: string }[];
  /** Whether the sandbox exposes a direct login for this market. */
  hasDemoLogin: boolean;
}

/**
 * Every market profile the platform ships — the complete set.
 *
 * These are the values the seeder uses (`backend/src/prisma/jurisdictions.ts`).
 * The backend owns the profiles; the frontend must not import backend source,
 * so this is a copy that has to be kept in step by hand.
 */
export const ALL_MARKETS: MarketProfile[] = [
  {
    code: 'KE',
    country: 'Kenya',
    organization: 'Rohi Estate Management',
    currency: 'KES',
    locale: 'en-KE',
    timezone: 'Africa/Nairobi',
    vatRate: 16,
    taxName: 'VAT',
    taxLabel: '16% VAT · 5% WHT',
    taxIdLabel: 'KRA PIN',
    taxIdExample: 'A7K2M9P4XQB',
    phoneCountryCode: '+254',
    phoneExample: '+254 712 345 678',
    rentMin: 35_000,
    rentMax: 120_000,
    electricity: { unit: 'kWh', rate: 24.5 },
    water: { unit: 'm3', rate: 120 },
    gas: { unit: 'm3', rate: 180 },
    city: 'Nairobi',
    properties: [
      { name: 'Riverside Heights', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Westlands Plaza', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Kilimani Gardens', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Lavington Towers', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: true
  },
  {
    code: 'ZA',
    country: 'South Africa',
    organization: 'Cape Town Property Group',
    currency: 'ZAR',
    locale: 'en-ZA',
    timezone: 'Africa/Johannesburg',
    vatRate: 15,
    taxName: 'VAT',
    taxLabel: '15% VAT',
    taxIdLabel: 'Tax Number',
    taxIdExample: '1234567890',
    phoneCountryCode: '+27',
    phoneExample: '+27 60 123 4567',
    rentMin: 6_000,
    rentMax: 25_000,
    electricity: { unit: 'kWh', rate: 2.5 },
    water: { unit: 'kl', rate: 45 },
    gas: { unit: 'kg', rate: 32 },
    city: 'Johannesburg',
    properties: [
      { name: 'Cape Heights', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Gauteng Plaza', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Durban Gardens', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Pretoria Towers', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  },
  {
    code: 'US',
    country: 'United States',
    organization: 'Liberty Property Group',
    currency: 'USD',
    locale: 'en-US',
    timezone: 'America/New_York',
    vatRate: 0,
    taxName: 'Sales tax',
    taxLabel: 'No federal VAT · sales tax by state',
    taxIdLabel: 'EIN',
    taxIdExample: '12-3456789',
    phoneCountryCode: '+1',
    phoneExample: '+1 201 555 0142',
    rentMin: 1_200,
    rentMax: 4_500,
    electricity: { unit: 'kWh', rate: 0.14 },
    water: { unit: 'gal', rate: 0.004 },
    gas: { unit: 'therm', rate: 1.2 },
    city: 'New York',
    properties: [
      { name: 'Liberty Heights', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Metro Plaza', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Pioneer Gardens', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Atlas Towers', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: true
  },
  {
    code: 'GB',
    country: 'United Kingdom',
    organization: 'Thames Property Group',
    currency: 'GBP',
    locale: 'en-GB',
    timezone: 'Europe/London',
    vatRate: 20,
    taxName: 'VAT',
    taxLabel: '20% VAT',
    taxIdLabel: 'UTR',
    taxIdExample: '1234567890',
    phoneCountryCode: '+44',
    phoneExample: '+44 7400 123456',
    rentMin: 900,
    rentMax: 3_200,
    electricity: { unit: 'kWh', rate: 0.34 },
    water: { unit: 'm3', rate: 2.5 },
    gas: { unit: 'kWh', rate: 0.1 },
    city: 'London',
    properties: [
      { name: 'Thames Heights', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Crown Plaza', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Britannia Gardens', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'London Prime Towers', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: true
  },
  {
    code: 'CA',
    country: 'Canada',
    organization: 'Maple Leaf Property Group',
    currency: 'CAD',
    locale: 'en-CA',
    timezone: 'America/Toronto',
    vatRate: 5,
    taxName: 'GST',
    taxLabel: '5% GST',
    taxIdLabel: 'BN',
    taxIdExample: '123456789',
    phoneCountryCode: '+1',
    phoneExample: '+1 416 555 0198',
    rentMin: 1_400,
    rentMax: 4_200,
    electricity: { unit: 'kWh', rate: 0.13 },
    water: { unit: 'm3', rate: 2.1 },
    gas: { unit: 'm3', rate: 0.45 },
    city: 'Toronto',
    properties: [
      { name: 'Maple Heights', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Toronto Plaza', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Vancouver Gardens', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Montreal Towers', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  },
  {
    code: 'AU',
    country: 'Australia',
    organization: 'Sydney Property Group',
    currency: 'AUD',
    locale: 'en-AU',
    timezone: 'Australia/Sydney',
    vatRate: 10,
    taxName: 'GST',
    taxLabel: '10% GST',
    taxIdLabel: 'ABN',
    taxIdExample: '12345678901',
    phoneCountryCode: '+61',
    phoneExample: '+61 400 123 456',
    rentMin: 1_200,
    rentMax: 3_800,
    electricity: { unit: 'kWh', rate: 0.32 },
    water: { unit: 'kl', rate: 2.5 },
    gas: { unit: 'MJ', rate: 0.04 },
    city: 'Sydney',
    properties: [
      { name: 'Sydney Heights', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Melbourne Plaza', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Brisbane Gardens', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Perth Towers', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: true
  },
  {
    code: 'DE',
    country: 'Germany',
    organization: 'Berlin Immobilien GmbH',
    currency: 'EUR',
    locale: 'de-DE',
    timezone: 'Europe/Berlin',
    vatRate: 19,
    taxName: 'USt',
    taxLabel: '19% USt · 7% reduced',
    taxIdLabel: 'Steuernummer',
    taxIdExample: '12/345/67890',
    phoneCountryCode: '+49',
    phoneExample: '+49 151 1234567',
    rentMin: 700,
    rentMax: 2_500,
    electricity: { unit: 'kWh', rate: 0.38 },
    water: { unit: 'm3', rate: 4.2 },
    gas: { unit: 'kWh', rate: 0.12 },
    city: 'Berlin',
    properties: [
      { name: 'Berlin Höhe', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'München Platz', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Hamburg Garten', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Frankfurt Turm', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  },
  {
    code: 'FR',
    country: 'France',
    organization: 'Paris Immobilier Gestion',
    currency: 'EUR',
    locale: 'fr-FR',
    timezone: 'Europe/Paris',
    vatRate: 20,
    taxName: 'TVA',
    taxLabel: '20% TVA',
    taxIdLabel: 'SIRET',
    taxIdExample: '12345678901234',
    phoneCountryCode: '+33',
    phoneExample: '+33 612 34 56 78',
    rentMin: 600,
    rentMax: 2_200,
    electricity: { unit: 'kWh', rate: 0.25 },
    water: { unit: 'm3', rate: 4 },
    gas: { unit: 'kWh', rate: 0.11 },
    city: 'Paris',
    properties: [
      { name: 'Résidence des Lilas', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Immeuble du Parc', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Le Clos Saint-Germain', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Les Jardins Belle Étoile', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  },
  {
    code: 'IN',
    country: 'India',
    organization: 'Mumbai Property Management',
    currency: 'INR',
    locale: 'en-IN',
    timezone: 'Asia/Kolkata',
    vatRate: 18,
    taxName: 'GST',
    taxLabel: '18% GST',
    taxIdLabel: 'GSTIN',
    taxIdExample: '27ABCDE1234F1Z5',
    phoneCountryCode: '+91',
    phoneExample: '+91 63 1234 5678',
    rentMin: 8_000,
    rentMax: 45_000,
    electricity: { unit: 'kWh', rate: 9.5 },
    water: { unit: 'm3', rate: 45 },
    gas: { unit: 'kg', rate: 90 },
    city: 'Mumbai',
    properties: [
      { name: 'Palm Grove Residencies', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Sunrise Apartments', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Green Meadows Heights', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Lakeview Court', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  },
  {
    code: 'CN',
    country: 'China',
    organization: 'Shanghai Property Services',
    currency: 'CNY',
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    vatRate: 13,
    taxName: 'VAT',
    taxLabel: '13% VAT',
    taxIdLabel: 'USCC',
    taxIdExample: '91310000MA1FL0AB7X',
    phoneCountryCode: '+86',
    phoneExample: '+86 130 1234 5678',
    rentMin: 1_500,
    rentMax: 9_000,
    electricity: { unit: 'kWh', rate: 0.65 },
    water: { unit: 'm3', rate: 5.5 },
    gas: { unit: 'm3', rate: 3.5 },
    city: 'Shanghai',
    properties: [
      { name: 'Jinjiang Garden', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Lanyuan Residence', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Huayuan Court', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Xiangyun Plaza', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  },
  {
    code: 'JP',
    country: 'Japan',
    organization: 'Tokyo Property Services',
    currency: 'JPY',
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
    vatRate: 10,
    taxName: 'CT',
    taxLabel: '10% consumption tax',
    taxIdLabel: 'Corporate No.',
    taxIdExample: '1234567890123',
    phoneCountryCode: '+81',
    phoneExample: '+81 090 1234 5678',
    rentMin: 55_000,
    rentMax: 180_000,
    electricity: { unit: 'kWh', rate: 27 },
    water: { unit: 'm3', rate: 320 },
    gas: { unit: 'm3', rate: 120 },
    city: 'Tokyo',
    properties: [
      { name: 'Sakura Heights', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Midori Residence', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Hikari Garden', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Fuji Tower', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  },
  {
    code: 'KR',
    country: 'South Korea',
    organization: 'Seoul Property Services',
    currency: 'KRW',
    locale: 'ko-KR',
    timezone: 'Asia/Seoul',
    vatRate: 10,
    taxName: 'VAT',
    taxLabel: '10% VAT',
    taxIdLabel: 'Business No.',
    taxIdExample: '1234567890',
    phoneCountryCode: '+82',
    phoneExample: '+82 010 1234 5678',
    rentMin: 400_000,
    rentMax: 1_500_000,
    electricity: { unit: 'kWh', rate: 155 },
    water: { unit: 'm3', rate: 690 },
    gas: { unit: 'm3', rate: 520 },
    city: 'Seoul',
    properties: [
      { name: 'Hanbit Residence', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Saemaeul Heights', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Cheongdam Garden', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Dongtan Tower', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  },
  {
    code: 'BR',
    country: 'Brazil',
    organization: 'São Paulo Property Management',
    currency: 'BRL',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    vatRate: 17,
    taxName: 'VAT',
    taxLabel: '17% VAT',
    taxIdLabel: 'CNPJ',
    taxIdExample: '12.345.678/0001-95',
    phoneCountryCode: '+55',
    phoneExample: '+55 11 91234 5678',
    rentMin: 1_200,
    rentMax: 6_000,
    electricity: { unit: 'kWh', rate: 0.95 },
    water: { unit: 'm3', rate: 12 },
    gas: { unit: 'm3', rate: 6.5 },
    city: 'São Paulo',
    properties: [
      { name: 'Alphaville Residências', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Jardim Apartamentos', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Vila Torres', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Condomínio Jardim', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  },
  {
    code: 'MX',
    country: 'Mexico',
    organization: 'Ciudad de México Property Management',
    currency: 'MXN',
    locale: 'es-MX',
    timezone: 'America/Mexico_City',
    vatRate: 16,
    taxName: 'VAT',
    taxLabel: '16% VAT',
    taxIdLabel: 'RFC',
    taxIdExample: 'G56O56123G85',
    phoneCountryCode: '+52',
    phoneExample: '+52 55 1234 5678',
    rentMin: 6_000,
    rentMax: 28_000,
    electricity: { unit: 'kWh', rate: 3.2 },
    water: { unit: 'm3', rate: 65 },
    gas: { unit: 'm3', rate: 25 },
    city: 'Mexico City',
    properties: [
      { name: 'Pórtico Residencias', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Bosque Departamentos', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Altavista Torre', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Rincón Jardín', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  },
  {
    code: 'AE',
    country: 'United Arab Emirates',
    organization: 'Dubai Properties Group',
    currency: 'AED',
    locale: 'en-AE',
    timezone: 'Asia/Dubai',
    vatRate: 5,
    taxName: 'VAT',
    taxLabel: '5% VAT',
    taxIdLabel: 'TRN',
    taxIdExample: '100123456789012',
    phoneCountryCode: '+971',
    phoneExample: '+971 50 123 4567',
    rentMin: 4_000,
    rentMax: 22_000,
    electricity: { unit: 'kWh', rate: 0.38 },
    water: { unit: 'm3', rate: 3.5 },
    gas: { unit: 'm3', rate: 2.8 },
    city: 'Dubai',
    properties: [
      { name: 'Dubai Heights', unitCount: 64, type: 'Commercial/Res', occupancy: '96.8%' },
      { name: 'Abu Dhabi Plaza', unitCount: 48, type: 'Residential', occupancy: '91.6%' },
      { name: 'Marina Gardens', unitCount: 24, type: 'Mixed Use', occupancy: '100.0%' },
      { name: 'Palm Towers', unitCount: 12, type: 'Boutique Multi-Family', occupancy: '100.0%' }
    ],
    hasDemoLogin: false
  }
];

/**
 * Which markets the public landing page shows.
 *
 * Driven by `NEXT_PUBLIC_LANDING_MARKETS` in `frontend/.env` — a
 * comma-separated list of ISO-3166-1 alpha-2 codes, in the order they should
 * appear. Leave it unset and every market shows. The env var decides what the
 * page talks about; the profile itself is still the copy above.
 */
function parseMarketCodes(value: string | undefined): string[] {
  if (value === undefined) return ALL_MARKETS.map((market) => market.code);
  const codes = value
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  if (codes.length === 0) return ALL_MARKETS.map((market) => market.code);
  return codes;
}

const REQUESTED_MARKET_CODES = parseMarketCodes(process.env.NEXT_PUBLIC_LANDING_MARKETS);

const KNOWN_MARKET_CODES = new Set(ALL_MARKETS.map((market) => market.code));

const REQUESTED_MARKETS = REQUESTED_MARKET_CODES.map((code) =>
  ALL_MARKETS.find((market) => market.code === code)
).filter((market): market is MarketProfile => Boolean(market));

if (process.env.NODE_ENV !== 'production') {
  const unknown = REQUESTED_MARKET_CODES.filter((code) => !KNOWN_MARKET_CODES.has(code));
  if (unknown.length > 0) {
    console.warn(
      `[landing] NEXT_PUBLIC_LANDING_MARKETS names unknown market code(s): ${unknown.join(', ')}. ` +
        `Known codes: ${[...KNOWN_MARKET_CODES].join(', ')}.`
    );
  }
}

/**
 * The markets on the page, in the order `NEXT_PUBLIC_LANDING_MARKETS` gave.
 * Never empty — a list of only unknown codes falls back to every market.
 */
export const MARKETS: MarketProfile[] =
  REQUESTED_MARKETS.length > 0 ? REQUESTED_MARKETS : ALL_MARKETS;

export const MARKET_CODES = MARKETS.map((market) => market.code);

export function getMarket(code: string): MarketProfile {
  return MARKETS.find((market) => market.code === code) ?? MARKETS[0];
}

/** The midpoint of a market's residential rent band — the "typical" rent. */
export function marketMidRent(market: MarketProfile): number {
  return Math.round((market.rentMin + market.rentMax) / 2);
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty'
];

/** Spell a small count out for the copy — "fifteen local realities". */
export function numberWord(count: number): string {
  if (count >= 0 && count <= NUMBER_WORDS.length - 1) return NUMBER_WORDS[count];
  return String(count);
}

/**
 * Format a number as money in a market's own currency and locale.
 * Uses `Intl`, so JPY gets no decimals and EUR gets `1.234,56`.
 */
export function formatMoney(amount: number, market: MarketProfile, fractionDigits = 0): string {
  try {
    return new Intl.NumberFormat(market.locale, {
      style: 'currency',
      currency: market.currency,
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits
    }).format(amount);
  } catch {
    return `${market.currency} ${amount.toLocaleString()}`;
  }
}

export interface FeatureItem {
  id: string;
  number: string;
  title: string;
  tagline: string;
  proofPoint: string;
  category: string;
  iconName: string;
  details: {
    label: string;
    value: string;
  }[];
  architectureBadge: string;
}

export const FEATURES: FeatureItem[] = [
  {
    id: 'property-units',
    number: '01',
    title: 'Property & Units',
    tagline: 'From boutique 12-unit residential apartments to multi-story commercial towers',
    proofPoint: 'Supports single-building landlords with 12 units up to multi-property portfolios; live occupancy tracking synced directly from leases.',
    category: 'Asset Management',
    iconName: 'Building2',
    architectureBadge: 'Live Lease State Machine',
    details: [
      { label: 'Scale Range', value: 'Seamlessly accommodates 12-unit walk-ups to 100+ multi-story commercial complexes' },
      { label: 'Occupancy Sync', value: 'Derived automatically from active leases; zero manual toggle lag' },
      { label: 'Data Onboarding', value: 'CSV import engine with dry-run preview and per-row error isolation' }
    ]
  },
  {
    id: 'leasing-portal',
    number: '02',
    title: 'Leasing & Tenant Portal',
    tagline: 'Digital lifecycle management from application to move-out settlement',
    proofPoint: 'Digital lease lifecycle (activate, renew, extend, terminate) with a tenant-facing portal for invoices, receipts, documents and repair requests.',
    category: 'Lease Operations',
    iconName: 'FileCheck2',
    architectureBadge: 'Lifecycle Guards',
    details: [
      { label: 'Lifecycle States', value: 'Strict transitions: Draft → Pending Approval → Active → Renewed/Extended → Terminated' },
      { label: 'Tenant Self-Service', value: 'Dedicated web portal for payment history, invoice download, and maintenance tickets' },
      { label: 'Scoped Isolation', value: 'A resident sees only their own invoices, receipts, documents and repair requests' }
    ]
  },
  {
    id: 'owner-statements',
    number: '03',
    title: 'Owner Statements & Payouts',
    tagline: 'Audit-grade landlord accounting without manual spreadsheets',
    proofPoint: 'Owner income derived from real payment rows (never typed in), management fees, payouts with transfer references. Owners get statements by email/SMS.',
    category: 'Owner Relations',
    iconName: 'ReceiptText',
    architectureBadge: 'Payment-Row Derived Ledger',
    details: [
      { label: 'Income Derivation', value: 'Calculated strictly from matched tenant payments; never manually typed or estimated' },
      { label: 'Fee Deduction', value: 'Configurable management fee percentages deducted before net disbursement' },
      { label: 'Multi-Channel Dispatch', value: 'Monthly statements and payout receipts dispatched by the Notifications module over email and SMS' }
    ]
  },
  {
    id: 'finance-accounting',
    number: '04',
    title: 'Finance & Accounting',
    tagline: 'Double-entry general ledger with tax rules configured as data',
    proofPoint: 'Real general ledger, jurisdiction tax engine (VAT, withholding tax as configuration, not code), supplier bills.',
    category: 'Core Accounting',
    iconName: 'Scale',
    architectureBadge: 'Double-Entry General Ledger',
    details: [
      { label: 'Ledger Engine', value: 'Balanced debits and credits posted on every financial event with immutability' },
      { label: 'Tax Configuration', value: 'VAT, sales tax & withholding tax (WHT) defined via rulesets per jurisdiction and region' },
      { label: 'Accounts Payable', value: 'Supplier bill ingestion, three-way matching against work orders, and aging reports' }
    ]
  },
  {
    id: 'payments-allocation',
    number: '05',
    title: 'Payments & Allocation',
    tagline: 'Record the payment once; the waterfall settles the ledger for you',
    proofPoint: 'Payments are recorded against the tenant ledger and allocated oldest-invoice-first (FIFO); a surplus becomes spendable credit on the tenant account.',
    category: 'Payment Infrastructure',
    iconName: 'CreditCard',
    architectureBadge: 'FIFO Waterfall Allocation',
    details: [
      { label: 'Recorded Rails', value: 'Bank transfer, card, M-Pesa, cash and cheque — recorded against the invoice, with a receipt issued' },
      { label: 'Smart Waterfall', value: 'Oldest outstanding invoice knocked off first; surplus converts to spendable credit' },
      { label: 'Refund Security', value: 'Approval-gated refund workflow with audit trail and automated credit notes' }
    ]
  },
  {
    id: 'maintenance-engine',
    number: '06',
    title: 'Maintenance',
    tagline: 'From tenant request to vendor payout with SLA response tracking',
    proofPoint: 'Work orders from request to close with an emergency fast-track, preventive schedules, response-time tracking.',
    category: 'Operations',
    iconName: 'Wrench',
    architectureBadge: 'SLA Escalation Engine',
    details: [
      { label: 'Emergency Fast-Track', value: 'Bypasses standard triage for immediate plumber/electrician dispatch with SMS alerts' },
      { label: 'Preventive Schedules', value: 'Automated recurring servicing for elevators, generators, water pumps, and HVAC' },
      { label: 'SLA Metrics', value: 'Response-time tracking with vendor completion certificates and tenant sign-off' }
    ]
  },
  {
    id: 'utilities-engine',
    number: '07',
    title: 'Utilities & Metering',
    tagline: 'Guaranteed billing integrity with bulk-to-submeter apportionment',
    proofPoint: 'Meter readings, tariffs with validity windows, apportionment (incl. bulk meters), one bill per meter per month guaranteed.',
    category: 'Utility Billing',
    iconName: 'Zap',
    architectureBadge: 'Single-Bill Monthly Guard',
    details: [
      { label: 'Tariff Engines', value: 'Time-windowed rate tiers with support for seasonal and regulatory adjustments' },
      { label: 'Apportionment Logic', value: 'Bulk inlet meters reconciled against submeters with common-area distribution' },
      { label: 'Zero Double-Billing', value: 'Database constraint guarantees exactly one bill per physical meter per calendar month' }
    ]
  },
  {
    id: 'hr-payroll',
    number: '08',
    title: 'HR & Payroll',
    tagline: 'Statutory payroll rules that arrive as dated, versioned configuration',
    proofPoint: 'Statutory payroll computed from rulesets rather than code (PAYE, NSSF, SHIF, housing levy where applicable, configurable per country), leave management.',
    category: 'Workforce',
    iconName: 'Users2',
    architectureBadge: 'Tax & Labor Config Engine',
    details: [
      { label: 'Bundled Samples', value: 'Worked payroll rule samples ship for Kenya, Germany and the United Kingdom; any other regime is a dated configuration row' },
      { label: 'Effective Dating', value: 'Every rule carries a validFrom date, so a payslip from last year keeps the figures that produced it' },
      { label: 'Leave Management', value: 'Annual, sick, and compassionate leave accruals with caretaker coverage handovers' }
    ]
  },
  {
    id: 'reports-analytics',
    number: '09',
    title: 'Reports & Analytics',
    tagline: 'Real-time operational business intelligence with instant CSV extraction',
    proofPoint: 'Occupancy, financial, sales, maintenance, landlord ROI; every report exports to CSV.',
    category: 'Business Intelligence',
    iconName: 'BarChart3',
    architectureBadge: 'Zero-Lag Query Aggregators',
    details: [
      { label: 'Core Metrics', value: 'Occupancy velocity, arrears aging buckets, vendor expenditure, and gross rental yield' },
      { label: 'Landlord ROI', value: 'Capital invested vs net yield factoring management fees, repairs, and vacancy rates' },
      { label: 'Audit Extraction', value: 'One-click export to CSV across every single report view with zero row truncation' }
    ]
  },
  {
    id: 'approvals-governance',
    number: '10',
    title: 'Workflow & Approvals',
    tagline: 'Configurable multi-step approvals with a complete non-repudiation trail',
    proofPoint: 'Entity-agnostic workflow engine: nobody approves their own request, delegation, full audit trail.',
    category: 'Governance & Security',
    iconName: 'ShieldCheck',
    architectureBadge: 'Dual-Control Segregation',
    details: [
      { label: 'Self-Approval Block', value: 'Hard rule preventing any user from approving their own financial request' },
      { label: 'Delegation Rules', value: 'Time-bound delegation windows during officer leave with fallback escalation' },
      { label: 'Complete Audit Log', value: 'Immutable timeline of started, approved, rejected, escalated and withdrawn events, with the acting user' }
    ]
  },
  {
    id: 'crm-lead-capture',
    number: '11',
    title: 'CRM & Lead Capture',
    tagline: 'From website enquiry to a signed lease, without losing the thread',
    proofPoint: 'Leads captured from a public webhook, moved across a New → Contacted → Viewing → Negotiation → Won/Lost pipeline, with a shared contacts directory and a communication timeline.',
    category: 'Growth',
    iconName: 'Target',
    architectureBadge: 'Public Lead Webhook',
    details: [
      { label: 'Pipeline Board', value: 'Kanban-style stages with Won/Lost as terminal states that cannot be re-entered' },
      { label: 'Shared Contacts', value: 'Buyers, tenants, landlords, investors, agents and lawyers in one directory, not five' },
      { label: 'Communication Log', value: 'Calls, emails, SMS, notes and meetings recorded on the contact record' }
    ]
  },
  {
    id: 'sales-pipeline',
    number: '12',
    title: 'Sales Pipeline',
    tagline: 'Quotation to handover, with commission splits that reconcile to the cent',
    proofPoint: 'Sales move through seven server-enforced stages; instalments are billed by the Finance module rather than a second billing path; agent, broker and referral commissions are reportable per agent.',
    category: 'Growth',
    iconName: 'Handshake',
    architectureBadge: 'Enforced Stage Machine',
    details: [
      { label: 'Seven Stages', value: 'Quotation → Offer → Reservation → Agreement → Payment → Handover' },
      { label: 'One Billing Path', value: 'Instalment plans post into the general ledger through the Finance module' },
      { label: 'Commission Splits', value: 'Agent, broker and referral splits calculated and reconciled against the sale value' }
    ]
  },
  {
    id: 'procurement',
    number: '13',
    title: 'Procurement',
    tagline: 'RFQ multi-quote to purchase order to goods receipt',
    proofPoint: 'Purchase requests raise an RFQ, quotes are compared side by side, the award becomes a purchase order, and the goods receipt closes the cycle against the supplier bill.',
    category: 'Supply Chain',
    iconName: 'ShoppingCart',
    architectureBadge: 'Request → Receipt Chain',
    details: [
      { label: 'Multi-Quote RFQ', value: 'Suppliers are invited, quotes are compared on the same lines, and the award is a recorded decision' },
      { label: 'Goods Receipt', value: 'Received quantities are booked so a purchase order can never over-receive silently' },
      { label: 'One Vendor Ledger', value: 'Procurement reads the same supplier rows as accounts payable — never a second vendor table' }
    ]
  },
  {
    id: 'inventory',
    number: '14',
    title: 'Inventory',
    tagline: 'A stock level is the sum of its movements — there is no counter to drift',
    proofPoint: 'Stock is computed from the movement ledger across goods receipts, job issues, transfers, returns and counts; no quantity column exists anywhere to disagree with it.',
    category: 'Supply Chain',
    iconName: 'Boxes',
    architectureBadge: 'Movement-Sum Ledger',
    details: [
      { label: 'No Stored Balance', value: 'Every read pairs the item query with a grouped sum over its movements' },
      { label: 'Signed Direction', value: 'Movements carry a direction, so the sign can never be taken from the client' },
      { label: 'Reorder Sweeps', value: 'Reorder levels are watched by the Notifications module and raised automatically' }
    ]
  },
  {
    id: 'facilities-bookings',
    number: '15',
    title: 'Facilities & Bookings',
    tagline: 'Amenities, visitor log and access cards as real records',
    proofPoint: 'Facilities are rows with their own slot grids, so an overlapping booking can be refused; visitors are logged as arrivals; access cards are tracked as entitlements.',
    category: 'Operations',
    iconName: 'CalendarCheck',
    architectureBadge: 'Overlap-Proof Booking Grid',
    details: [
      { label: 'Bookable Resources', value: 'Clubhouses, meeting rooms, gyms, pools, courts, laundries and parking, each with opening hours and a slot grid' },
      { label: 'Visitor Management', value: 'A visitor is a person and a visit is an arrival — the log answers who came and when' },
      { label: 'Access Cards', value: 'Card issuance and expiry, including resident parking as an entitlement rather than a slot' }
    ]
  },
  {
    id: 'documents-legal',
    number: '16',
    title: 'Documents, Legal & Compliance',
    tagline: 'One file store, a contract register, and expiry you can see coming',
    proofPoint: 'Documents version on re-upload and attach to any record; contracts carry derived expiry status, notice deadlines and renewal chains, so a lapse is visible before it becomes a breach.',
    category: 'Governance & Security',
    iconName: 'FolderLock',
    architectureBadge: 'Derived Contract Status',
    details: [
      { label: 'One Document Store', value: 'The Document Center version a re-upload and attach a file to any record — there is no second file store beside it' },
      { label: 'Contract Register', value: 'Expiry status, notice deadlines and warning bands are derived, never typed' },
      { label: 'Renewal Chains', value: 'Linked renewals are walked so the deadline that matters is the one that is surfaced' }
    ]
  },
  {
    id: 'notifications-comms',
    number: '17',
    title: 'Notifications & Resident Comms',
    tagline: 'Email, SMS and in-app, with suppression reported honestly',
    proofPoint: 'Lease expiries, rent due, arrears, contract expiry, maintenance updates and workflow decisions are dispatched over in-app, email and SMS — and an unconfigured channel reports SUPPRESSED rather than pretending to have sent.',
    category: 'Communications',
    iconName: 'BellRing',
    architectureBadge: 'Idempotent Trigger Sweeps',
    details: [
      { label: 'Three Live Channels', value: 'In-app, email (SMTP) and SMS (Twilio or Africa\'s Talking) — no WhatsApp or push provider is claimed' },
      { label: 'Suppressed ≠ Failed', value: 'A channel with no provider configured records SUPPRESSED with the reason, so an operator can tell "we chose not to send" from "it broke"' },
      { label: 'Idempotent Sweeps', value: 'Dedupe keys are per lease and per band, so a second sweep on the same day sends nothing twice' }
    ]
  },
  {
    id: 'tenant-requests-moveouts',
    number: '18',
    title: 'Tenant Requests & Move-Out',
    tagline: 'The last month of a tenancy, captured as records',
    proofPoint: 'Resident requests are raised, triaged and approved against a policy; move-out runs condition reports, final utility bills and a settlement the tenant can check.',
    category: 'Lease Operations',
    iconName: 'ClipboardCheck',
    architectureBadge: 'Approval-Backed Handover',
    details: [
      { label: 'Request Inbox', value: 'Resident requests arrive with approvals attached and are visible to the team that has to action them' },
      { label: 'Inspection Linked', value: 'Move-out condition reports are linked to the deductions that are later settled from the deposit' },
      { label: 'Final Bills', value: 'Final utility bills are closed into the settlement, so the refund is computed from records' }
    ]
  },
  {
    id: 'platform-administration',
    number: '19',
    title: 'Platform Administration',
    tagline: 'Onboard an organization, meter its usage, toggle its modules',
    proofPoint: 'Organizations are onboarded with their first administrator and a 14-day trial, usage is derived on read against the plan limits, and the subscription can be suspended and restored without losing data.',
    category: 'Platform',
    iconName: 'ServerCog',
    architectureBadge: 'Derived Usage Metering',
    details: [
      { label: 'Organization Onboarding', value: 'One transaction creates the organization, its first admin and a TRIALING subscription with a 14-day clock' },
      { label: 'Plan Limits', value: 'User and property creation is refused over the plan limit, with usage counted on read rather than stored' },
      { label: 'Module Toggles', value: 'Every module is a subscription key, so an organization runs exactly the set it has paid for' }
    ]
  },
  {
    id: 'security-deposits',
    number: '20',
    title: 'Security Deposits',
    tagline: 'The deposit follows the rent; the refund is computed',
    proofPoint: 'Each unit type carries its own deposit rule, the held deposit is derived from that rule rather than typed at the door, and the move-out settlement subtracts only logged damage and final utility balances.',
    category: 'Lease Operations',
    iconName: 'PiggyBank',
    architectureBadge: 'Derived Deposit Settlement',
    details: [
      { label: 'Per-Type Rules', value: 'A property unit type carries its own deposit rule, so a studio and a two-bedroom are priced differently' },
      { label: 'Derived Holding', value: 'What is held is computed from the rent and the rule — there is no free-typed deposit amount' },
      { label: 'Computed Refund', value: 'Deductions come from logged inspection damage and outstanding utilities; the refund is what is left' }
    ]
  }
];

export const FEATURE_CATEGORIES = [
  { id: 'all', label: 'All 20 Modules' },
  { id: 'operations', label: 'Property & Leasing' },
  { id: 'finance', label: 'Payments, Ledger & Tax' },
  { id: 'utilities-workforce', label: 'Utilities, HR & Workflows' },
  { id: 'growth', label: 'Growth & Supply Chain' },
  { id: 'platform', label: 'Platform & Communications' }
];

export const TRUST_POINTS = [
  {
    title: 'Computed From Existing Records',
    description: 'Every balance, statement, and tax figure is derived strictly from verified transactional records. Numbers are computed on the fly, never typed in or overwritten by hand.',
    badge: 'Derived Math Only'
  },
  {
    title: 'Immutable Audit Logging',
    description: 'Every lease modification, payment allocation, invoice discount, and refund is committed with a non-repudiation log containing actor ID, timestamp, and field deltas.',
    badge: 'Append-Only Logs'
  },
  {
    title: '13 System Roles',
    description: 'Fine-grained permissions prevent cross-boundary actions. Accountants cannot alter leases; leasing officers cannot override tax formulas; technicians only reach their own work orders.',
    badge: 'Strict RBAC'
  },
  {
    title: 'Tenant-Level Data Isolation',
    description: 'Organizations operate in strictly partitioned database tenants. Your leases, banking references, and tenant directories are never co-mingled with other companies.',
    badge: 'Isolated Tenants'
  }
];

/**
 * The thirteen system roles seeded into every organization
 * (`backend/src/prisma/roles-seed.ts`). These are the real names — the landing
 * page used to advertise twelve invented ones.
 */
export const ADMIN_ROLES = [
  'Super Admin',
  'Company Admin',
  'Property Manager',
  'Leasing Officer',
  'Sales Agent',
  'Accountant',
  'Maintenance Manager',
  'Technician',
  'Landlord',
  'Tenant',
  'Procurement Officer',
  'HR Manager',
  'Staff Self-Service'
];

/**
 * What each seeded role can read, write and is hard-blocked from. These are
 * summaries of the permission matrix the roles carry, not a transcription of
 * every permission key — the point of the panel is that the boundary is real.
 */
export const ROLE_PERMISSIONS: Record<string, { read: string[]; write: string[]; restricted: string[] }> = {
  'Super Admin': {
    read: ['Every organization', 'Every property, lease and ledger', 'System audit logs'],
    write: ['Organization provisioning', 'Role assignment', 'Subscription and module state'],
    restricted: ['Cannot approve their own financial request — dual control is enforced at the API, not the UI']
  },
  'Company Admin': {
    read: ['The whole organization', 'Users, roles and branches', 'Module and plan settings'],
    write: ['User and role administration', 'Branch creation', 'Tax rulesets'],
    restricted: ['Cannot approve their own financial request — dual control is enforced at the API, not the UI']
  },
  'Property Manager': {
    read: ['Assigned properties and their units', 'Active leases and tenants', 'Open work orders and meter readings'],
    write: ['Tenant management', 'Lease activation and renewal', 'Work-order assignment'],
    restricted: ['No access to owner payouts or the general ledger']
  },
  'Leasing Officer': {
    read: ['Available units', 'Active leases', 'Applicant pipeline', 'Tenant contact details'],
    write: ['Draft and negotiate leases', 'Schedule inspections', 'Move-in handovers'],
    restricted: ['Cannot execute refunds or write manual accounting adjustments']
  },
  'Sales Agent': {
    read: ['Sales pipeline and quotations', 'Available units', 'Commission statements for themselves'],
    write: ['Quotations and offers', 'Reservations and booking fees', 'Record their own lead activity'],
    restricted: ['Cannot approve a commission, and cannot alter ledger entries']
  },
  Accountant: {
    read: ['General ledger and trial balance', 'Chart of accounts', 'Invoices, payments and receipts', 'Owner statements and payouts'],
    write: ['Post journal entries', 'Record payments and receipts', 'Prepare owner payouts', 'Maintain tax rulesets'],
    restricted: ['Cannot create or modify leases directly', 'Cannot approve their own payout request']
  },
  'Maintenance Manager': {
    read: ['All work orders', 'Vendor and contractor profiles', 'Asset registers and preventive schedules'],
    write: ['Dispatch and assign work orders', 'Verify vendor completion certificates', 'Schedule preventive servicing'],
    restricted: ['Cannot disburse payments or alter lease agreements']
  },
  Technician: {
    read: ['Their own assigned work orders', 'Asset history for the equipment they service', 'Their own payslips and leave requests'],
    write: ['Execute and close work orders', 'Record labour and materials', 'Log their own leave requests'],
    restricted: ['No access to tenant financials, owner statements or the general ledger']
  },
  Landlord: {
    read: ['Their own properties', 'Their own statements and payout receipts'],
    write: ['Nothing — the owner account is read-only today'],
    restricted: ['Cannot see tenant details beyond their own tenancies; a self-service owner portal is on the roadmap']
  },
  Tenant: {
    read: ['Their own lease', 'Their own invoices, receipts and documents'],
    write: ['Submit maintenance and tenant requests', 'Upload request attachments'],
    restricted: ['Cannot see any other tenant, any landlord statement or any ledger']
  },
  'Procurement Officer': {
    read: ['Purchase requests, RFQs and quotes', 'Purchase orders and goods receipts', 'Supplier profiles'],
    write: ['Raise purchase requests', 'Issue RFQs and award them', 'Raise purchase orders', 'Record goods receipts'],
    restricted: ['Cannot approve their own purchase request, and cannot post to the general ledger']
  },
  'HR Manager': {
    read: ['Staff records and contracts', 'Leave balances and applications', 'Payroll rules and payslips'],
    write: ['Manage employees', 'Approve leave', 'Run payroll for the approved period'],
    restricted: ['Cannot change their own payslip, and cannot edit statutory rules without a dated new row']
  },
  'Staff Self-Service': {
    read: ['Their own payslips, leave balances and requests', 'Their own assigned work orders'],
    write: ['Submit leave requests', 'Update their own contact details'],
    restricted: ['Cannot read any other employee\'s record and cannot write anything financial']
  }
};

export const NOTIFICATION_SCHEDULE = [
  { days: '60 Days', trigger: 'First Lease Expiry Reminder', channel: 'In-App + Email', target: 'Tenant & Leasing Officer' },
  { days: '30 Days', trigger: 'Formal Renewal Offer Prompt', channel: 'In-App + Email + SMS', target: 'Tenant & Leasing Officer' },
  { days: '14 Days', trigger: 'Intent Notice Deadline', channel: 'In-App + Email + SMS', target: 'Leasing Officer & Property Manager' },
  { days: '7 Days', trigger: 'Move-Out Inspection Scheduling', channel: 'In-App + Email', target: 'Property Manager & Tenant' },
  { days: 'Day 1 of Month', trigger: 'Rent Due Notification', channel: 'In-App + Email', target: 'Active Tenant' },
  { days: 'Day 5 of Month', trigger: 'Overdue Arrears Escalation', channel: 'In-App + Email + SMS', target: 'Accountant & Tenant' }
];

export const METRICS = {
  units: '2,500+',
  tenancies: '1,900+',
  invoices: '15,000+',
  caption: 'Demo data for illustration'
};

/**
 * The demo personas, in place of invented customers.
 *
 * These are the seeded organizations — you can sign into each one and check
 * every number on this card yourself, which is why they are published here
 * rather than a fictional principal of a fictional firm.
 */
export const TESTIMONIALS = [
  {
    quote: 'Rohi carries the whole dataset: 120 landlords, 100 properties, more than 2,500 units, more than 1,900 active tenancies and more than 15,000 invoices. Every balance on screen is computed from a payment row — nothing is typed in.',
    author: 'Rohi Estate Management',
    role: 'Kenya · Enterprise organization',
    company: 'Seeded demo organization',
    city: 'Nairobi, Kenya',
    unitsManaged: '100 properties · 2,500+ units',
    mandatoryLabel: 'Sign in and verify'
  },
  {
    quote: 'Each market is its own organization with its own currency, locale, tax rules, telephone format and landlord tax identifier. The same screens behind them read differently in Johannesburg, Boston and Seoul — that is the point of the model.',
    author: 'Liberty Property Group',
    role: 'United States · Professional organization',
    company: 'Seeded demo organization',
    city: 'New York, United States',
    unitsManaged: '1 property · 3 units · 2 tenancies',
    mandatoryLabel: 'Sign in and verify'
  }
];

export type PricingCurrency =
  | 'USD'
  | 'KES'
  | 'ZAR'
  | 'GBP'
  | 'CAD'
  | 'AUD'
  | 'EUR'
  | 'INR'
  | 'JPY'
  | 'CNY'
  | 'KRW'
  | 'BRL'
  | 'MXN'
  | 'AED';

/**
 * Every currency the pricing table can be shown in.
 *
 * One per currency the shipped markets bill in — Germany and France share the
 * euro, so fourteen currencies cover fifteen markets.
 */
export const ALL_PRICING_CURRENCIES: PricingCurrency[] = [
  'USD',
  'KES',
  'ZAR',
  'GBP',
  'CAD',
  'AUD',
  'EUR',
  'INR',
  'JPY',
  'CNY',
  'KRW',
  'BRL',
  'MXN',
  'AED'
];

/**
 * Which currencies the pricing switcher offers.
 *
 * Driven by `NEXT_PUBLIC_LANDING_CURRENCIES` in `frontend/.env` — a
 * comma-separated list of ISO-4217 codes, in the order they should appear.
 * Leave it unset and the currencies the enabled markets bill in are used, so
 * the two lists cannot drift apart.
 */
function parseCurrencies(value: string | undefined): PricingCurrency[] {
  if (value === undefined) {
    const marketCurrencies: PricingCurrency[] = [];
    for (const market of MARKETS) {
      if (!marketCurrencies.includes(market.currency as PricingCurrency)) {
        marketCurrencies.push(market.currency as PricingCurrency);
      }
    }
    return marketCurrencies.length > 0 ? marketCurrencies : ALL_PRICING_CURRENCIES;
  }
  const codes = value
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean) as PricingCurrency[];
  if (codes.length === 0) return ALL_PRICING_CURRENCIES;
  return codes;
}

const REQUESTED_CURRENCIES = parseCurrencies(process.env.NEXT_PUBLIC_LANDING_CURRENCIES);

const KNOWN_CURRENCIES = new Set<string>(ALL_PRICING_CURRENCIES);

if (process.env.NODE_ENV !== 'production') {
  const unknown = REQUESTED_CURRENCIES.filter((code) => !KNOWN_CURRENCIES.has(code));
  if (unknown.length > 0) {
    console.warn(
      `[landing] NEXT_PUBLIC_LANDING_CURRENCIES names unknown currency code(s): ${unknown.join(', ')}. ` +
        `Known codes: ${ALL_PRICING_CURRENCIES.join(', ')}.`
    );
  }
}

export const PRICING_CURRENCIES: PricingCurrency[] = REQUESTED_CURRENCIES.filter((code) =>
  KNOWN_CURRENCIES.has(code)
);

if (PRICING_CURRENCIES.length === 0) {
  PRICING_CURRENCIES.push(...ALL_PRICING_CURRENCIES);
}

export const PRICING_PLANS: {
  name: string;
  badge: string;
  description: string;
  pricing: Record<PricingCurrency, { monthly: number; annual: number }>;
  features: string[];
  highlighted: boolean;
  cta: string;
}[] = [
  {
    name: 'Starter',
    badge: 'Boutique Apartments & Private Landlords',
    description: 'Perfect for boutique 12-unit walk-ups, residential apartments, or emerging portfolios up to 50 active units.',
    pricing: {
      USD: { monthly: 49, annual: 39 },
      KES: { monthly: 6500, annual: 5200 },
      ZAR: { monthly: 900, annual: 720 },
      GBP: { monthly: 39, annual: 31 },
      CAD: { monthly: 67, annual: 52 },
      AUD: { monthly: 74, annual: 59 },
      EUR: { monthly: 45, annual: 36 },
      INR: { monthly: 4050, annual: 3250 },
      JPY: { monthly: 7600, annual: 6000 },
      CNY: { monthly: 350, annual: 280 },
      KRW: { monthly: 66000, annual: 53000 },
      BRL: { monthly: 250, annual: 200 },
      MXN: { monthly: 830, annual: 660 },
      AED: { monthly: 180, annual: 144 }
    },
    features: [
      'Ideal for 12 to 50 active rental units',
      'Digital lease lifecycle with renewal guards',
      'Tenant self-service portal (invoices & tickets)',
      'Payment recording with FIFO allocation & spendable credit',
      'Derived owner statements & CSV exports',
      'Statutory utility billing (1 bill per meter/mo)',
      'Email & in-app support'
    ],
    highlighted: false,
    cta: 'Start 14-Day Free Trial'
  },
  {
    name: 'Professional',
    badge: 'Growing Property Management Companies',
    description: 'Complete operations for established agencies running multiple buildings and dedicated staff.',
    pricing: {
      USD: { monthly: 129, annual: 99 },
      KES: { monthly: 17000, annual: 13000 },
      ZAR: { monthly: 2400, annual: 1850 },
      GBP: { monthly: 99, annual: 76 },
      CAD: { monthly: 177, annual: 136 },
      AUD: { monthly: 197, annual: 151 },
      EUR: { monthly: 119, annual: 91 },
      INR: { monthly: 10700, annual: 8200 },
      JPY: { monthly: 20000, annual: 15300 },
      CNY: { monthly: 930, annual: 710 },
      KRW: { monthly: 174000, annual: 133000 },
      BRL: { monthly: 660, annual: 505 },
      MXN: { monthly: 2190, annual: 1680 },
      AED: { monthly: 473, annual: 363 }
    },
    features: [
      'Up to 300 active units across up to 5 branches',
      'All Starter features included',
      'FIFO payment waterfall & credit wallet',
      'Configurable approval workflows (dual control)',
      'Jurisdiction tax engine (VAT / sales tax / WHT)',
      'Statutory HR & Payroll module with dated rulesets',
      'Preventive maintenance scheduler & emergency fast-track',
      '13 system role permissions matrix',
      'Priority email & SMS escalation'
    ],
    highlighted: true,
    cta: 'Start 14-Day Free Trial'
  },
  {
    name: 'Enterprise',
    badge: 'Institutional Portfolios & Multi-Country Firms',
    description: 'Bespoke infrastructure for property management groups operating across several jurisdictions.',
    pricing: {
      USD: { monthly: 299, annual: 249 },
      KES: { monthly: 39000, annual: 32000 },
      ZAR: { monthly: 5500, annual: 4600 },
      GBP: { monthly: 235, annual: 196 },
      CAD: { monthly: 410, annual: 341 },
      AUD: { monthly: 457, annual: 380 },
      EUR: { monthly: 275, annual: 229 },
      INR: { monthly: 24800, annual: 20600 },
      JPY: { monthly: 46400, annual: 38600 },
      CNY: { monthly: 2150, annual: 1790 },
      KRW: { monthly: 403000, annual: 336000 },
      BRL: { monthly: 1520, annual: 1270 },
      MXN: { monthly: 5080, annual: 4230 },
      AED: { monthly: 1097, annual: 914 }
    },
    features: [
      'High unit and property ceilings, set per organization',
      'All Professional features included',
      'Payroll rules for any regime, added as dated configuration rows',
      'Dedicated organization tenant database partitioning',
      'Bulk CSV import with dry-run validation in every module',
      'Contractual SLA with a named response target',
      'Dedicated account manager & migration engineer',
      'Security review and audit support on request'
    ],
    highlighted: false,
    cta: 'Start 14-Day Free Trial'
  }
];

export const FAQS = [
  {
    question: 'Do my figures reconcile?',
    answer: 'Yes — completely and deterministically. Every figure in TU Properties is derived directly from verified transactional records, never typed in or manually amended. Our double-entry general ledger enforces strict balancing rules with overlapping-period guards that prevent duplicate billing, split dates, or ghost revenue entries. If a payment is recorded, owner statements, tenant balances, and tax withholdings update automatically.'
  },
  {
    question: 'Can tenants and owners log in?',
    answer: 'Tenants get their own dedicated self-service web portal today: they can review their active lease, settle rent by bank transfer, card, M-Pesa, cash or cheque as the property records it, view past invoice receipts, download statements, and submit maintenance and tenant requests with photos. Owners do not yet have a self-service portal — that is on the roadmap — but they already receive automated, verified income statements and payout receipts with transfer references by email and SMS.'
  },
  {
    question: 'Does it handle my country\'s taxes?',
    answer: 'It does, because jurisdiction is configuration rather than code. Fifteen market profiles ship with the platform, each carrying its own currency, locale, timezone, consumption-tax rate, telephone format, tax-ID shape, utility tariffs and residential rent band, so a Kenyan organization and an Indian one are not the same rows with a different label on them. Statutory rates are configuration rows on top of that: worked tax rules ship for Kenya, Germany, the United Kingdom and United States (by state), worked payroll rules for Kenya, Germany and the United Kingdom, and any other regime is added as a dated rule rather than as code.'
  },
  {
    question: 'What property and portfolio sizes does TU Properties support?',
    answer: 'The system is architected to scale without friction from boutique 12-unit residential apartments and small multi-family walk-ups, all the way to multi-story apartment towers, mixed-use commercial plazas, and large corporate real estate portfolios with thousands of units. Whether you are an independent landlord managing a single building or an agency operating across multiple markets, the exact same mathematical ledger, audit trail, and tenant workflows apply.'
  },
  {
    question: 'Can I import my existing data?',
    answer: 'Yes. We provide robust CSV import templates for properties, physical units, tenant contacts, and opening lease balances. Every import runs through an automated dry-run validation preview before anything touches the database. You receive an immediate per-row validation report highlighting any format anomalies or lease date overlaps so you can fix errors before committing.'
  }
];
