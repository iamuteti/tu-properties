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
