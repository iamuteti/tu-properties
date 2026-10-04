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
