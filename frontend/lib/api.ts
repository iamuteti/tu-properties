import axios from 'axios';
import { AuthResponse, Property, Unit, Tenant, RentalAgreement, Invoice, Payment, Organization, Landlord, CreateInvoiceData, CreatePaymentData, Receipt, PaginatedResponse, MoveOutRequest } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3003';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor to handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Handle unauthorized access - use Next.js router instead of window.location
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            // Dispatch event to trigger logout in auth context
            window.dispatchEvent(new CustomEvent('unauthorized'));
            console.warn('Unauthorized access - token cleared');
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
};

// Properties API
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
        const query = queryParams.toString();
        return api.get<PaginatedResponse<Property>>(`/properties${query ? `?${query}` : ''}`);
    },

    findOne: (id: string) =>
        api.get<Property>(`/properties/${id}`),

    update: (id: string, data: Partial<{ name: string; address: string; type: string }>) =>
        api.patch<Property>(`/properties/${id}`, data),

    remove: (id: string) =>
        api.delete(`/properties/${id}`),
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

// Units API
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
        const query = queryParams.toString();
        return api.get<PaginatedResponse<Unit>>(`/units${query ? `?${query}` : ''}`);
    },

    findOne: (id: string) =>
        api.get<Unit>(`/units/${id}`),

    update: (id: string, data: Partial<Unit>) =>
        api.patch<Unit>(`/units/${id}`, data),

    remove: (id: string) =>
        api.delete(`/units/${id}`),
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

export const billingApi = {
    // Invoices
    createInvoice: (data: CreateInvoiceData) =>
        api.post<Invoice>('/billing/invoices', data),

    findAllInvoices: () =>
        api.get<Invoice[]>('/billing/invoices'),

    findOneInvoice: (id: string) =>
        api.get<Invoice>(`/billing/invoices/${id}`),

    deleteInvoice: (id: string) =>
        api.delete(`/billing/invoices/${id}`),

    deleteInvoices: (ids: string[]) =>
        api.post('/billing/invoices/bulk-delete', { ids }),

    // Payments
    recordPayment: (data: { invoiceId: string; amount: number; paymentDate: string; method: string; reference?: string }) =>
        api.post<Payment>('/billing/payments', data),

    findAllPayments: () =>
        api.get<Payment[]>('/billing/payments'),

    // Get all rental agreements for customer selection
    findAllRentalAgreements: () =>
        api.get<RentalAgreement[]>('/billing/rental-agreements'),
};

// Finance API (new modular endpoints)
export const financeApi = {
    // Invoices
    createInvoice: (data: CreateInvoiceData) =>
        api.post<Invoice>('/finance/invoices', data),

    findAllInvoices: () =>
        api.get<Invoice[]>('/finance/invoices'),

    findOneInvoice: (id: string) =>
        api.get<Invoice>(`/finance/invoices/${id}`),

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
    createReceipt: (data: Record<string, unknown>) =>
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