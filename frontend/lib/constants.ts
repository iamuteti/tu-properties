export const COUNTRIES = [
  { value: "KE", label: "Kenya" },
  { value: "TZ", label: "Tanzania" },
  { value: "UG", label: "Uganda" },
  { value: "RW", label: "Rwanda" },
  { value: "BI", label: "Burundi" },
  { value: "SS", label: "South Sudan" },
  { value: "SO", label: "Somalia" },
  { value: "DJ", label: "Djibouti" },
  { value: "ER", label: "Eritrea" },
  { value: "ET", label: "Ethiopia" },
  { value: "CM", label: "Cameroon" },
  { value: "GH", label: "Ghana" },
  { value: "NG", label: "Nigeria" },
  { value: "ZA", label: "South Africa" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "IT", label: "Italy" },
  { value: "ES", label: "Spain" },
  { value: "JP", label: "Japan" },
  { value: "CN", label: "China" },
];

export const MULTI_STORY_TYPES = [
  { value: "low-rise", label: "Low-rise" },
  { value: "mid-rise", label: "Mid-rise" },
  { value: "high-rise", label: "High-rise" },
  { value: "skyscraper", label: "Skyscraper" },
];

export const SPECIFICATIONS = [
  { value: "multi-unit", label: "Multi-unit/Multi-Space" },
  { value: "single-unit", label: "Single Unit" },
  { value: "space", label: "Space" },
  { value: "na", label: "N/A" },
];

export const PENALTY_CHARGE_MODES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "flat", label: "Flat Rate" },
];

export const ACCOUNT_LEDGER_TYPES = [
  { value: "property-control", label: "Property Control Ledger" },
  { value: "general-ledger", label: "General Ledger" },
  { value: "cash-book", label: "Cash Book" },
];

export const PROPERTY_CATEGORIES = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "retail", label: "Retail" },
  { value: "office", label: "Office" },
  { value: "land", label: "Land" },
];

export const PROPERTY_TYPES = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "studio", label: "Studio" },
  { value: "warehouse", label: "Warehouse" },
  { value: "factory", label: "Factory" },
  { value: "storefront", label: "Storefront" },
  { value: "office-space", label: "Office Space" },
  { value: "retail-space", label: "Retail Space" },
];

export const UNIT_TYPES = [
  { value: "two-bedroom", label: "Two Bedroom" },
  { value: "one-bedroom", label: "One Bedroom" },
  { value: "studio", label: "Studio" },
  { value: "executive-suite", label: "Executive Suite" },
  { value: "commercial-space", label: "Commercial Space" },
  { value: "warehouse", label: "Warehouse" },
  { value: "office", label: "Office" },
  { value: "retail", label: "Retail" },
];

export const TRANSACTION_CLASSES = [
  { value: "RENT", label: "Rent" },
  { value: "A/C AND HEATING", label: "A/C and Heating" },
  { value: "ELECTRICITY", label: "Electricity" },
  { value: "FIXTURES/HEATING", label: "Fixtures/Heating" },
  { value: "GARBAGE", label: "Garbage" },
  { value: "GRASS/GARDEN", label: "Grass/Garden" },
  { value: "PARKING", label: "Parking" },
  { value: "SECURITY", label: "Security" },
  { value: "SERVICE CHARGE", label: "Service Charge" },
  { value: "WATER", label: "Water" },
  // Module 14. `ELECTRICITY` and `WATER` above predate the utilities module and are
  // what the *rent* invoice's service lines are classified with. A **consumption**
  // invoice is a different document - raised by the Utilities module through
  // `InvoicesService`, carrying a measured quantity rather than a fixed charge - so
  // it gets its own class rather than borrowing one of those two. That is also what
  // keeps it from claiming `Invoice.billingPeriod`, which belongs to the rent bill.
  { value: "UTILITY", label: "Utility consumption" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Module 14 — Utilities
// ─────────────────────────────────────────────────────────────────────────────

export const UTILITY_TYPES = [
  { value: "WATER", label: "Water" },
  { value: "ELECTRICITY", label: "Electricity" },
  { value: "GAS", label: "Gas" },
  // Not in the module doc's list, and the reason it is here: on most Kenyan estates
  // sewerage is charged separately from water, usually off a bulk meter, so a tenant
  // never sees a water volume - only a fixed charge. That is a case a `WATER` meter
  // row cannot represent honestly.
  { value: "SEWAGE", label: "Sewerage" },
];

/**
 * How a bulk meter's consumption is divided across the units it feeds.
 *
 * Rendered with the reason it exists, because a bare `AREA` on a dropdown does not
 * say what the resident is being charged for. The module **refuses** to bill a bulk
 * meter until one of these is chosen - it will not default to the first.
 */
export const APPORTIONMENT_METHODS = [
  { value: "AREA", label: "By floor area", hint: "A 90 sqm unit in a shared meter pays for 90 sqm." },
  { value: "EQUAL", label: "Split evenly", hint: "Every unit the meter feeds pays the same share." },
  { value: "OCCUPANCY", label: "By days occupied", hint: "A unit that moved in mid-month pays for the part of the month it was there." },
  { value: "MANUAL", label: "Negotiated split", hint: "A fixed split you record yourself. Requires the weights." },
];

export const METER_SCOPES = [
  { value: "SUBMETER", label: "Sub-meter", hint: "Serves exactly one unit. Its consumption is that unit's bill." },
  { value: "BULK", label: "Bulk meter", hint: "Serves many units. Its consumption must be divided before anybody is billed." },
];

export const METER_READING_SOURCES = [
  { value: "MANUAL", label: "Manual" },
  { value: "SMART", label: "Smart meter" },
  // Marked rather than hidden: a meter that could not be read is a real case, and an
  // estimate that looks like a reading is worse than an obvious estimate.
  { value: "ESTIMATED", label: "Estimated", hint: "Could not be read. Recorded so a later audit can tell it from a real reading." },
];

export const METER_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "RETIRED", label: "Retired", hint: "Kept, not deleted, so historic readings still explain old invoices." },
];

export const UTILITY_CHARGE_STATUSES = [
  { value: "PENDING", label: "Priced, not invoiced" },
  { value: "INVOICED", label: "Invoiced" },
  {
    value: "RECONCILED",
    label: "Reconciled",
    hint: "Priced and matched against the utility company's own bill, with no resident document.",
  },
  { value: "VOID", label: "Voided", hint: "Written off. The reason is kept, so it still explains itself." },
];

/**
 * What document a metered charge ends up on. Per-organization, because the markets
 * differ — the same reason tax, currency and timezone are organization settings rather
 * than code.
 *
 * Left unset means `SEPARATE_STATEMENT`, and the split is deliberate: "nobody has
 * decided" stays distinguishable from a decision. Nothing in the product picks this
 * for an organization.
 */
export const UTILITY_BILLING_MODES = [
  {
    value: "SEPARATE_STATEMENT",
    label: "We re-bill residents",
    hint: 'One invoice per charge. The arrangement that leaves rent billing untouched, and so cannot stop a resident being billed rent.',
  },
  {
    value: "DIRECT_ACCOUNT",
    label: "Residents are invoiced by the utility directly",
    hint: 'The norm in the US and Canada, and common elsewhere. Consumption is still priced and reconciled against what the utility company billed the estate, but no resident invoice is raised — we have no standing to raise one.',
  },
];

