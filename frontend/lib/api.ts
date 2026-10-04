import axios from 'axios';
import { AuthResponse, User, Property, Unit, Tenant, RentalAgreement, Invoice, Payment, Organization, OrganizationProfileInput, Role, RoleAssignment, Branch, Document, LoginEvent, Landlord, LandlordDetail, LandlordCharge, LandlordPayout, OwnerStatement, StatementPreview, CreateInvoiceData, CreatePaymentData, CreateReceiptData, DashboardStats, Receipt, PaginatedResponse, MoveOutRequest, PropertyAmenity, ImportReport, UnitStatus, Lead, Contact, Communication, CreateLeadData, ConvertLeadData, LogCommunicationData, LeadStage, Sale, SaleStage, CreateSaleData, Commission, CommissionStatus, CommissionReport, SaleInstallment, Lease, LeaseAction, LeaseLedger, CreateLeaseData, MoveOutDeduction, DepositBreakdown, DeductionCategory, InspectionReport, InspectionItem, InspectionType, ConditionRating, LeaseTemplate, OccupancyHistory, PortalSummary, PortalLease, PortalInvoice, PortalReceipt, PortalDocument, PortalTenant, TenantRequest, TenantRequestType } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3003';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // auth token now lives in an httpOnly cookie
});

// No request interceptor is needed: the httpOnly cookie is sent automatically
// by the browser on same-origin requests, and there is no token to read out
// of localStorage. This closes the XSS token-theft vector.

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Dispatch event to trigger logout in auth context
      window.dispatchEvent(new CustomEvent('unauthorized'));
      console.warn('Unauthorized access - session expired');
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
    login: (email: string, password: string) =>
        api.post<AuthResponse>('/auth/login', { email, password }),

    register: (userData: { email: string; password: string; firstName: string; lastName: string }) =>
        api.post<AuthResponse>('/auth/register', userData),

    getProfile: () =>
        api.get('/auth/profile'),

    logout: () =>
        api.post<{ message: string }>('/auth/logout'),

    // MFA (TOTP)
    mfaSetup: () =>
        api.post<{ secret: string; otpauthUrl: string; issuer: string }>('/auth/mfa/setup'),
    mfaEnable: (secret: string, code: string) =>
        api.post<{ message: string }>('/auth/mfa/enable', { secret, code }),
    mfaDisable: (code: string) =>
        api.post<{ message: string }>('/auth/mfa/disable', { code }),
    verifyMfa: (mfaToken: string, code: string) =>
        api.post<{ user: User; sessionId: string }>('/auth/mfa/verify', { mfaToken, code }),

    // Sessions (revocation)
    listSessions: () =>
        api.get<{ id: string; createdAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null; isCurrent: boolean }[]>('/auth/sessions'),
    revokeOtherSessions: () =>
        api.post<{ revoked: number }>('/auth/sessions/revoke-others'),

    // Login / security history (self-scoped; org-wide history is on /audit)
    loginHistory: () =>
        api.get<LoginEvent[]>('/auth/login-history'),
};

// Users API (user management, Module 1: Core Platform)
export const usersApi = {
    findAll: (params?: { search?: string }) => {
        const query = params?.search ? `?search=${encodeURIComponent(params.search)}` : '';
        return api.get<User[]>(`/users${query}`);
    },

    findOne: (id: string) =>
        api.get<User>(`/users/${id}`),

    create: (data: {
        email: string;
        firstName: string;
        lastName: string;
        phone?: string;
        role?: User['role'];
        passwordHash?: string;
    }) =>
        api.post<{ user: User; temporaryPassword?: string }>('/users', data),

    update: (id: string, data: Partial<{ firstName: string; lastName: string; phone: string; email: string; role: User['role']; isActive: boolean }>) =>
        api.patch<User>(`/users/${id}`, data),

    remove: (id: string) =>
        api.delete(`/users/${id}`),

    // Structured roles (Module 1 RBAC)
    listRoles: () =>
        api.get<Role[]>('/users/roles'),

    getUserRoles: (id: string) =>
        api.get<RoleAssignment[]>(`/users/${id}/roles`),

    setUserRoles: (id: string, roleIds: string[]) =>
        api.patch<RoleAssignment[]>(`/users/${id}/roles`, { roleIds }),
};

// Organizations API
export const organizationsApi = {
    create: (data: { name: string; slug: string; subdomain?: string }) =>
        api.post<Organization>('/organizations', data),

    findAll: () =>
        api.get<Organization[]>('/organizations'),

    findOne: (id: string) =>
        api.get<Organization>(`/organizations/${id}`),

    update: (id: string, data: Partial<{ name: string; subdomain: string; customDomain: string; plan: string }>) =>
        api.patch<Organization>(`/organizations/${id}`, data),

    remove: (id: string) =>
        api.delete(`/organizations/${id}`),

    checkSlug: (slug: string) =>
        api.get<boolean>(`/organizations/check/slug/${slug}`),

    checkSubdomain: (subdomain: string) =>
        api.get<boolean>(`/organizations/check/subdomain/${subdomain}`),

    // Self-service org profile / system settings (any org member reads;
    // ADMIN+ writes via `settings.update` permission).
    getMe: () =>
        api.get<Organization>('/organizations/me'),

    updateMe: (data: OrganizationProfileInput) =>
        api.patch<Organization>('/organizations/me', data),
};

