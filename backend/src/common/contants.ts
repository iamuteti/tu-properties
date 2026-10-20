export const COUNTRIES = [
  { value: 'KE', label: 'Kenya' },
  { value: 'TZ', label: 'Tanzania' },
  { value: 'UG', label: 'Uganda' },
  { value: 'RW', label: 'Rwanda' },
  { value: 'BI', label: 'Burundi' },
  { value: 'SS', label: 'South Sudan' },
  { value: 'SO', label: 'Somalia' },
  { value: 'DJ', label: 'Djibouti' },
  { value: 'ER', label: 'Eritrea' },
  { value: 'ET', label: 'Ethiopia' },
  { value: 'CM', label: 'Cameroon' },
  { value: 'GH', label: 'Ghana' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'IT', label: 'Italy' },
  { value: 'ES', label: 'Spain' },
  { value: 'IN', label: 'India' },
  { value: 'CN', label: 'China' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
  { value: 'BR', label: 'Brazil' },
  { value: 'MX', label: 'Mexico' },
  { value: 'AE', label: 'United Arab Emirates' },
];

export const MULTI_STORY_TYPES = [
  { value: 'low-rise', label: 'Low-rise' },
  { value: 'mid-rise', label: 'Mid-rise' },
  { value: 'high-rise', label: 'High-rise' },
  { value: 'skyscraper', label: 'Skyscraper' },
];

export const SPECIFICATIONS = [
  { value: 'multi-unit', label: 'Multi-unit/Multi-Space' },
  { value: 'single-unit', label: 'Single Unit' },
  { value: 'space', label: 'Space' },
  { value: 'na', label: 'N/A' },
];

export const PENALTY_CHARGE_MODES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'flat', label: 'Flat Rate' },
];

export const ACCOUNT_LEDGER_TYPES = [
  { value: 'property-control', label: 'Property Control Ledger' },
  { value: 'general-ledger', label: 'General Ledger' },
  { value: 'cash-book', label: 'Cash Book' },
];

export const PROPERTY_CATEGORIES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'retail', label: 'Retail' },
  { value: 'office', label: 'Office' },
  { value: 'land', label: 'Land' },
];

export const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'studio', label: 'Studio' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'factory', label: 'Factory' },
  { value: 'storefront', label: 'Storefront' },
  { value: 'office-space', label: 'Office Space' },
  { value: 'retail-space', label: 'Retail Space' },
];

export const UNIT_TYPES = [
  { value: 'two-bedroom', label: 'Two Bedroom' },
  { value: 'one-bedroom', label: 'One Bedroom' },
  { value: 'studio', label: 'Studio' },
  { value: 'executive-suite', label: 'Executive Suite' },
  { value: 'commercial-space', label: 'Commercial Space' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'office', label: 'Office' },
  { value: 'retail', label: 'Retail' },
];

export const TRANSACTION_CLASSES = [
  { value: 'RENT', label: 'Rent' },
  { value: 'A/C AND HEATING', label: 'A/C and Heating' },
  { value: 'ELECTRICITY', label: 'Electricity' },
  { value: 'FIXTURES/HEATING', label: 'Fixtures/Heating' },
  { value: 'GARBAGE', label: 'Garbage' },
  { value: 'GRASS/GARDEN', label: 'Grass/Garden' },
  { value: 'PARKING', label: 'Parking' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'SERVICE CHARGE', label: 'Service Charge' },
  { value: 'WATER', label: 'Water' },
];

export const CURRENCIES = [
  { value: 'KES', label: 'Kenyan Shilling [KES]' },
  { value: 'USD', label: 'US Dollar [USD]' },
  { value: 'EUR', label: 'Euro [EUR]' },
  { value: 'GBP', label: 'British Pound [GBP]' },
];

export const ACCOUNTS_RECEIVABLE = [
  { value: '1', label: 'Accounts Receivable' },
  { value: '2', label: 'Rent Receivable' },
  { value: '3', label: 'Utilities Receivable' },
];

export const INCOME_ACCOUNTS = [
  { value: '1', label: 'Rental Income' },
  { value: '2', label: 'Service Charge Income' },
  { value: '3', label: 'Utility Income' },
  { value: '4', label: 'Parking Income' },
];

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
  // Money the payer sent straight to the party it was due to — usually the
  // owner — so it never reached an account of ours.
  { value: 'DIRECT_REMIT', label: 'Paid Directly to the Owner' },
];

/**
 * The payment methods where the money lands in an account of ours.
 *
 * `DIRECT_REMIT` is deliberately absent: it is money the payer sent straight to
 * the party it was due to, so a payment the estate actually received must never
 * be seeded with it — that would be seeding a receipt which claims the estate
 * is holding money it has never seen, in every seeded ledger in the product.
 *
 * Seeded rent and deposits were received by the estate, so they are seeded
 * with one of these.
 */
export const SETTLED_PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'CHEQUE',
  'MPESA',
  'CARD',
  'OTHER',
] as const;

/**
 * The payment method for money that bypassed the estate.
 *
 * Named once, because three places have to agree on it: the receipt and
 * payment controllers accept it, the ledger routes it away from our cash and
 * bank accounts, and the capture form offers it in the dropdown. A spelling
 * that is right in three of those places is a receipt that says "cash" while
 * the ledger says "the owner took it".
 */
export const DIRECT_REMIT_METHOD = 'DIRECT_REMIT';

export const PERIODS = [
  { value: 'custom', label: 'Custom Dates' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'todayYesterday', label: 'Today & Yesterday' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'lastWeek', label: 'Last Week' },
  { value: 'lastWeekToDate', label: 'Last Week To Date' },
  { value: 'lastWeekButOne', label: 'Last Week But One' },
  { value: 'lastTwoWeeks', label: 'Last Two Weeks' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'lastMonthToDate', label: 'Last Month To Date' },
  { value: 'lastMonthButOne', label: 'Last Month But One' },
  { value: 'lastTwoMonths', label: 'Last Two Months' },
  { value: 'thisQuarter', label: 'This Quarter' },
  { value: 'lastQuarter', label: 'Last Quarter' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'financialYearToLastMonth', label: 'Financial Year To Last Month' },
  { value: 'lastYear', label: 'Last Year' },
];
