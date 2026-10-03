import axios from 'axios';
import { AuthResponse, User, Property, Unit, Tenant, RentalAgreement, Invoice, Payment, Organization, OrganizationProfileInput, Role, RoleAssignment, Branch, Document, LoginEvent, Landlord, CreateInvoiceData, CreatePaymentData, CreateReceiptData, DashboardStats, Receipt, PaginatedResponse, MoveOutRequest, PropertyAmenity, ImportReport, UnitStatus } from '@/types';

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

// Landlords API
export const landlordsApi = {
    create: (data: Partial<Landlord>) =>
        api.post<Landlord>('/landlords', data),

    findAll: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        status?: string;
    }) =>
        api.get<{ data: Landlord[]; meta: { total: number; page: number; limit: number; totalPages: number } }>('/landlords', { params }),

    findOne: (id: string) =>
        api.get<Landlord>(`/landlords/${id}`),

    update: (id: string, data: Partial<Landlord>) =>
        api.patch<Landlord>(`/landlords/${id}`, data),

    remove: (id: string) =>
        api.delete(`/landlords/${id}`),
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