export const VACANCY_POLICIES = [
  {
    value: "RECORD_ONLY",
    label: "Record it and decide later",
    hint: "The consumption is priced and reported, and nobody is invoiced. The default when nothing is set: it makes a real cost visible without inventing a payer.",
  },
  {
    value: "SKIP",
    label: "Do not bill vacant units",
    hint: "The charge is voided with that reason kept.",
  },
  {
    value: "REDISTRIBUTE",
    label: "Re-rate across the occupied units",
    hint: "Configured but not yet applied. Moving one unit's share onto its neighbours changes what other residents owe, so it has to be run deliberately rather than as a side effect of billing.",
  },
];

/**
 * Currencies an organization can transact in.
 *
 * Widened from a Kenya-only list when Module 12 landed. That original four were
 * not a deliberate scoping decision — they were an assumption, and an ISO-4217
 * field with a closed dropdown makes an assumption out of a usability
 * convenience: a group paying a remote contractor in euros could not enter it.
 * Anything outside this list is still accepted as free text; the backend validates
 * the three-letter code either way.
 */
export const CURRENCIES = [
  { value: "KES", label: "Kenyan Shilling [KES]" },
  { value: "USD", label: "US Dollar [USD]" },
  { value: "EUR", label: "Euro [EUR]" },
  { value: "GBP", label: "British Pound [GBP]" },
  { value: "ZAR", label: "South African Rand [ZAR]" },
  { value: "NGN", label: "Nigerian Naira [NGN]" },
  { value: "EGP", label: "Egyptian Pound [EGP]" },
  { value: "TZS", label: "Tanzanian Shilling [TZS]" },
  { value: "UGX", label: "Ugandan Shilling [UGX]" },
  { value: "RWF", label: "Rwandan Franc [RWF]" },
  { value: "BWP", label: "Botswana Pula [BWP]" },
  { value: "ZMW", label: "Zambian Kwacha [ZMW]" },
  { value: "MWK", label: "Malawian Kwacha [MWK]" },
  { value: "ETB", label: "Ethiopian Birr [ETB]" },
  { value: "XOF", label: "West African CFA Franc [XOF]" },
  { value: "CDF", label: "Congolese Franc [CDF]" },
  { value: "AED", label: "UAE Dirham [AED]" },
  { value: "SAR", label: "Saudi Riyal [SAR]" },
  { value: "QAR", label: "Qatari Riyal [QAR]" },
  { value: "INR", label: "Indian Rupee [INR]" },
  { value: "PKR", label: "Pakistani Rupee [PKR]" },
  { value: "BDT", label: "Bangladeshi Taka [BDT]" },
  { value: "JPY", label: "Japanese Yen [JPY]" },
  { value: "CNY", label: "Chinese Yuan [CNY]" },
  { value: "AUD", label: "Australian Dollar [AUD]" },
  { value: "NZD", label: "New Zealand Dollar [NZD]" },
  { value: "CAD", label: "Canadian Dollar [CAD]" },
  { value: "CHF", label: "Swiss Franc [CHF]" },
  { value: "SEK", label: "Swedish Krona [SEK]" },
  { value: "NOK", label: "Norwegian Krone [NOK]" },
  { value: "DKK", label: "Danish Krone [DKK]" },
  { value: "PLN", label: "Polish Zloty [PLN]" },
  { value: "CZK", label: "Czech Koruna [CZK]" },
  { value: "HUF", label: "Hungarian Forint [HUF]" },
  { value: "RON", label: "Romanian Leu [RON]" },
  { value: "BGN", label: "Bulgarian Lev [BGN]" },
  { value: "BRL", label: "Brazilian Real [BRL]" },
  { value: "MXN", label: "Mexican Peso [MXN]" },
  { value: "ARS", label: "Argentine Peso [ARS]" },
  { value: "CLP", label: "Chilean Peso [CLP]" },
  { value: "COP", label: "Colombian Peso [COP]" },
  { value: "PEN", label: "Peruvian Sol [PEN]" },
];

export const ACCOUNTS_RECEIVABLE = [
  { value: "1", label: "Accounts Receivable" },
  { value: "2", label: "Rent Receivable" },
  { value: "3", label: "Utilities Receivable" },
];

export const INCOME_ACCOUNTS = [
  { value: "1", label: "Rental Income" },
  { value: "2", label: "Service Charge Income" },
  { value: "3", label: "Utility Income" },
  { value: "4", label: "Parking Income" },
];

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "MPESA", label: "M-Pesa" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

export const PERIODS = [
  { value: "custom", label: "Custom Dates" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "todayYesterday", label: "Today & Yesterday" },
  { value: "thisWeek", label: "This Week" },
  { value: "lastWeek", label: "Last Week" },
  { value: "lastWeekToDate", label: "Last Week To Date" },
  { value: "lastWeekButOne", label: "Last Week But One" },
  { value: "lastTwoWeeks", label: "Last Two Weeks" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "lastMonthToDate", label: "Last Month To Date" },
  { value: "lastMonthButOne", label: "Last Month But One" },
  { value: "lastTwoMonths", label: "Last Two Months" },
  { value: "thisQuarter", label: "This Quarter" },
  { value: "lastQuarter", label: "Last Quarter" },
  { value: "thisYear", label: "This Year" },
  { value: "financialYearToLastMonth", label: "Financial Year To Last Month" },
  { value: "lastYear", label: "Last Year" },
];

// ============================================
// CRM (Module 3)
// ============================================

/** Pipeline columns on the board, in order. Terminal stages last. */
export const LEAD_STAGES: Array<{
    value: 'NEW' | 'CONTACTED' | 'VIEWING_SCHEDULED' | 'NEGOTIATION' | 'WON' | 'LOST';
    label: string;
    description: string;
}> = [
    { value: 'NEW', label: 'New', description: 'Freshly captured, nobody has called yet' },
    { value: 'CONTACTED', label: 'Contacted', description: 'We reached them and had a first conversation' },
    { value: 'VIEWING_SCHEDULED', label: 'Viewing scheduled', description: 'A property or unit viewing is booked' },
    { value: 'NEGOTIATION', label: 'Negotiation', description: 'Talking terms — price, rent, move-in date' },
    { value: 'WON', label: 'Won', description: 'Converted to a contact (and usually a tenant or buyer)' },
    { value: 'LOST', label: 'Lost', description: 'Closed without a deal; the reason is recorded' },
] as const;

export const LEAD_SOURCES: Array<{ value: string; label: string }> = [
    { value: 'WEBSITE', label: 'Website' },
    { value: 'FACEBOOK', label: 'Facebook' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'WALK_IN', label: 'Walk-in' },
    { value: 'REFERRAL', label: 'Referral' },
    { value: 'OTHER', label: 'Other' },
];

