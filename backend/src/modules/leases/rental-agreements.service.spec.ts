import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AgreementStatus } from '@prisma/client';
import { RentalAgreementsService } from './rental-agreements.service';
import { PrismaService } from '@/prisma/prisma.service';
import { UnitsService } from '@/modules/units/units.service';

/**
 * Lifecycle behaviour the service owns (the rules themselves are tested
 * separately in `lease-lifecycle.spec.ts`):
 *   1. one live lease per unit,
 *   2. renewal creates a successor and links both sides of the chain,
 *   3. termination records the reason, vacates the unit and deactivates a
 *      tenant with no other active lease,
 *   4. nothing deletes a lease that has money or is in force.
 */
describe('RentalAgreementsService (lifecycle)', () => {
  let service: RentalAgreementsService;

  const activeLease: any = {
    id: 'lease-1',
    code: 'RA-000001',
    unitId: 'unit-1',
    tenantId: 'tenant-1',
    status: AgreementStatus.ACTIVE,
    agreementType: 'RENTAL',
    currency: 'KES',
    rentAmount: 45_000,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-06-30'),
    termMonths: 6,
    securityDeposit: 90_000,
    organizationId: 'org-1',
    renewedToId: null,
    unit: { id: 'unit-1', currency: 'KES' },
    tenant: { id: 'tenant-1' },
  };

  function mockPrisma() {
    // findFirst serves two different queries: the "is the unit already let"
    // guard (where.status is a filter) and "load this lease" (where.id). The
    // state object lets a test change either one without fighting the mock.
    const state = {
      openLease: null as unknown,
      lease: activeLease as unknown,
      moveOut: null as unknown,
      successor: null as unknown,
      // Shape returned by findUniqueOrThrow in remove(): status + invoices.
      units: { status: AgreementStatus.DRAFT, invoices: [] } as unknown,
    };

    const leaseModel = {
      create: jest.fn().mockImplementation(({ data }: any) => ({
        ...activeLease,
        ...data,
        id: 'lease-2',
        code: 'RA-000002',
      })),
      findMany: jest.fn().mockResolvedValue([activeLease]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve('status' in where ? state.openLease : state.lease),
        ),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() => Promise.resolve(state.units)),
      update: jest.fn().mockImplementation(({ data }: any) => ({
        ...activeLease,
        ...data,
      })),
      delete: jest.fn().mockResolvedValue(activeLease),
    };
    return {
      rentalAgreement: leaseModel,
      state,
      unit: {
        findFirst: jest.fn().mockResolvedValue({ id: 'unit-1' }),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'unit-1' }),
      },
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      moveOutRequest: {
        findFirst: jest
          .fn()
          .mockImplementation(() => Promise.resolve(state.moveOut)),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((fn: any) => fn({ rentalAgreement: leaseModel })),
    };
  }

  let prisma: ReturnType<typeof mockPrisma>;
  let units: { syncOccupancyStatus: jest.Mock };

  beforeEach(async () => {
    prisma = mockPrisma();
    units = {
      syncOccupancyStatus: jest.fn().mockResolvedValue({ changed: true }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RentalAgreementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UnitsService, useValue: units },
      ],
    }).compile();
    service = moduleRef.get(RentalAgreementsService);
  });

  describe('create', () => {
    it('refuses a second live lease on the same unit', async () => {
      prisma.state.openLease = {
        code: 'RA-000009',
        status: AgreementStatus.ACTIVE,
      };

      await expect(
        service.create(
          { unitId: 'unit-1', tenantId: 'tenant-1', rentAmount: 45_000 },
          'org-1',
        ),
      ).rejects.toThrow(/already has an open lease/i);
      expect(prisma.rentalAgreement.create).not.toHaveBeenCalled();
    });

    it('rejects an end date before the start date', async () => {
      await expect(
        service.create(
          {
            unitId: 'unit-1',
            tenantId: 'tenant-1',
            rentAmount: 45_000,
            startDate: '2026-06-01',
            endDate: '2026-01-01',
          },
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('connects the unit, tenant and organization', async () => {
      await service.create(
        { unitId: 'unit-1', tenantId: 'tenant-1', rentAmount: 45_000 },
        'org-1',
      );

      const args = prisma.rentalAgreement.create.mock.calls[0][0];
      expect(args.data.unit).toEqual({ connect: { id: 'unit-1' } });
      expect(args.data.tenant).toEqual({ connect: { id: 'tenant-1' } });
      expect(args.data.organization).toEqual({ connect: { id: 'org-1' } });
    });
  });

  describe('activate', () => {
    it('activates the lease and hands the unit to the tenant', async () => {
      prisma.state.lease = { ...activeLease, status: AgreementStatus.DRAFT };

      await service.activate('lease-1', 'org-1');

      const args = prisma.rentalAgreement.update.mock.calls[0][0];
      expect(args.data).toMatchObject({
        status: AgreementStatus.ACTIVE,
        activatedAt: expect.any(Date),
      });
      expect(units.syncOccupancyStatus).toHaveBeenCalledWith('unit-1', 'org-1');
    });

    it('refuses to activate a lease that has not started', async () => {
      prisma.state.lease = {
        ...activeLease,
        status: AgreementStatus.DRAFT,
        startDate: new Date('2099-01-01'),
      };

      await expect(service.activate('lease-1', 'org-1')).rejects.toThrow(
        ConflictException,
      );
      expect(units.syncOccupancyStatus).not.toHaveBeenCalled();
    });

    it('404s for another tenant lease', async () => {
      prisma.state.lease = null;
      await expect(service.activate('lease-x', 'org-2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('renew', () => {
    it('creates the successor, links the chain and keeps the unit occupied', async () => {
      const result = await service.renew(
        'lease-1',
        { termMonths: 12, rentAmount: 50_000 },
        'org-1',
      );

      expect(prisma.rentalAgreement.create).toHaveBeenCalled();
      const created = prisma.rentalAgreement.create.mock.calls[0][0].data;
      expect(created.renewedFrom).toEqual({ connect: { id: 'lease-1' } });
      expect(created.status).toBe(AgreementStatus.ACTIVE);
      expect(created.startDate).toEqual(new Date('2026-07-01'));
      expect(created.endDate).toEqual(new Date('2027-07-01'));

      // The old lease is closed and points at its successor.
      const closeArgs = prisma.rentalAgreement.update.mock.calls[0][0];
      expect(closeArgs.data).toMatchObject({
        status: AgreementStatus.RENEWED,
        renewedToId: 'lease-2',
      });

      expect(result.lease.id).toBe('lease-2');
      expect(result.previous.code).toBe('RA-000001');
      expect(units.syncOccupancyStatus).toHaveBeenCalledWith('unit-1', 'org-1');
    });

    it('refuses a second renewal of the same lease', async () => {
      prisma.state.lease = { ...activeLease, renewedToId: 'lease-2' };

      await expect(
        service.renew('lease-1', { termMonths: 12 }, 'org-1'),
      ).rejects.toThrow(/already been renewed/i);
      expect(prisma.rentalAgreement.create).not.toHaveBeenCalled();
    });

    it('needs an explicit start date for an open-ended lease', async () => {
      prisma.state.lease = { ...activeLease, endDate: null };

      await expect(
        service.renew('lease-1', { termMonths: 6 }, 'org-1'),
      ).rejects.toThrow(/no end date/i);
    });

    it('rejects a term that ends before it starts', async () => {
      await expect(
        service.renew(
          'lease-1',
          { newStartDate: '2026-07-01', newEndDate: '2026-06-15' },
          'org-1',
        ),
      ).rejects.toThrow(/must end after it starts/i);
    });
  });

  describe('extend', () => {
    it('moves the end date later', async () => {
      const result = await service.extend(
        'lease-1',
        { newEndDate: '2026-09-30' },
        'org-1',
      );
      const args = prisma.rentalAgreement.update.mock.calls[0][0];
      expect(args.data.endDate).toEqual(new Date('2026-09-30'));
      expect(result.endDate).toEqual(new Date('2026-09-30'));
    });

    it('refuses to move the end date earlier', async () => {
      await expect(
        service.extend('lease-1', { newEndDate: '2026-02-01' }, 'org-1'),
      ).rejects.toThrow(/later, not earlier/i);
    });
  });

  describe('terminate', () => {
    it('records the reason, vacates the unit and deactivates the tenant', async () => {
      prisma.rentalAgreement.count.mockResolvedValue(0);

      const result = await service.terminate(
        'lease-1',
        { reason: 'Relocating abroad' },
        'org-1',
      );

      const args = prisma.rentalAgreement.update.mock.calls[0][0];
      expect(args.data).toMatchObject({
        status: AgreementStatus.TERMINATED,
        terminatedReason: 'Relocating abroad',
        terminatedAt: expect.any(Date),
      });

      expect(units.syncOccupancyStatus).toHaveBeenCalledWith('unit-1', 'org-1');
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        data: { status: 'INACTIVE' },
      });
      expect(result.unitVacated).toBe(true);
    });

    it('leaves the tenant active when they still have another lease', async () => {
      prisma.rentalAgreement.count.mockResolvedValue(1);

      await service.terminate('lease-1', { reason: 'Moving house' }, 'org-1');

      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('does not vacate the unit when a renewal already took over', async () => {
      // The successor lookup filters on the unit, not on a lease id.
      prisma.rentalAgreement.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve('unitId' in where ? { id: 'lease-2' } : activeLease),
      );

      const result = await service.terminate(
        'lease-1',
        { reason: 'Upgrading' },
        'org-1',
      );

      expect(result.unitVacated).toBe(false);
      expect(units.syncOccupancyStatus).not.toHaveBeenCalled();
    });

    it('reports arrears rather than blocking the move', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          amount: 45_000,
          dueDate: new Date('2026-01-01'),
          payments: [],
        },
      ]);

      const result = await service.terminate(
        'lease-1',
        { reason: 'Ending early' },
        'org-1',
      );

      expect(result.arrears).toBe(45_000);
      expect(result.outstanding).toBe(45_000);
    });

    it('refuses to terminate an already renewed lease', async () => {
      prisma.state.lease = { ...activeLease, status: AgreementStatus.RENEWED };

      await expect(
        service.terminate('lease-1', { reason: 'x' }, 'org-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('expire', () => {
    it('refuses to expire a lease that has not reached its end date', async () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      prisma.state.lease = { ...activeLease, endDate: future };

      await expect(service.expire('lease-1', 'org-1')).rejects.toThrow(
        /does not end until/i,
      );
    });

    it('expires a lease past its end date and frees the unit', async () => {
      prisma.state.lease = { ...activeLease, endDate: new Date('2020-01-01') };

      await service.expire('lease-1', 'org-1');

      const args = prisma.rentalAgreement.update.mock.calls[0][0];
      expect(args.data).toMatchObject({
        status: AgreementStatus.EXPIRED,
        expiredAt: expect.any(Date),
      });
      expect(units.syncOccupancyStatus).toHaveBeenCalledWith('unit-1', 'org-1');
    });
  });

  describe('remove', () => {
    it('refuses to delete an active lease', async () => {
      prisma.state.lease = { id: 'lease-1' };
      prisma.state.units = { status: AgreementStatus.ACTIVE, invoices: [] };

      await expect(service.remove('lease-1', 'org-1')).rejects.toThrow(
        /terminate it so the history/i,
      );
      expect(prisma.rentalAgreement.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a lease that has invoices', async () => {
      prisma.state.lease = { id: 'lease-1' };
      prisma.state.units = {
        status: AgreementStatus.TERMINATED,
        invoices: [{ id: 'inv-1' }],
      };

      await expect(service.remove('lease-1', 'org-1')).rejects.toThrow(
        /invoice\(s\) attached/i,
      );
    });

    it('deletes an untouched draft', async () => {
      prisma.state.lease = { id: 'lease-1' };
      prisma.state.units = { status: AgreementStatus.DRAFT, invoices: [] };

      await service.remove('lease-1', 'org-1');
      expect(prisma.rentalAgreement.delete).toHaveBeenCalledWith({
        where: { id: 'lease-1' },
      });
    });
  });

  describe('expiring', () => {
    it('returns the reminder target for a lease inside the window', async () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 10);

      prisma.rentalAgreement.findMany.mockResolvedValue([
        {
          ...activeLease,
          endDate: soon,
          tenant: {
            surname: 'Amina',
            otherNames: 'Wanjiru',
            phone: '+254700',
            email: 'amina@example.com',
          },
        },
      ]);

      const result = await service.expiring('org-1', 30);

      expect(result[0].daysRemaining).toBe(10);
      expect(result[0].reminderTarget).toEqual({
        name: 'Amina Wanjiru',
        phone: '+254700',
        email: 'amina@example.com',
      });
    });
  });

  describe('occupancyHistory', () => {
    it('reports tenancies and the vacant gaps between them', async () => {
      prisma.unit.findFirst.mockResolvedValue({
        id: 'unit-1',
        name: 'Flat 1',
        status: 'VACANT',
        property: { id: 'prop-1', name: 'Karen', code: 'PR-100' },
        rentalAgreements: [
          {
            id: 'lease-1',
            code: 'RA-1',
            status: AgreementStatus.TERMINATED,
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-06-30'),
            terminatedAt: new Date('2025-06-30'),
            tenant: { id: 't1', surname: 'One', otherNames: null, code: 'T1' },
          },
          {
            id: 'lease-2',
            code: 'RA-2',
            status: AgreementStatus.ACTIVE,
            startDate: new Date('2025-09-01'),
            endDate: null,
            terminatedAt: null,
            tenant: { id: 't2', surname: 'Two', otherNames: null, code: 'T2' },
          },
        ],
      });

      const history = await service.occupancyHistory('unit-1', 'org-1');

      const kinds = history.periods.map((period) => period.kind);
      expect(kinds).toEqual(['tenancy', 'vacancy', 'tenancy']);
      expect(history.summary.tenancies).toBe(2);
      expect(history.summary.currentTenant).toMatchObject({ id: 't2' });
      // 1 Jul – 31 Aug 2025 vacant.
      expect(history.summary.totalVacantDays).toBe(63);
    });

    it('404s for a unit in another organization', async () => {
      prisma.unit.findFirst.mockResolvedValue(null);
      await expect(service.occupancyHistory('unit-x', 'org-2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
