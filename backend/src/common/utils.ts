import { ForbiddenException, NotFoundException } from '@nestjs/common';

// Generate invoice number
export function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `INV-${year}${month}-${random}`;
}

// Generate receipt number
export function generateReceiptNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `REC-${year}${month}-${random}`;
}

/**
 * Extract tenant ID from the request user object.
 * Returns undefined only for SUPER_ADMIN users (they can access all data).
 * Throws for any other user without an organization — failing closed keeps a
 * user with a broken/missing org from reading unfiltered tenant data.
 *
 * @param request - The request object containing the user
 * @returns The tenant ID (organizationId), or undefined for super admins
 */
export function getTenantId(request: any): string | undefined {
  const user = request?.user;
  if (!user) {
    throw new ForbiddenException('No authenticated user on request');
  }
  // Super admins can access all data
  if (user.role === 'SUPER_ADMIN') return undefined;
  if (!user.organizationId) {
    throw new ForbiddenException(
      'User has no organization assigned; cannot access tenant data',
    );
  }
  return user.organizationId;
}

/**
 * Type guard to check if user is a super admin
 */
export function isSuperAdmin(user: any): boolean {
  return user?.role === 'SUPER_ADMIN';
}

/**
 * Extract the authenticated user's id from the request, for records that need
 * an actor (who logged this call, who converted this lead).
 * Returns `undefined` for super admins operating without a user context.
 */
export function getUserId(request: any): string | undefined {
  return request?.user?.id;
}

/**
 * Like `getTenantId`, but for endpoints that *cannot* operate without a tenant
 * (creating a record, or anything that must be written to exactly one
 * organization). Super admins have no `organizationId`, so they get a 403 with
 * an explanation instead of silently writing unscoped data.
 */
export function requireTenantId(request: any): string {
  const tenantId = getTenantId(request);
  if (!tenantId) {
    throw new ForbiddenException(
      'This action requires an organization. Switch to an organization-scoped user or pass the organization explicitly.',
    );
  }
  return tenantId;
}

/**
 * Assert that the record matching `where` exists, throwing 404 otherwise.
 *
 * Prisma `update`/`delete` require a *unique* where clause, so tenant-scoped
 * mutations cannot pass `{ id, organizationId }` directly. Instead, verify
 * ownership with a `findFirst` using the tenant-scoped where, then act on
 * the (now verified) `id` alone.
 */
export async function assertTenantRecord(
  model: { findFirst: (args: { where: any; select?: any }) => Promise<any> },
  where: any,
): Promise<void> {
  const record = await model.findFirst({ where, select: { id: true } });
  if (!record) {
    throw new NotFoundException('Record not found');
  }
}

/**
 * Await a Prisma lookup and turn a null result into a 404.
 *
 * Without this, a `findFirst` that matches nothing (genuinely missing record
 * OR a record belonging to another tenant) resolves to `null`, and NestJS
 * answers 200 with an empty body — leaking existence and breaking detail
 * pages. Use for every tenant-scoped read-by-id.
 */
export async function requireRecord<T>(
  lookup: Promise<T | null>,
  label = 'Record',
): Promise<T> {
  const record = await lookup;
  if (!record) {
    throw new NotFoundException(`${label} not found`);
  }
  return record;
}