// Branches API (Module 1: Core Platform)
export const branchesApi = {
    findAll: (params?: { search?: string; isActive?: boolean }) =>
        api.get<Branch[]>('/branches', { params }),

    findOne: (id: string) =>
        api.get<Branch>(`/branches/${id}`),

    create: (data: { name: string; code?: string; address?: string; city?: string; phone?: string; email?: string }) =>
        api.post<Branch>('/branches', data),

    update: (id: string, data: Partial<{ name: string; code: string; address: string; city: string; phone: string; email: string; isActive: boolean }>) =>
        api.patch<Branch>(`/branches/${id}`, data),

    remove: (id: string) =>
        api.delete(`/branches/${id}`),
};

// Document Center API (Module 1: Core Platform)
export const documentsApi = {
    upload: (file: File, entityType: string, entityId: string) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('entityType', entityType);
        formData.append('entityId', entityId);
        return api.post<Document>('/documents', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },

    findAll: (params?: { entityType?: string; entityId?: string; page?: number; limit?: number }) =>
        api.get<{ data: Document[]; meta: { total: number; page: number; limit: number; totalPages: number } }>('/documents', { params }),

    findOne: (id: string) =>
        api.get<Document>(`/documents/${id}`),

    /** Browser-navigable download URL (the httpOnly cookie is sent automatically). */
    downloadUrl: (id: string) => `${API_BASE_URL}/documents/${id}/download`,

    remove: (id: string) =>
        api.delete(`/documents/${id}`),
};

// Properties API (Module 2: Property Management)
export const propertiesApi = {
    create: (data: Partial<Property>) =>
        api.post<Property>('/properties', data),

    findAll: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        type?: string;
        category?: string;
        landlordId?: string;
        branchId?: string;
        status?: string;
        includeArchived?: boolean;
    }) => {
        const queryParams = new URLSearchParams();
        if (params?.page) queryParams.append('page', params.page.toString());
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        if (params?.search) queryParams.append('search', params.search);
        if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
        if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
        if (params?.type) queryParams.append('type', params.type);
        if (params?.category) queryParams.append('category', params.category);
        if (params?.landlordId) queryParams.append('landlordId', params.landlordId);
        if (params?.branchId) queryParams.append('branchId', params.branchId);
        if (params?.status) queryParams.append('status', params.status);
        if (params?.includeArchived) queryParams.append('includeArchived', 'true');
        const query = queryParams.toString();
        return api.get<PaginatedResponse<Property>>(`/properties${query ? `?${query}` : ''}`);
    },

    findOne: (id: string) =>
        api.get<Property>(`/properties/${id}`),

    update: (id: string, data: Partial<Property>) =>
        api.patch<Property>(`/properties/${id}`, data),

    remove: (id: string) =>
        api.delete(`/properties/${id}`),

    // Availability calendar feed (vacant/reserved units + upcoming lease ends)
    availability: (params?: { propertyId?: string; from?: string; to?: string }) =>
        api.get<Unit[]>('/properties/availability', { params }),

    /** Tenant-wide occupancy rollup. */
    occupancy: () =>
        api.get<Array<{ status: string; count: number }>>('/properties/occupancy'),

    // Amenities (structured rows, not free text)
    listAmenities: (id: string) =>
        api.get<PropertyAmenity[]>(`/properties/${id}/amenities`),

    addAmenity: (id: string, data: { name: string; category?: string; notes?: string }) =>
        api.post<PropertyAmenity>(`/properties/${id}/amenities`, data),

    replaceAmenities: (id: string, amenities: Array<{ name: string; category?: string; notes?: string }>) =>
        api.put<PropertyAmenity[]>(`/properties/${id}/amenities`, { amenities }),

    removeAmenity: (id: string, amenityId: string) =>
        api.delete(`/properties/${id}/amenities/${amenityId}`),

    // Bulk import / export
    /** Browser-navigable CSV download (the httpOnly cookie is sent automatically). */
    exportUrl: (params?: { search?: string; type?: string; category?: string; landlordId?: string; branchId?: string; status?: string }) => {
        const queryParams = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) queryParams.append(key, value);
        });
        const query = queryParams.toString();
        return `${API_BASE_URL}/properties/export${query ? `?${query}` : ''}`;
    },

    importTemplateUrl: () => `${API_BASE_URL}/properties/import-template`,

    importCsv: (csv: string, dryRun?: boolean) =>
        api.post<ImportReport>('/properties/import', { csv, dryRun }),
};

/**
 * Build a GET URL for a CSV export endpoint. Exports are plain links rather
 * than axios calls: the browser has to download the file, and the auth cookie
 * travels with a normal navigation.
 */
