import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        
        // If no user, let other guards handle it
        if (!user) {
            return true;
        }
        
        // Super admins can access everything
        if (user.role === 'SUPER_ADMIN') {
            return true;
        }
        
        // For other users, they must have an organizationId
        // This guard ensures data is filtered by organizationId
        // but doesn't block access - the services will handle the filtering
        return true;
    }
}

/**
 * Guard that requires a user to belong to a tenant (non-super admins)
 */
@Injectable()
export class TenantRequiredGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        
        if (!user) {
            throw new ForbiddenException('Authentication required');
        }
        
        // Super admins don't need a tenant
        if (user.role === 'SUPER_ADMIN') {
            return true;
        }
        
        // Other users must have a tenant
        if (!user.organizationId) {
            throw new ForbiddenException('User must belong to an organization');
        }
        
        return true;
    }
}
