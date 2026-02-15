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
    name: string;
    address: string;
    type: string;
    createdAt: string;
    updatedAt: string;
    _count?: {
        units: number;
    };
}

export interface Unit {
    id: string;
    unitNumber: string;
    type: string;
    status: string;
    rentAmount: number;
    propertyId: string;
    property?: Property;
    createdAt: string;
    updatedAt: string;
}

export interface Tenant {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    status: string;
    createdAt: string;
    updatedAt: string;
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