function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const queryParams = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            queryParams.append(key, String(value));
        }
    });
    const query = queryParams.toString();
    return `${API_BASE_URL}${path}${query ? `?${query}` : ''}`;
}

// Landlords API (Module 6: Landlord Management)
export interface LandlordListParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
    managementFeeType?: string;
    hasProperties?: boolean;
}

export const landlordsApi = {
    create: (data: Partial<Landlord>) =>
        api.post<Landlord>('/landlords', data),

    findAll: (params?: LandlordListParams) =>
        api.get<{ data: Landlord[]; meta: { total: number; page: number; limit: number; totalPages: number } }>('/landlords', { params }),

    findOne: (id: string) =>
        api.get<LandlordDetail>(`/landlords/${id}`),

    /** What this landlord is still owed, plus charge and payout totals. */
    outstanding: (id: string) =>
        api.get<{
            outstanding: number;
            paid: number;
            statements: number;
            charges: { unstated: number; total: number; count: number };
            payouts: { paid: number; pending: number; count: number };
        }>(`/landlords/${id}/outstanding`),

    update: (id: string, data: Partial<Landlord>) =>
        api.patch<Landlord>(`/landlords/${id}`, data),

    remove: (id: string) =>
        api.delete(`/landlords/${id}`),

    exportUrl: (params?: { status?: string; managementFeeType?: string }) =>
        buildUrl('/landlords/export', params),
};

/** Owner charges — costs levied on a landlord, deducted on their statement. */
export const landlordChargesApi = {
    findAll: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        landlordId?: string;
        propertyId?: string;
        category?: string;
        unstated?: boolean;
        from?: string;
        to?: string;
    }) =>
        api.get<{ data: LandlordCharge[]; meta: { total: number; page: number; limit: number; totalPages: number } }>('/landlords/charges', { params }),

    findOne: (id: string) =>
        api.get<LandlordCharge>(`/landlords/charges/${id}`),

    create: (data: {
        landlordId: string;
        propertyId?: string;
        category: string;
        description: string;
        amount: number;
        chargeDate?: string;
        notes?: string;
    }) => api.post<LandlordCharge>('/landlords/charges', data),

    update: (id: string, data: Partial<LandlordCharge>) =>
        api.patch<LandlordCharge>(`/landlords/charges/${id}`, data),

    remove: (id: string) =>
        api.delete(`/landlords/charges/${id}`),

    exportUrl: (params?: { landlordId?: string; category?: string }) =>
        buildUrl('/landlords/charges/export', params),
};

/** Owner statements — a period's account, derived from rent payments. */
export const ownerStatementsApi = {
    findAll: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        landlordId?: string;
        status?: string;
        periodStart?: string;
        periodEnd?: string;
    }) =>
        api.get<{ data: OwnerStatement[]; meta: { total: number; page: number; limit: number; totalPages: number } }>('/owner-statements', { params }),

    findOne: (id: string) =>
        api.get<OwnerStatement>(`/owner-statements/${id}`),

    /** Dry run: exactly what a period would produce, writing nothing. */
    preview: (params: { landlordId: string; periodStart: string; periodEnd: string }) =>
        api.get<StatementPreview>('/owner-statements/preview', { params }),

    generate: (data: {
        landlordId: string;
        periodStart: string;
        periodEnd: string;
        notes?: string;
        managementFeeType?: string;
        managementFeeRate?: number;
        managementFeeAmount?: number;
    }) => api.post<OwnerStatement>('/owner-statements', data),

    issue: (id: string) => api.post<OwnerStatement>(`/owner-statements/${id}/issue`),

    void: (id: string, reason?: string) =>
        api.post<OwnerStatement>(`/owner-statements/${id}/void`, { reason }),

    remove: (id: string) => api.delete(`/owner-statements/${id}`),

    /** Opens the printable statement; `download=true` serves it as a file. */
    documentUrl: (id: string, download = false) =>
        `${API_BASE_URL}/owner-statements/${id}/document${download ? '?download=true' : ''}`,

    exportUrl: (params?: { landlordId?: string; status?: string }) =>
        buildUrl('/owner-statements/export', params),
};

/** Owner payouts — money leaving the company for a landlord. */
export const landlordPayoutsApi = {
    findAll: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        landlordId?: string;
        ownerStatementId?: string;
        status?: string;
        method?: string;
    }) =>
        api.get<{ data: LandlordPayout[]; meta: { total: number; page: number; limit: number; totalPages: number } }>('/landlord-payouts', { params }),

    findOne: (id: string) => api.get<LandlordPayout>(`/landlord-payouts/${id}`),

    create: (data: {
        landlordId: string;
        ownerStatementId?: string;
        amount: number;
        method?: string;
        currency?: string;
        reference?: string;
        scheduledFor?: string;
        notes?: string;
    }) => api.post<LandlordPayout>('/landlord-payouts', data),

    updateStatus: (
        id: string,
        data: { status: string; reference?: string; failureReason?: string; paidAt?: string; notes?: string },
    ) => api.patch<LandlordPayout>(`/landlord-payouts/${id}/status`, data),

    exportUrl: (params?: { landlordId?: string; status?: string }) =>
        buildUrl('/landlord-payouts/export', params),
};

