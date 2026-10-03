import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PropertiesService, summarizeOccupancy } from './properties.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * CRUD module test pattern (Module 0 requirement: "test coverage for at
 * least the auth flow and one full CRUD module as a pattern for future
 * modules to follow"), extended by Module 2 with the property-management
 * rules the audit flagged:
 *   1. create connects the caller's organization,
 *   2. list/reads filter by organizationId,
 *   3. reads-by-id 404 (never 200+empty) when missing or cross-tenant,
 *   4. mutations pre-verify ownership before touching the record by id,
 *   5. referenced landlord/branch ids must belong to the caller's org,
 *   6. deleting a property that still has units is a 409, not an FK 500,
 *   7. ARCHIVED properties stay out of the default list.
 */
describe('PropertiesService (tenant-scoped CRUD pattern)', () => {
  let service: PropertiesService;

  const property: any = {
    id: 'prop-1',
    organizationId: 'org-1',
    code: 'PR-001',
    name: 'Sunset Apartments',
    status: 'ACTIVE',
  };

  function mockPrisma() {
    const propertyModel = {
      create: jest.fn().mockResolvedValue(property),
      findMany: jest.fn().mockResolvedValue([property]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue(property),
      delete: jest.fn().mockResolvedValue(property),
    };
    const propertyAmenityModel = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn(),
    };
    const tx = {
      property: propertyModel,
      propertyAmenity: propertyAmenityModel,
    };
    return {
      property: propertyModel,
      propertyAmenity: propertyAmenityModel,
      unit: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      landlord: { findFirst: jest.fn().mockResolvedValue({ id: 'land-1' }) },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
  }

  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(PropertiesService);
  });

  describe('create', () => {
    it('attaches the caller organization when tenantId is provided', async () => {
      await service.create(
        { code: 'PR-002', name: 'New Building' } as any,
        'org-1',
      );
      expect(prisma.property.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization: { connect: { id: 'org-1' } },
        }),
        include: expect.anything(),
      });
    });

    it('does not attach an organization for the (super admin) unscoped path', async () => {
      await service.create({ code: 'PR-003', name: 'Platform Seed' } as any);
      expect(prisma.property.create).toHaveBeenCalledWith({
        data: expect.not.objectContaining({ organization: expect.anything() }),
        include: expect.anything(),
      });
    });

    it('rejects a duplicate code inside the same organization', async () => {
      prisma.property.findFirst.mockResolvedValue({ id: 'prop-9' });
      await expect(
        service.create({ code: 'PR-001', name: 'Duplicate' } as any, 'org-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.property.create).not.toHaveBeenCalled();
    });

    it('refuses a landlord that belongs to another organization', async () => {
      prisma.landlord.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          { code: 'PR-004', name: 'X', landlordId: 'land-other' } as any,
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.property.create).not.toHaveBeenCalled();
    });

    it('refuses a branch that belongs to another organization', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          { code: 'PR-005', name: 'X', branchId: 'branch-other' } as any,
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates structured amenities and converts dateAcquired', async () => {
      await service.create(
        {
          code: 'PR-006',
          name: 'With amenities',
          dateAcquired: '2024-05-01',
          amenities: [{ name: 'Lift' }, { name: 'lift' }, { name: '' }],
        } as any,
        'org-1',
      );

      const args = prisma.property.create.mock.calls[0][0];
      expect(args.data.dateAcquired).toEqual(new Date('2024-05-01'));
      // Duplicates (case-insensitive) and blanks are dropped.
      expect(args.data.amenities.create).toEqual([
        { name: 'Lift', category: null, notes: null },
      ]);
    });
  });

  describe('findAll', () => {
    it('scopes the where clause to the caller organization and hides archived rows', async () => {
      const result = await service.findAll('org-1');

      expect(prisma.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', status: { not: 'ARCHIVED' } },
          skip: 0,
          take: 10,
        }),
      );
      expect(prisma.property.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', status: { not: 'ARCHIVED' } },
      });
      expect(result.meta.total).toBe(1);
    });

    it('includes archived properties when explicitly asked', async () => {
      await service.findAll('org-1', undefined, { includeArchived: true });
      const args = prisma.property.findMany.mock.calls[0][0];
      expect(args.where.status).toBeUndefined();
    });

    it('filters by status, branch and type', async () => {
      await service.findAll('org-1', undefined, {
        status: 'INACTIVE',
        branchId: 'branch-1',
        type: 'apartment',
      });
      const args = prisma.property.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({
        status: 'INACTIVE',
        branchId: 'branch-1',
        type: 'apartment',
      });
    });

    it('applies search + pagination through the same where clause', async () => {
      await service.findAll('org-1', { page: 2, limit: 5, search: 'sunset' });

      const args = prisma.property.findMany.mock.calls[0][0];
      expect(args.where.organizationId).toBe('org-1');
      expect(args.where.OR).toBeDefined();
      expect(args.skip).toBe(5);
      expect(args.take).toBe(5);
    });

    it('ignores an unknown sortBy instead of passing it to Prisma', async () => {
      await service.findAll('org-1', { sortBy: 'landlord; DROP TABLE' });
      const args = prisma.property.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('findOne', () => {
    it('returns the record with an occupancy rollup', async () => {
      prisma.property.findFirst.mockResolvedValue({
        ...property,
        units: [
          { status: 'VACANT' },
          { status: 'OCCUPIED' },
          { status: 'OCCUPIED' },
        ],
      });
      const result = await service.findOne('prop-1', 'org-1');

      expect(prisma.property.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prop-1', organizationId: 'org-1' },
        }),
      );
      expect(result.occupancy).toMatchObject({
        total: 3,
        VACANT: 1,
        OCCUPIED: 2,
      });
    });

    it('404s when the record belongs to another tenant (no 200 + empty body)', async () => {
      prisma.property.findFirst.mockResolvedValue(null);
      await expect(
        service.findOne('prop-other-tenant', 'org-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne('prop-other-tenant', 'org-1'),
      ).rejects.toThrow('Property not found');
    });
  });

  describe('update / remove', () => {
    it('update refuses a cross-tenant record before touching it', async () => {
      prisma.property.findFirst.mockResolvedValue(null);
      await expect(
        service.update('prop-1', { name: 'Hacked' } as any, 'org-2'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.property.update).not.toHaveBeenCalled();
    });

    it('update proceeds after the ownership check passes', async () => {
      prisma.property.findFirst.mockResolvedValue({ id: 'prop-1' });
      await service.update('prop-1', { name: 'Renamed' } as any, 'org-1');
      expect(prisma.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { name: 'Renamed' },
        include: expect.anything(),
      });
    });

    it('update can disassociate the landlord by passing null', async () => {
      prisma.property.findFirst.mockResolvedValue({ id: 'prop-1' });
      await service.update('prop-1', { landlordId: null } as any, 'org-1');
      const args = prisma.property.update.mock.calls[0][0];
      expect(args.data.landlord).toEqual({ disconnect: true });
    });

    it('update replaces the amenity set when amenities are supplied', async () => {
      prisma.property.findFirst.mockResolvedValue({ id: 'prop-1' });
      await service.update(
        'prop-1',
        { amenities: [{ name: 'Gym' }] } as any,
        'org-1',
      );
      const args = prisma.property.update.mock.calls[0][0];
      expect(args.data.amenities.deleteMany).toEqual({});
      expect(args.data.amenities.create).toHaveLength(1);
    });

    it('remove refuses a cross-tenant record before deleting it', async () => {
      prisma.property.findFirst.mockResolvedValue(null);
      await expect(service.remove('prop-1', 'org-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.property.delete).not.toHaveBeenCalled();
    });

    it('remove deletes once ownership is confirmed', async () => {
      prisma.property.findFirst.mockResolvedValue({ id: 'prop-1' });
      await service.remove('prop-1', 'org-1');
      expect(prisma.property.delete).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
      });
    });

    it('remove reports a 409 when the property still has units', async () => {
      prisma.property.findFirst.mockResolvedValue({ id: 'prop-1' });
      prisma.unit.count.mockResolvedValue(3);
      await expect(service.remove('prop-1', 'org-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.property.delete).not.toHaveBeenCalled();
    });
  });

  describe('amenities', () => {
    beforeEach(() => {
      prisma.property.findFirst.mockResolvedValue({ id: 'prop-1' });
    });

    it('replaces the amenity set atomically and de-duplicates', async () => {
      await service.replaceAmenities(
        'prop-1',
        [{ name: 'Pool' }, { name: 'pool' }, { name: 'Gym' }],
        'org-1',
      );

      expect(prisma.propertyAmenity.deleteMany).toHaveBeenCalledWith({
        where: { propertyId: 'prop-1' },
      });
      expect(prisma.propertyAmenity.createMany).toHaveBeenCalledWith({
        data: [
          { name: 'Pool', category: null, notes: null, propertyId: 'prop-1' },
          { name: 'Gym', category: null, notes: null, propertyId: 'prop-1' },
        ],
        skipDuplicates: true,
      });
    });

    it('upserts a single amenity by (propertyId, name)', async () => {
      prisma.propertyAmenity.upsert.mockResolvedValue({ id: 'am-1' });
      await service.addAmenity('prop-1', { name: 'Lift' } as any, 'org-1');

      expect(prisma.propertyAmenity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { propertyId_name: { propertyId: 'prop-1', name: 'Lift' } },
        }),
      );
    });

    it('404s when deleting an amenity that is not on the property', async () => {
      prisma.propertyAmenity.findFirst.mockResolvedValue(null);
      await expect(
        service.removeAmenity('prop-1', 'am-other', 'org-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.propertyAmenity.delete).not.toHaveBeenCalled();
    });
  });

  describe('import', () => {
    beforeEach(() => {
      // No existing property with the same code unless a test says otherwise.
      prisma.property.findFirst.mockResolvedValue(null);
    });

    it('imports valid rows and reports per-row outcomes', async () => {
      const csv = [
        'code,name,landlordCode',
        'PR-10,Import One,L-1',
        'PR-11,Import Two,L-1',
      ].join('\n');
      const result = await service.importCsv({ csv } as any, 'org-1');

      expect(result.total).toBe(2);
      expect(result.created).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('fails one row without aborting the rest', async () => {
      const csv = [
        'code,name,landlordCode',
        'PR-12,Good,L-1',
        'PR-13,Bad landlord,L-MISSING',
      ].join('\n');
      // Both the code lookup and the create-time re-check key off the code.
      prisma.landlord.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.code === 'L-MISSING' || where.id === 'L-MISSING'
            ? null
            : { id: 'land-1' },
        ),
      );

      const result = await service.importCsv({ csv } as any, 'org-1');

      expect(result.created).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[1].message).toMatch(/L-MISSING/);
    });

    it('skips a row whose code already exists', async () => {
      prisma.property.findFirst.mockResolvedValue({ id: 'prop-existing' });
      const csv = ['code,name', 'PR-001,Duplicate'].join('\n');
      const result = await service.importCsv({ csv } as any, 'org-1');

      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
    });

    it('rejects a file that is missing the required columns', async () => {
      await expect(
        service.importCsv({ csv: 'title,description\nx,y' } as any, 'org-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('supports a dry run that writes nothing', async () => {
      const csv = ['code,name', 'PR-14,Dry Run'].join('\n');
      const result = await service.importCsv(
        { csv, dryRun: true } as any,
        'org-1',
      );

      expect(result.dryRun).toBe(true);
      expect(result.created).toBe(1);
      expect(prisma.property.create).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    it('emits one row per property with the current filters applied', async () => {
      const csv = await service.exportCsv('org-1', { status: 'ACTIVE' });
      const lines = csv.trim().split('\r\n');

      expect(lines[0].startsWith('code,name,status')).toBe(true);
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('PR-001');
    });
  });
});

describe('summarizeOccupancy', () => {
  it('counts units per status with a total', () => {
    expect(
      summarizeOccupancy([
        { status: 'VACANT' },
        { status: 'VACANT' },
        { status: 'MAINTENANCE' },
      ]),
    ).toEqual({ total: 3, VACANT: 2, MAINTENANCE: 1 });
  });

  it('handles a property with no units', () => {
    expect(summarizeOccupancy([])).toEqual({ total: 0 });
  });
});
