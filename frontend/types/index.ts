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

// ---------------------------------------------------------------------------
// Module 10: Procurement
// ---------------------------------------------------------------------------

export type PurchaseRequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type PurchaseRequestAction =
    | 'SUBMIT'
    | 'APPROVE'
    | 'REJECT'
    | 'CANCEL'
    | 'REOPEN'
    | 'RAISE_RFQ';

export interface PurchaseRequestLine {
    id: string;
    description: string;
    specification?: string | null;
    quantity: string | number;
    unitPrice?: string | number | null;
    estimatedAmount?: string | number | null;
    sortOrder: number;
}

export interface PurchaseRequest {
    id: string;
    organizationId: string;
    reference: string;
    title: string;
    description?: string | null;
    category: string;
    priority: string;
    status: PurchaseRequestStatus;
    statusLabel?: string;
    department?: string | null;
    currency: string;
    estimatedAmount?: string | number | null;
    neededBy?: string | null;
    requestedById?: string | null;
    approvalRequestedAt?: string | null;
    decisionNote?: string | null;
    rejectionReason?: string | null;
    decidedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    requestedBy?: { id: string; firstName: string; lastName: string; role?: string } | null;
    decidedBy?: { id: string; firstName: string; lastName: string } | null;
    lines: PurchaseRequestLine[];
    rfqs?: { id: string; reference: string; status: string; createdAt: string }[];
    orders?: { id: string; reference: string; status: string; totalAmount: string | number }[];
    /** Derived by the API, never stored. */
    lineCount?: number;
    rfqCount?: number;
    availableActions?: PurchaseRequestAction[];
    /** The live approval for this request, when one was requested. */
    approval?: WorkflowInstance | null;
}

export interface PurchaseRequestStats {
    total: number;
    open: number;
    awaitingApproval: number;
    urgentOpen: number;
    estimatedOpen: number;
    byStatus: Partial<Record<PurchaseRequestStatus, number>>;
    byCategory: Record<string, number>;
}

export type RfqStatus = 'DRAFT' | 'ISSUED' | 'QUOTES_RECEIVED' | 'CLOSED' | 'AWARDED' | 'CANCELLED';

export type RfqAction = 'ISSUE' | 'RECORD_QUOTE' | 'CLOSE' | 'REOPEN' | 'AWARD' | 'CANCEL';

export type QuoteStatus = 'SUBMITTED' | 'SHORTLISTED' | 'REJECTED' | 'AWARDED' | 'WITHDRAWN';

export interface RfqInvitation {
    id: string;
    supplierId: string;
    status: 'INVITED' | 'QUOTED' | 'DECLINED';
    invitedAt: string;
    respondedAt?: string | null;
    declineReason?: string | null;
    supplier?: { id: string; name: string; code: string; category?: string | null; rating?: number | null } | null;
}

export interface RfqQuoteLine {
    id: string;
    description: string;
    quantity: string | number;
    unitPrice: string | number;
    amount: string | number;
    purchaseRequestLineId?: string | null;
}

export interface RfqQuote {
    id: string;
    rfqId: string;
    supplierId: string;
    status: QuoteStatus;
    totalAmount: string | number;
    currency: string;
    leadTimeDays?: number | null;
    validUntil?: string | null;
    notes?: string | null;
    submittedAt: string;
    supplier?: { id: string; name: string; code?: string; category?: string | null; rating?: number | null } | null;
    lines: RfqQuoteLine[];
}

/** One row of the bid comparison. Every figure is derived server-side. */
export interface ComparisonRow {
    quoteId: string;
    supplierId: string;
    supplierName: string;
    totalAmount: number;
    leadTimeDays: number | null;
    /** Difference from the request's estimate; null when there was none. */
    variance: number | null;
    variancePercent: number | null;
    linesCovered: number;
    linesTotal: number;
    coversAllLines: boolean;
    cheapest: boolean;
    fastest: boolean;
    /** Only set when one quote wins on both price and lead time. */
    recommended: boolean;
    rank: number;
    expired: boolean;
}

export interface QuoteComparison {
    rows: ComparisonRow[];
    lowest: number | null;
    highest: number | null;
    average: number | null;
    quotesReceived: number;
    quotesRanked: number;
    singleSource: boolean;
    lowestQuoteId: string | null;
    fastestQuoteId: string | null;
    recommendedQuoteId: string | null;
}

export interface Rfq {
    id: string;
    organizationId: string;
    reference: string;
    title: string;
    notes?: string | null;
    status: RfqStatus;
    statusLabel?: string;
    currency: string;
    quotesDueAt?: string | null;
    issuedAt?: string | null;
    closedAt?: string | null;
    awardedAt?: string | null;
    awardedQuoteId?: string | null;
    cancellationReason?: string | null;
    purchaseRequestId?: string | null;
    createdAt: string;
    updatedAt: string;
    raisedBy?: { id: string; firstName: string; lastName: string } | null;
    purchaseRequest?: {
        id: string;
        reference: string;
        title: string;
        category: string;
        estimatedAmount?: string | number | null;
        currency: string;
        lines: {
            id: string;
            description: string;
            specification?: string | null;
            quantity: string | number;
            estimatedAmount?: string | number | null;
            sortOrder: number;
        }[];
    } | null;
    invitations: RfqInvitation[];
    quotes: RfqQuote[];
    awardedQuote?: {
        id: string;
        supplierId: string;
        totalAmount: string | number;
        /** What the winning supplier promised; the order's date came from this. */
        leadTimeDays?: number | null;
    } | null;
    orders?: { id: string; reference: string; status: string; totalAmount: string | number }[];
    /** Derived by the API. */
    overdue?: boolean;
    daysOverdue?: number;
    singleSource?: boolean;
    quotesReceived?: number;
    declinedCount?: number;
    availableActions?: RfqAction[];
    comparison?: QuoteComparison;
}

export interface RfqStats {
    total: number;
    open: number;
    awaitingQuotes: number;
    overdue: number;
    singleSource: number;
    byStatus: Partial<Record<RfqStatus, number>>;
}

export type PurchaseOrderStatus =
    | 'DRAFT'
    | 'SENT'
    | 'ACCEPTED'
    | 'PARTIALLY_RECEIVED'
    | 'RECEIVED'
    | 'CLOSED'
    | 'CANCELLED';