// Units API (Module 2: Property Management)
export const unitsApi = {
    create: (data: Partial<Unit>) =>
        api.post<Unit>('/units', data),

    findAll: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        propertyId?: string;
        status?: string;
        type?: string;
        branchId?: string;
        floor?: string;
        bedrooms?: string;
    }) => {
        const queryParams = new URLSearchParams();
        if (params?.page) queryParams.append('page', params.page.toString());
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        if (params?.search) queryParams.append('search', params.search);
        if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
        if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
        if (params?.propertyId) queryParams.append('propertyId', params.propertyId);
        if (params?.status) queryParams.append('status', params.status);
        if (params?.type) queryParams.append('type', params.type);
        if (params?.branchId) queryParams.append('branchId', params.branchId);
        if (params?.floor) queryParams.append('floor', params.floor);
        if (params?.bedrooms) queryParams.append('bedrooms', params.bedrooms);
        const query = queryParams.toString();
        return api.get<PaginatedResponse<Unit>>(`/units${query ? `?${query}` : ''}`);
    },

    findOne: (id: string) =>
        api.get<Unit>(`/units/${id}`),

    update: (id: string, data: Partial<Unit>) =>
        api.patch<Unit>(`/units/${id}`, data),

    /**
     * Occupancy transition. Validated server-side against the unit's rental
     * agreements — a unit cannot be marked occupied without an active lease.
     */
    setStatus: (id: string, status: UnitStatus, reason?: string) =>
        api.patch<Unit>(`/units/${id}/status`, { status, reason }),

    /** Re-derive occupancy from the unit's rental agreements. */
    syncStatus: (id: string) =>
        api.post<{ id: string; status: UnitStatus; changed: boolean }>(`/units/${id}/sync-status`),

    remove: (id: string) =>
        api.delete(`/units/${id}`),

    exportUrl: (params?: { search?: string; propertyId?: string; status?: string; type?: string; branchId?: string }) => {
        const queryParams = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) queryParams.append(key, value);
        });
        const query = queryParams.toString();
        return `${API_BASE_URL}/units/export${query ? `?${query}` : ''}`;
    },

    importTemplateUrl: () => `${API_BASE_URL}/units/import-template`,

    importCsv: (csv: string, dryRun?: boolean, createMissingProperties?: boolean) =>
        api.post<ImportReport>('/units/import', { csv, dryRun, createMissingProperties }),
};

// Tenants API
export const tenantsApi = {
    create: (data: Partial<Tenant>) =>
        api.post<Tenant>('/tenants', data),

    findAll: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        status?: string;
        agreementType?: string;
        propertyId?: string;
        withDeposit?: boolean;
    }) => {
        const queryParams = new URLSearchParams();
        if (params?.page) queryParams.append('page', params.page.toString());
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        if (params?.search) queryParams.append('search', params.search);
        if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
        if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
        if (params?.status) queryParams.append('status', params.status);
        if (params?.agreementType) queryParams.append('agreementType', params.agreementType);
        if (params?.propertyId) queryParams.append('propertyId', params.propertyId);
        if (params?.withDeposit !== undefined) queryParams.append('withDeposit', params.withDeposit.toString());
        const query = queryParams.toString();
        return api.get<PaginatedResponse<Tenant>>(`/tenants${query ? `?${query}` : ''}`);
    },

    findOne: (id: string) =>
        api.get<Tenant>(`/tenants/${id}`),

    update: (id: string, data: Partial<Tenant>) =>
        api.patch<Tenant>(`/tenants/${id}`, data),

    remove: (id: string) =>
        api.delete(`/tenants/${id}`),
};

// Rental Agreements API
export const rentalAgreementsApi = {
    create: (data: { unitId: string; tenantId: string; agreementType?: string; startDate: string; endDate?: string; rentAmount: number; status: string }) =>
        api.post<RentalAgreement>('/rental-agreements', data),

    findAll: () =>
        api.get<RentalAgreement[]>('/rental-agreements'),

    findOne: (id: string) =>
        api.get<RentalAgreement>(`/rental-agreements/${id}`),

    update: (id: string, data: Partial<{ unitId: string; tenantId: string; agreementType: string; startDate: string; endDate: string; rentAmount: number; status: string }>) =>
        api.patch<RentalAgreement>(`/rental-agreements/${id}`, data),

    remove: (id: string) =>
        api.delete(`/rental-agreements/${id}`),
};