export const CONTACT_TYPES: Array<{ value: string; label: string }> = [
    { value: 'BUYER', label: 'Buyer' },
    { value: 'TENANT', label: 'Tenant' },
    { value: 'LANDLORD', label: 'Landlord' },
    { value: 'INVESTOR', label: 'Investor' },
    { value: 'AGENT', label: 'Agent' },
    { value: 'LAWYER', label: 'Lawyer' },
];

export const COMM_CHANNELS: Array<{ value: string; label: string }> = [
    { value: 'CALL', label: 'Call' },
    { value: 'EMAIL', label: 'Email' },
    { value: 'SMS', label: 'SMS' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'MEETING', label: 'Meeting' },
    { value: 'NOTE', label: 'Note' },
];

export const COMM_DIRECTIONS: Array<{ value: string; label: string }> = [
    { value: 'INBOUND', label: 'Inbound' },
    { value: 'OUTBOUND', label: 'Outbound' },
];

/** Column accent colours for the pipeline board. */
export const LEAD_STAGE_COLORS: Record<string, string> = {
    NEW: 'bg-slate-100 border-slate-300',
    CONTACTED: 'bg-sky-50 border-sky-300',
    VIEWING_SCHEDULED: 'bg-indigo-50 border-indigo-300',
    NEGOTIATION: 'bg-amber-50 border-amber-300',
    WON: 'bg-green-50 border-green-300',
    LOST: 'bg-red-50 border-red-300',
};

// ============================================
// SALES (Module 4)
// ============================================

/** Sale pipeline columns, in order. Terminal stages are last and closed. */
export const SALE_STAGES: Array<{
    value:
        | 'QUOTATION'
        | 'OFFER'
        | 'RESERVATION'
        | 'AGREEMENT'
        | 'PAYMENT'
        | 'HANDOVER'
        | 'CANCELLED';
    label: string;
    description: string;
}> = [
    { value: 'QUOTATION', label: 'Quotation', description: 'Price agreed in principle, nothing committed' },
    { value: 'OFFER', label: 'Offer', description: 'Formal offer made to the buyer' },
    { value: 'RESERVATION', label: 'Reservation', description: 'Property held — agreed price on record' },
    { value: 'AGREEMENT', label: 'Agreement', description: 'Sale agreement signed with a buyer' },
    { value: 'PAYMENT', label: 'Payment', description: 'Invoices raised and money being collected' },
    { value: 'HANDOVER', label: 'Handover', description: 'Fully paid and transferred — sale closed' },
    { value: 'CANCELLED', label: 'Cancelled', description: 'Closed without a deal; reason recorded' },
] as const;

export const SALE_STAGE_COLORS: Record<string, string> = {
    QUOTATION: 'bg-slate-100 border-slate-300',
    OFFER: 'bg-sky-50 border-sky-300',
    RESERVATION: 'bg-indigo-50 border-indigo-300',
    AGREEMENT: 'bg-violet-50 border-violet-300',
    PAYMENT: 'bg-amber-50 border-amber-300',
    HANDOVER: 'bg-green-50 border-green-300',
    CANCELLED: 'bg-red-50 border-red-300',
};

export const INSTALLMENT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'INVOICED', label: 'Invoiced' },
    { value: 'PAID', label: 'Paid' },
    { value: 'OVERDUE', label: 'Overdue' },
    { value: 'WAIVED', label: 'Waived' },
];

export const COMMISSION_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'PAID', label: 'Paid' },
    { value: 'REJECTED', label: 'Rejected' },
];

// ============================================
// LEASE & TENANCY (Module 5)
// ============================================

export const AGREEMENT_STATUSES: Array<{ value: string; label: string }> = [
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'RENEWED', label: 'Renewed' },
    { value: 'TERMINATED', label: 'Terminated' },
];

export const AGREEMENT_TYPES: Array<{ value: string; label: string }> = [
    { value: 'RENTAL', label: 'Rental (monthly)' },
    { value: 'LEASE', label: 'Lease (fixed term)' },
];

export const MOVE_OUT_STATUSES: Array<{ value: string; label: string }> = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'REJECTED', label: 'Rejected' },
];

export const DEDUCTION_CATEGORIES: Array<{ value: string; label: string }> = [
    { value: 'DAMAGE', label: 'Damage' },
    { value: 'CLEANING', label: 'Cleaning' },
    { value: 'UNPAID_RENT', label: 'Unpaid rent' },
    { value: 'LATE_FEE', label: 'Late fee' },
    { value: 'UTILITY', label: 'Utility' },
    { value: 'REPAIRS', label: 'Repairs' },
    { value: 'OTHER', label: 'Other' },
];

export const CONDITION_RATINGS: Array<{ value: string; label: string }> = [
    { value: 'GOOD', label: 'Good' },
    { value: 'FAIR', label: 'Fair' },
    { value: 'POOR', label: 'Poor' },
    { value: 'DAMAGED', label: 'Damaged' },
];

export const INSPECTION_TYPES: Array<{ value: string; label: string }> = [
    { value: 'MOVE_IN', label: 'Move-in' },
    { value: 'PERIODIC', label: 'Periodic' },
    { value: 'MOVE_OUT', label: 'Move-out' },
    { value: 'ANNUAL', label: 'Annual' },
];

/** Colours for agreement status pills, shared by list and detail. */
export const AGREEMENT_STATUS_STYLES: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-700',
    ACTIVE: 'bg-green-100 text-green-800',
    EXPIRED: 'bg-amber-100 text-amber-800',
    RENEWED: 'bg-violet-100 text-violet-800',
    TERMINATED: 'bg-red-100 text-red-800',
};

export const CONDITION_STYLES: Record<string, string> = {
    GOOD: 'bg-green-100 text-green-800',
    FAIR: 'bg-yellow-100 text-yellow-800',
    POOR: 'bg-orange-100 text-orange-800',
    DAMAGED: 'bg-red-100 text-red-800',
};

// ============================================
// TENANT REQUESTS (Module 5)
// ============================================

export const TENANT_REQUEST_TYPES: Array<{
    value: string;
    label: string;
    description: string;
}> = [
    {
        value: 'RENEWAL',
        label: 'Renew my lease',
        description: 'Stay on after the current term, optionally with a new rent.',
    },
    {
        value: 'MOVE_OUT',
        label: 'Give notice to move out',
        description: 'Tell us when you plan to leave. Your notice period still applies.',
    },
    {
        value: 'PAYMENT_PLAN',
        label: 'Ask for a payment plan',
        description: 'If you are behind on rent, ask to agree instalments.',
    },
    {
        value: 'MAINTENANT',
        label: 'Report a repair',
        description: 'Something in the unit needs fixing.',
    },
    {
        value: 'LEASE_AMENDMENT',
        label: 'Change something on my lease',
        description: 'Anything else you would like agreed in writing.',
    },
];

export const TENANT_REQUEST_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'WITHDRAWN', label: 'Withdrawn' },
];

export const REQUEST_STATUS_STYLES: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
    WITHDRAWN: 'bg-slate-100 text-slate-700',
};

// ---------------------------------------------------------------------------
// Module 6: Landlord Management — owner statements, payouts, charges
// ---------------------------------------------------------------------------

