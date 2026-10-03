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
    organizationId?: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
    properties?: Property[];
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
    role: 'SUPER_ADMIN' | 'ADMIN' | 'PROPERTY_MANAGER' | 'ACCOUNTANT' | 'USER';
    organizationId?: string;
    organization?: Organization;
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