// Finance API (new modular endpoints — the only billing API in use)
export const financeApi = {
    // Invoices
    createInvoice: (data: CreateInvoiceData) =>
        api.post<Invoice>('/finance/invoices', data),

    findAllInvoices: () =>
        api.get<Invoice[]>('/finance/invoices'),

    findOneInvoice: (id: string) =>
        api.get<Invoice>(`/finance/invoices/${id}`),

    updateInvoice: (id: string, data: {
        landlordId?: string;
        rentalAgreementId?: string;
        issueDate?: string;
        dueDate?: string;
        currency?: string;
        memo?: string;
        billTo?: string;
        amount?: number;
        vatAmount?: number;
        totalAmount?: number;
        paidAmount?: number;
        balanceAmount?: number;
        status?: Invoice['status'];
    }) =>
        api.patch<Invoice>(`/finance/invoices/${id}`, data),

    deleteInvoice: (id: string) =>
        api.delete(`/finance/invoices/${id}`),

    deleteInvoices: (ids: string[]) =>
        api.post('/finance/invoices/bulk-delete', { ids }),

    // Payments
    createPayment: (data: CreatePaymentData) =>
        api.post<Payment>('/finance/payments', data),

    recordPayment: (data: { invoiceId: string; amount: number; paymentDate: string; method: string; reference?: string }) =>
        api.post<Payment>('/finance/payments', data),

    findAllPayments: () =>
        api.get<Payment[]>('/finance/payments'),

    deletePayment: (id: string) =>
        api.delete(`/finance/payments/${id}`),

    deletePayments: (ids: string[]) =>
        api.post('/finance/payments/bulk-delete', { ids }),

    reversePayment: (id: string) =>
        api.post(`/finance/payments/${id}/reverse`),

    // Receipts
    createReceipt: (data: CreateReceiptData) =>
        api.post<Receipt>('/finance/receipts', data),

    findAllReceipts: () =>
        api.get<Receipt[]>('/finance/receipts'),

    findOneReceipt: (id: string) =>
        api.get<Receipt>(`/finance/receipts/${id}`),

    deleteReceipt: (id: string) =>
        api.delete(`/finance/receipts/${id}`),

    deleteReceipts: (ids: string[]) =>
        api.post('/finance/receipts/bulk-delete', { ids }),
};

/**
 * General ledger (Module 7: Finance & Accounting). Accounts, journal entries,
 * reversals and the trial balance. Routine transactions are auto-posted by the
 * backend — these endpoints exist for reading the ledger and for the manual
 * adjusting entries an accountant occasionally needs.
 */
export interface GLAccount {
    id: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    subtype?: string | null;
    description?: string | null;
    normalBalance: 'DEBIT' | 'CREDIT';
    isSystem: boolean;
    isPostable: boolean;
    isActive: boolean;
}

export interface GLJournalLine {
    id: string;
    accountId: string;
    debit: number | string;
    credit: number | string;
    description?: string | null;
    account: GLAccount;
}

export interface GLJournalEntry {
    id: string;
    entryNumber: string;
    entryDate: string;
    memo?: string | null;
    reference?: string | null;
    source: string;
    sourceRef?: { type?: string; id?: string; number?: string } | null;
    status: 'POSTED' | 'REVERSED';
    postedBy?: string | null;
    postedAt?: string | null;
    lines: GLJournalLine[];
}

export interface GLTrialBalanceRow {
    id: string;
    code: string;
    name: string;
    type: GLAccount['type'];
    debit: number;
    credit: number;
    balance: number;
}

export const accountingApi = {
    listAccounts: () => api.get<GLAccount[]>('/finance/accounting/accounts'),

    createAccount: (data: {
        code: string;
        name: string;
        type: GLAccount['type'];
        subtype?: string;
        description?: string;
        normalBalance?: 'DEBIT' | 'CREDIT';
        isPostable?: boolean;
    }) => api.post<GLAccount>('/finance/accounting/accounts', data),

    updateAccount: (
        id: string,
        data: { name?: string; subtype?: string; description?: string; isPostable?: boolean; isActive?: boolean },
    ) => api.put<GLAccount>(`/finance/accounting/accounts/${id}`, data),

    deleteAccount: (id: string) =>
        api.delete(`/finance/accounting/accounts/${id}`),

    listEntries: (params?: { from?: string; to?: string; source?: string; limit?: number }) =>
        api.get<GLJournalEntry[]>('/finance/accounting/entries', { params }),

    findEntry: (id: string) => api.get<GLJournalEntry>(`/finance/accounting/entries/${id}`),

    createEntry: (data: {
        entryDate?: string;
        memo?: string;
        reference?: string;
        lines: { accountCode: string; debit?: number; credit?: number; description?: string }[];
    }) => api.post<GLJournalEntry>('/finance/accounting/entries', data),

    reverseEntry: (id: string) =>
        api.post<GLJournalEntry>(`/finance/accounting/entries/${id}/reverse`),

    trialBalance: (params?: { from?: string; to?: string }) =>
        api.get<{ rows: GLTrialBalanceRow[]; totalDebit: number; totalCredit: number; balanced: boolean }>(
            '/finance/accounting/trial-balance',
            { params },
        ),

    accountLedger: (id: string, params?: { from?: string; to?: string }) =>
        api.get<{ account: GLAccount; lines: { entryNumber: string; entryDate: string; description?: string | null; debit: number; credit: number; balance: number }[]; closingBalance: number }>(
            `/finance/accounting/accounts/${id}/ledger`,
            { params },
        ),
};