export type PurchaseOrderAction =
    | 'SEND'
    | 'ACCEPT'
    | 'RECEIVE'
    | 'RECEIVE_PART'
    | 'CLOSE'
    | 'CANCEL'
    | 'REOPEN';

export interface PurchaseOrderLine {
    id: string;
    description: string;
    specification?: string | null;
    quantity: string | number;
    unitPrice: string | number;
    amount: string | number;
    /** Derived from the receipts, never decremented. */
    receivedQuantity: string | number;
    sortOrder: number;
}

export interface GoodsReceipt {
    id: string;
    purchaseOrderId: string;
    receivedAt: string;
    deliveryNote?: string | null;
    conditionNote?: string | null;
    receivedBy?: { id: string; firstName: string; lastName: string } | null;
    lines: {
        id: string;
        purchaseOrderLineId: string;
        quantity: string | number;
        /** Set when the Inventory module has booked the stock in. */
        stockInRecordedAt?: string | null;
    }[];
}

export interface PurchaseOrder {
    id: string;
    organizationId: string;
    reference: string;
    supplierId: string;
    status: PurchaseOrderStatus;
    statusLabel?: string;
    category: string;
    currency: string;
    subtotal: string | number;
    taxAmount: string | number;
    totalAmount: string | number;
    orderDate: string;
    expectedDelivery?: string | null;
    deliveryAddress?: string | null;
    terms?: string | null;
    notes?: string | null;
    rfqId?: string | null;
    quoteId?: string | null;
    purchaseRequestId?: string | null;
    supplierBillId?: string | null;
    sentAt?: string | null;
    acceptedAt?: string | null;
    receivedAt?: string | null;
    closedAt?: string | null;
    cancelledAt?: string | null;
    cancellationReason?: string | null;
    createdAt: string;
    updatedAt: string;
    supplier?: { id: string; code: string; name: string; email?: string | null; phone?: string | null } | null;
    raisedBy?: { id: string; firstName: string; lastName: string } | null;
    rfq?: { id: string; reference: string; status: string } | null;
    quote?: { id: string; totalAmount: string | number; leadTimeDays?: number | null } | null;
    purchaseRequest?: { id: string; reference: string; title: string; category: string } | null;
    supplierBill?: {
        id: string;
        billNumber: string;
        status: string;
        totalAmount: string | number;
        balanceAmount: string | number;
    } | null;
    lines: PurchaseOrderLine[];
    deliveries: GoodsReceipt[];
    /** Derived by the API. */
    overdue?: boolean;
    daysOverdue?: number;
    outstandingQuantity?: number;
    outstandingValue?: number;
    receivedPercent?: number;
    pendingStockInLines?: number;
    availableActions?: PurchaseOrderAction[];
}

export interface PurchaseOrderStats {
    total: number;
    open: number;
    openValue: number;
    awaitingDelivery: number;
    overdue: number;
    awaitingBill: number;
    byStatus: Partial<Record<PurchaseOrderStatus, number>>;
    bySupplier: { supplierId: string; orders: number; value: number }[];
}

/**
 * @deprecated Superseded by `StockInStatus` (Module 11).
 *
 * This is the shape the endpoint returned while there was no inventory module to
 * book goods into: it reported that it could not help, which was honest and was
 * also why Module 10 could not meet its own acceptance criterion. Kept only so a
 * stale caller fails to compile rather than silently rendering `undefined`.
 */
export interface PendingStockIn {
    inventoryModuleAvailable: false;
    note: string;
    pendingLines: {
        receiptId: string;
        receivedAt: string;
        purchaseOrderLineId: string;
        quantity: string | number;
    }[];
}

/**
 * Performance figures, all derived on read from the orders and quotations.
 * `null` rather than zero for a rate means "nothing to measure", which is a
 * different statement from "never on time".
 */
export interface SupplierPerformance {
    orders: number;
    openOrders: number;
    totalSpend: number;
    delivered: number;
    onTimeDeliveries: number;
    onTimeRate: number | null;
    /** How many rounds this supplier has ever quoted on. */
    quotations: number;
    quotationsWon: number;
    /** `null` means "never quoted", which is not the same as "won none". */
    winRate: number | null;
}

export interface ProcurementSupplier {
    id: string;
    code: string;
    name: string;
    status: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    paymentTermsDays?: number | null;
    category?: string | null;
    rating?: number | null;
    contractStartDate?: string | null;
    contractEndDate?: string | null;
    contractReference?: string | null;
    performance: SupplierPerformance;
    contractExpired?: boolean;
    contractExpiringSoon?: boolean;
    bills?: {
        id: string;
        billNumber: string;
        status: string;
        totalAmount: string | number;
        balanceAmount: string | number;
        dueDate: string;
    }[];
    orders?: {
        id: string;
        reference: string;
        status: PurchaseOrderStatus;
        totalAmount: string | number;
        orderDate: string;
        expectedDelivery?: string | null;
        receivedAt?: string | null;
    }[];
    quotations?: {
        id: string;
        status: QuoteStatus;
        totalAmount: string | number;
        currency: string;
        leadTimeDays?: number | null;
        validUntil?: string | null;
        submittedAt: string;
        rfq: { id: string; reference: string; title: string; status: string };
    }[];
    invitations?: {
        id: string;
        status: string;
        invitedAt: string;
        respondedAt?: string | null;
        declineReason?: string | null;
        rfq: { id: string; reference: string; title: string; status: string };
    }[];
}

