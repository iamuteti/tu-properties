import axios from 'axios';
import { AuthResponse, User, Property, Unit, Tenant, RentalAgreement, Invoice, Payment, Organization, OrganizationProfileInput, Role, RoleAssignment, Branch, Document, LoginEvent, Landlord, LandlordDetail, LandlordCharge, LandlordPayout, OwnerStatement, StatementPreview, CreateInvoiceData, CreatePaymentData, CreateReceiptData, DashboardStats, Receipt, PaginatedResponse, MoveOutRequest, PropertyAmenity, ImportReport, UnitStatus, Lead, Contact, Communication, CreateLeadData, ConvertLeadData, LogCommunicationData, LeadStage, Sale, SaleStage, CreateSaleData, Commission, CommissionStatus, CommissionReport, SaleInstallment, Lease, LeaseAction, LeaseLedger, CreateLeaseData, MoveOutDeduction, DepositBreakdown, DeductionCategory, InspectionReport, InspectionItem, InspectionType, ConditionRating, LeaseTemplate, OccupancyHistory, PortalSummary, PortalLease, PortalInvoice, PortalReceipt, PortalDocument, PortalTenant, TenantRequest, TenantRequestType, ApprovalInbox, WorkflowDefinition, WorkflowDelegation, WorkflowInstance, WorkflowStepTemplate, WorkOrder, WorkOrderStats, WorkOrderTask, MaintenanceTechnician, Asset, AssetDetail, AssetStats, PmSchedule, PmRun, PortalWorkOrder, PurchaseRequest, PurchaseRequestStats, PurchaseRequestLine, Rfq, RfqStats, RfqInvitation, RfqQuote, QuoteComparison, PurchaseOrder, PurchaseOrderStats, PurchaseOrderLine, ProcurementSupplier, SupplierSpendRow, StockInStatus, InventoryItemRow, InventoryItemDetail, InventoryStats, WarehouseRow, WarehouseDetail, StockMovementRow, StockMovementStats, WorkOrderMaterials, EmployeeRow, EmployeeDetail, EmployeeSelf, EmployeeStats, LeaveRequestRow, LeaveBalanceRow, LeaveCalendar, LeavePolicyRow, HolidayRow, LeaveBalance, PayrollRuleRow, PayrollRuleCoverage, PayrollRulePreview, PayrollJurisdiction, PayrollTotals, PayrollRunRow, PayrollRunDetail, PayslipRow, PayslipDetail, PayslipLineRow, PayrollRunSummary, FacilityRow, FacilityDetail, FacilityAvailability, FacilityBookingRow, FacilityBookingPreview, FacilityBlackoutRow, AccessCardRow, VisitorRow, VisitorDetail, VisitorVisitRow,
    UtilityMeterRow,
    UtilityMeterDetail,
    MeterReadingRow,
    UtilityRateRow,
    UtilityChargeRow,
    BillRunResult,
    BulkReadingResult,
    UtilityMeterPayload,
    UtilityRatePayload,
    CreateReadingPayload,
    BillPeriodPayload,
    UtilityType,
    MeterScope,
    ApportionmentMethod,
    MeterReadingSource,
} from '@/types';

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

    getPaymentById: (id: string) =>
        api.get<Payment>(`/finance/payments/${id}`),

    deletePayment: (id: string) =>
        api.delete(`/finance/payments/${id}`),

    deletePayments: (ids: string[]) =>
        api.post('/finance/payments/bulk-delete', { ids }),

    reversePayment: (id: string) =>
        api.post(`/finance/payments/${id}/reverse`),

    /** Spend a payment that arrived without an invoice, oldest invoice first. */
    allocatePayment: (id: string, invoiceIds?: string[]) =>
        api.post<{ allocations: { invoiceId: string; amount: number }[]; unallocated: number }>(
            `/finance/payments/${id}/allocate`,
            { invoiceIds },
        ),

    /** Who owes what, and how stale. */
    arrears: (params?: { asOf?: string; propertyId?: string }) =>
        api.get<{
            asOf: string;
            buckets: {
                current: number;
                days1to30: number;
                days31to60: number;
                days61to90: number;
                over90: number;
                total: number;
                overdue: number;
            };
            byTenant: {
                tenantId: string;
                tenantName: string;
                phone: string | null;
                total: number;
                overdue: number;
                invoices: {
                    id: string;
                    invoiceNumber: string;
                    dueDate: string;
                    balance: number;
                }[];
            }[];
        }>('/finance/invoices/arrears', { params }),

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
 * Credit balances and refunds (Module 8: Payments). A credit is money the
 * customer is owed back — an overpayment, an unallocated transfer, goodwill —
 * and it is spent against invoices rather than being lost.
 */
export interface CustomerCredit {
    id: string;
    amount: number;
    appliedAmount: number;
    currency: string;
    reason?: string | null;
    source: 'OVERPAYMENT' | 'UNALLOCATED_RECEIPT' | 'GOODWILL' | 'REFUND_UNSPENT' | 'MANUAL';
    status: 'OPEN' | 'PARTIALLY_APPLIED' | 'APPLIED' | 'VOID';
    tenantId?: string | null;
    landlordId?: string | null;
    customerName?: string | null;
    createdAt: string;
    tenant?: { surname: string; otherNames?: string | null } | null;
    landlord?: { name: string } | null;
    applications?: { id: string; amount: number; invoiceId: string; invoice?: { invoiceNumber: string } }[];
}

export interface PaymentRefund {
    id: string;
    amount: number;
    reason: string;
    refundReference?: string | null;
    processedAt: string;
    processedBy?: string | null;
    payment?: { id: string; amount: number; paymentMethod: string } | null;
    creditNote?: { id: string; creditNoteNumber: string; totalAmount: number } | null;
}

/**
 * Tax rules (Module 7: Finance & Accounting). Tax is configuration, not code:
 * a rule names its country and optional region, its rate, whether the price
 * includes the tax, and which ledger account collects it. An organization
 * declares where it is taxed; the engine resolves what applies at invoice date.
 */
export interface TaxRule {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    /** ISO-3166-1 alpha-2, or null for the organization's fallback rule. */
    countryCode?: string | null;
    regionCode?: string | null;
    basis: 'EXCLUSIVE' | 'INCLUSIVE';
    treatment: 'CHARGED' | 'WITHHELD';
    rate: number | string;
    ledgerAccountCode?: string | null;
    isCompound: boolean;
    /** '*' applies to every line; otherwise a category match is required. */
    appliesToCategory: string;
    validFrom: string;
    validTo?: string | null;
    isActive: boolean;
}

export interface TaxJurisdiction {
    countryCode?: string | null;
    regionCode?: string | null;
    taxRegistrationNumber?: string | null;
    currency: string;
    label?: string;
}

export const taxApi = {
    jurisdiction: () =>
        api.get<TaxJurisdiction>('/finance/tax/jurisdiction'),

    setJurisdiction: (data: {
        countryCode?: string | null;
        regionCode?: string | null;
        taxRegistrationNumber?: string | null;
    }) => api.put<TaxJurisdiction>('/finance/tax/jurisdiction', data),

    findAll: (params?: { countryCode?: string }) =>
        api.get<TaxRule[]>('/finance/tax/rules', { params }),

    /** Price a draft without writing anything — what the invoice form calls. */
    calculate: (lines: { description: string; amount: number; category?: string }[]) =>
        api.post<{
            netAmount: number;
            chargedTax: number;
            withheldTax: number;
            totalAmount: number;
            jurisdiction: string;
            summary: { code: string; name: string; ratePercent: number; amount: number; account: string }[];
        }>('/finance/tax/calculate', { lines }),

    /** Passing an existing `id` supersedes that rule instead of editing it. */
    create: (data: {
        id?: string;
        code: string;
        name: string;
        description?: string;
        countryCode?: string | null;
        regionCode?: string | null;
        basis?: 'EXCLUSIVE' | 'INCLUSIVE';
        treatment?: 'CHARGED' | 'WITHHELD';
        ratePercent: number;
        ledgerAccountCode?: string;
        appliesToCategory?: string;
        validFrom?: string;
        validTo?: string;
    }) => api.post<TaxRule>('/finance/tax/rules', data),

    update: (
        id: string,
        data: { name?: string; description?: string; isActive?: boolean; validTo?: string },
    ) => api.put<TaxRule>(`/finance/tax/rules/${id}`, data),

    remove: (id: string) => api.delete(`/finance/tax/rules/${id}`),
};

/**
 * Accounts payable (Module 7). The payable-side mirror of the billing side:
 * suppliers, their bills, payments against them, credit when we overpay, and an
 * aging report. `calculateTax` is optional — a bill is priced by the same
 * jurisdiction rules as an invoice unless the caller supplies the figures from
 * the supplier's own document.
 */
export interface Supplier {
    id: string;
    code: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    country?: string | null;
    taxPin?: string | null;
    paymentTermsDays?: number | null;
    bills?: { balanceAmount: number | string }[];
}

export interface SupplierBill {
    id: string;
    billNumber: string;
    supplierId: string;
    supplier?: Supplier;
    supplierReference?: string | null;
    billDate: string;
    dueDate: string;
    currency: string;
    category: string;
    subtotal: number | string;
    taxAmount: number | string;
    totalAmount: number | string;
    paidAmount: number | string;
    balanceAmount: number | string;
    status: 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
    notes?: string | null;
    lines?: {
        id: string;
        description: string;
        quantity: number | string;
        unitPrice: number | string;
        amount: number | string;
        expenseAccountCode?: string | null;
    }[];
    payments?: BillPayment[];
}

export interface BillPayment {
    id: string;
    billId: string;
    amount: number | string;
    paymentDate: string;
    method: string;
    reference?: string | null;
    appliedAmount: number | string;
    isReversed: boolean;
    bill?: SupplierBill;
}

export interface SupplierCredit {
    id: string;
    amount: number | string;
    appliedAmount: number | string;
    reason?: string | null;
    status: string;
    supplier?: Supplier;
}

