import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract the tenant ID from the request user
 * Usage: @Tenant() tenantId: string
 */
export const Tenant = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const user = request.user;
        
        // Return organizationId if available
        return user?.organizationId || null;
    },
);

/**
 * Decorator to extract the full user object
 * Usage: @CurrentUser() user: any
 */
export const CurrentUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    },
);

/**
 * Check if the user is a super admin
 */
export const IsSuperAdmin = (user: any): boolean => {
    return user?.role === 'SUPER_ADMIN';
};

/**
 * Check if user can access the given tenant
 */
export const CanAccessTenant = (user: any, tenantId: string | null): boolean => {
    // Super admins can access any tenant
    if (user?.role === 'SUPER_ADMIN') {
        return true;
    }
    
    // Non-super admins must have matching tenant
    return user?.organizationId === tenantId;
};
