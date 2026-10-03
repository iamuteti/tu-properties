import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../modules/audit/audit.service';

/**
 * AuditInterceptor records every successful mutating request (POST/PUT/PATCH/DELETE)
 * against tenant data into the AuditLog table.
 *
 * It is intentionally defensive: a failure to write an audit entry must never
 * break the original request, so all audit errors are swallowed and logged.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const user = request.user;

    // Only audit authenticated requests with a known user.
    if (!user?.userId) {
      return next.handle();
    }

    const method = request.method;
    const isMutation =
      method === 'POST' ||
      method === 'PUT' ||
      method === 'PATCH' ||
      method === 'DELETE';
    if (!isMutation) {
      return next.handle();
    }

    const route = (request.route?.path as string) || request.url || '';
    const entity = this.entityFromRoute(route);
    const paramId = request.params?.id as string | undefined;

    return next.handle().pipe(
      tap({
        next: (result) => {
          const id = paramId || this.extractId(result);
          if (!id) return;
          this.auditService
            .logAction({
              user: { connect: { id: user.userId } },
              ...(user.organizationId
                ? { organization: { connect: { id: user.organizationId } } }
                : {}),
              action: this.actionFromMethod(method),
              entity,
              entityId: id,
              details: `${method} ${route}`,
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            })
            .catch((err) =>
              this.logger.warn('Audit write failed', err as Error),
            );
        },
      }),
    );
  }

  private actionFromMethod(method: string): string {
    switch (method) {
      case 'POST':
        return 'CREATE';
      case 'PUT':
      case 'PATCH':
        return 'UPDATE';
      case 'DELETE':
        return 'DELETE';
      default:
        return method;
    }
  }

  private entityFromRoute(route: string): string {
    const cleaned = route.replace(/^\/+/, '').split('?')[0];
    const parts = cleaned.split('/');
    let last = parts[parts.length - 1];
    if (!last || last === 'bulk-delete') {
      last = parts[parts.length - 2] || parts[parts.length - 1];
    }
    // Sub-resource routes: the audited entity is the collection, not the
    // sub-resource (/users/:id/roles → User, /organizations/me → Organization).
    if (last === 'roles' || last === 'me') {
      last = parts[parts.length - 3] || parts[parts.length - 2] || last;
    }
    return this.pascalize(last);
  }

  private extractId(result: any): string | undefined {
    if (!result || typeof result !== 'object') return undefined;
    if (result.id) return result.id;
    return undefined;
  }

  private pascalize(segment: string): string {
    if (!segment) return 'Unknown';
    const singular = segment.replace(/s$/, '');
    return singular.charAt(0).toUpperCase() + singular.slice(1);
  }
}
