import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * CRUD module test pattern (Module 0 requirement: "test coverage for at
 * least the auth flow and one full CRUD module as a pattern for future
 * modules to follow").
 *
 * PropertiesService is the reference: it demonstrates the tenant-scoping
 * rules every module must keep —
 *   1. create connects the caller's organization,
 *   2. list/reads filter by organizationId,
 *   3. reads-by-id 404 (never 200+empty) when the record is missing or
 *      belongs to another tenant,
 *   4. mutations pre-verify ownership before touching the record by id.
 */
describe('PropertiesService (tenant-scoped CRUD pattern)', () => {
  let service: PropertiesService;

  const property: any = {
    id: 'prop-1',
    organizationId: 'org-1',
    code: 'PR-001',
    name: 'Sunset Apartments',
  };

  function mockPrisma() {
    // One shared set of model mocks: the service's $transaction receives a
    // "tx" that delegates to the same functions, so assertions can read
    // either handle.
    const propertyModel = {
      create: jest.fn().mockResolvedValue(property),
      findMany: jest.fn().mockResolvedValue([property]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue(property),
      delete: jest.fn().mockResolvedValue(property),
    };
    const tx = { property: propertyModel };
    return {
      property: propertyModel,
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
  }

  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [PropertiesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PropertiesService);
  });

  describe('create', () => {
    it('attaches the caller organization when tenantId is provided', () => {
      service.create({ code: 'PR-002', name: 'New Building' } as any, 'org-1');
      expect(prisma.property.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization: { connect: { id: 'org-1' } },
        }),
      });
    });

    it('does not attach an organization for the (super admin) unscoped path', () => {
      service.create({ code: 'PR-003', name: 'Platform Seed' } as any);
      expect(prisma.property.create).toHaveBeenCalledWith({
        data: expect.not.objectContaining({ organization: expect.anything() }),
      });
    });
  });

  describe('findAll', () => {
    it('scopes the where clause to the caller organization', async () => {
      const result = await service.findAll('org-1');

      expect(prisma.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          skip: 0,
          take: 10,
        }),
      );
      expect(prisma.property.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
      });
      expect(result.meta.total).toBe(1);
    });

    it('applies search + pagination through the same where clause', async () => {
      await service.findAll('org-1', { page: 2, limit: 5, search: 'sunset' });

      const args = prisma.property.findMany.mock.calls[0][0];
      expect(args.where.organizationId).toBe('org-1');
      expect(args.where.OR).toBeDefined();
      expect(args.skip).toBe(5);
      expect(args.take).toBe(5);
    });
  });

  describe('findOne', () => {
    it('returns the record when it belongs to the caller organization', async () => {
      prisma.property.findFirst.mockResolvedValue(property);
      const result = await service.findOne('prop-1', 'org-1');

      expect(prisma.property.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prop-1', organizationId: 'org-1' },
        }),
      );
      expect(result.id).toBe('prop-1');
    });

    it('404s when the record belongs to another tenant (no 200 + empty body)', async () => {
      // Cross-tenant lookup: scoped where finds nothing.
      prisma.property.findFirst.mockResolvedValue(null);
      await expect(service.findOne('prop-other-tenant', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('prop-other-tenant', 'org-1')).rejects.toThrow(
        'Property not found',
      );
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
      });
    });

    it('remove refuses a cross-tenant record before deleting it', async () => {
      prisma.property.findFirst.mockResolvedValue(null);
      await expect(service.remove('prop-1', 'org-2')).rejects.toThrow(NotFoundException);
      expect(prisma.property.delete).not.toHaveBeenCalled();
    });

    it('remove deletes once ownership is confirmed', async () => {
      prisma.property.findFirst.mockResolvedValue({ id: 'prop-1' });
      await service.remove('prop-1', 'org-1');
      expect(prisma.property.delete).toHaveBeenCalledWith({ where: { id: 'prop-1' } });
    });
  });
});