// Dashboard API
export const dashboardApi = {
    getStats: () =>
        api.get<DashboardStats>('/dashboard/stats'),
};

// Moveouts API
export const moveoutsApi = {
    create: (data: Partial<MoveOutRequest>) =>
        api.post<MoveOutRequest>('/moveouts', data),

    findAll: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        status?: string;
    }) => {
        const queryParams = new URLSearchParams();
        if (params?.page) queryParams.append('page', params.page.toString());
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        if (params?.search) queryParams.append('search', params.search);
        if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
        if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
        if (params?.status) queryParams.append('status', params.status);
        const query = queryParams.toString();
        return api.get<PaginatedResponse<MoveOutRequest>>(`/moveouts${query ? `?${query}` : ''}`);
    },

    findOne: (id: string) =>
        api.get<MoveOutRequest>(`/moveouts/${id}`),

    update: (id: string, data: Partial<MoveOutRequest>) =>
        api.patch<MoveOutRequest>(`/moveouts/${id}`, data),

    remove: (id: string) =>
        api.delete(`/moveouts/${id}`),
};
// ============================================
// CRM API (Module 3)
// ============================================

export const crmApi = {
    // ------------------------------------------------------------------ leads
    createLead: (data: CreateLeadData) =>
        api.post<Lead>('/crm/leads', data),

    findLeads: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        stage?: string;
        source?: string;
        propertyId?: string;
        branchId?: string;
        assignedAgentId?: string;
        unassigned?: boolean;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            query.append(key, String(value));
        });
        const qs = query.toString();
        return api.get<PaginatedResponse<Lead>>(`/crm/leads${qs ? `?${qs}` : ''}`);
    },

    findLead: (id: string) => api.get<Lead>(`/crm/leads/${id}`),

    /** Pipeline board feed: open leads only. */
    pipeline: (params?: { propertyId?: string; agentId?: string }) =>
        api.get<Lead[]>('/crm/leads/pipeline', { params }),

    updateLead: (id: string, data: Partial<CreateLeadData>) =>
        api.patch<Lead>(`/crm/leads/${id}`, data),

    /** Move through the pipeline; the API validates the transition. */
    setLeadStage: (id: string, stage: LeadStage, reason?: string) =>
        api.patch<Lead>(`/crm/leads/${id}/stage`, { stage, reason }),

    convertLead: (id: string, data: ConvertLeadData) =>
        api.post<{ lead: Lead; contactId: string; tenantId?: string }>(
            `/crm/leads/${id}/convert`,
            data,
        ),

    removeLead: (id: string) => api.delete(`/crm/leads/${id}`),

    leadsExportUrl: (params?: {
        search?: string;
        stage?: string;
        source?: string;
        propertyId?: string;
        branchId?: string;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const qs = query.toString();
        return `${API_BASE_URL}/crm/leads/export${qs ? `?${qs}` : ''}`;
    },

    // --------------------------------------------------------------- contacts
    createContact: (data: Partial<Contact>) =>
        api.post<Contact>('/crm/contacts', data),

    findContacts: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        type?: string;
        engaged?: boolean;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            query.append(key, String(value));
        });
        const qs = query.toString();
        return api.get<PaginatedResponse<Contact>>(`/crm/contacts${qs ? `?${qs}` : ''}`);
    },

    findContact: (id: string) => api.get<Contact>(`/crm/contacts/${id}`),

    updateContact: (id: string, data: Partial<Contact>) =>
        api.patch<Contact>(`/crm/contacts/${id}`, data),

    removeContact: (id: string) => api.delete(`/crm/contacts/${id}`),

    contactTimeline: (id: string) =>
        api.get<Communication[]>(`/crm/contacts/${id}/timeline`),

    contactsExportUrl: (params?: { search?: string; type?: string }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const qs = query.toString();
        return `${API_BASE_URL}/crm/contacts/export${qs ? `?${qs}` : ''}`;
    },

    // --------------------------------------------------------- communications
    logCommunication: (data: LogCommunicationData) =>
        api.post<Communication>('/crm/contacts/communications', data),

    listCommunications: (params?: { leadId?: string; limit?: number }) =>
        api.get<Communication[]>('/crm/contacts/communications', { params }),

    removeCommunication: (id: string) =>
        api.delete(`/crm/contacts/communications/${id}`),
};

// ============================================
// SALES API (Module 4)
// ============================================

