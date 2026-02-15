import axios from 'axios';
import { AuthResponse, Property, Unit, Tenant, Lease, Invoice, Payment, Organization } from '@/types';

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
            // Instead of window.location.href, let the auth context handle the redirect
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
    create: (data: { name: string; address: string; type: string }) =>
        api.post<Property>('/properties', data),

    findAll: () =>
        api.get<Property[]>('/properties'),

    findOne: (id: string) =>
        api.get<Property>(`/properties/${id}`),

    update: (id: string, data: Partial<{ name: string; address: string; type: string }>) =>
        api.patch<Property>(`/properties/${id}`, data),

    remove: (id: string) =>
        api.delete(`/properties/${id}`),
};

// Units API
export const unitsApi = {
    create: (data: { unitNumber: string; type: string; status: string; rentAmount: number; propertyId: string }) =>
        api.post<Unit>('/units', data),

    findAll: () =>
        api.get<Unit[]>('/units'),

    findOne: (id: string) =>
        api.get<Unit>(`/units/${id}`),

    update: (id: string, data: Partial<{ unitNumber: string; type: string; status: string; rentAmount: number; propertyId: string }>) =>
        api.patch<Unit>(`/units/${id}`, data),

    remove: (id: string) =>
        api.delete(`/units/${id}`),
};

// Tenants API
export const tenantsApi = {
    create: (data: { firstName: string; lastName: string; email: string; phoneNumber: string; status: string }) =>
        api.post<Tenant>('/tenants', data),

    findAll: () =>
        api.get<Tenant[]>('/tenants'),

    findOne: (id: string) =>
        api.get<Tenant>(`/tenants/${id}`),

    update: (id: string, data: Partial<{ firstName: string; lastName: string; email: string; phoneNumber: string; status: string }>) =>
        api.patch<Tenant>(`/tenants/${id}`, data),

    remove: (id: string) =>
        api.delete(`/tenants/${id}`),
};

// Leases API
export const leasesApi = {
    create: (data: { unitId: string; tenantId: string; startDate: string; endDate: string; rentAmount: number; status: string }) =>
        api.post<Lease>('/leases', data),

    findAll: () =>
        api.get<Lease[]>('/leases'),

    findOne: (id: string) =>
        api.get<Lease>(`/leases/${id}`),

    update: (id: string, data: Partial<{ unitId: string; tenantId: string; startDate: string; endDate: string; rentAmount: number; status: string }>) =>
        api.patch<Lease>(`/leases/${id}`, data),

    remove: (id: string) =>
        api.delete(`/leases/${id}`),
};

// Billing API
export const billingApi = {
    // Invoices
    createInvoice: (data: { leaseId: string; amount: number; dueDate: string; status: string; type: string }) =>
        api.post<Invoice>('/billing/invoices', data),

    findAllInvoices: () =>
        api.get<Invoice[]>('/billing/invoices'),

    findOneInvoice: (id: string) =>
        api.get<Invoice>(`/billing/invoices/${id}`),

    // Payments
    recordPayment: (data: { invoiceId: string; amount: number; paymentDate: string; method: string; reference?: string }) =>
        api.post<Payment>('/billing/payments', data),

    findAllPayments: () =>
        api.get<Payment[]>('/billing/payments'),
};