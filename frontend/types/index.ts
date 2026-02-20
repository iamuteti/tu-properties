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
    createdAt: string;
    updatedAt: string;
}

export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'PROPERTY_MANAGER' | 'ACCOUNTANT' | 'USER';
    organizationId?: string;
    organization?: Organization;
}

export interface AuthResponse {
    access_token: string;
    user: User;
}

export interface ApiResponse<T> {
    data: T;
    message?: string;
    error?: string;
}

export interface Property {
    id: string;
    code: string;
    name: string;
    dateAcquired?: string;
    lrNumber?: string;
    
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
    
    categoryId?: string;
    category?: PropertyCategory;
    
    propertyTypeId?: string;
    propertyType?: PropertyType;
    
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
    unitTypeId?: string;
    unitType?: any;

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
    leases?: any[];
    serviceCharges?: any[];
    meterNumbers?: any[];
    features?: any[];

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
    emergencyContacts?: TenantEmergencyContact[];
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
}

export interface Lease {
    id: string;
    unitId: string;
    tenantId: string;
    startDate: string;
    endDate: string;
    rentAmount: number;
    status: string;
    unit?: Unit;
    tenant?: Tenant;
    invoices?: any[];
    createdAt: string;
    updatedAt: string;
}

export interface Invoice {
    id: string;
    leaseId: string;
    amount: number;
    dueDate: string;
    status: 'PAID' | 'UNPAID' | 'OVERDUE' | 'PARTIALLY_PAID';
    type: 'RENT' | 'UTILITY' | 'FEE';
    createdAt: string;
    updatedAt: string;
    lease?: Lease;
    payments?: Payment[];
}

export interface Payment {
    id: string;
    invoiceId: string;
    amount: number;
    paymentDate: string;
    method: 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHECK';
    reference?: string;
    createdAt: string;
    updatedAt: string;
    invoice?: Invoice;
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