export const salesApi = {
    createSale: (data: CreateSaleData) => api.post<Sale>('/sales', data),

    findSales: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        stage?: string;
        propertyId?: string;
        agentUserId?: string;
        buyerContactId?: string;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            query.append(key, String(value));
        });
        const qs = query.toString();
        return api.get<PaginatedResponse<Sale>>(`/sales${qs ? `?${qs}` : ''}`);
    },

    findSale: (id: string) => api.get<Sale>(`/sales/${id}`),

    /** Open sales only — the pipeline board feed. */
    pipeline: (params?: { agentUserId?: string }) =>
        api.get<Sale[]>('/sales/pipeline', { params }),

    updateSale: (id: string, data: Partial<CreateSaleData>) =>
        api.patch<Sale>(`/sales/${id}`, data),

    setStage: (id: string, stage: SaleStage, reason?: string) =>
        api.patch<Sale>(`/sales/${id}/stage`, { stage, reason }),

    removeSale: (id: string) => api.delete(`/sales/${id}`),

    // ------------------------------------------------------------ instalments
    createInstallmentPlan: (
        id: string,
        data: {
            installments: number;
            firstDueDate: string;
            upfrontAmount?: number;
            upfrontDescription?: string;
            intervalDays?: number;
        },
    ) => api.post<SaleInstallment[]>(`/sales/${id}/installments/plan`, data),

    /** Raise a finance invoice for one instalment (server-side reuse). */
    invoiceInstallment: (id: string, installmentId: string, body?: { description?: string; memo?: string }) =>
        api.post(`/sales/${id}/installments/${installmentId}/invoice`, body ?? {}),

    setInstallmentStatus: (id: string, installmentId: string, status: string) =>
        api.patch<SaleInstallment>(
            `/sales/${id}/installments/${installmentId}/status?status=${status}`,
        ),

    refreshInstallments: (id: string) =>
        api.post<{ updated: number }>(`/sales/${id}/installments/refresh`),

    // ------------------------------------------------------------- commissions
    generateCommissions: (
        id: string,
        data: {
            commissionRate?: number;
            participants?: Array<{ agentUserId: string; splitPercentage: number }>;
            basis?: string;
        },
    ) =>
        api.post<{ total: number; rate: number; commissions: Commission[] }>(
            `/sales/${id}/commissions`,
            data,
        ),

    commissionReport: (params?: { agentUserId?: string; status?: string; saleTransactionId?: string }) =>
        api.get<CommissionReport>('/sales/commissions', { params }),

    setCommissionStatus: (
        id: string,
        status: CommissionStatus,
        body?: { paidRef?: string; notes?: string },
    ) => api.patch<Commission>(`/sales/commissions/${id}/status`, { status, ...(body ?? {}) }),

    // ------------------------------------------------------------------ export
    exportUrl: (params?: { search?: string; stage?: string; propertyId?: string; agentUserId?: string }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const qs = query.toString();
        return `${API_BASE_URL}/sales/export${qs ? `?${qs}` : ''}`;
    },
};

// ============================================
// LEASES API (Module 5)
// ============================================

export const leasesApi = {
    createLease: (data: CreateLeaseData) => api.post<Lease>('/leases', data),

    findLeases: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        status?: string;
        agreementType?: string;
        unitId?: string;
        tenantId?: string;
        propertyId?: string;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            query.append(key, String(value));
        });
        const qs = query.toString();
        return api.get<PaginatedResponse<Lease>>(`/leases${qs ? `?${qs}` : ''}`);
    },

    findLease: (id: string) => api.get<Lease>(`/leases/${id}`),

    updateLease: (id: string, data: Partial<CreateLeaseData>) =>
        api.patch<Lease>(`/leases/${id}`, data),

    // Lifecycle actions. `status` is only settable through these.
    activate: (id: string) => api.post<Lease>(`/leases/${id}/activate`),

    /** Creates the successor agreement and links the renewal chain. */
    renew: (
        id: string,
        data: {
            newStartDate?: string;
            newEndDate?: string;
            rentAmount?: number;
            securityDeposit?: number;
            termMonths?: number;
            currency?: string;
        },
    ) => api.post<{ previous: { id: string; code: string }; lease: Lease }>(`/leases/${id}/renew`, data),

    extend: (id: string, newEndDate: string) =>
        api.post<Lease>(`/leases/${id}/extend`, { newEndDate }),

    terminate: (id: string, reason: string) =>
        api.post<{ lease: Lease; outstanding: number; arrears: number; unitVacated: boolean }>(
            `/leases/${id}/terminate`,
            { reason },
        ),

    expire: (id: string) => api.post<Lease>(`/leases/${id}/expire`),

    reactivate: (id: string) => api.post<Lease>(`/leases/${id}/reactivate`),

    removeLease: (id: string) => api.delete(`/leases/${id}`),

    /** Everything billed and collected against this lease. */
    ledger: (id: string) => api.get<LeaseLedger>(`/leases/${id}/ledger`),

    /** Expiry reminders (stub until Notifications exists). */
    expiring: (days = 60) => api.get<Lease[]>('/leases/expiring', { params: { days } }),

    /** Occupancy history for a unit: tenancies plus the vacant gaps. */
    occupancyHistory: (unitId: string) =>
        api.get<OccupancyHistory>(`/leases/units/${unitId}/occupancy-history`),

    exportUrl: (params?: { search?: string; status?: string; agreementType?: string }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const qs = query.toString();
        return `${API_BASE_URL}/leases/export${qs ? `?${qs}` : ''}`;
    },
};