export interface SupplierSpendRow {
    supplierId: string;
    supplierName: string;
    supplierCode: string;
    category: string | null;
    orders: number;
    total: number;
    received: number;
    open: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Module 11 — Inventory
// ═══════════════════════════════════════════════════════════════════════════
//
// The one thing to understand about these types: **there is no stock level
// field anywhere.** `InventoryItemRow.totalQuantity` and `Warehouse.unitsHeld`
// are computed by the backend on every read, from the sum of the movements, and
// they arrive on the object rather than being fetched separately. That is why
// `quantityByWarehouse` ships with every row — the frontend never has to join
// anything, because the join already happened on the server where the movements
// live.

/** Derived on the server. Never stored, never settable. */
export type StockStatus = 'OUT_OF_STOCK' | 'REORDER' | 'OK';

export type InventoryCategory =
    | 'PAINT'
    | 'PLUMBING'
    | 'ELECTRICAL'
    | 'TILES_FLOORING'
    | 'BUILDING_MATERIALS'
    | 'HARDWARE'
    | 'CLEANING'
    | 'SAFETY'
    | 'GARDENING'
    | 'FURNITURE'
    | 'APPLIANCES'
    | 'OTHER';

export type StockMovementType =
    | 'GOODS_RECEIPT'
    | 'WORK_ORDER_ISSUE'
    | 'ADJUSTMENT'
    | 'OPENING'
    | 'TRANSFER'
    | 'RETURN';

/**
 * What to order, and why.
 *
 * `shortfall` is null when the item is in stock — "how far below" of nothing is
 * a question with no answer, and returning 0 would suggest it is exactly on its
 * level.
 */
export interface ReorderSuggestion {
    needsReorder: boolean;
    status: StockStatus;
    shortfall: number | null;
    suggestedQuantity: number;
    /** Null when no price is on file — an unknown cost is not a zero cost. */
    estimatedCost: number | null;
    unitOfMeasure: string;
    reason: string | null;
}

export interface InventoryItemRow {
    id: string;
    sku: string;
    name: string;
    description?: string | null;
    category: InventoryCategory;
    unitOfMeasure: string;
    unitCost?: string | number | null;
    reorderLevel: string | number;
    reorderQuantity?: string | number | null;
    notes?: string | null;
    isActive: boolean;
    preferredSupplierId?: string | null;
    preferredSupplier?: {
        id: string;
        code: string;
        name: string;
        phone?: string | null;
        email?: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
    /** The derived level, summed across every store. */
    totalQuantity: number;
    /** Warehouse id → balance. A store with no movements is simply absent. */
    quantityByWarehouse: Record<string, number>;
    warehouses: number;
    movementCount: number;
    lastMovementAt: string | null;
    status: StockStatus;
    statusLabel: string;
    /** Quantity × last known unit cost. Cheap; the detail page's `valuation` is
     *  the true weighted average and the two are deliberately different. */
    valuationValue: number;
    reorder: ReorderSuggestion;
}

export interface StockValuation {
    quantity: number;
    value: number;
    averageUnitCost: number | null;
    /** Movements that carried no cost, so the average is partly assumed. */
    movementsWithoutCost: number;
}

export interface StockMovementRow {
    id: string;
    itemId: string;
    warehouseId: string;
    quantity: number;
    type: StockMovementType;
    unitCost: string | number | null;
    goodsReceiptLineId?: string | null;
    workOrderId?: string | null;
    transferGroup?: string | null;
    reason?: string | null;
    notes?: string | null;
    createdAt: string;
    /** The level as of this movement, not today's level. */
    balanceAfter: number | null;
    direction: 'in' | 'out';
    item: { id: string; sku: string; name: string; unitOfMeasure: string };
    warehouse: { id: string; name: string; code: string };
    workOrder?: { id: string; reference: string; title: string; status?: string } | null;
    goodsReceiptLine?: {
        id: string;
        goodsReceipt: {
            id: string;
            receivedAt: string;
            deliveryNote?: string | null;
            purchaseOrder: { id: string; reference: string };
        };
    } | null;
    createdBy?: { id: string; firstName: string; lastName: string } | null;
    /** Set on the rows a call just created, so a form can highlight them. */
    isNew?: boolean;
}

export interface InventoryItemDetail extends InventoryItemRow {
    valuation: StockValuation;
    movements: StockMovementRow[];
    consumedBy: {
        movementId: string;
        quantity: number;
        issuedAt: string;
        workOrder: { id: string; reference: string; title: string; status?: string };
    }[];
}

export interface WarehouseRow {
    id: string;
    code: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    isDefault: boolean;
    isActive: boolean;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
    unitsHeld: number;
    distinctItems: number;
    hasStock: boolean;
}

export interface WarehouseDetail extends WarehouseRow {
    belowReorder: {
        id: string;
        sku: string;
        name: string;
        onHand: number;
        reorderLevel: number;
        unitOfMeasure: string;
        unitCost: number | null;
    }[];
    recentMovements: StockMovementRow[];
}

export interface InventoryStats {
    items: number;
    warehouses: number;
    /** Sum of every signed movement. */
    totalUnits: number;
    belowReorder: number;
    outOfStock: number;
    needsReorder: number;
    /** Items whose books say less than nothing is there. Needs a stock take. */
    negativeBalances: number;
    totalMovements: number;
    /** Null when no item has a price on file — not the same as zero. */
    stockValueAtUnitCost: number | null;
    pricedItems: number;
    itemsWithoutPrice: number;
    reorderSuggestions: {
        itemId: string;
        quantity: number;
        unitCost: number | null;
        unitOfMeasure: string;
    }[];
}

export interface StockMovementStats {
    total: number;
    last30Days: number;
    byType: Partial<Record<StockMovementType, number>>;
    netUnitsByType: Partial<Record<StockMovementType, number>>;
}

/** One line of Module 10's stock-in, still waiting for a decision. */
export interface PendingStockInLine {
    goodsReceiptId: string;
    goodsReceiptLineId: string;
    receivedAt: string;
    deliveryNote: string | null;
    purchaseOrderLineId: string;
    description: string;
    specification: string | null;
    quantity: number;
    unitPrice: number;
    /** True when somebody already said which item it is, but not which store. */
    itemChosen: boolean;
    inventoryItem?: {
        id: string;
        sku: string;
        name: string;
        unitOfMeasure: string;
    } | null;
}

/**
 * Module 11 replaced this shape. It used to be
 * `{ inventoryModuleAvailable: false, note, pendingLines }` — the honest answer
 * while there was no inventory module to book goods into, and the reason Module 10
 * could not meet its own acceptance criterion.
 */
export interface StockInStatus {
    purchaseOrderId: string;
    reference: string;
    stockInModuleAvailable: boolean;
    note: string;
    pending: PendingStockInLine[];
    booked: {
        goodsReceiptLineId: string;
        inventoryItem: { id: string; sku: string; name: string; unitOfMeasure: string } | null;
        movementId: string | null;
        warehouseId: string | null;
        recordedAt: string | null;
    }[];
}

/** What one maintenance job consumed from the store. */
export interface WorkOrderMaterials {
    workOrderId: string;
    movements: StockMovementRow[];
    /** Net of issues and returns, so a part-used-and-returned job reads as the
     *  part it actually kept. */
    consumed: {
        inventoryItemId: string;
        sku: string;
        name: string;
        unitOfMeasure: string;
        quantity: number;
        estimatedCost: number | null;
    }[];
    totalEstimatedCost: number;
}


// ═══════════════════════════════════════════════════════════════════════════
// Module 12 — HR & Payroll
// ═══════════════════════════════════════════════════════════════════════════
//
// Two things to understand before using these.
//
// **A payslip has no `netSalary` field on the type.** `PayslipTotals` is
// computed by the backend from the payslip's own lines and arrives alongside
// them, so `gross - employeeDeductions === net` holds by construction rather than
// by agreement between a stored total and its own detail. Nothing on the frontend
// needs to recompute it, and nothing should try.
//
// **A rule's figures are jurisdiction-resolved on the server.** A `PayrollRule`
// carries `countryCode`/`regionCode`/`periodMode`/`bands` because those are what
// make it correct in one country and inapplicable in another; the frontend renders
// what came back and never decides which rules apply.

export type EmploymentType =
    | 'FULL_TIME'
    | 'PART_TIME'
    | 'CONTRACT'
    | 'INTERN'
    | 'TEMPORARY';

export type PayFrequency =
    | 'WEEKLY'
    | 'FORTNIGHTLY'
    | 'MONTHLY'
    | 'QUARTERLY'
    | 'ANNUAL';

export type LeaveType =
    | 'ANNUAL'
    | 'SICK'
    | 'UNPAID'
    | 'MATERNITY'
    | 'PATERNITY'
    | 'ADOPTION'
    | 'BEREAVEMENT'
    | 'COMPENSATORY'
    | 'OFFICIAL'
    | 'OFF_DUTY';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type PayrollRuleType = 'PROGRESSIVE_BANDS' | 'PERCENTAGE' | 'FIXED';

export type PayrollCalculationBase = 'GROSS' | 'BASIC' | 'TAXABLE';

export type PayrollBearer = 'EMPLOYEE' | 'EMPLOYER' | 'BOTH';

export type PayrollPeriodMode = 'PERIOD' | 'ANNUALISED';

export type PayrollLineDirection =
    | 'EARNING'
    | 'EMPLOYEE_DEDUCTION'
    | 'EMPLOYER_CONTRIBUTION';

export type PayrollDeductionKind = 'STATUTORY' | 'COMPANY' | 'OTHER';

export type PayrollRunStatus =
    | 'DRAFT'
    | 'CALCULATED'
    | 'APPROVED'
    | 'PAID'
    | 'VOID';

/** Where the organization pays people, and whether it said so or inherited it. */
export interface PayrollJurisdiction {
    countryCode: string | null;
    regionCode: string | null;
    currency: string;
    label: string;
    /** True when `payrollCountryCode` was unset and the tax country was used. */
    inherited: boolean;
}

/**
 * The derived figures of a payslip. Present on the payslip itself and recomputed
 * from its lines on every read — never stored.
 */
export interface PayrollTotals {
    gross: number;
    employeeDeductions: number;
    employerContributions: number;
    net: number;
    applied: {
        code: string;
        name: string;
        ruleId: string;
        amount: number;
        bearer: PayrollBearer;
    }[];
}

export interface PayrollBand {
    /** Cumulative upper bound. `null` on the last band, and it must be last. */
    upTo?: number | null;
    ratePercent?: number;
    amount?: number;
}

export interface PayrollRuleRow {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    countryCode?: string | null;
    regionCode?: string | null;
    type: PayrollRuleType;
    base: PayrollCalculationBase;
    bearer: PayrollBearer;
    ratePercent?: string | number | null;
    amount?: string | number | null;
    minimumBaseAmount?: string | number | null;
    maximumBaseAmount?: string | number | null;
    exemptBelowBaseAmount?: string | number | null;
    bands?: PayrollBand[] | null;
    periodMode: PayrollPeriodMode;
    periodsPerYear: number;
    sortOrder: number;
    ledgerAccountCode?: string | null;
    expenseAccountCode?: string | null;
    validFrom: string;
    validTo?: string | null;
    isActive: boolean;
    organizationId?: string | null;
}

/**
 * Is this jurisdiction actually configured?
 *
 * The `warning` field is the reason this endpoint exists rather than the UI
 * counting rules itself. A jurisdiction with no rules pays everybody and
 * withholds nothing, and the run reports **success** — which is the specific
 * outcome this module exists to make impossible, and the only thing standing
 * between it and a plausible-looking payroll is somebody reading this string.
 */
export interface PayrollRuleCoverage {
    jurisdiction: PayrollJurisdiction;
    configured: boolean;
    ruleCount: number;
    codes: string[];
    missingAccounts: string[];
    unknownAccounts: string[];
    /** Rule codes sharing one ledger account with another rule. */
    sharedAccounts?: string[];
    warning: string | null;
}

export interface PayrollRulePreview {
    jurisdiction: PayrollJurisdiction;
    ruleCount: number;
    lines: {
        direction: PayrollLineDirection;
        code: string;
        name: string;
        amount: number;
        kind: PayrollDeductionKind;
        explanation?: string;
    }[];
    totals: PayrollTotals;
    warnings: { code: string; message: string }[];
}

export interface PayslipLineRow {
    id: string;
    direction: PayrollLineDirection;
    code: string;
    name: string;
    amount: number;
    kind: PayrollDeductionKind;
    payrollRuleId?: string | null;
    accountCode?: string | null;
    sortOrder: number;
    /** Present on the engine's output, not persisted — explains a figure. */
    explanation?: string;
}

export interface PayslipRow {
    id: string;
    employeeId: string;
    payrollRunId: string;
    periodStart: string;
    periodEnd: string;
    payDate: string;
    currency: string;
    basicSalary: number;
    locale?: string | null;
    lines: PayslipLineRow[];
    /** Derived from `lines` on every read. */
    totals: PayrollTotals;
    employeeName?: string;
    runReference?: string;
    runStatus?: PayrollRunStatus;
    /** Present on the self-service reads, which scope by the caller's own
     *  employment record and therefore have no `employeeName` to show. */
    payrollRun?: {
        id: string;
        reference: string;
        status: PayrollRunStatus;
        periodStart: string;
        periodEnd: string;
        payDate: string;
    };
    /** Self-service only: posted to the ledger is not the same as paid. */
    paymentState?: 'paid' | 'approved-not-released' | 'not-yet-paid';
}

export interface PayrollRunSummary {
    payslips: number;
    currencies: {
        currency: string;
        payslips: number;
        gross: number;
        employeeDeductions: number;
        employerContributions: number;
        totalCost: number;
        net: number;
    }[];
    /** True only if a run somehow holds more than one currency. */
    mixedCurrency: boolean;
    /** Null rather than a sum when `mixedCurrency` — an unattributable number
     *  is worse than no number. */
    gross: number | null;
    employeeDeductions: number | null;
    employerContributions: number | null;
    totalCost: number | null;
    net: number | null;
    posted: boolean;
}

export interface PayrollRunRow {
    id: string;
    reference: string;
    periodStart: string;
    periodEnd: string;
    payDate: string;
    currency: string;
    status: PayrollRunStatus;
    journalEntryId?: string | null;
    calculatedAt?: string | null;
    approvedAt?: string | null;
    paidAt?: string | null;
    voidReason?: string | null;
    summary: PayrollRunSummary;
}

export interface PayrollRunDetail extends PayrollRunRow {
    payslips: (PayslipRow & { employee?: PayslipEmployee })[];
    coverage: PayrollRuleCoverage;
    rulesApplied?: unknown;
}

/** The employment details a payslip detail read attaches. */
export interface PayslipEmployee {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    nationalId?: string | null;
    taxNumber?: string | null;
    socialSecurityNumber?: string | null;
    bankAccount?: string | null;
    bankName?: string | null;
    bankBranch?: string | null;
    salaryCurrency?: string | null;
}

/**
 * One payslip with its context.
 *
 * `employee` is **optional** because the self-service read (`GET /hr/me/payslips/:id`)
 * does not attach it — the caller already knows whose it is, and attaching the whole
 * employment record to your own payslip would be a wider response for no reason.
 */
export interface PayslipDetail extends PayslipRow {
    employee?: PayslipEmployee;
    payrollRun: {
        id: string;
        reference: string;
        status: PayrollRunStatus;
        periodStart: string;
        periodEnd: string;
        payDate: string;
        currency: string;
    };
    applied: { ruleId: string; code: string; name: string }[];
}

/**
 * The staff directory. **There is no salary field on this type, and that is
 * deliberate** — the backend selects the columns, so a compensation field added to
 * the model later cannot appear here by accident. `basicSalary` is on
 * `EmployeeDetail`, which requires `employees.compensation`.
 */
/**
 * The scalars every employee response carries.
 *
 * Split out because the backend reads employees at three different levels and
 * the *types* have to say so: the directory (`EmployeeRow`) selects a fixed
 * column list that cannot include compensation, while the single-record reads
 * spread the whole row. `periodsPerYear` is deliberately absent from this
 * interface because the directory does not select it — see `EmployeeRow`.
 */
export interface EmployeeCore {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    department?: string | null;
    jobTitle?: string | null;
    employmentType: EmploymentType;
    hireDate: string;
    terminationDate?: string | null;
    isActive: boolean;
    userId?: string | null;
    /** Present, and *not* compensation — an employee is paid in something. */
    salaryCurrency: string;
    payFrequency: PayFrequency;
}

export interface EmployeeRow extends EmployeeCore {
    /** What they go by — printed on a payslip rather than a legal name. */
    displayName: string;
    legalName: string;
    hasLogin: boolean;
    tenureYears: number;
}

export interface LeaveBalance {
    entitlement: number;
    taken: number;
    /** Approved and dated ahead — counted, so December cannot be approved twice. */
    booked: number;
    /** Entitlement plus carryover, less both. Never `entitlement - taken`. */
    remaining: number;
    carriedIn: number;
    /** Anything above the carryover cap that no longer exists. */
    expired: number;
}

export interface EmployeeComponentRow {
    id: string;
    percentage?: string | number | null;
    amount?: string | number | null;
    currency: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
    payComponent: {
        id: string;
        code: string;
        name: string;
        kind: PayrollDeductionKind;
        direction: PayrollLineDirection;
        isTaxable: boolean;
        isPensionable: boolean;
    };
}

/**
 * One employee in full. `GET /hr/employees/:id`, behind `employees.compensation`.
 *
 * Extends `EmployeeCore` and **not** `EmployeeRow`: the directory's derived
 * fields (`displayName`, `hasLogin`, `tenureYears`) are computed by the backend's
 * `directoryView`, and a detail read never runs it — so claiming them here would
 * let a page render `undefined` as a real value.
 */
export interface EmployeeDetail extends EmployeeCore {
    /** Requires `employees.compensation`. Absent from the directory on purpose. */
    basicSalary: number;
    periodsPerYear: number;
    nationalId?: string | null;
    taxNumber?: string | null;
    socialSecurityNumber?: string | null;
    bankAccount?: string | null;
    bankName?: string | null;
    bankBranch?: string | null;
    bankCode?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    preferredLocale?: string | null;
    user?: {
        id: string;
        email: string;
        firstName?: string | null;
        lastName?: string | null;
        role?: string | null;
    } | null;
    leavePolicy?: { id: string; code: string; name: string } | null;
    leaveBalance: LeaveBalance;
    payslips: {
        id: string;
        /** The payroll run's reference — a payslip has no reference of its own. */
        reference: string;
        runId: string;
        runStatus: PayrollRunStatus;
        periodStart: string;
        periodEnd: string;
        payDate: string;
        currency: string;
        basicSalary: number;
    }[];
    components: EmployeeComponentRow[];
}

/**
 * Somebody's own employment record, `GET /hr/me`.
 *
 * A **different shape from `EmployeeDetail`**: the backend resolves it from the
 * login and does not attach payslips or components (they arrive on their own
 * routes). Modelling it as `EmployeeDetail` is how a self-service page ends up
 * reading `undefined.map(...)`.
 */
export interface EmployeeSelf extends EmployeeCore {
    basicSalary: number;
    periodsPerYear: number;
    preferredLocale?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    leaveBalance: LeaveBalance;
}

export interface EmployeeStats {
    total: number;
    active: number;
    inactive: number;
    byDepartment: { department: string; count: number }[];
    byEmploymentType: Partial<Record<EmploymentType, number>>;
    byPayFrequency: Partial<Record<PayFrequency, number>>;
    currencies: { currency: string; count: number }[];
    /** More than one currency in one organization is normal for a group, not a
     *  data error, so it is reported rather than flagged. */
    multiCurrency: boolean;
    /** Staff the organization pays but cannot reach. */
    withLogin: number;
}

export interface LeaveRequestRow {
    id: string;
    employeeId: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    status: LeaveStatus;
    reason?: string | null;
    decisionNote?: string | null;
    decidedAt?: string | null;
    createdAt: string;
    /** **Derived** from the dates, the weekend pattern and the public holidays —
     *  never accepted from the caller. Five days of leave is five *working* days. */
    workingDays: number;
    employeeName?: string;
    employee?: {
        id: string;
        employeeNumber: string;
        firstName: string;
        lastName: string;
        preferredName?: string | null;
        department?: string | null;
        leavePolicy?: {
            id: string;
            code: string;
            name: string;
            annualEntitlementDays: string | number;
            carryoverLimitDays?: string | number | null;
        } | null;
    };
    balance?: LeaveBalance & {
        policy: { code: string; name: string };
        calendar: { weekendDays: number[] };
    };
    /** Other approved leave overlapping these dates — who else would be away. */
    clashesWith?: { requestId: string; employeeId: string; workingDays: number }[];
}

export interface LeaveBalanceRow {
    employeeId: string;
    employeeNumber: string;
    name: string;
    department?: string | null;
    balance: LeaveBalance & {
        policy: { code: string; name: string };
        calendar: { weekendDays: number[] };
    };
}

export interface LeaveCalendar {
    weekendDays: number[];
    holidays: {
        date: string;
        name: string;
        isRecurring: boolean;
        jurisdictionWide: boolean;
    }[];
    days: {
        date: string;
        isoDay: number;
        isWorkingDay: boolean;
        /** 'weekend' | 'public holiday' | null. Why the day is unavailable. */
        reason: string | null;
        holiday: string | null;
    }[];
}

export interface LeavePolicyRow {
    id: string;
    code: string;
    name: string;
    countryCode?: string | null;
    regionCode?: string | null;
    annualEntitlementDays: string | number;
    carryoverLimitDays?: string | number | null;
    minNoticeDays: number;
    minNoticeWaivedDays: number;
    unpaidAllowed: boolean;
    maxConsecutiveDays?: number | null;
    isDefault: boolean;
    isActive: boolean;
}

export interface HolidayRow {
    id: string;
    date: string;
    name: string;
    countryCode?: string | null;
    regionCode?: string | null;
    isRecurring: boolean;
}

// =============================================================
// Module 13 — Facilities
// =============================================================

export type FacilityKind =
    | 'CLUBHOUSE'
    | 'MEETING_ROOM'
    | 'PARKING'
    | 'GYM'
    | 'POOL'
    | 'TENNIS_COURT'
    | 'LAUNDRY'
    | 'RECREATION'
    | 'OTHER';

/**
 * Five states and no sixth.
 *
 * The missing one is `COMPLETED`, and it is missing on purpose: the backend derives
 * "has this already happened" from `endsAt`, so a status the server computes is not
 * one the client has to invent. `NO_SHOW` is the only past-tense state because it is
 * a judgement somebody makes when they find an empty room.
 */
export type FacilityBookingStatus =
    | 'PENDING'
    | 'CONFIRMED'
    | 'CANCELLED'
    | 'REJECTED'
    | 'NO_SHOW';

/** The five actions the booking lifecycle will accept. */
export type FacilityBookingAction =
    | 'APPROVE'
    | 'REJECT'
    | 'CANCEL'
    | 'REACTIVATE'
    | 'MARK_NO_SHOW';

export interface FacilityBookingTiming {
    phase: 'PAST' | 'NOW' | 'UPCOMING';
    inProgress: boolean;
    hasEnded: boolean;
    minutesUntilStart: number;
    minutesUntilEnd: number;
    hasHappened: boolean;
}

export interface FacilityRow {
    id: string;
    name: string;
    kind: FacilityKind;
    description?: string | null;
    capacity?: number | null;
    /** Minutes from local midnight — the shape the database stores. */
    opensAtMinutes: number;
    closesAtMinutes: number;
    slotMinutes: number;
    maxAdvanceDays: number;
    requiresApproval: boolean;
    isBookable: boolean;
    isActive: boolean;
    bookingFee: number | null;
    bookingFeeCurrency: string | null;
    opensAtLabel: string;
    closesAtLabel: string;
    property?: { id: string; code: string; name: string } | null;
    /** Only present on the list read. */
    openingHours?: string;
    /** **Derived on read** — nothing stores "open now" and nothing has to sweep it. */
    isOpenNow?: boolean;
    totalBookings?: number;
}

export interface FacilityBlackoutRow {
    id: string;
    reason: string;
    startsAt: string;
    endsAt: string;
    createdAt?: string;
}

export interface FacilityDetail extends FacilityRow {
    blackouts: FacilityBlackoutRow[];
    upcomingBookings: Array<{
        id: string;
        reference: string;
        bookedForName: string;
        startsAt: string;
        endsAt: string;
        status: FacilityBookingStatus;
        slotLabel: string;
        timing: FacilityBookingTiming;
    }>;
    statistics: {
        confirmed: number;
        noShow: number;
        awaitingApproval: number;
        closuresScheduled: number;
    };
}

export interface FacilityAvailabilitySlot {
    minutes: number;
    label: string;
    available: boolean;
    /** Who holds it — `null` when free or closed. */
    bookedBy: string | null;
}

export interface FacilityAvailabilityDay {
    date: string;
    isOpen: boolean;
    reason: string | null;
    slots: FacilityAvailabilitySlot[];
}

export interface FacilityAvailability {
facility: {
        id: string;
        name: string;
        kind: FacilityKind;
        slotMinutes: number;
        requiresApproval: boolean;
        isBookable: boolean;
        maxAdvanceDays: number;
        /** Shown on the booking screen as advice; never enforced. */
        capacity: number | null;
        bookingFee: number | null;
        bookingFeeCurrency: string | null;
    };

