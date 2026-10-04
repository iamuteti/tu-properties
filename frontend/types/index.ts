import { ColumnDef } from '@tanstack/react-table';

export interface PropertyCategory {
    id: string;
    name: string;
    code?: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PropertyType {
    id: string;
    name: string;
    code?: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Landlord {
    id: string;
    code: string;
    name: string;
    status: string;
    email?: string;
    phone?: string;
    alternativePhone?: string;
    address?: string;
    city?: string;
    country?: string;
    postalCode?: string;
    bankName?: string;
    bankBranch?: string;
    accountName?: string;
    accountNumber?: string;
    taxPin?: string;
    vatRegistered?: boolean;
    /** Management agreement (Module 6) — what the owner statement deducts. */
    managementFeeType: 'PERCENTAGE' | 'FIXED';
    managementFeeRate: number;
    managementFeeAmount: number;
    notes?: string;
    organizationId?: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
    properties?: Property[];
}

/** Landlord detail payload: profile plus the owner's money history. */
export interface LandlordDetail extends Landlord {
    /** Properties, each with a unit count so the page need not fetch them. */
    properties?: Array<Property & { _count?: { units: number } }>;
    statements: OwnerStatementSummary[];
    payouts: LandlordPayoutSummary[];
    charges: LandlordCharge[];
    totals: {
        properties: number;
        units: number;
        paidOut: number;
        outstanding: number;
        unstatedCharges: number;
    };
}

export interface StatementIncomeLine {
    ref: string;
    description: string;
    property: string | null;
    amount: number;
    paymentDate: string;
}

export interface StatementExpenseLine {
    ref: string;
    category: string;
    description: string;
    property: string | null;
    amount: number;
    chargeDate: string;
}

export type OwnerStatementStatus = 'DRAFT' | 'ISSUED' | 'SETTLED' | 'VOID';

export interface OwnerStatementSummary {
    id: string;
    statementNumber: string;
    periodStart: string;
    periodEnd: string;
    status: OwnerStatementStatus;
    grossIncome: number;
    expenses: number;
    managementFee: number;
    carriedForward: number;
    netPayout: number;
    issuedAt?: string | null;
}

export interface OwnerStatement extends OwnerStatementSummary {
    organizationId?: string;
    landlordId: string;
    currency: string;
    notes?: string | null;
    incomeLines: StatementIncomeLine[];
    expenseLines: StatementExpenseLine[];
    landlord?: { id: string; code: string; name: string };
    payouts?: LandlordPayoutSummary[];
    charges?: LandlordCharge[];
    createdAt: string;
    updatedAt: string;
    generatedBy?: string | null;
    /** Derived: how much of the net payout has been paid out. */
    settledAmount: number;
    /** Derived: what is still owed on this statement. */
    outstandingAmount: number;
}

export interface StatementPreview {
    landlordId: string;
    periodStart: string;
    periodEnd: string;
    grossIncome: number;
    expenses: number;
    managementFee: number;
    carriedForward: number;
    netPayout: number;
    incomeLines: StatementIncomeLine[];
    expenseLines: StatementExpenseLine[];
    priorStatements: OwnerStatementSummary[];
}

export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';

export interface LandlordPayoutSummary {
    id: string;
    amount: number;
    status: PayoutStatus;
    method: string;
    reference?: string | null;
    paidAt?: string | null;
    createdAt: string;
    ownerStatementId?: string | null;
    ownerStatement?: {
        id: string;
        statementNumber: string;
        periodEnd?: string;
        netPayout: number;
    } | null;
}

export interface LandlordPayout extends LandlordPayoutSummary {
    landlordId: string;
    currency: string;
    scheduledFor?: string | null;
    failureReason?: string | null;
    notes?: string | null;
    landlord?: { id: string; code: string; name: string };
}

export type ChargeCategory =
    | 'MAINTENANCE'
    | 'REPAIR'
    | 'UTILITIES'
    | 'INSURANCE'
    | 'TAX'
    | 'LEGAL'
    | 'OTHER';

export interface LandlordCharge {
    id: string;
    landlordId: string;
    propertyId?: string | null;
    category: ChargeCategory;
    description: string;
    amount: number;
    chargeDate: string;
    /** Set once the charge is on an issued statement — then it is frozen. */
    ownerStatementId?: string | null;
    ownerStatement?: { id: string; statementNumber: string; status: OwnerStatementStatus } | null;
    notes?: string | null;
    property?: { id: string; name: string } | null;
    landlord?: { id: string; code: string; name: string };
    createdAt: string;
    updatedAt: string;
}

export interface Organization {
    id: string;
    name: string;
    slug: string;
    subdomain?: string;
    customDomain?: string;
    isActive: boolean;
    plan: string;
    maxUsers: number;
    maxProperties: number;
    logoUrl?: string;
    primaryColor?: string;
    contactEmail?: string;
    contactPhone?: string;
    /** Legal & tax profile (System Settings). */
    legalName?: string;
    taxId?: string;
    /** Org-level defaults (System Settings). */
    currency?: string;
    timezone?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OrganizationProfileInput {
    name?: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    legalName?: string | null;
    taxId?: string | null;
    currency?: string;
    timezone?: string;
}

export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'PROPERTY_MANAGER' | 'LEASING_OFFICER' | 'ACCOUNTANT' | 'USER';
    organizationId?: string;
    organization?: Organization;
    /**
     * Set only for tenant portal logins: this user is a resident of exactly one
     * tenant record, and the `/portal` API is scoped by it. Staff have it null.
     */
    portalTenantId?: string | null;
    /** Whether TOTP two-factor auth is enabled on this account. */
    mfaEnabled?: boolean;
    /** Account status (user management). */
    isActive?: boolean;
    phone?: string;
}

/** Structured RBAC role (Module 1: Core Platform). */
export interface RolePermissions {
    all?: boolean;
    modules: Record<string, { view?: boolean; create?: boolean; update?: boolean; delete?: boolean }>;
}

export interface Role {
    id: string;
    name: string;
    description?: string;
    isSystem: boolean;
    organizationId?: string | null;
    permissions: RolePermissions;
}

export interface RoleAssignment {
    id: string;
    roleId: string;
    role: Omit<Role, 'permissions'>;
}

export interface Branch {
    id: string;
    organizationId?: string;
    name: string;
    code?: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface Document {
    id: string;
    organizationId?: string;
    entityType: string;
    entityId: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    sizeBytes: number;
    version: number;
    uploadedById: string;
    uploadedBy?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    };
    createdAt: string;
    updatedAt: string;
}

export interface LoginEvent {
    action: string;
    details?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    at: string;
}

export interface AuthResponse {
    user: User;
    sessionId?: string;
    /** Set when the account has MFA enabled and the TOTP step is pending. */
    mfaRequired?: boolean;
    /** Short-lived challenge token for the MFA verify step. */
    mfaToken?: string;
}

export interface ApiResponse<T> {
    data: T;
    message?: string;
    error?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

/** Lifecycle status of a property record (Module 2). */
export type PropertyStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

/** Occupancy status of a unit (Module 2). Always consistent with its leases. */
export type UnitStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';

/** Structured amenity row attached to a property. */
export interface PropertyAmenity {
    id: string;
    propertyId: string;
    name: string;
    category?: string | null;
    notes?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

/** Feature/amenity row attached to a unit. */
export interface UnitFeature {
    id?: string;
    unitId?: string;
    name: string;
    featureType?: string | null;
}

/** Per-row report returned by the CSV bulk import endpoints. */
export interface ImportReport {
    total: number;
    created: number;
    skipped: number;
    failed: number;
    dryRun: boolean;
    results: Array<{
        row: number;
        code?: string;
        name?: string;
        status: 'created' | 'skipped' | 'failed';
        id?: string;
        message?: string;
    }>;
}

export interface Property {
    id: string;
    code: string;
    name: string;
    dateAcquired?: string;
    lrNumber?: string;
    /** Lifecycle status; archived properties are hidden from default lists. */
    status?: PropertyStatus;
    branchId?: string;
    branch?: Branch | null;
    amenities?: PropertyAmenity[];
    /** Occupancy rollup returned by the property detail endpoint. */
    occupancy?: Record<string, number> & { total: number };
    
    // Location & Address
    country?: string;
    estateArea?: string; // Estate/Area
    areaRegion?: string; // Area/Region
    roadStreet?: string; // Road/Street
    specification?: string; // Multi-unit/Multi-Space
    
    // Property Classification
    multiStoryType?: string; // Multi Story Type
    numberOfFloors?: number; // No. Of Floors
    
    // Geographic Coordinates
    latitude?: number;
    longitude?: number;
    
    // Notes & Contact Info
    notes?: string; // Property notes/description
    specificContactInfo?: string; // Specific contact information
    
    // Relationships
    landlordId?: string;
    landlord?: any;

    /**
     * Classification columns on the `properties` table. Both are free-form
     * strings seeded from `PROPERTY_TYPES` / `PROPERTY_CATEGORIES` in
     * `lib/constants.ts` — the database has no property-type/category lookup
     * tables, so the `categoryId` / `propertyTypeId` fields that used to sit
     * here never had a column to write to.
     */
    category?: string;
    type?: string;
    
    // Organization/Tenant association
    organizationId?: string;
    organization?: any;
    
    // Accounting & Billing Configuration
    accountLedgerType?: string; // e.g., "Property Control Ledger in GL"
    primaryBankAccount?: string; // Primary Bank/Account/Operating Account
    alternativeTaxPin?: string; // Alternative Tax PIN
    propertyWorkingTaxPin?: string; // Property Working Tax PIN
    invoicePaymentInfo?: string;
    holderPaymentTerms?: string;
    
    // MPESA Configuration
    mpesaPropertyPayNumber?: string;
    disableMpesaStkPush?: boolean;
    disableMpesaStkNarration?: boolean;
    
    // Counters
    tenantReceiptAccountCodeCounter?: number;
    
    // Rent Penalty Configuration
    lpgExempted?: boolean;
    penaltyChargeMode?: string; // Penalty Charge Mode
    penaltyDay?: number; // Penalty Day
    
    // Landlord Banking Details
    landlordDrawerBank?: string;
    landlordBankBranch?: string;
    landlordAccountName?: string;
    landlordAccountNumber?: string;
    
    // Communication Preferences
    exemptAllSms?: boolean;
    exemptInvoiceSms?: boolean;
    exemptGeneralSms?: boolean;
    exemptHagueSms?: boolean;
    exemptBalanceSms?: boolean;
    
    exemptAllEmail?: boolean;
    exemptInvoiceEmail?: boolean;
    exemptGeneralEmail?: boolean;
    exemptReceiptEmail?: boolean;
    exemptBalanceEmail?: boolean;
    
    // Other Preferences
    excludeInTwoSummaryReport?: boolean;
    
    // Related entities
    units?: any[];
    standingCharges?: any[];
    securityDeposits?: any[];
    
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
    
    _count?: {
        units: number;
        amenities?: number;
    };
}

export interface Unit {
    id: string;
    code: string;
    name: string;
    sequence?: number;
    propertyId: string;
    property?: Property;

    // Pricing
    quotedPrice?: number;
    baseRent?: number;
    basePerUnitArea?: number;
    currency?: string;

    // Area/Space Management
    areaSqFt?: number;
    chargePlan?: string;

    // Unit Details & Specifications
    floor?: number;
    bedrooms?: number;
    bathrooms?: number;
    furnished?: boolean;
    outSourceParking?: string;
    type?: any;

    // Ownership
    ownerOccupied?: boolean;

    // Utility Account & Billing Numbers
    electricityAcno?: string;
    waterAcno?: string;
    electricityMeethno?: string;
    waterMeethno?: string;

    // Letting Details
    takeOnLettingDate?: string;

    // Tenant/Resident Code Counter
    tenantResidentCodeCounter?: number;

    // Notes
    apartmentNotes?: string;

    // Status
    status: string;

    // Relationships
    rentalAgreements?: RentalAgreement[];
    serviceCharges?: any[];
    meterNumbers?: any[];
    features?: UnitFeature[];

    /** Derived occupancy view returned by the unit detail endpoint. */
    occupancy?: {
        status: UnitStatus;
        derivedStatus: UnitStatus;
        availableActions: UnitStatus[];
    };

    // Audit fields
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
}

export interface TenantEmergencyContact {
    id?: string;
    contactName?: string;
    relationship?: string;
    phone?: string;
    email?: string;
    priority?: number;
}

export interface Tenant {
    id: string;
    accountNumber: string;
    code: string;
    tenantType?: string;
    surname: string;
    otherNames?: string;
    gender?: string;
    email?: string;
    phone: string;
    town?: string;
    county?: string;
    occupation?: string;
    /** CRM link (Module 3): the shared people directory entry. */
    contactId?: string;
    sendMobileNumber?: boolean;
    idNoRegNo?: string;
    taxPin?: string;
    postalAddress?: string;
    postalCode?: string;
    country?: string;
    photoUrl?: string;
    organizationId?: string;
    rentalAgreement?: RentalAgreement;
    lastPaidInvoice?: Invoice;
    emergencyContacts?: TenantEmergencyContact[];
    status: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
}

export interface RentalAgreement {
    id: string;
    unitId: string;
    tenantId: string;
    agreementType?: 'LEASE' | 'RENTAL';
    startDate: string;
    endDate?: string;
    rentAmount: number;
    currency?: string;
    paymentDay?: number;
    termMonths?: number;
    securityDeposit?: number;
    escalationRate?: number;
    escalationMonth?: number;
    noticePeriodDays?: number;
    status: string;
    unit?: Unit;
    tenant?: Tenant;
    property?: Property;
    invoices?: any[];
    createdAt: string;
    updatedAt: string;
}

export interface Invoice {
    id: string;
    invoiceNumber: string;
    landlordId?: string;
    rentalAgreementId?: string;
    issueDate: string;
    dueDate: string;
    amount: number;
    vatAmount?: number;
    totalAmount: number;
    currency: string;
    transactionClass?: string;
    acReceivable?: string;
    billTo?: string;
    spotRate?: number;
    lpoNumber?: string;
    signOnEfims?: boolean;
    paymentInfo?: string;
    termsConditions?: string;
    memo?: string;
    status: 'DRAFT' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
    paidAmount: number;
    balanceAmount: number;
    organizationId?: string;
    createdAt: string;
    updatedAt: string;
    landlord?: Landlord;
    rentalAgreement?: RentalAgreement;
    invoiceItems?: any[];
    payments?: Payment[];
}

export interface Receipt {
    id: string;
    receiptId: string;
    receiptType: 'ApplyToInvoice' | 'CashReceipt';
    receiptCategory: 'Rent' | 'General';
    
    // Common fields
    receivedFrom: string;
    paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'MPESA' | 'CARD' | 'OTHER';
    depositIntoAc?: string;
    refNo?: string;
    chequeNo?: string;
    chequeDate?: string;
    recordingDate: string;
    amountReceived: number;
    notes?: string;
    
    // Rent receipt specific fields
    tenantId?: string;
    tenant?: Tenant;
    landlordId?: string;
    landlord?: Landlord;
    recordDate?: string;
    bankingDate?: string;
    paymentRefNo?: string;
    amountVatInclusive?: boolean;
    receiptTo?: 'Landlord' | 'GeneralLedger';
    drtOrDrf?: 'DirectReceipt' | 'DepositRefund';
    memo?: string;
    paymentBank?: string;
    currency?: string;
    spotRate?: number;
    
    // Reversal properties
    isReversed?: boolean;
    reversalPeriod?: string;
    
    // Relationships
    payments?: Payment[];
    receiptLines?: ReceiptLine[];
    
    organizationId?: string;
    createdAt: string;
    updatedAt: string;
    recordedBy?: string;
}

export interface Payment {
    id: string;
    invoiceId?: string;
    rentalAgreementId?: string;
    receiptId?: string;
    paymentDate: string;
    amount: number;
    currency?: string;
    spotRate?: number;
    paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'MPESA' | 'CARD' | 'OTHER';
    paymentReference?: string;
    payee?: string;
    paidFrom?: string;
    paidTo?: string;
    paymentType?: 'ApplyToBill' | 'CashPayment';
    chequeNumber?: string;
    chequeDate?: string;
    mpesaReceiptNumber?: string;
    mpesaPhoneNumber?: string;
    notes?: string;
    attachments?: string;
    organizationId?: string;
    createdAt: string;
    updatedAt: string;
    recordedBy?: string;
    invoice?: Invoice;
    rentalAgreement?: RentalAgreement;
    receipt?: Receipt;
}

export interface ReceiptLine {
    id?: string;
    date: string;
    invNo?: string;
    particular: string;
    invoiceTotal: number;
    prevReceipts: number;
    amtDue: number;
    payment: number;
    newBalance: number;
    whtTax?: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface DashboardStats {
    totals: {
        properties: number;
        landlords: number;
        units: number;
        activeTenants: number;
    };
    unitsByStatus: { status: string; count: number }[];
    monthlyCharges: { label: string; charged: number; collected: number }[];
    unitsByProperty: { property: string; units: number }[];
}

export interface CreateReceiptData {
    receiptId?: string;
    receiptType?: 'ApplyToInvoice' | 'CashReceipt';
    receiptCategory?: 'Rent' | 'General';
    receivedFrom: string;
    paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'MPESA' | 'CARD' | 'OTHER';
    depositIntoAc?: string;
    refNo?: string;
    chequeNo?: string;
    chequeDate?: string;
    recordingDate?: string;
    amountReceived: number;
    notes?: string;
    tenantId?: string;
    landlordId?: string;
    recordDate?: string;
    bankingDate?: string;
    paymentRefNo?: string;
    amountVatInclusive?: boolean;
    receiptTo?: 'Landlord' | 'GeneralLedger';
    drtOrDrf?: 'DirectReceipt' | 'DepositRefund';
    memo?: string;
    paymentBank?: string;
    currency?: string;
    spotRate?: number;
    recordedBy?: string;
    receiptLines?: Omit<ReceiptLine, 'id'>[];
    payments?: {
        invoiceId?: string;
        rentalAgreementId?: string;
        paymentDate: string;
        amount: number;
        currency?: string;
        spotRate?: number;
        paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'MPESA' | 'CARD' | 'OTHER';
        paymentReference?: string;
        payee?: string;
        paidFrom?: string;
        paidTo?: string;
        paymentType?: 'ApplyToBill' | 'CashPayment';
        notes?: string;
    }[];
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  searchColumn?: keyof T;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
}

export interface ImageCarouselProps {
  images?: string[];
  height?: string;
  onChange?: (index: number) => void;
}

export interface ImageData {
  src: string;
  name: string;
  file: File;
}

export interface ImagePickerProps {
  max?: number;
  min?: number;
  required?: boolean;
  onChange?: (files: File[]) => void;
  existingImages?: string[];
  hint?: string;
}

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

// Billing API
export interface InvoiceLineItem {
    revenueExpenseItem: string;
    particular: string;
    incomeAccount: string;
    unitCost: number;
    qty: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
    className: string;
}

export interface CreateInvoiceData {
    // Invoice header
    invoiceNumber?: string;
    landlordId?: string;
    rentalAgreementId?: string;
    transactionClass: string;
    acReceivable: string;
    billTo?: string;
    issueDate: string;
    dueDate: string;
    currency: string;
    spotRate: number;
    lpoNumber?: string;
    signOnEfims: boolean;
    paymentInfo?: string;
    termsConditions?: string;
    memo?: string;
    
    // Amounts
    amount: number;
    vatAmount?: number;
    totalAmount: number;
    paidAmount?: number;
    balanceAmount: number;
    status?: string;
    
    // Invoice items
    invoiceItems?: InvoiceLineItem[];
}

export interface CreatePaymentData {
    invoiceId?: string;
    rentalAgreementId?: string;
    receiptId?: string;
    paymentDate: string;
    amount: number;
    currency?: string;
    spotRate?: number;
    paymentMethod: string;
    paymentReference?: string;
    payee?: string;
    paidFrom?: string;
    paidTo?: string;
    paymentType?: string;
    chequeNumber?: string;
    chequeDate?: string;
    mpesaReceiptNumber?: string;
    mpesaPhoneNumber?: string;
    notes?: string;
}

export interface MoveOutRequest {
    id: string;
    organizationId: string;
    tenantId: string;
    rentalAgreementId: string;
    moveoutDate: string;
    approvalDate?: string;
    approvedBy?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    depositRefunded: boolean;
    depositRefundAmount?: number;
    notes?: string;
    createdAt: string;
    updatedAt: string;
    tenant?: Tenant;
    rentalAgreement?: RentalAgreement;
    /** Itemised deductions behind the refund (Module 5). */
    deductions?: MoveOutDeduction[];
    /** Detail endpoint only: the derived deposit position. */
    deposit?: DepositBreakdown;
}
// ============================================
// CRM (Module 3)
// ============================================

/** Where a lead came from. WEBSITE/FACEBOOK are the automated sources. */
export type LeadSource =
    | 'WEBSITE'
    | 'FACEBOOK'
    | 'WHATSAPP'
    | 'WALK_IN'
    | 'REFERRAL'
    | 'OTHER';

/** Pipeline stage. WON/LOST are terminal until the lead is reopened. */
export type LeadStage =
    | 'NEW'
    | 'CONTACTED'
    | 'VIEWING_SCHEDULED'
    | 'NEGOTIATION'
    | 'WON'
    | 'LOST';

export type ContactType =
    | 'BUYER'
    | 'TENANT'
    | 'LANDLORD'
    | 'INVESTOR'
    | 'AGENT'
    | 'LAWYER';

export type CommChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'CALL' | 'NOTE' | 'MEETING';
export type CommDirection = 'INBOUND' | 'OUTBOUND';

export interface Lead {
    id: string;
    organizationId?: string;
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    message?: string | null;
    source: LeadSource;
    sourceDetail?: string | null;
    stage: LeadStage;
    lostReason?: string | null;
    interestedPropertyId?: string | null;
    interestedProperty?: { id: string; name: string; code: string } | null;
    branchId?: string | null;
    branch?: { id: string; name: string; code: string } | null;
    assignedAgentId?: string | null;
    assignedAgent?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    } | null;
    /** Set once the lead is converted — the contact it became. */
    contactId?: string | null;
    contact?: { id: string; firstName: string; lastName: string; type: ContactType } | null;
    convertedAt?: string | null;
    createdAt: string;
    updatedAt: string;

    communications?: Communication[];
    /** Only on the detail endpoint: the stages this lead may move to now. */
    pipeline?: { availableStages: LeadStage[] };
}

export interface Contact {
    id: string;
    organizationId?: string;
    type: ContactType;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    notes?: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    tenant?: {
        id: string;
        code: string;
        surname: string;
        otherNames: string | null;
    } | null;
    _count?: { leads: number; communications: number };
    leads?: Array<{
        id: string;
        firstName: string;
        lastName: string | null;
        stage: LeadStage;
        source: LeadSource;
        createdAt: string;
    }>;
    /** Only on the detail endpoint: merged communication history. */
    timeline?: Communication[];
}

export interface Communication {
    id: string;
    organizationId?: string;
    contactId?: string | null;
    leadId?: string | null;
    channel: CommChannel;
    direction: CommDirection;
    subject?: string | null;
    content?: string | null;
    outcome?: string | null;
    occurredAt: string;
    createdAt?: string;
    loggedById?: string | null;
    loggedBy?: { id: string; firstName: string; lastName: string } | null;
    contact?: { id: string; firstName: string; lastName: string } | null;
    lead?: {
        id: string;
        firstName: string;
        lastName: string | null;
        stage: LeadStage;
    } | null;
}

export interface CreateLeadData {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
    message?: string;
    source?: LeadSource;
    sourceDetail?: string;
    interestedPropertyId?: string | null;
    branchId?: string | null;
    assignedAgentId?: string | null;
}

export interface ConvertLeadData {
    contactId?: string;
    type?: ContactType;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    company?: string;
    createTenant?: boolean;
}

export interface LogCommunicationData {
    channel: CommChannel;
    direction?: CommDirection;
    subject?: string;
    content?: string;
    outcome?: string;
    occurredAt?: string;
    contactId?: string;
    leadId?: string;
}

// ============================================
// SALES (Module 4)
// ============================================

/** Property sale pipeline. HANDOVER and CANCELLED are terminal. */
export type SaleStage =
    | 'QUOTATION'
    | 'OFFER'
    | 'RESERVATION'
    | 'AGREEMENT'
    | 'PAYMENT'
    | 'HANDOVER'
    | 'CANCELLED';

export type InstallmentStatus =
    | 'SCHEDULED'
    | 'INVOICED'
    | 'PAID'
    | 'OVERDUE'
    | 'WAIVED';

export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';

export interface SaleInstallment {
    id: string;
    saleTransactionId?: string;
    sequence: number;
    description: string;
    amount: number | string;
    dueDate: string;
    status: InstallmentStatus;
    invoiceId?: string | null;
    paidAt?: string | null;
    invoice?: {
        id: string;
        invoiceNumber: string;
        status: string;
        dueDate: string;
        amount: number | string;
        paidAmount: number | string;
        balanceAmount: number | string;
        currency?: string;
    } | null;
}

export interface Commission {
    id: string;
    organizationId?: string;
    saleTransactionId?: string | null;
    rentalAgreementId?: string | null;
    agentUserId: string;
    amount: number | string;
    splitPercentage?: number | string | null;
    currency: string;
    basis: string;
    status: CommissionStatus;
    notes?: string | null;
    approvedAt?: string | null;
    paidAt?: string | null;
    paidRef?: string | null;
    agent: { id: string; firstName: string; lastName: string; email: string };
    saleTransaction?: { code: string; stage: SaleStage; propertyTitle?: string | null } | null;
    approvedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface Sale {
    id: string;
    organizationId?: string;
    code: string;
    propertyId: string;
    propertyTitle?: string | null;
    property?: { id: string; name: string; code: string; status?: string; landlordId?: string | null };
    buyerContactId?: string | null;
    buyerContact?: { id: string; firstName: string; lastName: string; type: string } | null;
    leadId?: string | null;
    lead?: { id: string; firstName: string; lastName: string; stage: string } | null;
    agentUserId?: string | null;
    agent?: { id: string; firstName: string; lastName: string; email: string } | null;
    stage: SaleStage;
    askingPrice?: number | string | null;
    agreedPrice?: number | string | null;
    bookingFee?: number | string | null;
    depositAmount?: number | string | null;
    currency: string;
    commissionRate?: number | string | null;
    quotationDate?: string | null;
    offerDate?: string | null;
    reservationDate?: string | null;
    agreementDate?: string | null;
    paymentDate?: string | null;
    handoverDate?: string | null;
    cancelledAt?: string | null;
    cancellationReason?: string | null;
    notes?: string | null;
    installments?: SaleInstallment[];
    commissions?: Commission[];
    createdAt: string;
    updatedAt: string;

    /** Detail endpoint only: the money rollup the UI and the server agree on. */
    money?: {
        agreedPrice: number;
        scheduled: number;
        outstanding: number;
        commission: number;
    };
    /** Detail endpoint only: the stages this sale may move to right now. */
    pipeline?: { availableStages: SaleStage[] };
}

export interface CreateSaleData {
    propertyId: string;
    propertyTitle?: string;
    buyerContactId?: string | null;
    leadId?: string | null;
    agentUserId?: string | null;
    askingPrice?: number;
    agreedPrice?: number;
    bookingFee?: number;
    depositAmount?: number;
    currency?: string;
    commissionRate?: number;
    notes?: string;
}

export interface CommissionReportRow {
    agentUserId: string;
    agentName: string;
    agentEmail: string;
    saleCount: number;
    total: number;
    pending: number;
    approved: number;
    paid: number;
}

export interface CommissionReport {
    rows: Commission[];
    byAgent: CommissionReportRow[];
}

// ============================================
// LEASE & TENANCY (Module 5)
// ============================================

export type AgreementStatus =
    | 'DRAFT'
    | 'ACTIVE'
    | 'EXPIRED'
    | 'TERMINATED'
    | 'RENEWED';

export type AgreementType = 'RENTAL' | 'LEASE';

export type LeaseAction =
    | 'ACTIVATE'
    | 'RENEW'
    | 'EXTEND'
    | 'TERMINATE'
    | 'EXPIRE'
    | 'REACTIVATE';

export interface Lease {
    id: string;
    code?: string;
    organizationId?: string | null;
    unitId: string;
    tenantId: string;
    status: AgreementStatus;
    agreementType: AgreementType;
    rentAmount: number | string;
    currency: string;
    startDate: string;
    endDate?: string | null;
    paymentDay?: number | null;
    termMonths?: number | null;
    securityDeposit?: number | string | null;
    noticePeriodDays?: number | null;
    escalationRate?: number | string | null;
    escalationMonth?: number | null;
    activatedAt?: string | null;
    terminatedAt?: string | null;
    terminatedReason?: string | null;
    expiredAt?: string | null;
    depositRefunded?: boolean;
    renewedToId?: string | null;
    renewedTo?: { id: string; code: string; status: AgreementStatus; endDate?: string | null } | null;
    renewedFrom?: { id: string; code: string; status: AgreementStatus; endDate?: string | null } | null;
    createdAt: string;

    unit?: { id: string; name: string; code: string; propertyId: string; property?: { id: string; name: string; code: string } } | null;
    tenant?: {
        id: string;
        code: string;
        surname: string;
        otherNames?: string | null;
        email?: string | null;
        phone?: string | null;
        accountNumber?: string | null;
    } | null;
    moveOutRequests?: MoveOutRequest[];
    inspections?: InspectionReport[];
    invoices?: Array<{
        id: string;
        invoiceNumber: string;
        status: string;
        dueDate: string;
        amount: number | string;
        paidAmount: number | string;
        balanceAmount: number | string;
    }>;

    /** Detail endpoint only. */
    money?: {
        invoiced: number;
        paid: number;
        outstanding: number;
        arrears: number;
    };
    timeline?: {
        daysRemaining: number | null;
        availableActions: LeaseAction[];
        notices: string[];
    };
}

export interface LeaseLedger {
    money: { invoiced: number; paid: number; outstanding: number; arrears: number };
    invoices: Array<{
        id: string;
        invoiceNumber: string;
        dueDate: string;
        amount: number;
        paid: number;
        status: string;
    }>;
}

export type MoveOutStatus = 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED';
export type DeductionCategory =
    | 'DAMAGE'
    | 'CLEANING'
    | 'UNPAID_RENT'
    | 'LATE_FEE'
    | 'UTILITY'
    | 'REPAIRS'
    | 'OTHER';

export interface MoveOutDeduction {
    id: string;
    category: DeductionCategory;
    description: string;
    amount: number | string;
    notes?: string | null;
    approvedBy?: { firstName: string; lastName: string } | null;
    createdAt: string;
}

export interface DepositBreakdown {
    depositHeld: number;
    deductions: Array<{
        category: DeductionCategory;
        description: string;
        amount: number;
        notes?: string | null;
        approvedBy?: string | null;
        createdAt: string;
    }>;
    deductionsByCategory: Array<{ category: DeductionCategory; total: number }>;
    deductionsTotal: number;
    unpaidRent: number;
    /** Never negative — what goes back to the tenant. */
    refund: number;
    /** Set when deductions and arrears exceed the deposit. */
    carriedForward: number;
    refundPaid: boolean;
    refundPaidAt?: string | null;
    refundRecordedAmount?: number | string | null;
    currency: string;
    status: MoveOutStatus;
    moveOutRequestId: string;
}


export type InspectionType = 'MOVE_IN' | 'PERIODIC' | 'MOVE_OUT' | 'ANNUAL';
export type InspectionStatus = 'DRAFT' | 'COMPLETED' | 'VOID';
export type ConditionRating = 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';

export interface InspectionItem {
    id: string;
    area: string;
    item: string;
    condition: ConditionRating;
    notes?: string | null;
    estimatedCost?: number | string | null;
    requiresAction?: boolean;
}

export interface InspectionReport {
    id: string;
    unitId: string;
    rentalAgreementId?: string | null;
    type: InspectionType;
    status: InspectionStatus;
    scheduledDate: string;
    completedAt?: string | null;
    completedBy?: { id: string; firstName: string; lastName: string } | null;
    notes?: string | null;
    items?: InspectionItem[];
    unit?: { id: string; name: string; property?: { id: string; name: string } } | null;
    rentalAgreement?: {
        id: string;
        code: string;
        status: AgreementStatus;
        tenant?: { id: string; surname: string; otherNames?: string | null } | null;
    } | null;
    previous?: InspectionReport | null;
    /** Items that got worse than the last report of the opposite type. */
    comparison?: Array<{
        area: string;
        item: string;
        from: ConditionRating | null;
        to: ConditionRating;
        worse: boolean;
        estimatedCost: number;
    }>;
}

export interface LeaseTemplate {
    id: string;
    name: string;
    agreementType: AgreementType;
    rentAmount?: number | string | null;
    currency: string;
    securityDeposit?: number | string | null;
    termMonths?: number | null;
    noticePeriodDays?: number;
    escalationRate?: number | string | null;
    paymentDay?: number;
    termsBody?: string | null;
    isActive: boolean;
}

export interface OccupancyHistory {
    unit: { id: string; name: string; property: { id: string; name: string; code: string } };
    status: string;
    periods: Array<
        | {
              kind: 'tenancy';
              agreementId: string;
              agreementCode: string;
              agreementStatus: AgreementStatus;
              tenant: { id: string; surname: string; otherNames?: string | null; code: string };
              start: string;
              end?: string | null;
              occupiedDays: number | null;
          }
        | {
              kind: 'vacancy';
              start: string;
              end: string;
              vacantDays: number;
          }
    >;
    summary: {
        tenancies: number;
        totalOccupiedDays: number;
        totalVacantDays: number;
        currentTenant: { id: string; surname: string; otherNames?: string | null; code: string } | null;
    };
}

export interface CreateLeaseData {
    unitId: string;
    tenantId: string;
    rentAmount: number;
    agreementType?: AgreementType;
    currency?: string;
    startDate?: string;
    endDate?: string;
    termMonths?: number;
    securityDeposit?: number;
    noticePeriodDays?: number;
    escalationRate?: number;
    paymentDay?: number;
}

// ============================================
// TENANT PORTAL (Module 5 / auth in Module 1)
// ============================================

export interface PortalTenant {
    code: string;
    accountNumber: string;
    surname: string;
    otherNames?: string | null;
    email?: string | null;
    phone?: string | null;
    status?: string;
}

export interface PortalMoney {
    invoiced: number;
    paid: number;
    outstanding: number;
    arrears: number;
}

export interface PortalSummary {
    hasLease: boolean;
    tenant: PortalTenant;
    money: PortalMoney;
    lease?: {
        code: string;
        rentAmount: number;
        currency: string;
        startDate: string;
        endDate?: string | null;
        unit?: {
            name: string;
            property?: { name: string; roadStreet?: string | null; estateArea?: string | null };
        } | null;
    };
    nextDue?: {
        invoiceId: string;
        invoiceNumber: string;
        dueDate: string;
        balance: number;
        isOverdue: boolean;
    } | null;
    daysRemaining: number | null;
}

export interface PortalLease {
    lease: {
        code: string;
        status: AgreementStatus;
        agreementType: AgreementType;
        rentAmount: number;
        currency: string;
        startDate: string;
        endDate?: string | null;
        termMonths?: number | null;
        paymentDay?: number | null;
        securityDeposit?: number | null;
        noticePeriodDays?: number | null;
        unit?: {
            id: string;
            name: string;
            bedrooms?: number | null;
            bathrooms?: number | null;
            areaSqFt?: number | string | null;
            property?: { id: string; name: string; code: string; roadStreet?: string | null; estateArea?: string | null };
        } | null;
    };
    money: PortalMoney;
    invoices: Array<{
        id: string;
        invoiceNumber: string;
        issueDate: string;
        dueDate: string;
        status: string;
        amount: number;
        paid: number;
    }>;
}

export interface PortalInvoice {
    id: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    status: string;
    amount: number | string;
    paidAmount: number | string;
    balanceAmount: number | string;
    currency?: string;
}

export interface PortalReceipt {
    id: string;
    receiptId: string;
    receiptType: string;
    receiptCategory: string;
    receivedFrom: string;
    paymentMethod: string;
    refNo?: string | null;
    recordingDate: string;
    amountReceived: number | string;
    notes?: string | null;
    memo?: string | null;
    currency: string;
    receiptLines?: Array<{ id: string; particular: string; invNo?: string | null; amtDue: number | string; payment: number | string }>;
}

export interface PortalDocument {
    id: string;
    fileName: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    version?: number;
    createdAt: string;
}


// ============================================
// TENANT REQUESTS (resident-initiated, staff-approved)
// ============================================

export type TenantRequestType =
    | 'RENEWAL'
    | 'MOVE_OUT'
    | 'PAYMENT_PLAN'
    | 'MAINTENANT'
    | 'LEASE_AMENDMENT';

export type TenantRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

export interface TenantRequest {
    id: string;
    type: TenantRequestType;
    status: TenantRequestStatus;
    payload?: Record<string, unknown> | null;
    preferredDate?: string | null;
    /** Set when a move-out date falls inside the lease's notice period. */
    earlyNotice?: boolean;
    note?: string | null;
    decidedAt?: string | null;
    decisionNote?: string | null;
    /** What the approval actually did (e.g. created the successor lease). */
    result?: Record<string, unknown> | null;
    createdAt: string;
    rentalAgreementId?: string | null;
    rentalAgreement?: {
        id: string;
        code: string;
        status: string;
        endDate?: string | null;
        noticePeriodDays?: number | null;
        unit?: { id: string; name: string } | null;
    } | null;
    tenant?: {
        id: string;
        code: string;
        surname: string;
        otherNames?: string | null;
        accountNumber?: string;
        phone?: string | null;
        email?: string | null;
    } | null;
    decidedBy?: { id: string; firstName: string; lastName: string } | null;
}

// ============================================
// WORKFLOW ENGINE (Module 18)
// ============================================

export type WorkflowInstanceStatus =
    | 'IN_PROGRESS'
    | 'ESCALATED'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED';

export type WorkflowStepStatus =
    | 'PENDING'
    | 'ACTIVE'
    | 'APPROVED'
    | 'REJECTED'
    | 'ESCALATED'
    | 'SKIPPED';

export type WorkflowApproverKind = 'ROLE' | 'USER';

export type WorkflowEventType =
    | 'STARTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'ESCALATED'
    | 'DELEGATED'
    | 'CANCELLED'
    | 'SKIPPED'
    | 'AUTO_APPROVED';

export interface WorkflowCondition {
    field: string;
    op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'exists';
    value?: unknown;
}

/** One level of a policy, as stored on a definition and frozen onto an instance. */
export interface WorkflowStepTemplate {
    name: string;
    approverKind: WorkflowApproverKind;
    approverUserId?: string | null;
    approverRole?: string | null;
    condition?: WorkflowCondition | null;
    escalateAfterHours?: number | null;
    escalateToUserId?: string | null;
}

export interface WorkflowDefinition {
    id: string;
    organizationId: string | null;
    entityType: string;
    name: string;
    description?: string | null;
    steps: WorkflowStepTemplate[];
    isActive: boolean;
    priority: number;
    createdAt: string;
    organization?: { id: string; name: string } | null;
    _count?: { instances: number };
}

export interface WorkflowStep {
    id: string;
    stepIndex: number;
    name: string;
    approverKind: WorkflowApproverKind;
    approverUserId?: string | null;
    approverRole?: string | null;
    status: WorkflowStepStatus;
    dueAt?: string | null;
    escalatedAt?: string | null;
    escalateToUserId?: string | null;
    actedById?: string | null;
    actedAt?: string | null;
    comment?: string | null;
    actedViaDelegationId?: string | null;
}

export interface WorkflowEvent {
    id: string;
    type: WorkflowEventType;
    stepIndex?: number | null;
    comment?: string | null;
    createdAt: string;
    actorUserId?: string | null;
    actorUser?: { id: string; firstName: string; lastName: string } | null;
    onBehalfOfUser?: { id: string; firstName: string; lastName: string } | null;
}

export interface WorkflowInstance {
    id: string;
    organizationId: string;
    entityType: string;
    entityId: string;
    entityLabel?: string | null;
    /** What the requester asked for, and what level conditions are read against. */
    context: Record<string, unknown>;
    status: WorkflowInstanceStatus;
    currentStep: number;
    finalComment?: string | null;
    startedById?: string | null;
    startedAt: string;
    completedAt?: string | null;
    createdAt: string;
    stepInstances: WorkflowStep[];
    events: WorkflowEvent[];
    startedBy?: { id: string; firstName: string; lastName: string; email?: string } | null;
    workflowDefinition?: { id: string; name: string; entityType: string } | null;
    /** Only on the response that started a request with no policy configured. */
    autoApproved?: boolean;
    note?: string | null;
    /** What the approval actually did (e.g. the refund it issued). */
    effect?: Record<string, unknown> | null;
}

/** A level waiting on this person, as the inbox sees it. */
export interface ApprovalTask {
    stepId: string;
    instanceId: string;
    stepIndex: number;
    stepName: string;
    status: WorkflowStepStatus;
    dueAt?: string | null;
    escalatedAt?: string | null;
    overdue: boolean;
    viaDelegation: boolean;
    onBehalfOfUserId?: string | null;
    viaOverride: boolean;
    entityType: string;
    entityId: string;
    entityLabel?: string | null;
    context: Record<string, unknown>;
    requestedAt: string;
    requestedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface ApprovalInbox {
    pending: ApprovalTask[];
    requestedByMe: WorkflowInstance[];
    counts: {
        pending: number;
        overdue: number;
        escalated: number;
        requested: number;
    };
}

export interface WorkflowDelegation {
    id: string;
    organizationId: string;
    fromUserId: string;
    toUserId: string;
    startsAt: string;
    endsAt?: string | null;
    reason?: string | null;
    createdAt: string;
    toUser?: { id: string; firstName: string; lastName: string; email?: string };
    fromUser?: { id: string; firstName: string; lastName: string; email?: string };
}

// ---------------------------------------------------------------------------
// Module 9: Maintenance
// ---------------------------------------------------------------------------

export type WorkOrderStatus =
    | 'REQUESTED'
    | 'INSPECTION'
    | 'APPROVED'
    | 'ASSIGNED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CLOSED'
    | 'CANCELLED';

export type WorkOrderAction =
    | 'INSPECT'
    | 'APPROVE'
    | 'ASSIGN'
    | 'START'
    | 'COMPLETE'
    | 'CLOSE'
    | 'CANCEL';

export interface WorkOrderTask {
    id: string;
    workOrderId: string;
    description: string;
    sortOrder: number;
    isDone: boolean;
    completedAt?: string | null;
    completedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface WorkOrder {
    id: string;
    organizationId: string;
    reference: string;
    title: string;
    description: string;
    category: string;
    priority: string;
    status: WorkOrderStatus;
    statusLabel?: string;
    source: string;
    propertyId?: string | null;
    unitId?: string | null;
    tenantId?: string | null;
    assetId?: string | null;
    assignedTechnicianId?: string | null;
    accessInstructions?: string | null;
    estimatedCost?: string | number | null;
    actualCost?: string | number | null;
    reportedAt: string;
    scheduledFor?: string | null;
    inspectedAt?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    closedAt?: string | null;
    cancelledAt?: string | null;
    inspectionNote?: string | null;
    resolutionNote?: string | null;
    cancellationReason?: string | null;
    approvalRequestedAt?: string | null;
    pmDueOn?: string | null;
    createdAt: string;
    updatedAt: string;
    property?: { id: string; name: string } | null;
    unit?: { id: string; name: string; property?: { name: string } | null } | null;
    tenant?: {
        id: string;
        code: string;
        accountNumber?: string;
        surname: string;
        otherNames?: string | null;
        phone?: string | null;
        email?: string | null;
    } | null;
    asset?: { id: string; name: string; type: string; assetTag?: string | null } | null;
    assignedTechnician?: {
        id: string;
        firstName: string;
        lastName: string;
        phone?: string | null;
    } | null;
    raisedBy?: { id: string; firstName: string; lastName: string } | null;
    tasks?: WorkOrderTask[];
    /** Derived by the API, never stored: see `work-order-lifecycle.ts`. */
    overdue?: boolean;
    hoursRemaining?: number;
    openTasks?: number;
    availableActions?: WorkOrderAction[];
    /** The live approval for this work order, when one was requested. */
    approval?: WorkflowInstance | null;
}

export interface WorkOrderStats {
    open: number;
    overdue: number;
    emergency: number;
    unassigned: number;
    scheduledThisWeek: number;
    awaitingApproval: number;
    byStatus: Partial<Record<WorkOrderStatus, number>>;
    byCategory: Record<string, number>;
}

/** What a resident sees of their own requests — no money, no internal notes. */
export interface PortalWorkOrder {
    id: string;
    reference: string;
    title: string;
    description: string;
    category: string;
    priority: string;
    status: WorkOrderStatus;
    statusLabel?: string;
    reportedAt: string;
    scheduledFor?: string | null;
    completedAt?: string | null;
    cancelledAt?: string | null;
    cancellationReason?: string | null;
    property?: { id: string; name: string } | null;
    unit?: { id: string; name: string } | null;
    assignedTechnician?: {
        id: string;
        firstName: string;
        lastName: string;
    } | null;
}

export interface MaintenanceTechnician {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
    role?: string;
    /** Live work already on their plate, for the dispatch picker. */
    openWorkOrders?: number;
}

export interface Asset {
    id: string;
    organizationId: string;
    propertyId: string;
    unitId?: string | null;
    type: string;
    name: string;
    assetTag?: string | null;
    serialNumber?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    location?: string | null;
    capacity?: string | null;
    installedAt?: string | null;
    warrantyExpiresAt?: string | null;
    status: string;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
    property?: { id: string; name: string } | null;
    unit?: { id: string; name: string } | null;
    pmSchedules?: { id: string; title: string; nextDueAt: string }[];
    _count?: { workOrders: number };
}

export interface AssetDetail extends Asset {
    openWorkOrders: number;
    totalWorkOrders: number;
    nextServiceDue?: string | null;
    workOrders: Pick<
        WorkOrder,
        | 'id'
        | 'reference'
        | 'title'
        | 'status'
        | 'source'
        | 'priority'
        | 'reportedAt'
        | 'completedAt'
        | 'actualCost'
    >[];
    serviceHistory: {
        id: string;
        reference: string;
        reportedAt: string;
        completedAt?: string | null;
        pmSchedule?: { title: string; frequencyDays: number } | null;
    }[];
}

export interface AssetStats {
    total: number;
    serviceOverdue: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
}

export interface PmSchedule {
    id: string;
    organizationId: string;
    assetId: string;
    title: string;
    description?: string | null;
    frequencyDays: number;
    leadTimeDays: number;
    checklist?: string[] | null;
    assignedTechnicianId?: string | null;
    active: boolean;
    nextDueAt: string;
    lastRunAt?: string | null;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
    asset?: {
        id: string;
        name: string;
        type: string;
        assetTag?: string | null;
        status: string;
        property?: { id: string; name: string } | null;
    } | null;
    assignedTechnician?: { id: string; firstName: string; lastName: string } | null;
    /** Derived by the API. */
    overdue?: boolean;
    daysUntilDue?: number;
    workOrders?: Pick<
        WorkOrder,
        | 'id'
        | 'reference'
        | 'status'
        | 'reportedAt'
        | 'completedAt'
        | 'pmDueOn'
    >[];
}

export interface PmRun {
    id: string;
    runOn: string;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    schedulesConsidered: number;
    workOrdersCreated: number;
    schedulesSkipped: number;
    schedulesFailed: number;
    details?: Record<string, string> | null;
    triggeredBy?: string | null;
    errorMessage?: string | null;
    startedAt: string;
    finishedAt?: string | null;
}