export const moveOutsApi = {
    create: (data: { rentalAgreementId: string; moveoutDate: string; notes?: string }) =>
        api.post<MoveOutRequest>('/move-outs', data),

    findAll: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
        api.get<PaginatedResponse<MoveOutRequest>>('/move-outs', { params }),

    findOne: (id: string) => api.get<MoveOutRequest>(`/move-outs/${id}`),

    /** The auditable deposit position — always derived, never typed in. */
    deposit: (id: string) => api.get<DepositBreakdown>(`/move-outs/${id}/deposit`),

    addDeduction: (
        id: string,
        data: { category: DeductionCategory; description: string; amount: number; notes?: string },
    ) => api.post<MoveOutDeduction>(`/move-outs/${id}/deductions`, data),

    removeDeduction: (id: string, deductionId: string) =>
        api.delete(`/move-outs/${id}/deductions/${deductionId}`),

    approve: (id: string, notes?: string) =>
        api.post<MoveOutRequest & { unitVacated: boolean }>(`/move-outs/${id}/approve`, { notes }),

    reject: (id: string, notes: string) =>
        api.post<MoveOutRequest>(`/move-outs/${id}/reject`, { notes }),

    /** Pays out the derived refund and stamps the lease. */
    refund: (id: string, paidRef: string, paymentMethod?: string) =>
        api.post<MoveOutRequest & { refund: number; reference: string }>(
            `/move-outs/${id}/refund`,
            { paidRef, paymentMethod },
        ),
};

export const inspectionsApi = {
    create: (data: {
        unitId: string;
        rentalAgreementId?: string;
        type: InspectionType;
        scheduledDate: string;
        notes?: string;
        items?: Array<{ area: string; item: string; condition?: ConditionRating; notes?: string; estimatedCost?: number }>;
    }) => api.post<InspectionReport>('/inspections', data),

    list: (params?: { unitId?: string; type?: string }) =>
        api.get<InspectionReport[]>('/inspections', { params }),

    findOne: (id: string) => api.get<InspectionReport>(`/inspections/${id}`),

    addItem: (
        id: string,
        item: { area: string; item: string; condition?: ConditionRating; notes?: string; estimatedCost?: number },
    ) => api.post<InspectionItem>(`/inspections/${id}/items`, item),

    updateItem: (
        id: string,
        itemId: string,
        data: { condition?: ConditionRating; notes?: string; estimatedCost?: number; requiresAction?: boolean },
    ) => api.patch<InspectionItem>(`/inspections/${id}/items/${itemId}`, data),

    complete: (id: string) => api.post<InspectionReport>(`/inspections/${id}/complete`),

    remove: (id: string) => api.delete(`/inspections/${id}`),
};

export const leaseTemplatesApi = {
    list: () => api.get<LeaseTemplate[]>('/lease-templates'),
    create: (data: Partial<LeaseTemplate>) => api.post<LeaseTemplate>('/lease-templates', data),
    update: (id: string, data: Partial<LeaseTemplate>) =>
        api.patch<LeaseTemplate>(`/lease-templates/${id}`, data),
    /** Deactivates rather than deleting — leases created from it are on file. */
    remove: (id: string) => api.delete(`/lease-templates/${id}`),
};

/**
 * Read-only resident API.
 *
 * Every call is scoped by the tenant linked to the signed-in user's session —
 * the client never sends a tenant id, so a resident cannot read another
 * household's data by editing a request.
 */
export const portalApi = {
    me: () =>
        api.get<{ user: { id: string; email: string }; tenant: PortalTenant }>('/portal/me'),

    summary: () => api.get<PortalSummary>('/portal/summary'),

    lease: () => api.get<PortalLease>('/portal/lease'),

    invoices: () => api.get<PortalInvoice[]>('/portal/invoices'),

    receipts: () => api.get<PortalReceipt[]>('/portal/receipts'),

    documents: () => api.get<PortalDocument[]>('/portal/documents'),

    /** Browser-navigable download (the httpOnly session cookie is sent along). */
    downloadUrl: (documentId: string) =>
        `${API_BASE_URL}/portal/documents/${documentId}/download`,
};

// ============================================
// TENANT REQUEST API
// ============================================

export const tenantRequestsApi = {
    // Resident side — scoped by the tenant on the session.
    myRequests: () => api.get<TenantRequest[]>('/portal/requests'),
    createRequest: (data: {
        type: TenantRequestType;
        rentalAgreementId?: string;
        preferredDate?: string;
        note?: string;
        payload?: Record<string, unknown>;
    }) => api.post<TenantRequest>('/portal/requests', data),
    withdrawRequest: (id: string) =>
        api.post<TenantRequest>(`/portal/requests/${id}/withdraw`),

    // Staff queue.
    findAll: (params?: { status?: string; type?: string; tenantId?: string }) =>
        api.get<TenantRequest[]>('/tenant-requests', { params }),
    decide: (id: string, decision: 'APPROVE' | 'REJECT', decisionNote?: string) =>
        api.post<TenantRequest>(`/tenant-requests/${id}/decide`, {
            decision,
            decisionNote,
        }),
};