    openingHours: string;
    days: FacilityAvailabilityDay[];
    bookings: Array<{
        id: string;
        reference: string;
        bookedForName: string;
        startsAt: string;
        endsAt: string;
        status: FacilityBookingStatus;
        slotLabel: string;
        timing: FacilityBookingTiming;
    }>;
    blackouts: FacilityBlackoutRow[];
}

/**
 * What the preview endpoint answers, so the booking dialog can tell somebody the
 * clubhouse shuts at 22:00 while they are still looking at the time picker.
 *
 * `code` is the machine-readable companion to `reason`; both are present because a
 * form that branches on prose is a form that breaks when the wording improves.
 */
export interface FacilityBookingPreview {
    ok: boolean;
    code: string | null;
    reason: string | null;
    startsAtMinutes: number;
    endsAtMinutes: number;
    slots: number[];
    facilityName: string;
    openingHours: string;
    fee: number | null;
    feeCurrency: string | null;
    willRequireApproval: boolean;
}

export interface FacilityBookingRow {
    id: string;
    reference: string;
    facilityId: string;
    facility?: {
        id: string;
        name: string;
        kind: FacilityKind;
        propertyId: string;
        requiresApproval: boolean;
    } | null;
    bookedByUserId?: string | null;
    bookedByUser?: { id: string; firstName: string; lastName: string } | null;
    tenant?: {
        id: string;
        surname: string;
        otherNames: string | null;
        code: string;
        phone: string;
    } | null;
    contact?: {
        id: string;
        firstName: string;
        lastName: string;
        company: string | null;
        phone: string | null;
    } | null;
    bookedForName: string;
    bookedForPhone: string | null;
    purpose: string | null;
    attendeeCount: number | null;
    startsAt: string;
    endsAt: string;
    slotLabel: string;
    status: FacilityBookingStatus;
    statusLabel: string;
    statusAdvice: string;
    decisionNote: string | null;
    decidedAt: string | null;
    decidedByUser?: { id: string; firstName: string; lastName: string } | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    /** Snapshotted at booking time; not invoiced yet — see the module's open items. */
    fee: number | null;
    feeCurrency: string | null;
    createdAt: string;
    /** **Derived**, never stored — the reason there is no COMPLETED status. */
    timing: FacilityBookingTiming;
    isPast: boolean;
    /**
     * Computed **by the server**, so the row menu cannot offer an action the API
     * would refuse. The client renders these and nothing else.
     */
    availableActions: FacilityBookingAction[];
}

export type AccessCardType = 'BUILDING' | 'UNIT' | 'PARKING' | 'FACILITY' | 'GATE';
export type AccessCardHolder = 'STAFF' | 'TENANT' | 'CONTACT' | 'VISITOR' | 'NONE';
export type AccessCardStatus =
    | 'ACTIVE'
    | 'SUSPENDED'
    | 'LOST'
    | 'EXPIRED'
    | 'REVOKED';

export type AccessCardAction =
    | 'SUSPEND'
    | 'REACTIVATE'
    | 'MARK_LOST'
    | 'MARK_EXPIRED'
    | 'REVOKE'
    | 'RECORD_REPLACEMENT';

export interface AccessCardRow {
    id: string;
    cardNumber: string;
    type: AccessCardType;
    status: AccessCardStatus;
    /**
     * The status the **gate** honours: `EXPIRED` when `expiresAt` has passed even
     * though the column still says ACTIVE. Two columns on purpose — the column is
     * what the database holds, this is what actually opens a door.
     */
    effectiveStatus: AccessCardStatus;
    statusLabel: string;
    isUsable: boolean;
    holder: AccessCardHolder;
    holderName: string;
    property?: { id: string; code: string; name: string } | null;
    unit?: { id: string; code: string; name: string } | null;
    facility?: { id: string; name: string; kind: FacilityKind } | null;
    tenant?: { id: string; surname: string; otherNames: string | null; code: string } | null;
    contact?: { id: string; firstName: string; lastName: string; company: string | null } | null;
    user?: { id: string; firstName: string; lastName: string; email: string } | null;
    visitor?: {
        id: string;
        firstName: string;
        lastName: string;
        isBlacklisted?: boolean;
    } | null;
    issuedAt: string;
    expiresAt: string | null;
    lastSeenAt: string | null;
    suspendedAt: string | null;
    revokedAt: string | null;
    revokedReason: string | null;
    replacementCardId: string | null;
    notes: string | null;
daysUntilExpiry: number | null;
    /**
     * Inside the 30-day renewal window. **False on a revoked or lost card** — a
     * revoked card whose date is three weeks out is not "expiring soon", it opens
     * nothing, and nudging somebody to renew it would be nonsense.
     */
    expiringSoon: boolean;
    /** Nothing further will happen to this card, whatever its date says. */
    isTerminal: boolean;

