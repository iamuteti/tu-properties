import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  getTenantId,
  isSuperAdmin,
  requireRecord,
  assertTenantRecord,
} from './utils';

/**
 * Tenant-isolation primitives — the guard rails every service relies on.
 * If these break, cross-tenant data leaks app-wide, so they get their own
 * spec alongside the auth + CRUD pattern specs.
 */
describe('tenant-scoping utils', () => {
  describe('getTenantId', () => {
    it('returns the organization id for a regular user', () => {
      expect(
        getTenantId({ user: { role: 'ADMIN', organizationId: 'org-1' } }),
      ).toBe('org-1');
    });

    it('returns undefined for SUPER_ADMIN (platform-wide access)', () => {
      expect(
        getTenantId({ user: { role: 'SUPER_ADMIN', organizationId: 'org-x' } }),
      ).toBeUndefined();
    });

    it('fails closed for a non-super-admin without an organization', () => {
      expect(() =>
        getTenantId({ user: { role: 'ADMIN', organizationId: null } }),
      ).toThrow(ForbiddenException);
    });

    it('fails closed when there is no user at all', () => {
      expect(() => getTenantId({})).toThrow(ForbiddenException);
    });
  });

  describe('isSuperAdmin', () => {
    it('only matches the SUPER_ADMIN role', () => {
      expect(isSuperAdmin({ role: 'SUPER_ADMIN' })).toBe(true);
      expect(isSuperAdmin({ role: 'ADMIN' })).toBe(false);
      expect(isSuperAdmin(undefined)).toBe(false);
    });
  });

  describe('requireRecord', () => {
    it('returns the record when found', async () => {
      await expect(
        requireRecord(Promise.resolve({ id: '1' }), 'Property'),
      ).resolves.toEqual({
        id: '1',
      });
    });

    it('throws a labeled 404 when the lookup is null', async () => {
      await expect(
        requireRecord(Promise.resolve(null), 'Property'),
      ).rejects.toThrow('Property not found');
    });

    it('throws a 404 when the lookup is undefined', async () => {
      await expect(
        requireRecord(Promise.resolve(undefined as any), 'Invoice'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertTenantRecord', () => {
    it('passes silently when the scoped record exists', async () => {
      const model = { findFirst: jest.fn().mockResolvedValue({ id: 'x' }) };
      await expect(
        assertTenantRecord(model as any, { id: 'x', organizationId: 'org-1' }),
      ).resolves.toBeUndefined();
      expect(model.findFirst).toHaveBeenCalledWith({
        where: { id: 'x', organizationId: 'org-1' },
        select: { id: true },
      });
    });

    it('throws 404 when the record is not in the caller organization', async () => {
      const model = { findFirst: jest.fn().mockResolvedValue(null) };
      await expect(
        assertTenantRecord(model as any, { id: 'x', organizationId: 'org-2' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