export const MANAGEMENT_FEE_TYPES = [
    { value: 'PERCENTAGE', label: 'Percentage of rent collected' },
    { value: 'FIXED', label: 'Flat fee per statement period' },
];

export const OWNER_STATEMENT_STATUSES: Array<{
    value: 'DRAFT' | 'ISSUED' | 'SETTLED' | 'VOID';
    label: string;
    /** Tailwind classes for the status badge. */
    className: string;
}> = [
    { value: 'DRAFT', label: 'Draft', className: 'bg-slate-100 text-slate-700' },
    { value: 'ISSUED', label: 'Issued', className: 'bg-blue-100 text-blue-700' },
    { value: 'SETTLED', label: 'Settled', className: 'bg-emerald-100 text-emerald-700' },
    { value: 'VOID', label: 'Void', className: 'bg-slate-100 text-slate-500 line-through' },
];

export const PAYOUT_STATUSES: Array<{
    value: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
    label: string;
    className: string;
}> = [
    { value: 'PENDING', label: 'Pending', className: 'bg-amber-100 text-amber-700' },
    { value: 'PROCESSING', label: 'Processing', className: 'bg-blue-100 text-blue-700' },
    { value: 'PAID', label: 'Paid', className: 'bg-emerald-100 text-emerald-700' },
    { value: 'FAILED', label: 'Failed', className: 'bg-red-100 text-red-700' },
];

export const CHARGE_CATEGORIES: Array<{ value: string; label: string }> = [
    { value: 'MAINTENANCE', label: 'Maintenance' },
    { value: 'REPAIR', label: 'Repairs' },
    { value: 'UTILITIES', label: 'Utilities' },
    { value: 'INSURANCE', label: 'Insurance' },
    { value: 'TAX', label: 'Tax / rates' },
    { value: 'LEGAL', label: 'Legal' },
    { value: 'OTHER', label: 'Other' },
];

/** Period presets for the "generate a statement" flow. */
export const STATEMENT_PERIOD_PRESETS: Array<{
    value: 'last-month' | 'this-month' | 'last-quarter' | 'custom';
    label: string;
}> = [
    { value: 'last-month', label: 'Last month' },
    { value: 'this-month', label: 'Month to date' },
    { value: 'last-quarter', label: 'Last quarter' },
    { value: 'custom', label: 'Custom dates' },
];

// ============================================
// WORKFLOW ENGINE (Module 18)
// ============================================

/**
 * What a request's status means, in words an approver can act on.
 *
 * `ESCALATED` is deliberately *not* a dead end: a level that blew its deadline
 * has been handed to somebody higher up and can still be decided.
 */
export const WORKFLOW_STATUS_META: Record<
    string,
    { label: string; className: string; description: string }
> = {
    IN_PROGRESS: {
        label: 'Waiting',
        className: 'bg-amber-100 text-amber-800',
        description: 'Somebody still has to decide this.',
    },
    ESCALATED: {
        label: 'Escalated',
        className: 'bg-orange-100 text-orange-800',
        description: 'It missed its deadline and was handed to somebody higher up.',
    },
    APPROVED: {
        label: 'Approved',
        className: 'bg-emerald-100 text-emerald-700',
        description: 'Every level that had to sign off has.',
    },
    REJECTED: {
        label: 'Rejected',
        className: 'bg-red-100 text-red-700',
        description: 'Somebody declined it. The note explains why.',
    },
    CANCELLED: {
        label: 'Withdrawn',
        className: 'bg-slate-100 text-slate-600',
        description: 'The person who raised it pulled it back.',
    },
};

export const WORKFLOW_STEP_STATUS_META: Record<
    string,
    { label: string; className: string }
> = {
    PENDING: { label: 'Not started', className: 'bg-slate-100 text-slate-600' },
    ACTIVE: { label: 'Waiting on you', className: 'bg-amber-100 text-amber-800' },
    APPROVED: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700' },
    REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
    ESCALATED: { label: 'Escalated', className: 'bg-orange-100 text-orange-800' },
    SKIPPED: { label: 'Did not apply', className: 'bg-slate-100 text-slate-500' },
};

export const WORKFLOW_EVENT_LABELS: Record<string, string> = {
    STARTED: 'Requested',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    ESCALATED: 'Escalated',
    DELEGATED: 'Delegated',
    CANCELLED: 'Withdrawn',
    SKIPPED: 'Skipped',
    AUTO_APPROVED: 'Processed without approval',
};

/**
 * Entity types the engine knows how to carry. Free-form in the database — a new
 * type is a policy row, not a migration — so this is for the picker's benefit.
 */
export const WORKFLOW_ENTITY_TYPES: Array<{ value: string; label: string }> = [
    { value: 'REFUND', label: 'Refund (money going back out)' },
    { value: 'EXPENSE', label: 'Expense' },
    { value: 'PAYOUT', label: 'Landlord payout' },
    { value: 'WRITE_OFF', label: 'Write-off' },
    { value: 'DISCOUNT', label: 'Discount' },
    { value: 'LEASE', label: 'Lease' },
    { value: 'PURCHASE_ORDER', label: 'Purchase order' },
    { value: 'WORK_ORDER', label: 'Work order' },
];

export const WORKFLOW_CONDITION_OPS: Array<{ value: string; label: string }> = [
    { value: 'gt', label: 'is greater than' },
    { value: 'gte', label: 'is at least' },
    { value: 'lt', label: 'is less than' },
    { value: 'lte', label: 'is at most' },
    { value: 'eq', label: 'equals' },
    { value: 'neq', label: 'does not equal' },
    { value: 'in', label: 'is one of' },
    { value: 'contains', label: 'contains' },
    { value: 'exists', label: 'is present' },
];

/** Context keys an approver is most likely to need, by entity type. */
export const WORKFLOW_CONTEXT_HINTS: Record<string, string[]> = {
    REFUND: ['amount', 'currency', 'reason', 'payer', 'invoiceNumber', 'refundable'],
    EXPENSE: ['amount', 'currency', 'reason', 'category'],
    PAYOUT: ['amount', 'currency', 'reason', 'landlord'],
    WRITE_OFF: ['amount', 'currency', 'reason'],
    DISCOUNT: ['amount', 'reason'],
    LEASE: ['rentAmount', 'tenant', 'reason'],
    PURCHASE_ORDER: ['amount', 'supplier', 'reason'],
    WORK_ORDER: ['amount', 'reason', 'priority'],
};