    /** What a guard would say the card is for, in one line. */
    opensDescription: string;
    recentVisits?: Array<{
        id: string;
        createdAt: string;
        checkedInAt: string | null;
        checkedOutAt: string | null;
    }>;
}

/** Derived from two timestamps and the clock; nothing stores it. */
export type VisitorVisitState =
    | 'COMPLETED'
    | 'OVERSTAY'
    | 'ON_SITE'
    | 'MISSED'
    | 'EXPECTED';

export interface VisitorRow {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    phone: string | null;
    email: string | null;
    company: string | null;
    idType: string | null;
    idNumber: string | null;
    isBlacklisted: boolean;
    blacklistedAt: string | null;
    blacklistReason: string | null;
    notes: string | null;
    isActive: boolean;
    createdAt: string;
    totalVisits?: number;
    /** Open visits right now — derived, and a per-row count for the picker. */
    onSiteNow?: number;
}

export interface VisitorDetail extends VisitorRow {
    contact?: { id: string; firstName: string; lastName: string; company: string | null } | null;
    accessCards: Array<{
        id: string;
        cardNumber: string;
        status: AccessCardStatus;
        expiresAt: string | null;
        type: AccessCardType;
    }>;
    visits: VisitorVisitRow[];
    statistics: {
        totalVisits: number;
        onSiteNow: number;
        overdue: number;
        lastVisitAt: string | null;
        cardsHeld: number;
    };
}

export interface VisitorVisitRow {
    id: string;
    propertyId: string | null;
    property?: { id: string; name: string } | null;
    visitorId: string;
    visitorName: string;
    visitorCompany: string | null;
    visitorPhone: string | null;
    visitorIsBlacklisted: boolean;
    hostName: string;
    hostPhone: string | null;
    purpose: string | null;
    expectedAt: string;
    expectedOutAt: string | null;
    checkedInAt: string | null;
    checkedOutAt: string | null;
    notes: string | null;
    isPreApproved: boolean;
    accessCard?: {
        id: string;
        cardNumber: string;
        status: string;
        expiresAt: string | null;
    } | null;
    createdAt: string;
    state: VisitorVisitState;
    stateLabel: string;
    isOnSite: boolean;
    isOverdue: boolean;
    /** Negative once overdue; null when no departure was expected. */
    minutesOverdue: number | null;
    availableActions: Array<'check-in' | 'check-out'>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 14 - Utilities
// ─────────────────────────────────────────────────────────────────────────────

export type UtilityType = 'WATER' | 'ELECTRICITY' | 'GAS' | 'SEWAGE';

export type MeterScope = 'SUBMETER' | 'BULK';

export type ApportionmentMethod = 'AREA' | 'EQUAL' | 'OCCUPANCY' | 'MANUAL';

export type MeterStatus = 'ACTIVE' | 'RETIRED';

export type MeterReadingSource = 'MANUAL' | 'SMART' | 'ESTIMATED';

export type UtilityChargeStatus = 'PENDING' | 'INVOICED' | 'VOID';

/**
 * A meter row.
 *
 * `canBeBilled` and `billsTo` are server-computed rather than derived here, because
 * "can this be billed right now" depends on scope and apportionment as the server
 * holds them — and a form that guesses at it will let somebody try and then explain
 * the refusal.
 */
export interface UtilityMeterRow {
    id: string;
    meterNumber: string;
    serialNumber: string | null;
    type: UtilityType;
    scope: MeterScope;
    status: MeterStatus;
    source: MeterReadingSource;
    unitId: string | null;
    propertyId: string;
    apportionmentMethod: ApportionmentMethod | null;
    digits: number | null;
    digitWrapAt: number | null;
    lastBilledThrough: string | null;
    readingSetup: string | null;
    createdAt: string;
    updatedAt: string;
    propertyName: string | null;
    unitCode: string | null;
    unitName: string | null;
    readingCount: number;
    chargeCount: number;
    isTerminal: boolean;
    canBeBilled: boolean;
    billsTo: string;
}

/** A meter with its recent reading ledger attached. */
export interface UtilityMeterDetail extends UtilityMeterRow {
    /**
     * Each reading paired with the one before it, so `consumption` is the derived
     * delta rather than a stored column. The oldest entry has `null` for both
     * previous and consumption: it establishes the baseline, it is not a period.
     */
    readings: MeterReadingRow[];
}

/**
 * One register value at one moment.
 *
 * `previousReading` and `consumption` are null on the oldest reading of a list rather
 * than zero, because zero would claim the meter did not move.
 */
export interface MeterReadingRow {
    id: string;
    readingDate: string;
    meterNumber: string;
    type: UtilityType;
    currentReading: number;
    previousReading: number | null;
    consumption: number | null;
    rolledOver: boolean;
    source: MeterReadingSource;
    note: string | null;
}

export interface UtilityRateRow {
    id: string;
    type: UtilityType;
    currency: string;
    ratePerUnit: number | string;
    standingCharge: number | string;
    prorateStandingCharge: boolean;
    purchaseCurrency: string | null;
    spotRate: number | string | null;
    vatRate: number | string | null;
    incomeAccount: string | null;
    revenueExpenseItem: string | null;
    meterId: string | null;
    propertyId: string | null;
    validFrom: string;
    validTo: string | null;
    meter?: { id: string; meterNumber: string } | null;
    property?: { id: string; name: string } | null;
}

/**
 * A priced period, ready to invoice.
 *
 * The money fields are recomputed by the server from the two readings and the tariff
 * every time this is fetched — nothing here is a stored figure.
 */
export interface UtilityChargeRow {
    id: string;
    billingPeriod: string;
    status: UtilityChargeStatus;
    meterId: string;
    meterNumber: string;
    type: UtilityType;
    meterScope: MeterScope;
    unitId: string | null;
    unitCode: string | null;
    unitName: string | null;
    allocationShare: number;
    allocationBasis: string | null;
    ratePerUnit: number;
    currency: string;
    invoiceId: string | null;
    invoiceNumber: string | null;
    invoiceStatus: string | null;
    /** Present on the ledger, which prices every charge it returns. */
    meterConsumption?: number;
    billableConsumption?: number;
    consumptionAmount?: number;
    standingChargeAmount?: number;
    subtotal?: number;
    vatAmount?: number;
    total?: number;
}

/** The result of a billing run, as the server reports it. */
export interface BillRunResult {
    billingPeriod: string;
    meter: { id: string; meterNumber: string; type: UtilityType; scope: MeterScope };
    meterConsumption: number;
    rolledOver: boolean;
    periodFrom: string;
    periodTo: string;
    charges: Array<{ unitId: string | null; share: number; total: number }>;
    invoices?: Array<{
        chargeId: string;
        invoiceId: string;
        invoiceNumber: string;
        total: number;
        unitCode: string | null;
    }>;
    /**
     * Priced but with nobody to invoice - a vacant unit on a bulk meter.
     *
     * Shown rather than swallowed: a vacant unit's water is a real cost somebody has
     * to decide about, and a silently dropped row is how it goes unnoticed.
     */
    unbilled?: Array<{ chargeId: string; unitCode: string | null; reason: string }>;
}

/** Bulk reading entry returns per-row outcomes, so one bad row does not lose the rest. */
export interface BulkReadingResult {
    created: number;
    failed: Array<{ readingDate: string; meterId: string; message: string }>;
    readings: unknown[];
}

export interface UtilityMeterPayload {
    propertyId: string;
    unitId?: string;
    type: UtilityType;
    meterNumber: string;
    serialNumber?: string;
    /** How readings on this meter are collected. Defaults to MANUAL server-side. */
    source?: MeterReadingSource;
    scope?: MeterScope;
    apportionmentMethod?: ApportionmentMethod;
    apportionmentWeights?: Record<string, number>;
    digits?: number;
    digitWrapAt?: number;
    lastBilledThrough?: string;
    readingSetup?: string;
}

export interface UtilityRatePayload {
    meterId?: string;
    propertyId?: string;
    type: UtilityType;
    currency?: string;
    ratePerUnit: number;
    standingCharge?: number;
    prorateStandingCharge?: boolean;
    purchaseCurrency?: string;
    spotRate?: number;
    vatRate?: number;
    incomeAccount?: string;
    revenueExpenseItem?: string;
    validFrom: string;
}

export interface CreateReadingPayload {
    meterId: string;
    readingDate: string;
    reading: number;
    source?: MeterReadingSource;
    note?: string;
}

export interface BillPeriodPayload {
    meterId: string;
    billingPeriod: string;
    unitId?: string;
    dueInDays?: number;
}