export const payablesApi = {
    findSuppliers: (params?: { status?: string }) =>
        api.get<Supplier[]>('/finance/payables/suppliers', { params }),

    findSupplier: (id: string) => api.get<Supplier>(`/finance/payables/suppliers/${id}`),

    createSupplier: (data: {
        name: string;
        email?: string;
        phone?: string;
        city?: string;
        country?: string;
        taxPin?: string;
        paymentTermsDays?: number;
    }) => api.post<Supplier>('/finance/payables/suppliers', data),

    updateSupplier: (id: string, data: Partial<Supplier>) =>
        api.patch<Supplier>(`/finance/payables/suppliers/${id}`, data),

    deleteSupplier: (id: string) =>
        api.delete(`/finance/payables/suppliers/${id}`),

    findBills: (params?: { supplierId?: string; status?: string; overdueOnly?: boolean }) =>
        api.get<SupplierBill[]>('/finance/payables/bills', { params }),

    findBill: (id: string) => api.get<SupplierBill>(`/finance/payables/bills/${id}`),

    createBill: (data: {
        supplierId: string;
        supplierReference?: string;
        billDate?: string;
        dueDate?: string;
        category?: string;
        taxAmount?: number;
        subtotal?: number;
        totalAmount?: number;
        notes?: string;
        lines: { description: string; quantity?: number; unitPrice: number; amount?: number }[];
    }) => api.post<SupplierBill>('/finance/payables/bills', data),

    voidBill: (id: string) => api.post(`/finance/payables/bills/${id}/void`),

    findPayments: (params?: { billId?: string }) =>
        api.get<BillPayment[]>('/finance/payables/payments', { params }),

    createPayment: (data: {
        billId: string;
        amount: number;
        paymentDate?: string;
        method?: string;
        reference?: string;
        notes?: string;
    }) => api.post<BillPayment>('/finance/payables/payments', data),

    reversePayment: (id: string) =>
        api.post(`/finance/payables/payments/${id}/reverse`),

    findCredits: (params?: { supplierId?: string }) =>
        api.get<SupplierCredit[]>('/finance/payables/credits', { params }),

    applyCredit: (id: string, billIds?: string[]) =>
        api.post(`/finance/payables/credits/${id}/apply`, { billIds }),

    aging: () =>
        api.get<{
            asOf: string;
            buckets: {
                current: number;
                days1to30: number;
                days31to60: number;
                days61to90: number;
                over90: number;
                total: number;
            };
            bySupplier: { supplierId: string; supplierName: string; total: number; overdue: number }[];
        }>('/finance/payables/aging'),
};

export const creditsApi = {
    findAll: (params?: { status?: string; tenantId?: string; landlordId?: string }) =>
        api.get<CustomerCredit[]>('/finance/credits', { params }),

    balances: () =>
        api.get<{ customerKey: string; label: string; balance: number; credits: number }[]>(
            '/finance/credits/balances',
        ),

    findOne: (id: string) => api.get<CustomerCredit>(`/finance/credits/${id}`),

    create: (data: {
        tenantId?: string;
        landlordId?: string;
        customerName?: string;
        amount: number;
        reason?: string;
    }) => api.post<CustomerCredit>('/finance/credits', data),

    /** No invoiceIds = oldest outstanding invoice first. */
    applyToInvoices: (id: string, invoiceIds?: string[], amount?: number) =>
        api.post<{ applications: { invoiceId: string; amount: number }[]; unapplied: number }>(
            `/finance/credits/${id}/apply`,
            { invoiceIds, amount },
        ),

    void: (id: string) => api.delete(`/finance/credits/${id}`),
};

