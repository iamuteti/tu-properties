// Generate invoice number
export function generateInvoiceNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}-${random}`;
}

// Generate receipt number
export function generateReceiptNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `REC-${year}${month}-${random}`;
}

/**
 * Extract tenant ID from the request user object.
 * Returns undefined for SUPER_ADMIN users (they can access all data).
 * Returns the organizationId for regular users.
 * 
 * @param request - The request object containing the user
 * @returns The tenant ID (organizationId) or undefined
 */
export function getTenantId(request: any): string | undefined {
    const user = request?.user;
    if (!user) return undefined;
    // Super admins can access all data
    if (user.role === 'SUPER_ADMIN') return undefined;
    return user.organizationId || undefined;
}

/**
 * Type guard to check if user is a super admin
 */
export function isSuperAdmin(user: any): boolean {
    return user?.role === 'SUPER_ADMIN';
}