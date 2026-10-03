import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AgreementStatus, Prisma, UnitStatus } from '@prisma/client';
import { UnitsService } from './units.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Units carry the two rules the audit called out for this module:
 *   1. a unit may only be created under a property in the caller's
 *      organization (the previous implementation connected whatever
 *      `propertyId` the client sent, which allowed cross-tenant writes),
 *   2. occupancy status is a validated transition, not a free-form column.
 */
describe('UnitsService', () => {
  let service: UnitsService;

  const unit: any = {
    id: 'unit-1',
    organizationId: 'org-1',
    code: 'UNIT-001',
    name: 'Flat 1',
    propertyId: 'prop-1',
    status: UnitStatus.VACANT,
  };

  const activeAgreement = {
    id: 'ra-1',
    status: AgreementStatus.ACTIVE,
    startDate: new Date('2026-01-01'),
    endDate: null,
    tenant: { id: 't-1', surname: 'Doe', otherNames: 'Jane' },
  };

  function mockPrisma() {
    const unitModel = {
      create: jest.fn().mockResolvedValue(unit),
      findMany: jest.fn().mockResolvedValue([unit]),
      count: jest.fn().mockResolvedValue(1),
      // Default: the unit exists in the caller's organization.
      findFirst: jest.fn().mockResolvedValue({ id: 'unit-1' }),
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'unit-1', status: UnitStatus.VACANT }),
      update: jest.fn().mockImplementation(({ data }: any) => ({
        ...unit,
        ...data,
      })),
      delete: jest.fn().mockResolvedValue(unit),
    };
    const tx = { unit: unitModel };
    return {
      unit: unitModel,
      property: {
        findFirst: jest.fn().mockResolvedValue({ id: 'prop-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      rentalAgreement: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
  }

  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [UnitsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(UnitsService);
  });

  describe('create', () => {
    it('refuses to attach a unit to another tenant property', async () => {
      prisma.property.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          { propertyId: 'prop-other', name: 'Flat 9' } as any,
          'org-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.unit.create).not.toHaveBeenCalled();
    });

    it('creates under the tenant property and generates a scoped code', async () => {
      await service.create(
        { propertyId: 'prop-1', name: 'Flat 1' } as any,
        'org-1',
      );

      expect(prisma.property.findFirst).toHaveBeenCalledWith({
        where: { id: 'prop-1', organizationId: 'org-1' },
        select: { id: true },
      });
      const args = prisma.unit.create.mock.calls[0][0];
      expect(args.data.code).toBe('UNIT-002');
      expect(args.data.property).toEqual({ connect: { id: 'prop-1' } });
    });

    it('rejects a non-VACANT status on creation', async () => {
      await expect(
        service.create(
          {
            propertyId: 'prop-1',
            name: 'Flat 2',
            status: UnitStatus.OCCUPIED,
          } as any,
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.unit.create).not.toHaveBeenCalled();
    });

    it('retries with a new code when the unique constraint collides', async () => {
      prisma.unit.create
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        )
        .mockResolvedValueOnce(unit);

      await service.create(
        { propertyId: 'prop-1', name: 'Flat 3' } as any,
        'org-1',
      );

      expect(prisma.unit.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('findAll', () => {
    it('scopes to the caller organization through the parent property', async () => {
      await service.findAll('org-1');
      const args = prisma.unit.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ property: { organizationId: 'org-1' } });
    });

    it('filters by branch via the property', async () => {
      await service.findAll('org-1', undefined, { branchId: 'branch-1' });
      const args = prisma.unit.findMany.mock.calls[0][0];
      expect(args.where.property).toEqual({ branchId: 'branch-1' });
    });

    it('ignores an unknown sortBy', async () => {
      await service.findAll('org-1', { sortBy: 'nonsense' });
      const args = prisma.unit.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('findOne', () => {
    it('reports the derived status and the actions currently allowed', async () => {
      prisma.unit.findFirst.mockResolvedValue({
        ...unit,
        status: UnitStatus.OCCUPIED,
        rentalAgreements: [
          {
            status: AgreementStatus.ACTIVE,
            startDate: new Date('2026-01-01'),
            endDate: null,
          },
        ],
      });

      const result = await service.findOne('unit-1', 'org-1');

      expect(result.occupancy.derivedStatus).toBe(UnitStatus.OCCUPIED);
      // While somebody rents the unit it can neither be vacated nor taken out
      // of service — only the no-op and a hold-for-later remain.
      expect(result.occupancy.availableActions).toEqual(
        expect.arrayContaining([UnitStatus.RESERVED]),
      );
      expect(result.occupancy.availableActions).not.toContain(
        UnitStatus.VACANT,
      );
      expect(result.occupancy.availableActions).not.toContain(
        UnitStatus.MAINTENANCE,
      );
    });

    it('404s for a cross-tenant unit', async () => {
      prisma.unit.findFirst.mockResolvedValue(null);
      await expect(service.findOne('unit-x', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('status transitions', () => {
    it('refuses OCCUPIED when no agreement is active', async () => {
      prisma.rentalAgreement.findMany.mockResolvedValue([]);
      await expect(
        service.setStatus('unit-1', UnitStatus.OCCUPIED, 'org-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.unit.update).not.toHaveBeenCalled();
    });

    it('applies a legal transition', async () => {
      prisma.rentalAgreement.findMany.mockResolvedValue([]);
      const updated = await service.setStatus(
        'unit-1',
        UnitStatus.MAINTENANCE,
        'org-1',
      );
      expect(updated.status).toBe(UnitStatus.MAINTENANCE);
    });

    it('refuses to move a tenanted unit out of occupancy', async () => {
      prisma.unit.findUnique.mockResolvedValue({
        id: 'unit-1',
        status: UnitStatus.OCCUPIED,
      });
      prisma.rentalAgreement.findMany.mockResolvedValue([
        {
          status: AgreementStatus.ACTIVE,
          startDate: new Date('2026-01-01'),
          endDate: null,
        },
      ]);
      await expect(
        service.setStatus('unit-1', UnitStatus.VACANT, 'org-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('syncs occupancy up when a lease becomes active', async () => {
      prisma.unit.findUnique.mockResolvedValue({
        id: 'unit-1',
        status: UnitStatus.VACANT,
      });
      prisma.rentalAgreement.findMany.mockResolvedValue([
        {
          status: AgreementStatus.ACTIVE,
          startDate: new Date('2026-01-01'),
          endDate: null,
        },
      ]);

      const result = await service.syncOccupancyStatus('unit-1', 'org-1');

      expect(result).toEqual({
        id: 'unit-1',
        status: UnitStatus.OCCUPIED,
        changed: true,
      });
      expect(prisma.unit.update).toHaveBeenCalledWith({
        where: { id: 'unit-1' },
        data: { status: UnitStatus.OCCUPIED },
      });
    });

    it('syncs occupancy down when the lease has ended', async () => {
      prisma.unit.findUnique.mockResolvedValue({
        id: 'unit-1',
        status: UnitStatus.OCCUPIED,
      });
      prisma.rentalAgreement.findMany.mockResolvedValue([
        {
          status: AgreementStatus.ACTIVE,
          startDate: new Date('2020-01-01'),
          endDate: new Date('2021-01-01'),
        },
      ]);

      const result = await service.syncOccupancyStatus('unit-1', 'org-1');

      expect(result).toEqual({
        id: 'unit-1',
        status: UnitStatus.VACANT,
        changed: true,
      });
    });

    it('is a no-op when the derived status already matches', async () => {
      prisma.unit.findUnique.mockResolvedValue({
        id: 'unit-1',
        status: UnitStatus.VACANT,
      });
      prisma.rentalAgreement.findMany.mockResolvedValue([]);

      const result = await service.syncOccupancyStatus('unit-1', 'org-1');

      expect(result).toEqual({
        id: 'unit-1',
        status: UnitStatus.VACANT,
        changed: false,
      });
      expect(prisma.unit.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('refuses a cross-tenant unit', async () => {
      prisma.unit.findFirst.mockResolvedValue(null);
      await expect(service.remove('unit-1', 'org-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.unit.delete).not.toHaveBeenCalled();
    });

    it('reports a 409 instead of an FK error when a lease references the unit', async () => {
      prisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
      prisma.rentalAgreement.count.mockResolvedValue(2);
      await expect(service.remove('unit-1', 'org-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.unit.delete).not.toHaveBeenCalled();
    });

    it('deletes when nothing references the unit', async () => {
      prisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
      await service.remove('unit-1', 'org-1');
      expect(prisma.unit.delete).toHaveBeenCalledWith({
        where: { id: 'unit-1' },
      });
    });
  });

  describe('import / export', () => {
    it('fails a row whose property code is unknown', async () => {
      prisma.property.findFirst.mockResolvedValue(null);
      const csv = ['propertyCode,name', 'PR-404,Flat 1'].join('\n');
      const result = await service.importCsv({ csv } as any, 'org-1');

      expect(result.failed).toBe(1);
      expect(result.results[0].message).toMatch(/No property with code/);
    });

    it('rejects a file that is missing the required columns', async () => {
      await expect(
        service.importCsv({ csv: 'a,b\n1,2' } as any, 'org-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('includes the current tenant and lease end in the export', async () => {
      prisma.unit.findMany.mockResolvedValue([
        {
          ...unit,
          property: { code: 'PR-001', name: 'Sunset' },
          rentalAgreements: [activeAgreement],
        },
      ]);

      const csv = await service.exportCsv('org-1');
      const [header, row] = csv.trim().split('\r\n');

      expect(header).toContain('currentTenant');
      expect(header).toContain('leaseEnd');
      expect(row).toContain('Doe Jane');
    });
  });
});