export function formatWorkflowCurrency(value: unknown, fallback = ''): string {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return fallback;
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: fallback || 'KES',
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${fallback || 'KES'} ${amount.toLocaleString()}`;
    }
}

// ---------------------------------------------------------------------------
// Module 9: Maintenance — work orders, plant, preventive maintenance
// ---------------------------------------------------------------------------

/**
 * The work-order pipeline, in order.
 *
 * The order matters: the board renders one column per state in exactly this
 * sequence, so a job reads left to right as it progresses. `CANCELLED` is last
 * because it leaves the pipeline rather than moving along it.
 */
export const WORK_ORDER_STATUSES: Array<{
    value: string;
    label: string;
    className: string;
    /** What "done" means for this state — drives the empty-state copy. */
    hint: string;
}> = [
    {
        value: 'REQUESTED',
        label: 'Requested',
        className: 'bg-slate-100 text-slate-700',
        hint: 'Reported and waiting for someone to look at it',
    },
    {
        value: 'INSPECTION',
        label: 'Inspection',
        className: 'bg-violet-100 text-violet-700',
        hint: 'Being assessed before anyone commits money',
    },
    {
        value: 'APPROVED',
        label: 'Approved',
        className: 'bg-blue-100 text-blue-700',
        hint: 'Signed off, waiting for a technician',
    },
    {
        value: 'ASSIGNED',
        label: 'Assigned',
        className: 'bg-cyan-100 text-cyan-700',
        hint: 'Somebody is booked to do it',
    },
    {
        value: 'IN_PROGRESS',
        label: 'In progress',
        className: 'bg-amber-100 text-amber-800',
        hint: 'On site, work under way',
    },
    {
        value: 'COMPLETED',
        label: 'Completed',
        className: 'bg-emerald-100 text-emerald-700',
        hint: 'Fixed, waiting to be signed off',
    },
    {
        value: 'CLOSED',
        label: 'Closed',
        className: 'bg-slate-800 text-white',
        hint: 'Done and finished with',
    },
    {
        value: 'CANCELLED',
        label: 'Cancelled',
        className: 'bg-slate-100 text-slate-500',
        hint: 'Called off, with the reason recorded',
    },
];

export const WORK_ORDER_STATUS_LABELS: Record<string, string> = Object.fromEntries(
    WORK_ORDER_STATUSES.map((status) => [status.value, status.label]),
);

/** The states that are still live work. Mirrors `OPEN_STATUSES` on the API. */
export const OPEN_WORK_ORDER_STATUSES = [
    'REQUESTED',
    'INSPECTION',
    'APPROVED',
    'ASSIGNED',
    'IN_PROGRESS',
];

export const WORK_ORDER_PRIORITIES: Array<{
    value: string;
    label: string;
    className: string;
    /** The response window, so the list can say why a job is red. */
    window: string;
}> = [
    { value: 'EMERGENCY', label: 'Emergency', className: 'bg-red-100 text-red-700', window: '24 hours' },
    { value: 'HIGH', label: 'High', className: 'bg-orange-100 text-orange-700', window: '3 days' },
    { value: 'NORMAL', label: 'Normal', className: 'bg-slate-100 text-slate-700', window: '7 days' },
    { value: 'LOW', label: 'Low', className: 'bg-slate-100 text-slate-500', window: '30 days' },
];

export const MAINTENANCE_CATEGORIES: Array<{ value: string; label: string }> = [
    { value: 'PLUMBING', label: 'Plumbing' },
    { value: 'ELECTRICAL', label: 'Electrical' },
    { value: 'CLEANING', label: 'Cleaning' },
    { value: 'PAINTING', label: 'Painting' },
    { value: 'SECURITY', label: 'Security' },
    { value: 'OTHER', label: 'Other' },
];

export const WORK_ORDER_SOURCES: Array<{ value: string; label: string }> = [
    { value: 'STAFF', label: 'Staff' },
    { value: 'TENANT_PORTAL', label: 'Resident portal' },
    { value: 'TENANT_REQUEST', label: 'Resident request queue' },
    { value: 'PREVENTIVE', label: 'Preventive service' },
];

/**
 * The buttons a work order offers, in the order the state machine allows them.
 *
 * These are the *offered* actions — each one asks for the fields it needs in its
 * own dialog — so the API decides what actually happens and returns a refusal
 * written for the person who pressed the button.
 */
export const WORK_ORDER_ACTIONS: Record<string, { value: string; label: string }[]> = {
    REQUESTED: [
        { value: 'INSPECT', label: 'Record inspection' },
        { value: 'ASSIGN', label: 'Assign technician' },
        { value: 'CANCEL', label: 'Cancel' },
    ],
    INSPECTION: [
        { value: 'APPROVE', label: 'Approve & assign' },
        { value: 'CANCEL', label: 'Cancel' },
    ],
    APPROVED: [
        { value: 'ASSIGN', label: 'Assign technician' },
        { value: 'CANCEL', label: 'Cancel' },
    ],
    ASSIGNED: [
        { value: 'START', label: 'Start work' },
        { value: 'CANCEL', label: 'Cancel' },
    ],
    IN_PROGRESS: [{ value: 'COMPLETE', label: 'Complete' }],
    COMPLETED: [{ value: 'CLOSE', label: 'Close' }],
    CLOSED: [],
    CANCELLED: [],
};

export const WORK_ORDER_ACTION_LABELS: Record<string, string> = {
    INSPECT: 'Record inspection',
    APPROVE: 'Approve & assign',
    ASSIGN: 'Assign technician',
    START: 'Start work',
    COMPLETE: 'Complete',
    CLOSE: 'Close',
    CANCEL: 'Cancel',
};

export const ASSET_TYPES: Array<{ value: string; label: string }> = [
    { value: 'ELEVATOR', label: 'Lift / elevator' },
    { value: 'GENERATOR', label: 'Generator' },
    { value: 'HVAC', label: 'Air conditioning' },
    { value: 'WATER_PUMP', label: 'Water pump' },
    { value: 'CCTV', label: 'CCTV / security' },
    { value: 'OTHER', label: 'Other plant' },
];

export const ASSET_STATUSES: Array<{
    value: string;
    label: string;
    className: string;
    hint: string;
}> = [
    {
        value: 'OPERATIONAL',
        label: 'Operational',
        className: 'bg-emerald-100 text-emerald-700',
        hint: 'In service',
    },
    {
        value: 'SERVICE_DUE',
        label: 'Service due',
        className: 'bg-amber-100 text-amber-800',
        hint: 'The service calendar says it is due',
    },
    {
        value: 'OUT_OF_SERVICE',
        label: 'Out of service',
        className: 'bg-red-100 text-red-700',
        hint: 'Broken or switched off',
    },
    {
        value: 'RETIRED',
        label: 'Retired',
        className: 'bg-slate-100 text-slate-500',
        hint: 'No longer owned; kept for its history',
    },
];

/** Intervals offered by the schedule form, in the words people use. */
export const PM_CADENCES: Array<{ value: number; label: string }> = [
    { value: 7, label: 'Weekly' },
    { value: 14, label: 'Fortnightly' },
    { value: 30, label: 'Monthly' },
    { value: 90, label: 'Quarterly' },
    { value: 180, label: 'Every six months' },
    { value: 365, label: 'Yearly' },
];

/** "Every 30 days" — for a schedule row, where days are all we store. */
export function describeCadence(frequencyDays: number): string {
    const match = PM_CADENCES.find((cadence) => cadence.value === frequencyDays);
    return match ? match.label : `Every ${frequencyDays} days`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Module 11 — Inventory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Why a category, rather than a free-text field.
 *
 * The question the whole field exists to answer is "what do we spend on plumbing a
 * year", and that needs a bucket rather than a string anybody typed. Free text
 * would answer it as "plumbing", "Plumbing", "plmb" and "bathroom" — four
 * categories, one spend.
 */
export const INVENTORY_CATEGORIES: Array<{
    value: string;
    label: string;
    hint: string;
}> = [
    { value: 'PAINT', label: 'Paint', hint: 'Emulsion, enamel, primer, varnish' },
    { value: 'PLUMBING', label: 'Plumbing', hint: 'Pipe, fittings, valves, taps' },
    { value: 'ELECTRICAL', label: 'Electrical', hint: 'Sockets, switches, cable, boards' },
    { value: 'TILES_FLOORING', label: 'Tiles & flooring', hint: 'Tiles, screed, skirting, lino' },
    { value: 'BUILDING_MATERIALS', label: 'Building materials', hint: 'Cement, sand, blocks, timber' },
    { value: 'HARDWARE', label: 'Hardware', hint: 'Screws, hinges, handles, brackets' },
    { value: 'CLEANING', label: 'Cleaning', hint: 'Detergent, sanitiser, cloths, mops' },
    { value: 'SAFETY', label: 'Safety', hint: 'Fire, first aid, signage, PPE' },
    { value: 'GARDENING', label: 'Gardening', hint: 'Plants, feed, tools' },
    { value: 'FURNITURE', label: 'Furniture', hint: 'Desks, chairs, shelves' },
    { value: 'APPLIANCES', label: 'Appliances', hint: 'Fridges, kettles, microwaves' },
    { value: 'OTHER', label: 'Other', hint: 'Everything that fits nowhere else' },
];

/**
 * Every movement type, for the filter and for reading the ledger.
 *
 * `hint` says what a row of this type means, because "ADJUSTMENT" on its own does
 * not tell a reader whether stock went up or down — the sign does, and the hint
 * says why it is allowed to.
 */
export const STOCK_MOVEMENT_TYPES: Array<{
    value: string;
    label: string;
    hint: string;
}> = [
    {
        value: 'GOODS_RECEIPT',
        label: 'Goods received',
        hint: 'Arrived against a purchase order. Always in, never out.',
    },
    {
        value: 'WORK_ORDER_ISSUE',
        label: 'Used on a job',
        hint: 'Consumed by a maintenance work order. Always out.',
    },
    {
        value: 'ADJUSTMENT',
        label: 'Stock take',
        hint: 'A correction after counting. The only kind that may leave stock negative.',
    },
    {
        value: 'OPENING',
        label: 'Opening balance',
        hint: 'Stock that was already on the shelf before this module existed.',
    },
    {
        value: 'TRANSFER',
        label: 'Transfer',
        hint: 'Moved between stores — two rows, one transfer group.',
    },
    {
        value: 'RETURN',
        label: 'Return',
        hint: 'Back to the supplier, or back off a job onto the shelf.',
    },
];

/**
 * The three a person records by hand.
 *
 * `GOODS_RECEIPT` and `WORK_ORDER_ISSUE` are deliberately missing: both carry a
 * reference to another module's record and are written through that module's own
 * endpoint, so the reference cannot be forged or pointed at the wrong thing.
 */
export const MANUAL_MOVEMENT_TYPES: Array<{
    value: string;
    label: string;
    hint: string;
}> = [
    {
        value: 'OPENING',
        label: 'Opening balance',
        hint: 'The first stock on the shelf for a new item.',
    },
    {
        value: 'ADJUSTMENT',
        label: 'Stock take correction',
        hint: 'The count disagreed with the books. Needs a reason.',
    },
    {
        value: 'RETURN',
        label: 'Return',
        hint: 'Back on the shelf from a job, or back to the supplier.',
    },
];

/**
 * The status filter.
 *
 * `belowReorder` is `!= 'OK'` rather than a second comparison, so it catches both
 * "running low" and "nothing left" — the screen somebody opens is "what do I need
 * to buy", not "which of the two shortage states is this".
 */
export const STOCK_STATUS_FILTERS: Array<{ value: string; label: string }> = [
    { value: '', label: 'Any stock level' },
    { value: 'belowReorder', label: 'Below reorder level or empty' },
    { value: 'outOfStock', label: 'Empty' },
    { value: 'ok', label: 'In stock' },
];

export const STOCK_MOVEMENT_DIRECTIONS: Array<{ value: string; label: string }> = [
    { value: '', label: 'Both ways' },
    { value: 'in', label: 'Came in' },
    { value: 'out', label: 'Went out' },
    { value: 'transfer', label: 'Transfers' },
    { value: 'adjustment', label: 'Stock takes' },
];

/**
 * Units offered when adding an item.
 *
 * Deliberately a list, not a dictionary of conversion factors: a property manager
 * buying paint does not think in millilitres, and a conversion engine is a second
 * source of truth that nobody will maintain. Anything else can be typed in — the
 * field is free text for exactly that reason.
 */
export const STOCK_UNITS: string[] = [
    'unit',
    'piece',
    'box',
    'roll',
    'tin',
    'litre',
    'metre',
    'kg',
    'bag',
    'pack',
    'length',
    'pair',
    'set',
    'jerrycan',
    'sheet',
];


// ═══════════════════════════════════════════════════════════════════════════
// Module 12 — HR & Payroll
// ═══════════════════════════════════════════════════════════════════════════
//
// Every list here is **data a screen can render**, never something the engine
// decides. Which rules apply, which base a percentage reads, whether a pay period
// is annualised — all of that is resolved server-side from the organization's
// jurisdiction, and none of it is safe to infer in a browser.

export const EMPLOYMENT_TYPES: Array<{ value: string; label: string; hint: string }> = [
    { value: 'FULL_TIME', label: 'Full time', hint: 'The ordinary arrangement' },
    { value: 'PART_TIME', label: 'Part time', hint: 'Fewer hours than a full week' },
    { value: 'CONTRACT', label: 'Contract', hint: 'Fixed term or project' },
    { value: 'INTERN', label: 'Intern', hint: 'Temporary, usually unpaid or minimal' },
    { value: 'TEMPORARY', label: 'Temporary', hint: 'Covering somebody who is away' },
];

export const PAY_FREQUENCIES: Array<{ value: string; label: string; hint: string }> = [
    {
        value: 'MONTHLY',
        label: 'Monthly',
        hint: '12 periods a year. The common case, and the only one most systems model',
    },
    {
        value: 'WEEKLY',
        label: 'Weekly',
        hint: '52 periods. Annual income tax on 52 weeks is not 12 months of it',
    },
    {
        value: 'FORTNIGHTLY',
        label: 'Fortnightly',
        hint: '26 periods a year',
    },
    { value: 'QUARTERLY', label: 'Quarterly', hint: '4 periods a year' },
    { value: 'ANNUAL', label: 'Annual', hint: 'One payment a year' },
];

/**
 * Currencies offered when adding an employee.
 *
 * A short list plus free text, because the honest answer for "what currencies do
 * you pay in" is whatever this group pays in, and the field is a three-letter
 * ISO-4217 code the backend validates either way. A closed list would be a
 * statement about which countries this product works in, and it works in more
 * than four.
 */

/**
 * Locales offered for a payslip.
 *
 * The *format* only — this product's interface is English and translating it is
 * app-wide work that is not this module's job. What is this module's job is that
 * a payslip is a document which may be contractually owed in somebody's own
 * language, so the payslip carries the locale it was rendered in and the date and
 * number formatting follows it rather than a hardcoded `en-KE`.
 */
export const PAYSLIP_LOCALES: Array<{ value: string; label: string }> = [
    { value: '', label: "The organization's default" },
    { value: 'en-KE', label: 'English (Kenya)' },
    { value: 'en-GB', label: 'English (UK)' },
    { value: 'en-US', label: 'English (US)' },
    { value: 'sw-KE', label: 'Kiswahili (Kenya)' },
    { value: 'fr-FR', label: 'Français (France)' },
    { value: 'de-DE', label: 'Deutsch (Deutschland)' },
    { value: 'es-ES', label: 'Español (España)' },
    { value: 'pt-BR', label: 'Português (Brasil)' },
    { value: 'ar-EG', label: 'العربية (مصر)' },
    { value: 'hi-IN', label: 'हिन्दी (भारत)' },
];

export const LEAVE_TYPES: Array<{ value: string; label: string; hint: string }> = [
    { value: 'ANNUAL', label: 'Annual leave', hint: 'The entitlement, and the one with a balance' },
    { value: 'SICK', label: 'Sick leave', hint: 'Usually a separate entitlement' },
    { value: 'UNPAID', label: 'Unpaid leave', hint: 'Not a balance — a deduction instead' },
    { value: 'MATERNITY', label: 'Maternity leave', hint: 'Statutory in most jurisdictions' },
    { value: 'PATERNITY', label: 'Paternity leave', hint: 'Statutory in some, not all' },
    { value: 'ADOPTION', label: 'Adoption leave', hint: 'Statutory in some, not all' },
    { value: 'BEREAVEMENT', label: 'Bereavement leave', hint: 'Usually a fixed number of days' },
    {
        value: 'COMPENSATORY',
        label: 'Time off in lieu',
        hint: 'Owed for work done outside normal hours, and frequently time-limited by law',
    },
    { value: 'OFFICIAL', label: 'Official duty', hint: 'Business elsewhere, not annual leave' },
    { value: 'OFF_DUTY', label: 'Off duty', hint: 'Paid time the policy already covers' },
];

export const LEAVE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
    PENDING: { label: 'Waiting', className: 'bg-amber-100 text-amber-800' },
    APPROVED: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700' },
    REJECTED: { label: 'Declined', className: 'bg-red-100 text-red-700' },
    CANCELLED: { label: 'Withdrawn', className: 'bg-slate-100 text-slate-600' },
};

/**
 * The three arithmetic shapes a rule can have.
 *
 * Each `hint` says what the type is *for*, because the difference matters legally
 * rather than technically: a percentage of a base is a contribution, a ladder is
 * an income tax, and a fixed amount is neither.
 */
export const PAYROLL_RULE_TYPES: Array<{ value: string; label: string; hint: string }> = [
    {
        value: 'PERCENTAGE',
        label: 'Percentage of a base',
        hint: 'Social insurance, health funds, levies. Usually one rate, possibly capped.',
    },
    {
        value: 'PROGRESSIVE_BANDS',
        label: 'Progressive bands',
        hint: 'Income tax. Each slice is taxed at its own rate, so the ladder must increase.',
    },
    {
        value: 'FIXED',
        label: 'A fixed amount',
        hint: 'A flat deduction or allowance, independent of the base.',
    },
];

/**
 * What a rule's percentage reads.
 *
 * `TAXABLE` exists because "taxable pay" is a statutory concept frequently **not**
 * equal to gross pay — a housing benefit is commonly taxable but not pensionable,
 * or the reverse — so a rule that only knew about GROSS could not be correct in
 * those places.
 */
export const PAYROLL_CALCULATION_BASES: Array<{ value: string; label: string; hint: string }> = [
    { value: 'GROSS', label: 'Gross pay', hint: 'Everything paid before any deduction' },
    { value: 'BASIC', label: 'Basic salary', hint: 'The contracted base, excluding allowances' },
    {
        value: 'TAXABLE',
        label: 'Taxable pay',
        hint: 'Gross less the non-taxable components this jurisdiction excludes',
    },
];

export const PAYROLL_BEARERS: Array<{ value: string; label: string; hint: string }> = [
    { value: 'EMPLOYEE', label: 'The employee', hint: 'Withheld. Reduces what they are paid.' },
    {
        value: 'EMPLOYER',
        label: 'The employer',
        hint: 'Never reduces net pay. Appears because employees are entitled to see the cost of employing them.',
    },
    {
        value: 'BOTH',
        label: 'Both, matched',
        hint: 'The same rate on each side — two figures, one rule.',
    },
];

/**
 * Annualised versus per-period.
 *
 * **This is the difference between a correct income tax and a wrong one.** Almost
 * every country sets its bands annually and computes the tax on annual income
 * before dividing by the number of periods. Walking the same bands once per month
 * on monthly pay consumes the whole year's relief by January and gives a
 * different — and wrong — answer. The hint on `ANNUALISED` says so, because it is
 * the field most likely to be set wrong by somebody who does not know why.
 */
export const PAYROLL_PERIOD_MODES: Array<{ value: string; label: string; hint: string }> = [
    {
        value: 'ANNUALISED',
        label: 'On annual income, divided back down',
        hint: 'Correct for income tax. The bands are set annually, so scale up, tax, then divide by the number of periods.',
    },
    {
        value: 'PERIOD',
        label: 'On each period as it stands',
        hint: 'Correct for social contributions, which are charged on the month.',
    },
];

export const PAYROLL_LINE_DIRECTIONS: Record<
    string,
    { label: string; className: string; hint: string }
> = {
    EARNING: {
        label: 'Earning',
        className: 'bg-slate-100 text-slate-700',
        hint: 'Adds to gross',
    },
    EMPLOYEE_DEDUCTION: {
        label: 'Deducted',
        className: 'bg-amber-100 text-amber-800',
        hint: 'Comes off what they are paid',
    },
    EMPLOYER_CONTRIBUTION: {
        label: 'Employer cost',
        className: 'bg-sky-100 text-sky-800',
        hint: 'What it costs to employ them. Never reduces net pay.',
    },
};

/**
 * The payroll run states, with what each one *means*.
 *
 * `hint` is on every entry rather than only the surprising ones, because the
 * surprising part is that `APPROVED` is not the end: the run still has to be
 * posted to the ledger and the money still has to be released, and a screen that
 * showed four states in a row without saying that would invite somebody to treat
 * approval as payment.
 */
export const PAYROLL_RUN_STATUS_LABELS: Record<
    string,
    { label: string; className: string; hint: string }
> = {
    DRAFT: {
        label: 'Draft',
        className: 'bg-slate-100 text-slate-600',
        hint: 'A period and a date, nothing calculated yet',
    },
    CALCULATED: {
        label: 'Calculated',
        className: 'bg-sky-100 text-sky-800',
        hint: 'Payslips exist but nobody has signed off the figures',
    },
    APPROVED: {
        label: 'Approved',
        className: 'bg-violet-100 text-violet-800',
        hint: 'Signed off — not yet on the ledger and not yet paid',
    },
    PAID: {
        label: 'Paid',
        className: 'bg-emerald-100 text-emerald-700',
        hint: 'Posted to the ledger and the money released',
    },
    VOID: {
        label: 'Voided',
        className: 'bg-red-100 text-red-700',
        hint: 'Superseded. Its payslips are kept as the record of what happened',
    },
};

/**
 * The order a payroll run moves in, and the one rule about it.
 *
 * **Posting comes before paying**, and that is the whole point of the sequence:
 * paying staff before the cost of employing them is on the books makes the trial
 * balance a work of fiction. The backend refuses `pay` on an unposted run; this
 * list exists so the buttons are disabled in the same order rather than letting
 * somebody click and read a 409.
 */
export const PAYROLL_RUN_SEQUENCE: Array<{
    status: string;
    action: string | null;
    label: string;
}> = [
    { status: 'DRAFT', action: 'calculate', label: 'Calculate' },
    { status: 'CALCULATED', action: 'approve', label: 'Approve the figures' },
    { status: 'APPROVED', action: 'post', label: 'Post to the ledger' },
    { status: 'APPROVED', action: 'pay', label: 'Release the money' },
];

export const PAYROLL_WARNING_LABELS: Record<string, string> = {
    NO_RULES_RESOLVED:
        'No statutory rules for this jurisdiction — nothing has been withheld.',
    NET_NEGATIVE: 'Deductions exceed gross, so net pay is not a positive amount.',
    ZERO_GROSS: 'Gross pay is zero, so every percentage rule is zero too.',
    BASE_ABOVE_CAP:
        'The base is above a statutory ceiling, so this payslip is not the whole picture.',
    BASE_BELOW_FLOOR: 'The base is below a statutory minimum contributory wage.',
    MISSING_PERIODS: 'Periods per year is wrong, so an annualised rule fell back to 12.',
};

// =============================================================
// Module 13 — Facilities
// =============================================================

export const FACILITY_KINDS: Array<{ value: string; label: string }> = [
    { value: 'CLUBHOUSE', label: 'Clubhouse' },
    { value: 'MEETING_ROOM', label: 'Meeting room' },
    { value: 'PARKING', label: 'Parking' },
    { value: 'GYM', label: 'Gym' },
    { value: 'POOL', label: 'Swimming pool' },
    { value: 'TENNIS_COURT', label: 'Tennis court' },
    { value: 'LAUNDRY', label: 'Laundry' },
    { value: 'RECREATION', label: 'Recreation' },
    { value: 'OTHER', label: 'Other' },
];

/**
 * Booking-grid sizes.
 *
 * A list rather than "any positive integer" because this is the unit the diary is
 * drawn in: a facility with a 7-minute grid produces a diary nobody can read and a
 * booking form with 300 options. The backend constrains it to the same range.
 */
export const FACILITY_SLOT_MINUTES: Array<{ value: number; label: string; hint: string }> = [
    { value: 15, label: '15 minutes', hint: 'Short slots — a treatment room or a court' },
    { value: 30, label: '30 minutes', hint: 'Consulting or a single desk' },
    { value: 60, label: '1 hour', hint: 'Meeting rooms and desks' },
    { value: 120, label: '2 hours', hint: 'Clubhouses and pools' },
];

export const FACILITY_BOOKING_STATUSES: Array<{ value: string; label: string }> = [
    { value: 'PENDING', label: 'Awaiting approval' },
    { value: 'CONFIRMED', label: 'Confirmed' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'REJECTED', label: 'Declined' },
    { value: 'NO_SHOW', label: 'Did not turn up' },
];

/**
 * Column headers for `?status=`. The value is `ALL` rather than an empty string
 * because an empty `<Select>` option and "no filter" are different meanings and the
 * second one is what the query string wants.
 */
export const FACILITY_STATUS_FILTERS: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: 'All states' },
    { value: 'UPCOMING', label: 'Upcoming' },
    { value: 'PAST', label: 'Past' },
    { value: 'TODAY', label: 'Today' },
];

export const FACILITY_BOOKING_FILTERS: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: 'All states' },
    { value: 'PENDING', label: 'Awaiting approval' },
    { value: 'CONFIRMED', label: 'Confirmed' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'REJECTED', label: 'Declined' },
    { value: 'NO_SHOW', label: 'Did not turn up' },
];

export const ACCESS_CARD_TYPES: Array<{ value: string; label: string }> = [
    { value: 'BUILDING', label: 'Building — every door' },
    { value: 'UNIT', label: 'Unit — this door and the building' },
    { value: 'PARKING', label: 'Parking' },
    { value: 'FACILITY', label: 'Facility — gym, store, clubhouse' },
    { value: 'GATE', label: 'Gate permit' },
];

export const ACCESS_CARD_STATUSES: Array<{ value: string; label: string }> = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'SUSPENDED', label: 'Suspended' },
    { value: 'LOST', label: 'Reported lost' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'REVOKED', label: 'Revoked' },
];

/**
 * **Derived** filters for the gate log — every one is a comparison between two
 * timestamps and the current time, which is why there is no column behind them.
 */
export const VISIT_STATE_FILTERS: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: 'Everything' },
    { value: 'onsite', label: 'On site now' },
    { value: 'expected', label: 'Expected, not yet arrived' },
    { value: 'overdue', label: 'Overstayed' },
    { value: 'history', label: 'History' },
];

/**
 * Module 13 badge styles.
 *
 * Deliberately **not** added to `STATUS_STYLES` in `entity-states.tsx`: that record
 * is keyed on a bare status string shared across every module, and both
 * `FacilityBookingStatus` and `AccessCardStatus` contain `ACTIVE`, `PENDING` and
 * `EXPIRED` with entirely different meanings. A card that is `EXPIRED` and a booking
 * that is `EXPIRED` — well, one has no such state — would otherwise borrow each
 * other's colours from a lookup table that cannot tell which resource it is
 * rendering. Each list therefore maps its own status.
 */
export const FACILITY_BOOKING_STATUS_STYLES: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    CONFIRMED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-slate-100 text-slate-500',
    REJECTED: 'bg-red-100 text-red-700',
    NO_SHOW: 'bg-orange-100 text-orange-800',
};

export const ACCESS_CARD_STATUS_STYLES: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    SUSPENDED: 'bg-amber-100 text-amber-800',
    LOST: 'bg-orange-100 text-orange-800',
    EXPIRED: 'bg-slate-100 text-slate-500',
    REVOKED: 'bg-red-100 text-red-700',
};

/** The gate book. `OVERSTAY` is the one that matters most, so it is the loudest. */
export const VISIT_STATE_STYLES: Record<string, string> = {
    EXPECTED: 'bg-sky-100 text-sky-800',
    ON_SITE: 'bg-emerald-100 text-emerald-700',
    OVERSTAY: 'bg-red-100 text-red-700',
    MISSED: 'bg-slate-100 text-slate-500',
    COMPLETED: 'bg-slate-100 text-slate-500',
};
