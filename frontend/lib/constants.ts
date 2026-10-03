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
];

export const CURRENCIES = [
  { value: "KES", label: "Kenyan Shilling [KES]" },
  { value: "USD", label: "US Dollar [USD]" },
  { value: "EUR", label: "Euro [EUR]" },
  { value: "GBP", label: "British Pound [GBP]" },
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
