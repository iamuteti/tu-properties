import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AgreementStatus } from '@prisma/client';
import { PortalService } from './portal.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * The portal is the module's security boundary: a resident must see their own
 * tenancy and nothing else, and staff must not be able to use it to look up an
 * arbitrary tenant. Every query is scoped by the *session's* `portalTenantId`,
 * which these tests pin — including the case where a client sends its own
 * tenantId in the query string (it must be ignored).
 */
describe('PortalService', () => {
  let service: PortalService;

  const portalSession = (tenantId = 'tenant-1') => ({
    user: { userId: 'user-1', email: 'resident@example.com', portalTenantId: tenantId },
  });
  const staffSession = { user: { userId: 'admin-1', email: 'a@x.co' } };

  const invoice = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'inv-1',
    invoiceNumber: 'INV-1',
    issueDate: new Date('2026-09-01'),
    dueDate: new Date('2026-10-01'),
    status: 'PENDING',
    amount: 45_000,
    paidAmount: 0,
    balanceAmount: 45_000,
    currency: 'KES',
    payments: [],
    ...over,
  });

  function mockPrisma() {
    return {
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          code: 'ROHI-T1',
          accountNumber: 'ACC-1',
          surname: 'Wanjiru',
          otherNames: 'Amina',
          email: 'amina@example.com',
          phone: '+254700000000',
          status: 'ACTIVE',
        }),
        findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
      rentalAgreement: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lease-1',
          code: 'RA-000001',
          status: AgreementStatus.ACTIVE,
          agreementType: 'RENTAL',
          rentAmount: 45_000,
          currency: 'KES',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
          termMonths: 12,
          paymentDay: 1,
          securityDeposit: 90_000,
          noticePeriodDays: 30,
          unit: {
            id: 'unit-1',
            name: 'Flat 12',
            bedrooms: 2,
            bathrooms: 2,
            areaSqFt: 900,
            property: { id: 'prop-1', name: 'Karen', code: 'PR-1', roadStreet: null, estateArea: null },
          },
        }),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([invoice()]),
      },
      receipt: { findMany: jest.fn().mockResolvedValue([]) },
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'doc-1',
          fileName: 'lease.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          version: 1,
          fileUrl: 'tenants/tenant-1/lease.pdf',
        }),
      },
    };
  }

  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [PortalService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PortalService);
  });

  describe('scope', () => {
    it('refuses a staff session outright', async () => {
      await expect(service.me(staffSession)).rejects.toThrow(ForbiddenException);
      await expect(service.invoices(staffSession)).rejects.toThrow(
        /tenant portal account/i,
      );
    });

    it('ignores a client-supplied tenantId and uses the session tenant', async () => {
      await service.invoices({
        ...portalSession(),
        query: { tenantId: 'someone-elses-tenant' },
      });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { rentalAgreement: { tenantId: 'tenant-1' } } }),
      );
    });

    it('404s for a tenant the session is not linked to', async () => {
      prisma.document.findFirst.mockResolvedValue(null);
      await expect(
        service.authorizeDocument('doc-x', portalSession()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('me', () => {
    it('returns only the signed-in tenant profile', async () => {
      const result = await service.me(portalSession());

      expect(result.user.email).toBe('resident@example.com');
      expect(result.tenant.code).toBe('ROHI-T1');
      expect(prisma.tenant.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tenant-1' } }),
      );
    });
  });

  describe('currentLease', () => {
    it('returns the active lease with its unit and money', async () => {
      const result = await service.currentLease(portalSession());

      expect(result.lease.code).toBe('RA-000001');
      expect(result.lease.unit.name).toBe('Flat 12');
      expect(result.money).toMatchObject({ invoiced: 45_000, paid: 0, outstanding: 45_000 });
    });

    it('tells a resident with no active lease that they have none', async () => {
      prisma.rentalAgreement.findFirst.mockResolvedValue(null);
      await expect(service.currentLease(portalSession())).rejects.toThrow(
        /do not have an active lease/i,
      );
    });
  });

  describe('money', () => {
    it('measures what is paid from the recorded payments, not the stored balance', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        invoice({
          amount: 45_000,
          // Finance never decrements this column (master doc issue 41) …
          balanceAmount: 45_000,
          // … the payment is what actually happened.
          payments: [{ amount: 45_000 }],
        }),
      ]);

      const result = await service.summary(portalSession());

      expect(result.money).toMatchObject({ paid: 45_000, outstanding: 0, arrears: 0 });
    });

    it('counts only overdue invoices as arrears', async () => {
      const overdue = new Date('2020-01-01');
      prisma.invoice.findMany.mockResolvedValue([
        invoice({ amount: 10_000, dueDate: overdue, payments: [] }),
        invoice({
          id: 'inv-2',
          invoiceNumber: 'INV-2',
          amount: 20_000,
          dueDate: new Date(Date.now() + 86_400_000 * 30),
          payments: [],
        }),
      ]);

      const result = await service.summary(portalSession());

      expect(result.money.arrears).toBe(10_000);
      expect(result.money.outstanding).toBe(30_000);
      // The next thing to pay is the overdue one, and it is flagged as overdue.
      expect(result.nextDue).toMatchObject({ invoiceNumber: 'INV-1', isOverdue: true });
    });

    it('reports days remaining on a fixed term', async () => {
      const result = await service.summary(portalSession());
      expect(typeof result.daysRemaining).toBe('number');
    });
  });

  describe('summary', () => {
    it('reports no lease rather than failing for a tenant without one', async () => {
      prisma.rentalAgreement.findFirst.mockResolvedValue(null);
      const result = await service.summary(portalSession());

      expect(result.hasLease).toBe(false);
      expect(result.money).toEqual({ invoiced: 0, paid: 0, outstanding: 0, arrears: 0 });
      expect(result.nextDue).toBeNull();
    });
  });

  describe('documents', () => {
    it('lists only documents filed against the signed-in tenant', async () => {
      await service.documents(portalSession());

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Tenant', entityId: 'tenant-1' },
        }),
      );
    });
  });
});