export const refundsApi = {
    findAll: (params?: { paymentId?: string }) =>
        api.get<PaymentRefund[]>('/finance/refunds', { params }),

    findOne: (id: string) => api.get<PaymentRefund>(`/finance/refunds/${id}`),

    refundable: (paymentId: string) =>
        api.get<{ paymentAmount: number; refunded: number; refundable: number }>(
            `/finance/refunds/refundable/${paymentId}`,
        ),

    /**
     * Raises a refund request (Module 18).
     *
     * The response is the approval request, not a refund: nothing has moved yet
     * unless `autoApproved` is true, which means no policy applied and it was
     * processed directly. Treat the two cases as different, because they are.
     */
    create: (data: {
        paymentId: string;
        amount: number;
        reason: string;
        refundReference?: string;
        toCredit?: boolean;
    }) =>
        api.post<
            WorkflowInstance & { autoApproved: boolean; note: string | null }
        >('/finance/refunds', data),
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

/**
 * Notifications (Module 17). In-app delivery is the only channel wired to a
 * real provider; email and SMS rows exist and report honestly as suppressed when
 * nothing is configured, rather than pretending to have been sent.
 */
export interface AppNotification {
    id: string;
    type: string;
    channel: "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP" | "PUSH";
    priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
    status: "PENDING" | "SENT" | "FAILED" | "SUPPRESSED";
    title: string;
    body: string;
    actionUrl?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    readAt?: string | null;
    createdAt: string;
}

export interface ArrearsTenant {
    tenantId: string;
    tenantName: string;
    phone: string | null;
    total: number;
    overdue: number;
    invoices: { id: string; invoiceNumber: string; dueDate: string; balance: number }[];
}

export const notificationsApi = {
    findAll: (params?: { unreadOnly?: boolean; limit?: number }) =>
        api.get<AppNotification[]>("/notifications", { params }),

    unreadCount: () => api.get<{ count: number }>("/notifications/unread-count"),

    markRead: (id: string) => api.post(`/notifications/${id}/read`),

    markAllRead: () => api.post("/notifications/read-all"),

    preferences: () => api.get("/notifications/preferences"),

    setPreference: (data: {
        type: string;
        inApp?: boolean;
        email?: boolean;
        sms?: boolean;
        push?: boolean;
    }) => api.post("/notifications/preferences", data),

    // ── Provider configuration (admin panel) ───────────────────────────────
    providers: () =>
        api.get<
            {
                id: string;
                label: string;
                channel: "SMS" | "EMAIL";
                fields: { name: string; label: string; secret: boolean; required: boolean }[];
                docsUrl: string;
            }[]
        >("/notifications/config/providers"),

    /** Current configuration per channel, credentials masked. */
    channelConfig: () =>
        api.get<
            {
                channel: string;
                configured: boolean;
                active: boolean;
                provider: string | null;
                maskedCredentials: Record<string, string> | null;
                settings: Record<string, unknown> | null;
                updatedAt: string | null;
                error?: string;
            }[]
        >("/notifications/config"),

    /** Saving does not activate: test first, then switch over. */
    saveChannelConfig: (data: {
        channel: string;
        provider: string;
        credentials: Record<string, unknown>;
        settings?: Record<string, unknown>;
    }) => api.post("/notifications/config", data),

    activateChannel: (channel: string) =>
        api.post(`/notifications/config/${channel}/activate`),

    deactivateChannel: (channel: string) =>
        api.post(`/notifications/config/${channel}/deactivate`),

    /** Send a test message through the saved config, active or not. */
    testChannel: (channel: string, to: string) =>
        api.post<{ ok: boolean; status: string; reason?: string; externalId?: string }>(
            `/notifications/config/${channel}/test`,
            { to },
        ),

    /** Administrative: run the reminder sweep now instead of waiting. */
    runTriggers: (onDate?: string) =>
        api.post<{ leases: number; due: number; overdue: number }>(
            "/notifications/triggers/run",
            { onDate },
        ),
};


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

// ============================================
// WORKFLOW ENGINE API (Module 18)
// ============================================

export const workflowsApi = {
    // ── The approvals inbox ────────────────────────────────────────────────
    // One queue for every entity type on purpose: an approver's job is "decide
    // what is waiting on me", and splitting that by module is how approval
    // inboxes end up unmonitored.
    inbox: () => api.get<ApprovalInbox>('/workflows/inbox'),

    instances: (params?: { status?: string; entityType?: string; page?: number; limit?: number }) =>
        api.get<PaginatedResponse<WorkflowInstance>>('/workflows/instances', { params }),

    findOne: (id: string) => api.get<WorkflowInstance>(`/workflows/instances/${id}`),

    /** The live approval for a record, if there is one. */
    forEntity: (entityType: string, entityId: string) =>
        api.get<WorkflowInstance | null>(`/workflows/entity/${entityType}/${entityId}`),

    /** A rejection must carry a note — it is what the requester reads. */
    decide: (id: string, decision: 'APPROVE' | 'REJECT', comment?: string) =>
        api.post<WorkflowInstance>(`/workflows/instances/${id}/decision`, {
            decision,
            comment,
        }),

    cancel: (id: string, reason: string) =>
        api.post<WorkflowInstance>(`/workflows/instances/${id}/cancel`, { reason }),

    // ── Policies ───────────────────────────────────────────────────────────
    definitions: (entityType?: string) =>
        api.get<WorkflowDefinition[]>('/workflows/definitions', {
            params: entityType ? { entityType } : undefined,
        }),

    approverOptions: () =>
        api.get<{
            users: {
                id: string;
                firstName: string;
                lastName: string;
                email: string;
            }[];
            roles: { id: string; name: string; isSystem: boolean }[];
        }>('/workflows/definitions/approver-options'),

    createDefinition: (data: {
        entityType: string;
        name: string;
        description?: string;
        steps: WorkflowStepTemplate[];
        isActive?: boolean;
        priority?: number;
    }) => api.post<WorkflowDefinition>('/workflows/definitions', data),

    updateDefinition: (
        id: string,
        data: {
            name?: string;
            description?: string;
            steps?: WorkflowStepTemplate[];
            isActive?: boolean;
            priority?: number;
        },
    ) => api.patch<WorkflowDefinition>(`/workflows/definitions/${id}`, data),

    deleteDefinition: (id: string) =>
        api.delete<{ deleted: boolean }>(`/workflows/definitions/${id}`),

    // ── Delegation: "while I am away, this colleague decides" ───────────────
    delegations: () =>
        api.get<{
            givenByMe: WorkflowDelegation[];
            givenToMe: WorkflowDelegation[];
        }>('/workflows/delegations'),

    createDelegation: (data: {
        toUserId: string;
        startsAt?: string;
        endsAt?: string;
        reason?: string;
    }) => api.post<WorkflowDelegation>('/workflows/delegations', data),

    removeDelegation: (id: string) =>
        api.delete<{ deleted: boolean }>(`/workflows/delegations/${id}`),
};

/**
 * Module 9 — Maintenance.
 *
 * Every state change is its own method rather than a generic `update(status)`:
 * the API refuses an illegal transition with a message, so the client should not
 * be able to ask for one. The list methods return whatever the endpoint returns
 * rather than normalising, because the endpoints already scope to the caller.
 */
export const maintenanceApi = {
    // ── Work orders ─────────────────────────────────────────────────────────
    workOrders: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<WorkOrder[]>('/maintenance/work-orders', { params }),

    workOrder: (id: string) => api.get<WorkOrder>(`/maintenance/work-orders/${id}`),

    workOrderStats: () => api.get<WorkOrderStats>('/maintenance/work-orders/stats'),

    /**
     * Browser-navigable CSV download. The httpOnly cookie is sent
     * automatically, so this can be opened in a new tab — which is why the
     * export endpoints are GET and not a POST returning a blob.
     */
    workOrdersExportUrl: (params?: {
        status?: string;
        category?: string;
        priority?: string;
        propertyId?: string;
        open?: string;
        search?: string;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const search = query.toString();
        return `${API_BASE_URL}/maintenance/work-orders/export${search ? `?${search}` : ''}`;
    },

    /** Who can be dispatched, with their live workload. */
    technicians: () =>
        api.get<MaintenanceTechnician[]>('/maintenance/work-orders/technicians'),

    createWorkOrder: (data: {
        title: string;
        description: string;
        category: string;
        priority?: string;
        propertyId?: string;
        unitId?: string;
        tenantId?: string;
        assetId?: string;
        accessInstructions?: string;
        estimatedCost?: number;
        scheduledFor?: string;
        assignedTechnicianId?: string;
    }) => api.post<WorkOrder>('/maintenance/work-orders', data),

    /** Descriptive fields only — the API has no status field here by design. */
    updateWorkOrder: (
        id: string,
        data: {
            title?: string;
            description?: string;
            category?: string;
            priority?: string;
            propertyId?: string;
            unitId?: string;
            assetId?: string;
            accessInstructions?: string;
            estimatedCost?: number;
            scheduledFor?: string;
        },
    ) => api.patch<WorkOrder>(`/maintenance/work-orders/${id}`, data),

    deleteWorkOrder: (id: string) =>
        api.delete<{ message: string }>(`/maintenance/work-orders/${id}`),

    inspectWorkOrder: (id: string, data: { inspectionNote: string; estimatedCost?: number }) =>
        api.post<WorkOrder>(`/maintenance/work-orders/${id}/inspect`, data),

    /** The direct approve-and-dispatch path, with no approval policy involved. */
    approveWorkOrder: (
        id: string,
        data: { technicianId: string; scheduledFor?: string; note?: string },
    ) => api.post<WorkOrder>(`/maintenance/work-orders/${id}/approve`, data),

    /** Routes through the approval engine. Auto-approves if no policy exists. */
    requestWorkOrderApproval: (id: string) =>
        api.post<{ approval: WorkflowInstance; workOrder: WorkOrder }>(
            `/maintenance/work-orders/${id}/request-approval`,
        ),

    assignWorkOrder: (id: string, data: { technicianId: string; scheduledFor?: string }) =>
        api.post<WorkOrder>(`/maintenance/work-orders/${id}/assign`, data),

    reassignWorkOrder: (id: string, technicianId: string) =>
        api.post<WorkOrder>(`/maintenance/work-orders/${id}/reassign`, { technicianId }),

    startWorkOrder: (id: string) =>
        api.post<WorkOrder>(`/maintenance/work-orders/${id}/start`),

    completeWorkOrder: (id: string, data: { resolutionNote: string; actualCost?: number }) =>
        api.post<WorkOrder>(`/maintenance/work-orders/${id}/complete`, data),

    closeWorkOrder: (id: string) =>
        api.post<WorkOrder>(`/maintenance/work-orders/${id}/close`),

    cancelWorkOrder: (id: string, reason: string) =>
        api.post<WorkOrder>(`/maintenance/work-orders/${id}/cancel`, { reason }),

    /** Per-row outcomes: some rows are refused and some are not. */
    bulkAssignWorkOrders: (data: {
        workOrderIds: string[];
        technicianId: string;
        scheduledFor?: string;
    }) =>
        api.post<{ assigned: number; failed: number; results: { id: string; ok: boolean; reason?: string }[] }>(
            '/maintenance/work-orders/bulk-assign',
            data,
        ),

    addWorkOrderTask: (id: string, description: string) =>
        api.post<WorkOrderTask>(`/maintenance/work-orders/${id}/tasks`, { description }),

    setWorkOrderTaskDone: (id: string, taskId: string, isDone: boolean) =>
        api.patch<WorkOrderTask>(`/maintenance/work-orders/${id}/tasks/${taskId}`, { isDone }),

deleteWorkOrderTask: (id: string, taskId: string) =>
        api.delete<{ message: string }>(`/maintenance/work-orders/${id}/tasks/${taskId}`),

    // ── Material, Module 11 ────────────────────────────────────────────────
    /**
     * What this job consumed, net of anything put back, plus every movement.
     *
     * On the maintenance route rather than under `/inventory` because that is
     * where the endpoint lives — maintenance owns the work order, inventory owns
     * the shelf, and this call asks the module that owns the job to report against
     * the ledger it does not own.
     */
    workOrderMaterials: (id: string) =>
        api.get<WorkOrderMaterials>(`/maintenance/work-orders/${id}/materials`),

    /** Refused by the backend when the store cannot cover the quantity. */
    issueWorkOrderStock: (
        id: string,
        data: {
            lines: {
                inventoryItemId: string;
                warehouseId: string;
                quantity: number;
                notes?: string;
            }[];
            notes?: string;
        },
    ) =>
        api.post<{ workOrderId: string; issued: number; movements: StockMovementRow[] }>(
            `/maintenance/work-orders/${id}/materials`,
            data,
        ),

    /**
     * Put material back, by naming the **original issue** being undone — so the
     * ledger keeps both rows and a reader can see what went out and what came
     * back. A reverse entered as fresh numbers would leave the original issue on
     * the record as though it were still true.
     */
    returnWorkOrderStock: (id: string, data: { movementIds: string[] }) =>
        api.post<{ workOrderId: string; returned: number; movements: StockMovementRow[] }>(
            `/maintenance/work-orders/${id}/materials/return`,
            data,
        ),

    // ── Asset register ─────────────────────────────────────────────────────
    assets: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<Asset[]>('/maintenance/assets', { params }),

    asset: (id: string) => api.get<AssetDetail>(`/maintenance/assets/${id}`),

    assetStats: () => api.get<AssetStats>('/maintenance/assets/stats'),

    assetsExportUrl: (params?: {
        type?: string;
        status?: string;
        propertyId?: string;
        search?: string;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const search = query.toString();
        return `${API_BASE_URL}/maintenance/assets/export${search ? `?${search}` : ''}`;
    },

    createAsset: (data: Record<string, string | number | undefined>) =>
        api.post<Asset>('/maintenance/assets', data),

    updateAsset: (id: string, data: Record<string, string | number | null | undefined>) =>
        api.patch<Asset>(`/maintenance/assets/${id}`, data),

    changeAssetStatus: (id: string, status: string) =>
        api.post<Asset>(`/maintenance/assets/${id}/status`, { status }),

    deleteAsset: (id: string) =>
        api.delete<{ message: string }>(`/maintenance/assets/${id}`),

    // ── Preventive maintenance ──────────────────────────────────────────────
    pmSchedules: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<PmSchedule[]>('/maintenance/pm-schedules', { params }),

    pmSchedule: (id: string) => api.get<PmSchedule>(`/maintenance/pm-schedules/${id}`),

    pmStats: () =>
        api.get<{ active: number; overdue: number; dueThisWeek: number }>(
            '/maintenance/pm-schedules/stats',
        ),

    pmRuns: () => api.get<PmRun[]>('/maintenance/pm-schedules/runs'),

    createPmSchedule: (data: Record<string, string | number | string[] | undefined>) =>
        api.post<PmSchedule>('/maintenance/pm-schedules', data),

    updatePmSchedule: (
        id: string,
        data: Record<string, string | number | boolean | string[] | undefined>,
    ) => api.patch<PmSchedule>(`/maintenance/pm-schedules/${id}`, data),

    deletePmSchedule: (id: string) =>
        api.delete<{ message: string }>(`/maintenance/pm-schedules/${id}`),

    /** Raise one schedule's work order now. Refused if it is not due yet. */
    runPmSchedule: (id: string) =>
        api.post<{ created: boolean; id?: string; reference?: string }>(
            `/maintenance/pm-schedules/${id}/run`,
        ),

    /** The daily sweep, by hand. Idempotent, so a missed day is recoverable. */
    runDuePmSchedules: () =>
        api.post<PmRun>('/maintenance/pm-schedules/run-due'),

    // ── Resident portal ─────────────────────────────────────────────────────
    portalWorkOrders: () => api.get<PortalWorkOrder[]>('/portal/maintenance'),

    reportIssue: (data: {
        title: string;
        description: string;
        category: string;
        priority?: string;
        accessInstructions?: string;
    }) => api.post<PortalWorkOrder>('/portal/maintenance', data),

withdrawIssue: (id: string) =>
        api.post<PortalWorkOrder>(`/portal/maintenance/${id}/withdraw`),
};

/**
 * Module 10 — Procurement.
 *
 * Four things are deliberately four objects rather than one: a purchase request,
 * a quotation round, a purchase order and a supplier are four documents with
 * four different owners, and merging them into one `procurementApi` would make
 * "which permission does this button need" unanswerable from the client.
 *
 * As in the maintenance module, every state change is its own method rather than
 * a generic `update(status)`: the API refuses an illegal transition with a
 * message written for the person who pressed the button, so the client should
 * not be able to ask for one. Which buttons a row offers comes from the
 * record's `availableActions`, computed server-side — the two cannot drift.
 *
 * Suppliers appear here too, but only for what procurement adds to them
 * (performance figures, contract window). Creating and editing a supplier is
 * `payablesApi`'s job, so there is one supplier record and one code sequence.
 */
export const procurementApi = {
    // ── Purchase requests ───────────────────────────────────────────────────
    purchaseRequests: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<PurchaseRequest[]>('/procurement/purchase-requests', { params }),

    purchaseRequest: (id: string) =>
        api.get<PurchaseRequest>(`/procurement/purchase-requests/${id}`),

    purchaseRequestStats: () =>
        api.get<PurchaseRequestStats>('/procurement/purchase-requests/stats'),

    purchaseRequestsExportUrl: (params?: {
        status?: string;
        category?: string;
        open?: string;
        search?: string;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const search = query.toString();
        return `${API_BASE_URL}/procurement/purchase-requests/export${search ? `?${search}` : ''}`;
    },

    /**
     * `lines` is required: a request with nothing on it cannot be quoted for,
     * so the API refuses to create one. `saveAsDraft` keeps it out of the
     * approval inbox until the line prices are right.
     */
    createPurchaseRequest: (data: {
        title: string;
        description?: string;
        category: string;
        priority?: string;
        department?: string;
        neededBy?: string;
        estimatedAmount?: number;
        lines: { description: string; specification?: string; quantity?: number; unitPrice?: number }[];
        saveAsDraft?: boolean;
    }) => api.post<PurchaseRequest>('/procurement/purchase-requests', data),

    /** Descriptive fields only — there is no status here by design. */
    updatePurchaseRequest: (
        id: string,
        data: {
            title?: string;
            description?: string;
            category?: string;
            priority?: string;
            department?: string;
            neededBy?: string | null;
            estimatedAmount?: number;
        },
    ) => api.patch<PurchaseRequest>(`/procurement/purchase-requests/${id}`, data),

    /** Replaces the whole line set; only a draft or reopened request accepts it. */
    replacePurchaseRequestLines: (
        id: string,
        lines: PurchaseRequestLine[] | { description: string; quantity?: number; unitPrice?: number }[],
    ) => api.put<PurchaseRequest>(`/procurement/purchase-requests/${id}/lines`, { lines }),

    deletePurchaseRequest: (id: string) =>
        api.delete<{ message: string }>(`/procurement/purchase-requests/${id}`),

    submitPurchaseRequest: (id: string, note?: string) =>
        api.post<PurchaseRequest>(`/procurement/purchase-requests/${id}/submit`, { note }),

    /** The direct path, with no approval policy involved. */
    approvePurchaseRequest: (id: string, note?: string) =>
        api.post<PurchaseRequest>(`/procurement/purchase-requests/${id}/approve`, { note }),

    /**
     * Routes through the approval engine. Auto-approves where no
     * PURCHASE_REQUEST policy is configured; otherwise the request stays PENDING
     * until the last approver decides.
     */
    requestPurchaseRequestApproval: (id: string) =>
        api.post<{ approval: WorkflowInstance; request: PurchaseRequest }>(
            `/procurement/purchase-requests/${id}/request-approval`,
        ),

    rejectPurchaseRequest: (id: string, reason: string) =>
        api.post<PurchaseRequest>(`/procurement/purchase-requests/${id}/reject`, { reason }),

    cancelPurchaseRequest: (id: string, reason: string) =>
        api.post<PurchaseRequest>(`/procurement/purchase-requests/${id}/cancel`, { reason }),

    reopenPurchaseRequest: (id: string) =>
        api.post<PurchaseRequest>(`/procurement/purchase-requests/${id}/reopen`),

    // ── RFQs and quotations ─────────────────────────────────────────────────
    rfqs: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<Rfq[]>('/procurement/rfqs', { params }),

    rfq: (id: string) => api.get<Rfq>(`/procurement/rfqs/${id}`),

    rfqStats: () => api.get<RfqStats>('/procurement/rfqs/stats'),

    /** The bid comparison, computed server-side from the quotations' own lines. */
    rfqComparison: (id: string) =>
        api.get<QuoteComparison>(`/procurement/rfqs/${id}/comparison`),

    createRfq: (data: {
        title: string;
        notes?: string;
        purchaseRequestId?: string;
        quotesDueAt?: string;
        currency?: string;
        supplierIds?: string[];
    }) => api.post<Rfq>('/procurement/rfqs', data),

    inviteSuppliers: (id: string, supplierIds: string[], notes?: string) =>
        api.post<Rfq>(`/procurement/rfqs/${id}/invite`, { supplierIds, notes }),

    /** One quotation per supplier per round; a resubmission replaces the last. */
    recordQuote: (
        id: string,
        data: {
            supplierId: string;
            lines: { description: string; quantity: number; unitPrice: number; purchaseRequestLineId?: string }[];
            leadTimeDays?: number;
            validUntil?: string;
            notes?: string;
            taxInclusive?: boolean;
        },
    ) => api.post<{ quote: RfqQuote; rfq: Rfq }>(`/procurement/rfqs/${id}/quotes`, data),

    declineInvitation: (id: string, supplierId: string, reason: string) =>
        api.post<Rfq>(`/procurement/rfqs/${id}/invitations/${supplierId}/decline`, { reason }),

    issueRfq: (id: string) => api.post<Rfq>(`/procurement/rfqs/${id}/issue`),

    /** Close the round without awarding it. No reason — no supplier is told. */
    closeRfq: (id: string) => api.post<Rfq>(`/procurement/rfqs/${id}/close`),

    reopenRfq: (id: string) => api.post<Rfq>(`/procurement/rfqs/${id}/reopen`),

    awardQuote: (id: string, quoteId: string, note?: string) =>
        api.post<Rfq>(`/procurement/rfqs/${id}/award`, { quoteId, note }),

    cancelRfq: (id: string, reason: string) =>
        api.post<Rfq>(`/procurement/rfqs/${id}/cancel`, { reason }),

    setQuoteStatus: (id: string, quoteId: string, status: string) =>
        api.patch<Rfq>(`/procurement/rfqs/${id}/quotes/${quoteId}/status`, { status }),

    /** The rounds one supplier was invited to — their own view of the RFQ. */
    supplierInvitations: (supplierId: string) =>
        api.get<RfqInvitation[]>(`/procurement/rfqs/supplier/${supplierId}`),

    // ── Purchase orders ─────────────────────────────────────────────────────
    purchaseOrders: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<PurchaseOrder[]>('/procurement/purchase-orders', { params }),

    purchaseOrder: (id: string) =>
        api.get<PurchaseOrder>(`/procurement/purchase-orders/${id}`),

    purchaseOrderStats: () =>
        api.get<PurchaseOrderStats>('/procurement/purchase-orders/stats'),

    purchaseOrdersExportUrl: (params?: {
        status?: string;
        supplierId?: string;
        open?: string;
        overdue?: string;
        search?: string;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const search = query.toString();
        return `${API_BASE_URL}/procurement/purchase-orders/export${search ? `?${search}` : ''}`;
    },

    /**
     * Either `quoteId` (lines and category come from the awarded quotation) or
     * `lines` with a `category`. The API refuses an order with neither, rather
     * than writing an order nobody can compare against a quotation.
     */
    createPurchaseOrder: (data: {
        supplierId: string;
        category?: string;
        lines?: {
            description: string;
            specification?: string;
            quantity: number;
            unitPrice: number;
            purchaseRequestLineId?: string;
        }[];
        quoteId?: string;
        purchaseRequestId?: string;
        rfqId?: string;
        currency?: string;
        taxAmount?: number;
        expectedDelivery?: string;
        deliveryAddress?: string;
        terms?: string;
        notes?: string;
    }) => api.post<PurchaseOrder>('/procurement/purchase-orders', data),

    updatePurchaseOrder: (
        id: string,
        data: { expectedDelivery?: string | null; deliveryAddress?: string; terms?: string; notes?: string },
    ) => api.patch<PurchaseOrder>(`/procurement/purchase-orders/${id}`, data),

    replacePurchaseOrderLines: (
        id: string,
        lines: { description: string; quantity: number; unitPrice: number }[],
    ) => api.put<PurchaseOrder>(`/procurement/purchase-orders/${id}/lines`, { lines }),

    deletePurchaseOrder: (id: string) =>
        api.delete<{ message: string }>(`/procurement/purchase-orders/${id}`),

    sendPurchaseOrder: (id: string) =>
        api.post<PurchaseOrder>(`/procurement/purchase-orders/${id}/send`),

    acceptPurchaseOrder: (id: string) =>
        api.post<PurchaseOrder>(`/procurement/purchase-orders/${id}/accept`),

    /**
     * Record goods arriving. The API decides whether this finishes the order or
     * leaves it part-received, from the receipts — not the caller.
     */
    receivePurchaseOrder: (
        id: string,
        data: {
            lines: { purchaseOrderLineId: string; quantity: number }[];
            receivedAt?: string;
            deliveryNote?: string;
            conditionNote?: string;
        },
    ) =>
        api.post<{ receipt: unknown; order: PurchaseOrder }>(
            `/procurement/purchase-orders/${id}/receive`,
            data,
        ),

    closePurchaseOrder: (id: string) =>
        api.post<PurchaseOrder>(`/procurement/purchase-orders/${id}/close`),

    cancelPurchaseOrder: (id: string, reason: string) =>
        api.post<PurchaseOrder>(`/procurement/purchase-orders/${id}/cancel`, { reason }),

    /**
     * Hands the order to finance as a real supplier bill — priced by the tax
     * engine, posted to the ledger. Needs `payables.create` as well.
     */
    createBillFromPurchaseOrder: (
        id: string,
        data?: { supplierReference?: string; billDate?: string; amount?: number },
    ) =>
        api.post<{ bill: SupplierBill; order: PurchaseOrder }>(
            `/procurement/purchase-orders/${id}/create-bill`,
            data ?? {},
        ),

    /** What has arrived and still needs booking onto a shelf. Module 11 answers
     *  this properly now, so the answer is a list of decisions rather than an
     *  apology — see the `StockInNotice` on the purchase order's page. */
    pendingStockIn: (id: string) =>
        api.get<StockInStatus>(`/procurement/purchase-orders/${id}/stock-in`),

    // ── Suppliers, from procurement's side ──────────────────────────────────
    /** The same rows `payablesApi.suppliers` returns, plus performance figures. */
    suppliers: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<ProcurementSupplier[]>('/procurement/suppliers', { params }),

    supplier: (id: string) =>
        api.get<ProcurementSupplier>(`/procurement/suppliers/${id}`),

    /** Spend per supplier over a period — "who are we actually buying from". */
    supplierSpend: (params?: { from?: string; to?: string }) =>
        api.get<SupplierSpendRow[]>('/procurement/suppliers/spend', { params }),

    /** Procurement fields only: category, rating, contract window, status. */
    updateSupplierProcurement: (
        id: string,
        data: {
            category?: string;
            rating?: number;
            contractStartDate?: string | null;
            contractEndDate?: string | null;
            contractReference?: string;
            status?: string;
        },
    ) => api.patch<ProcurementSupplier>(`/procurement/suppliers/${id}`, data),
};

/**
 * Module 11 — Inventory.
 *
 * Note what is *not* in here, because the absence is the design: there is no
 * "set the quantity" call. A stock level is the sum of the movements, so the only
 * way to change one is to record a movement — opening, adjustment, transfer,
 * stock take, goods received or an issue to a job. Anything else would be a
 * second writer for a number that must agree with the ledger.
 */
export const inventoryApi = {
    // ── Items ────────────────────────────────────────────────────────────────
    /** Rows arrive with `totalQuantity`, `status` and `reorder` already derived. */
    items: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<InventoryItemRow[]>('/inventory/items', { params }),

    item: (id: string) => api.get<InventoryItemDetail>(`/inventory/items/${id}`),

    itemStats: () => api.get<InventoryStats>('/inventory/items/stats'),

    /** What to order, worst first. Ordered by shortfall, not by name. */
    reorderList: () => api.get<InventoryItemRow[]>('/inventory/items/reorder-list'),

    itemsExportUrl: (params?: { category?: string; status?: string; search?: string }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const search = query.toString();
        return `${API_BASE_URL}/inventory/items/export${search ? `?${search}` : ''}`;
    },

    /**
     * Note there is no `quantity` here. An item is created empty; stock is put on
     * it with an `OPENING` movement, which keeps one writer for the balance.
     */
    createItem: (data: {
        sku: string;
        name: string;
        description?: string;
        category?: string;
        unitOfMeasure?: string;
        unitCost?: number;
        reorderLevel?: number;
        reorderQuantity?: number;
        preferredSupplierId?: string;
        notes?: string;
    }) => api.post<InventoryItemDetail>('/inventory/items', data),

    updateItem: (
        id: string,
        data: {
            sku?: string;
            name?: string;
            description?: string;
            category?: string;
            unitOfMeasure?: string;
            unitCost?: number | null;
            reorderLevel?: number;
            reorderQuantity?: number | null;
            preferredSupplierId?: string | null;
            notes?: string;
            /** Retiring keeps the movements; deleting would take the balance with
             *  them, so the API refuses once there are any. */
            isActive?: boolean;
        },
    ) => api.patch<InventoryItemDetail>(`/inventory/items/${id}`, data),

    /** 409s once the item has any movements against it. */
    deleteItem: (id: string) =>
        api.delete<{ message: string }>(`/inventory/items/${id}`),

    // ── Stores ───────────────────────────────────────────────────────────────
    warehouses: (params?: { includeInactive?: string }) =>
        api.get<WarehouseRow[]>('/inventory/warehouses', { params }),

    warehouse: (id: string) => api.get<WarehouseDetail>(`/inventory/warehouses/${id}`),

    warehousesExportUrl: () => `${API_BASE_URL}/inventory/warehouses/export`,

    createWarehouse: (data: {
        code: string;
        name: string;
        address?: string;
        phone?: string;
        isDefault?: boolean;
        notes?: string;
    }) => api.post<WarehouseDetail>('/inventory/warehouses', data),

    /** Setting `isDefault` demotes the previous one rather than refusing. */
    updateWarehouse: (
        id: string,
        data: {
            code?: string;
            name?: string;
            address?: string;
            phone?: string;
            isDefault?: boolean;
            notes?: string;
            isActive?: boolean;
        },
    ) => api.patch<WarehouseDetail>(`/inventory/warehouses/${id}`, data),

    /** 409s once the store has any movements against it. */
    deleteWarehouse: (id: string) =>
        api.delete<{ message: string }>(`/inventory/warehouses/${id}`),

    // ── The ledger ───────────────────────────────────────────────────────────
    /** Rows carry `balanceAfter`: the level as of that movement, not today's. */
    movements: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<StockMovementRow[]>('/inventory/stock-movements', { params }),

    movement: (id: string) => api.get<StockMovementRow>(`/inventory/stock-movements/${id}`),

    movementStats: () => api.get<StockMovementStats>('/inventory/stock-movements/stats'),

    movementsExportUrl: (params?: {
        itemId?: string;
        warehouseId?: string;
        type?: string;
        direction?: string;
        from?: string;
        to?: string;
        search?: string;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const search = query.toString();
        return `${API_BASE_URL}/inventory/stock-movements/export${search ? `?${search}` : ''}`;
    },

    /**
     * A movement a person records by hand.
     *
     * `quantity` is **positive** and `direction` says which way it goes. The sign
     * is never taken from the client: a goods receipt booked as -5 is not a
     * refund, it is a goods receipt that quietly subtracts from the shelf.
     */
    recordMovement: (data: {
        itemId: string;
        warehouseId: string;
        type: 'OPENING' | 'ADJUSTMENT' | 'RETURN';
        quantity: number;
        direction?: 'IN' | 'OUT';
        reason?: string;
        unitCost?: number;
        notes?: string;
    }) => api.post<StockMovementRow>('/inventory/stock-movements', data),

    /**
     * Two rows, one transfer group. Never one — the service writes the negative
     * half out of the source and the positive half into the destination, in one
     * transaction, or refuses the whole thing.
     */
    transferStock: (data: {
        fromWarehouseId: string;
        toWarehouseId: string;
        lines: { itemId: string; quantity: number }[];
        notes?: string;
    }) =>
        api.post<{
            transferGroup: string;
            from: { id: string; name: string; code: string };
            to: { id: string; name: string; code: string };
            lines: {
                itemId: string;
                description: string;
                quantity: number;
                balanceBefore: number;
                balanceAfter: number;
            }[];
            movements: StockMovementRow[];
        }>('/inventory/stock-movements/transfer', data),

    /**
     * The caller states what it **counted**, and the service derives the variance.
     * That is the whole reason a stock take is worth more than an adjustment: it
     * is repeatable by somebody else, because it is a measurement rather than a
     * subtraction somebody had to get right.
     */
    recordStockTake: (data: {
        lines: { itemId: string; warehouseId?: string; quantity: number; reason?: string }[];
        notes?: string;
    }) =>
        api.post<{
            counted: number;
            variances: number;
            matched: number;
            adjustments: {
                itemId: string;
                itemLabel: string;
                warehouseId: string;
                warehouseLabel: string;
                counted: number;
                expected: number;
                difference: number;
            }[];
            movements: StockMovementRow[];
        }>('/inventory/stock-movements/stock-take', data),

    /**
     * Book goods received against a purchase order onto a shelf.
     *
     * The `{ goodsReceiptLineId, inventoryItemId, warehouseId }` triple is
     * explicit per line rather than guessed from a description: "6 × 20mm
     * compression coupling" only becomes SKU `PLMB-0042` when somebody holding
     * both documents says so.
     */
    bookStockIn: (data: {
        purchaseOrderId: string;
        lines: { goodsReceiptLineId: string; inventoryItemId: string; warehouseId: string }[];
        notes?: string;
    }) =>
        api.post<{
            purchaseOrderId: string;
            reference: string;
            booked: number;
            movements: number;
            lines: {
                goodsReceiptLineId: string;
                sku: string;
                itemName: string;
                warehouseName: string;
                quantity: number;
                unitCost: number;
                description: string;
            }[];
            pending: StockInStatus;
        }>('/inventory/stock-movements/book-in', data),

    /**
     * A receipt line that will never go on a shelf — a laptop, a printer, a desk.
     * Without this the pending list never empties, and the same line is raised as
     * a question every morning for the life of the order.
     */
    markNotStock: (goodsReceiptLineId: string) =>
        api.post<{ message: string; goodsReceiptLineId: string }>(
            '/inventory/stock-movements/not-stock',
            { goodsReceiptLineId },
        ),

    /**
     * The daily reorder sweep, on demand.
     *
     * Idempotent through the notification `dedupeKey`, so running it twice sends
     * nothing twice — which is what makes exposing it at all safe.
     */
    runReorderSweep: () =>
        api.post<{ organizations: number; sent: number }>(
            '/inventory/stock-movements/run-reorder-sweep',
        ),
};
// ═══════════════════════════════════════════════════════════════════════════
// Module 12 — HR & Payroll
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Two permission tiers, and the split is the security design rather than
 * tidiness — so it is worth knowing before wiring buttons:
 *
 * - `employees.view` is the **directory**: names, departments, job titles, start
 *   dates, and the fact that somebody is paid *in something*. Almost every role.
 * - `employees.compensation` is salaries, bank details and national identifiers.
 *   Three roles.
 *
 * The backend's `findAll` selects a fixed column list for the directory, so a
 * salary field cannot leak into it by accident. The UI's job is only to not
 * offer a compensation control to somebody who will get a 403.
 */
/**
 * Payloads named rather than derived.
 *
 * `Parameters<typeof hrApi.createEmployee>[0]` inside the object would make
 * `hrApi` reference its own initializer, which TypeScript resolves as `any` — and
 * a client typed `any` defeats the point of typing it at all.
 */
type EmployeePayload = {
    employeeNumber: string;
    firstName: string;
    lastName: string;
    preferredName?: string;
    preferredLocale?: string;
    department?: string;
    jobTitle?: string;
    employmentType?: string;
    hireDate: string;
    terminationDate?: string;
    basicSalary: number;
    salaryCurrency?: string;
    payFrequency?: string;
    periodsPerYear?: number;
    nationalId?: string;
    taxNumber?: string;
    socialSecurityNumber?: string;
    bankAccount?: string;
    bankName?: string;
    bankBranch?: string;
    bankCode?: string;
    address?: string;
    phone?: string;
    email?: string;
    leavePolicyId?: string;
    userId?: string;
};

type EmployeeComponentPayload = {
    payComponentId: string;
    percentage?: number;
    amount?: number;
    currency?: string;
};

type PayrollRulePayload = {
    code: string;
    name: string;
    description?: string;
    countryCode?: string;
    regionCode?: string;
    type?: string;
    base?: string;
    bearer?: string;
    ratePercent?: number;
    amount?: number;
    minimumBaseAmount?: number;
    maximumBaseAmount?: number;
    exemptBelowBaseAmount?: number;
    bands?: { upTo?: number | null; ratePercent?: number; amount?: number }[];
    periodMode?: string;
    periodsPerYear?: number;
    sortOrder?: number;
    ledgerAccountCode?: string;
    expenseAccountCode?: string;
    validFrom?: string;
    validTo?: string;
};

export const hrApi = {
    // ── Employees ──────────────────────────────────────────────────────────
    /**
     * The directory. Never includes a salary — that is a property of the
     * backend's query, not of this client.
     */
    employees: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<EmployeeRow[]>('/hr/employees', { params }),

    employee: (id: string) => api.get<EmployeeDetail>(`/hr/employees/${id}`),

    /** No salary aggregates on purpose: a dashboard total payroll cost is read by
     *  people with no business knowing it. */
    employeeStats: () => api.get<EmployeeStats>('/hr/employees/stats'),

    /** The directory, not the full record — an export leaves the building. */
    employeesExportUrl: () => `${API_BASE_URL}/hr/employees/export`,

    createEmployee: (data: EmployeePayload) =>
        api.post<EmployeeDetail>('/hr/employees', data),

    updateEmployee: (
        id: string,
        data: Partial<EmployeePayload> & { isActive?: boolean },
    ) => api.patch<EmployeeDetail>(`/hr/employees/${id}`, data),

    /**
     * Leaving is a date, not a delete. Payslips reference the employee row and a
     * payslip is a document somebody may need years later.
     */
    terminateEmployee: (id: string, terminationDate: string) =>
        api.post<{
            message: string;
            employeeId: string;
            terminationDate: string;
            /** Non-null when a payroll run is open over the leaving date. */
            openRun: { reference: string; periodEnd: string } | null;
        }>(`/hr/employees/${id}/terminate`, { terminationDate }),

    /** One-to-one: without it one person could be two employees, paid twice. */
    linkEmployeeUser: (id: string, userId: string | null) =>
        api.post<EmployeeDetail>(`/hr/employees/${id}/link-user`, { userId }),

    setEmployeeComponents: (
        id: string,
        components: EmployeeComponentPayload[],
    ) =>
        api.post<EmployeeDetail>(`/hr/employees/${id}/components`, { components }),

    /**
     * Would this leave request be granted? Read-only, and it takes an employee id
     * because this is the *manager* view — the self-service path below has no such
     * parameter at all.
     */
    previewLeave: (
        employeeId: string,
        params: { startDate: string; endDate: string; leaveType?: string },
    ) =>
        api.get<{
            allowed: boolean;
            workingDays: number;
            totalInYear: number;
            remaining: number;
            reason?: string;
        }>(`/hr/employees/${employeeId}/leave-preview`, { params }),

    // ── Leave ──────────────────────────────────────────────────────────────
    leaveRequests: (
        params?: Record<string, string | number | boolean | undefined>,
    ) => api.get<LeaveRequestRow[]>('/hr/leave', { params }),

    leaveRequest: (id: string) => api.get<LeaveRequestRow>(`/hr/leave/${id}`),

    /**
     * The working calendar, day by day, each non-working day saying whether it is
     * a weekend or a named public holiday. This is what answers "why does my
     * five-day request show as three?" without a support ticket.
     */
    leaveCalendar: (params?: { from?: string; to?: string }) =>
        api.get<LeaveCalendar>('/hr/leave/calendar', { params }),

    leaveBalances: () => api.get<LeaveBalanceRow[]>('/hr/leave/balances'),

    leavePolicies: () => api.get<LeavePolicyRow[]>('/hr/leave/policies'),

    holidays: () => api.get<HolidayRow[]>('/hr/leave/holidays'),

    leaveExportUrl: (params?: Record<string, string | undefined>) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const search = query.toString();
        return `${API_BASE_URL}/hr/leave/export${search ? `?${search}` : ''}`;
    },

    /**
     * File leave for somebody. `employeeId` is required *here* and is **ignored**
     * by `createSelfLeave` — which is why there are two methods and not one with an
     * optional id.
     */
    createLeave: (data: {
        employeeId: string;
        leaveType?: string;
        startDate: string;
        endDate: string;
        reason?: string;
    }) => api.post<LeaveRequestRow>('/hr/leave', data),

    /** By hand, for an organization with no approval workflow configured. */
    approveLeave: (id: string, note?: string) =>
        api.post<LeaveRequestRow>(`/hr/leave/${id}/approve`, { note }),

    rejectLeave: (id: string, note?: string) =>
        api.post<LeaveRequestRow>(`/hr/leave/${id}/reject`, { note }),

    /** The employee's own action. A rejected request cannot be cancelled. */
    cancelLeave: (id: string, note?: string) =>
        api.post<LeaveRequestRow>(`/hr/leave/${id}/cancel`, { note }),

    // ── Payroll rules ──────────────────────────────────────────────────────
    /**
     * Rules in force. Readable by anyone who can see a payslip — configuring a
     * rule you cannot see is not a thing anybody should have to do.
     */
    payrollRules: (params?: Record<string, string | undefined>) =>
        api.get<PayrollRuleRow[]>('/hr/payroll-rules', { params }),

    /**
     * Is this jurisdiction configured? Read this before running payroll: a
     * jurisdiction with no rules pays everybody, withholds nothing, and the run
     * reports success.
     */
    payrollRuleCoverage: () =>
        api.get<PayrollRuleCoverage>('/hr/payroll-rules/coverage'),

    payrollJurisdiction: () =>
        api.get<PayrollJurisdiction>('/hr/payroll-rules/jurisdiction'),

    payrollRule: (id: string) => api.get<PayrollRuleRow>(`/hr/payroll-rules/${id}`),

    /**
     * Run the engine over a hypothetical salary. Read-only, writes nothing, and
     * works for a jurisdiction the organization does not yet operate in — which is
     * how you plan a new country.
     */
    previewPayroll: (data: {
        gross: number;
        basic?: number;
        periodsPerYear?: number;
        countryCode?: string;
        regionCode?: string;
        at?: string;
    }) => api.post<PayrollRulePreview>('/hr/payroll-rules/preview', data),

    payrollRulesExportUrl: () => `${API_BASE_URL}/hr/payroll-rules/export`,

    /**
     * No `amount` for a percentage rule and no `ratePercent` for a fixed one —
     * the service refuses both, because a rule that computes to zero silently is
     * the failure this module most needs to prevent.
     */
    createPayrollRule: (data: PayrollRulePayload) =>
        api.post<PayrollRuleRow>('/hr/payroll-rules', data),

    /** Descriptive fields are free; money-moving fields are refused in force. */
    updatePayrollRule: (
        id: string,
        data: Partial<PayrollRulePayload> & { isActive?: boolean },
    ) => api.patch<PayrollRuleRow>(`/hr/payroll-rules/${id}`, data),

    /** Close a rule off, keeping the payslips that reference it. */
    retirePayrollRule: (id: string) =>
        api.post<PayrollRuleRow>(`/hr/payroll-rules/${id}/retire`),

    // ── Payroll runs ───────────────────────────────────────────────────────
    payrollRuns: (params?: Record<string, string | undefined>) =>
        api.get<PayrollRunRow[]>('/hr/payroll-runs', { params }),

    payrollRun: (id: string) =>
        api.get<PayrollRunDetail>(`/hr/payroll-runs/${id}`),

    payslip: (id: string) =>
        api.get<PayslipDetail>(`/hr/payroll-runs/payslips/${id}`),

    payrollRunsExportUrl: () => `${API_BASE_URL}/hr/payroll-runs/export`,

    /** `employeeIds` narrows the run; omit for every active employee. */
    createPayrollRun: (data: {
        reference: string;
        periodStart: string;
        periodEnd: string;
        payDate: string;
        currency?: string;
        employeeIds?: string[];
    }) => api.post<PayrollRunRow & { message: string }>('/hr/payroll-runs', data),

    /**
     * Replaces any previous calculation rather than adding to it — otherwise a
     * recalculation pays the difference twice.
     */
    calculatePayrollRun: (id: string) =>
        api.post<{
            run: PayrollRunRow;
            coverage: PayrollRuleCoverage;
            payslips: {
                employeeId: string;
                employeeNumber: string;
                name: string;
                totals: PayrollTotals;
                lines: PayslipLineRow[];
            }[];
            /** Not employed during the period, or paid in another currency. */
            skipped: {
                employeeId: string;
                employeeNumber: string;
                reason: string;
            }[];
            summary: {
                payslips: number;
                currency: string;
                gross: number;
                employeeDeductions: number;
                employerContributions: number;
                net: number;
            };
            warnings: { code: string; message: string }[];
            skippedWarning: string | null;
        }>(`/hr/payroll-runs/${id}/calculate`),

    /** Refuses while any payslip would pay nothing or less than nothing. */
    approvePayrollRun: (id: string) =>
        api.post<PayrollRunRow & { message: string }>(
            `/hr/payroll-runs/${id}/approve`,
        ),

    /** One journal entry for the whole run, through Module 7's service. */
    postPayrollRun: (id: string) =>
        api.post<PayrollRunRow & { entryNumber: string; message: string }>(
            `/hr/payroll-runs/${id}/post`,
        ),

    /** Requires the run to be posted first. */
    payPayrollRun: (id: string, paymentReference?: string) =>
        api.post<PayrollRunRow & { message: string }>(
            `/hr/payroll-runs/${id}/pay`,
            { paymentReference },
        ),

    voidPayrollRun: (id: string, reason: string) =>
        api.post<PayrollRunRow & { message: string }>(
            `/hr/payroll-runs/${id}/void`,
            { reason },
        ),

    /** A draft has nothing worth keeping; anything calculated is a document. */
    deletePayrollRun: (id: string) => api.delete<void>(`/hr/payroll-runs/${id}`),

    // ── Self-service ───────────────────────────────────────────────────────
    //
    // Every method below resolves the employee from the login. **There is no
    // employee id on any of them, and that is the feature** — there is no request
    // this client can make that names somebody else.
    //
    // `createSelfLeave` does accept the `employeeId` the shared DTO carries, and
    // the backend discards it. It is omitted from the type here so a developer
    // cannot wire a form field to it by accident.
    me: () => api.get<EmployeeSelf>('/hr/me'),

    myPayslips: () => api.get<PayslipRow[]>('/hr/me/payslips'),

    myPayslip: (id: string) => api.get<PayslipDetail>(`/hr/me/payslips/${id}`),

    myLeave: (params?: Record<string, string | undefined>) =>
        api.get<LeaveRequestRow[]>('/hr/me/leave', { params }),

    myLeaveBalance: () =>
        api.get<NonNullable<LeaveRequestRow['balance']>>('/hr/me/leave-balance'),

    createSelfLeave: (data: {
        leaveType?: string;
        startDate: string;
        endDate: string;
        reason?: string;
    }) => api.post<LeaveRequestRow & { note?: string }>('/hr/me/leave', data),

    cancelSelfLeave: (id: string, note?: string) =>
        api.post<LeaveRequestRow>(`/hr/me/leave/${id}/cancel`, { note }),
};

// ═══════════════════════════════════════════════════════════════════════════
// Module 13 — Facilities
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Three resources, deliberately three concerns rather than one object.
 *
 * A clubhouse diary, a gate log and a card register have three different owners and
 * three different sets of permissions — `facility_bookings.decide` is narrower than
 * `facility_bookings.create`, and `access_cards` is the most sensitive grant in the
 * product. Merging them into a single `facilitiesApi` would make "which permission
 * does this button need" unanswerable from the client, which is the same reason
 * procurement has four.
 *
 * As everywhere else in this file, **every state change is its own method** rather
 * than a generic `update(status)`: the API refuses an illegal transition with a
 * message written for the person who pressed the button, so the client should not be
 * able to ask for one. Which buttons a row offers comes from the record's
 * `availableActions`, computed server-side — the two cannot drift.
 *
 * Payloads named rather than derived: `Parameters<typeof facilitiesApi.createFacility>[0]`
 * inside the object would make `facilitiesApi` reference its own initializer, which
 * TypeScript resolves as `any` — and a client typed `any` defeats the point.
 */
type FacilityPayload = {
    name: string;
    kind?: string;
    description?: string;
    capacity?: number;
    /** `"HH:MM"` — converted to minutes-from-midnight by the backend. */
    opensAt?: string;
    closesAt?: string;
    slotMinutes?: number;
    maxAdvanceDays?: number;
    requiresApproval?: boolean;
    isBookable?: boolean;
    bookingFee?: number;
    bookingFeeCurrency?: string;
    notes?: string;
    isActive?: boolean;
};

type FacilityBookingPayload = {
    facilityId: string;
    startsAt: string;
    endsAt: string;
    contactId?: string;
    tenantId?: string;
    bookedForName?: string;
    bookedForPhone?: string;
    purpose?: string;
    attendeeCount?: number;
    /** Forces PENDING on a facility that does not require it. */
    requestApproval?: boolean;
};

type AccessCardPayload = {
    cardNumber?: string;
    type?: string;
    propertyId?: string;
    unitId?: string;
    facilityId?: string;
    userId?: string;
    tenantId?: string;
    contactId?: string;
    visitorId?: string;
    holderName?: string;
    expiresAt?: string;
    notes?: string;
};

export const facilitiesApi = {
    // ── The register ────────────────────────────────────────────────────────
    facilities: (
        params?: Record<string, string | number | boolean | undefined>,
    ) => api.get<FacilityRow[]>('/facilities', { params }),

    facility: (id: string) => api.get<FacilityDetail>(`/facilities/${id}`),

    facilitiesExportUrl: () => `${API_BASE_URL}/facilities/export`,

    /**
     * The diary.
     *
     * Slot-by-slot availability, which is what a booking screen needs and what a
     * list of bookings cannot answer: "when is the clubhouse free?" is a question
     * about *empty* slots.
     */
    facilityAvailability: (
        id: string,
        params?: { from?: string; to?: string; days?: number },
    ) => api.get<FacilityAvailability>(`/facilities/${id}/availability`, { params }),

    createFacility: (data: FacilityPayload, propertyId: string) =>
        api.post<FacilityDetail>(`/facilities?propertyId=${encodeURIComponent(propertyId)}`, data),

    updateFacility: (id: string, data: Partial<FacilityPayload>) =>
        api.patch<FacilityDetail>(`/facilities/${id}`, data),

    /**
     * Close a facility for a period.
     *
     * Refused when live bookings fall inside, and the message names them — the same
     * guard Module 6 uses for overlapping owner statements.
     */
    closeFacility: (
        id: string,
        data: { reason: string; startsAt: string; endsAt: string },
    ) => api.post<FacilityBlackoutRow>(`/facilities/${id}/close`, data),

    facilityBlackouts: (id: string) =>
        api.get<{ facilityId: string; blackouts: FacilityBlackoutRow[] }>(
            `/facilities/${id}/blackouts`,
        ),

    reopenFacility: (facilityId: string, blackoutId: string) =>
        api.delete<{ message: string }>(
            `/facilities/blackouts/${blackoutId}?facilityId=${encodeURIComponent(facilityId)}`,
        ),
};

export const facilityBookingsApi = {
    bookings: (
        params?: Record<string, string | number | boolean | undefined>,
    ) => api.get<FacilityBookingRow[]>('/facilities/bookings', { params }),

    booking: (id: string) => api.get<FacilityBookingRow>(`/facilities/bookings/${id}`),

    bookingsExportUrl: (params?: {
        facilityId?: string;
        status?: string;
        when?: string;
    }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const search = query.toString();
        return `${API_BASE_URL}/facilities/bookings/export${search ? `?${search}` : ''}`;
    },

    /**
     * Read-only, and it answers with the *same* `checkSlot` the create path uses —
     * so it cannot tell somebody the slot is free when the server is about to
     * refuse it.
     */
    previewBooking: (data: {
        facilityId: string;
        startsAt: string;
        endsAt: string;
    }) => api.post<FacilityBookingPreview>('/facilities/bookings/preview', data),

    createBooking: (data: FacilityBookingPayload) =>
        api.post<FacilityBookingRow>('/facilities/bookings', data),

    /** Descriptive fields only — there is no `status` here by design. */
    updateBooking: (
        id: string,
        data: {
            bookedForName?: string;
            bookedForPhone?: string;
            purpose?: string;
            attendeeCount?: number;
            contactId?: string;
            tenantId?: string;
        },
    ) => api.patch<FacilityBookingRow>(`/facilities/bookings/${id}`, data),

    /**
     * Move a booking. Its own action because this is the one edit that re-enters the
     * overlap check against a possibly-changed grid.
     */
    rescheduleBooking: (
        id: string,
        data: { startsAt: string; endsAt: string },
    ) => api.post<FacilityBookingRow>(`/facilities/bookings/${id}/reschedule`, data),

    approveBooking: (id: string, note?: string) =>
        api.post<FacilityBookingRow>(`/facilities/bookings/${id}/approve`, { note }),

    /** The note is **required** by the API — it is the only thing the booker reads. */
    rejectBooking: (id: string, note: string) =>
        api.post<FacilityBookingRow>(`/facilities/bookings/${id}/reject`, { note }),

    cancelBooking: (id: string, note: string) =>
        api.post<FacilityBookingRow>(`/facilities/bookings/${id}/cancel`, { note }),

    /** Undoing a cancellation is a correction, not a decision, so it needs no note. */
    reactivateBooking: (id: string) =>
        api.post<FacilityBookingRow>(`/facilities/bookings/${id}/reactivate`),

    /** Only valid once the slot has passed — it records that nobody came. */
    markBookingNoShow: (id: string) =>
        api.post<FacilityBookingRow>(`/facilities/bookings/${id}/no-show`),

    /** Per-row outcomes: some rows are refused and some are not. */
    bulkBookingAction: (data: {
        ids: string[];
        action: 'approve' | 'reject' | 'cancel';
        note?: string;
    }) =>
        api.post<{
            succeeded: number;
            failed: number;
            results: { id: string; ok: boolean; reason?: string }[];
            message: string;
        }>('/facilities/bookings/bulk', data),
};

/**
 * The gate.
 *
 * The narrowest permission in the product: the people in this log did not choose to
 * be recorded and have no other relationship with the organization.
 */
export const visitorsApi = {
    visitors: (
        params?: Record<string, string | number | boolean | undefined>,
    ) => api.get<VisitorRow[]>('/facilities/visitors', { params }),

    visitor: (id: string) => api.get<VisitorDetail>(`/facilities/visitors/${id}`),

    visitorsExportUrl: () => `${API_BASE_URL}/facilities/visitors/export`,

    createVisitor: (data: {
        firstName: string;
        lastName: string;
        phone?: string;
        email?: string;
        company?: string;
        idType?: string;
        idNumber?: string;
        contactId?: string;
        notes?: string;
    }) => api.post<VisitorDetail>('/facilities/visitors', data),

    updateVisitor: (
        id: string,
        data: Partial<{
            firstName: string;
            lastName: string;
            phone: string;
            email: string;
            company: string;
            idType: string;
            idNumber: string;
            contactId: string;
            notes: string;
            isActive: boolean;
        }>,
    ) => api.patch<VisitorDetail>(`/facilities/visitors/${id}`, data),

    /** The API refuses a bar with no reason, and refuses while they are on site. */
    barVisitor: (id: string, reason: string) =>
        api.post<VisitorDetail & { message: string }>(`/facilities/visitors/${id}/bar`, {
            reason,
        }),

    /** Keeps the original reason on the record — a history with a blank "why" is useless. */
    unbarVisitor: (id: string, note?: string) =>
        api.post<VisitorDetail & { message: string }>(
            `/facilities/visitors/${id}/unbar`,
            { note },
        ),

    // ── The visit log, at its own route ─────────────────────────────────────
    //
    // Separate from the visitor directory because they are different documents with
    // different rates of change: a visitor row changes when somebody joins the list,
    // a visit changes every time somebody arrives.

    /**
     * The gate book. `state` is a **derived** filter — `onsite`, `expected`,
     * `overdue` and `history` are comparisons against the clock.
     */
    visits: (params?: Record<string, string | number | boolean | undefined>) =>
        api.get<VisitorVisitRow[]>('/facilities/visits', { params }),

    visit: (id: string) => api.get<VisitorVisitRow>(`/facilities/visits/${id}`),

    visitsExportUrl: () => `${API_BASE_URL}/facilities/visits/export`,

    /** A **barred** visitor is refused outright, not accepted with a warning. */
    logArrival: (data: {
        visitorId: string;
        propertyId?: string;
        tenantId?: string;
        contactId?: string;
        userId?: string;
        hostName?: string;
        hostPhone?: string;
        purpose?: string;
        expectedAt?: string;
        expectedOutAt?: string;
        accessCardId?: string;
        notes?: string;
    }) => api.post<VisitorVisitRow>('/facilities/visits', data),

    checkIn: (id: string) => api.post<VisitorVisitRow>(`/facilities/visits/${id}/check-in`),

    checkOut: (id: string) => api.post<VisitorVisitRow>(`/facilities/visits/${id}/check-out`),

    /**
     * "Was this expected" and "did they arrive" are different questions: a contractor
     * booked for Thursday who never turns up has to be visible as a missed
     * appointment, which is only possible if the expectation is recorded first.
     */
    preApproveVisit: (id: string) =>
        api.post<VisitorVisitRow>(`/facilities/visits/${id}/pre-approve`),
};

export const accessCardsApi = {
    /**
     * The register.
     *
     * `?status=EXPIRED` filters on the **effective** status, so it also finds cards
     * whose date has passed while their column still says ACTIVE. That is what the
     * gate honours, and a filter that disagreed with it would hide live cards.
     */
    accessCards: (
        params?: Record<string, string | number | boolean | undefined>,
    ) => api.get<AccessCardRow[]>('/facilities/access-cards', { params }),

    accessCard: (id: string) => api.get<AccessCardRow>(`/facilities/access-cards/${id}`),

    accessCardsExportUrl: () => `${API_BASE_URL}/facilities/access-cards/export`,

    createAccessCard: (data: AccessCardPayload) =>
        api.post<AccessCardRow>('/facilities/access-cards', data),

    /** Holder name and expiry only. `type`, `status` and the target are not here. */
    updateAccessCard: (
        id: string,
        data: { holderName?: string; expiresAt?: string; notes?: string },
    ) => api.patch<AccessCardRow>(`/facilities/access-cards/${id}`, data),

    suspendCard: (id: string, note: string) =>
        api.post<AccessCardRow>(`/facilities/access-cards/${id}/suspend`, { note }),

    reactivateCard: (id: string, note?: string) =>
        api.post<AccessCardRow>(`/facilities/access-cards/${id}/reactivate`, { note }),

    /**
     * Terminal on purpose: a lost card has been in somebody else's pocket, so its
     * number is compromised and there is no `reactivate` from here.
     */
    markCardLost: (id: string, note: string) =>
        api.post<AccessCardRow>(`/facilities/access-cards/${id}/mark-lost`, { note }),

    /** The contractor whose visa ran out before the card did. */
    markCardExpired: (id: string, note?: string) =>
        api.post<AccessCardRow>(`/facilities/access-cards/${id}/mark-expired`, { note }),

    revokeCard: (id: string, note: string) =>
        api.post<AccessCardRow>(`/facilities/access-cards/${id}/revoke`, { note }),

    /** Records the chain; the lost card's own status does not change. */
    recordCardReplacement: (id: string, replacementCardId: string, note?: string) =>
        api.post<AccessCardRow>(`/facilities/access-cards/${id}/record-replacement`, {
            replacementCardId,
            note,
        }),
};

/**
 * Module 14 - utilities.
 *
 * Three clients rather than one, because the three resources have genuinely different
 * shapes of question: the register asks *what meters exist*, the ledger asks *what did
 * they read*, and billing asks *what did that cost*.
 *
 * The billing methods are two actions rather than one flag. `bill` prices a period
 * and stops; `billAndInvoice` raises the document. They fail independently, and
 * separating them is what makes a wrong figure correctable without a credit note.
 */
export const utilitiesApi = {
    // ── The meter register ────────────────────────────────────────────────────
    meters: (params?: {
        propertyId?: string;
        type?: UtilityType;
        scope?: MeterScope;
        unitId?: string;
        search?: string;
        status?: string;
    }) => api.get<UtilityMeterRow[]>('/utilities/meters', { params }),

    meter: (id: string) => api.get<UtilityMeterDetail>(`/utilities/meters/${id}`),

    metersExportUrl: (params?: { propertyId?: string; type?: UtilityType }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const qs = query.toString();
        return `${API_BASE_URL}/utilities/meters/export${qs ? `?${qs}` : ''}`;
    },

    createMeter: (data: UtilityMeterPayload) =>
        api.post<UtilityMeterRow>('/utilities/meters', data),

    updateMeter: (id: string, data: Partial<UtilityMeterPayload>) =>
        api.patch<UtilityMeterRow>(`/utilities/meters/${id}`, data),

    /**
     * Retire a meter. Named rather than a status field, and refused while a bulk
     * meter has priced-but-unbilled periods — retiring would leave the consumption
     * measured and nothing explaining what it cost.
     */
    retireMeter: (id: string) => api.post<UtilityMeterRow>(`/utilities/meters/${id}/retire`, {}),
};

export const meterReadingsApi = {
    readings: (params?: {
        meterId?: string;
        source?: MeterReadingSource;
        from?: string;
        to?: string;
    }) => api.get<MeterReadingRow[]>('/utilities/readings', { params }),

    readingsExportUrl: (params?: { meterId?: string; from?: string; to?: string }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const qs = query.toString();
        return `${API_BASE_URL}/utilities/readings/export${qs ? `?${qs}` : ''}`;
    },

    createReading: (data: CreateReadingPayload) =>
        api.post<MeterReadingRow>('/utilities/readings', data),

    /**
     * Bulk entry for an estate with one bulk meter feeding many units.
     *
     * Per-row outcomes rather than all-or-nothing: one mistyped meter number must not
     * discard the rest of the clipboard, and the caller needs to know which row to fix.
     */
    createReadingsBulk: (readings: CreateReadingPayload[]) =>
        api.post<BulkReadingResult>('/utilities/readings/bulk', { readings }),

    /**
     * Correct a reading. Refused once the reading has been billed, because the
     * invoice already carries the consumption derived from it.
     */
    updateReading: (id: string, data: Partial<CreateReadingPayload>) =>
        api.patch<MeterReadingRow>(`/utilities/readings/${id}`, data),
};

export const utilityRatesApi = {
    rates: (params?: { type?: UtilityType; meterId?: string; propertyId?: string; at?: string }) =>
        api.get<UtilityRateRow[]>('/utilities/rates', { params }),

    createRate: (data: UtilityRatePayload) =>
        api.post<UtilityRateRow>('/utilities/rates', data),

    /**
     * Supersede a tariff: close the current window and open its replacement.
     *
     * Deliberately not an `updateRate`. Changing a rate and stopping one applying from
     * a date are different intents with different consequences for invoices already
     * issued under it.
     */
    supersedeRate: (id: string, ratePerUnit: number, validTo: string, reason?: string) =>
        api.post<{ superseded: string; rate: UtilityRateRow }>(
            `/utilities/rates/${id}/supersede`,
            { ratePerUnit, validTo, reason },
        ),
};

export const utilityChargesApi = {
    charges: (params?: { unitId?: string; billingPeriod?: string; status?: string }) =>
        api.get<UtilityChargeRow[]>('/utilities/charges', { params }),

    chargesExportUrl: (params?: { unitId?: string; billingPeriod?: string; status?: string }) => {
        const query = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value) query.append(key, value);
        });
        const qs = query.toString();
        return `${API_BASE_URL}/utilities/charges/export${qs ? `?${qs}` : ''}`;
    },

    /** Price a period and stop. Nothing is asked of anybody. */
    billPeriod: (data: BillPeriodPayload) =>
        api.post<BillRunResult>('/utilities/charges/bill', data),

    /** The acceptance criterion: a reading in, a correctly-calculated invoice out. */
    billAndInvoice: (data: BillPeriodPayload) =>
        api.post<BillRunResult>('/utilities/charges/bill-and-invoice', data),

    /**
     * Write off a charge. A reason is required and kept — an unexplained write-off is
     * indistinguishable from an error three months later. Refused once the charge is
     * on an invoice, because cancelling that invoice is Finance's action.
     */
    voidCharge: (id: string, reason: string) =>
        api.post<UtilityChargeRow>(`/utilities/charges/${id}/void`, { reason }),
};
