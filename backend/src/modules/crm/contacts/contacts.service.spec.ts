import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Contact rules: tenant scoping, type filtering, the communication timeline
 * (which must hang off somebody), and the Tenant↔Contact link being
 * one-to-one.
 */
describe('ContactsService', () => {
  let service: ContactsService;

  const contact: any = {
    id: 'contact-1',
    organizationId: 'org-1',
    firstName: 'Amina',
    lastName: 'Wanjiru',
    type: 'TENANT',
    email: 'amina@example.com',
    isActive: true,
  };

  function mockPrisma() {
    const contactModel = {
      create: jest.fn().mockResolvedValue(contact),
      findMany: jest.fn().mockResolvedValue([contact]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(contact),
      findUniqueOrThrow: jest.fn().mockResolvedValue(contact),
      update: jest.fn().mockResolvedValue(contact),
      delete: jest.fn().mockResolvedValue(contact),
    };
    const commModel = {
      create: jest.fn().mockResolvedValue({ id: 'comm-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 'comm-1' }),
      delete: jest.fn().mockResolvedValue({ id: 'comm-1' }),
    };
    const tx = { contact: contactModel };
    return {
      contact: contactModel,
      communicationLog: commModel,
      lead: { findFirst: jest.fn().mockResolvedValue({ id: 'lead-1' }) },
      tenant: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'tenant-1', contactId: null }),
        update: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
  }

  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ContactsService);
  });

  describe('create', () => {
    it('scopes the contact to the caller organization', async () => {
      await service.create(
        { firstName: 'Amina', lastName: 'Wanjiru', type: 'TENANT' },
        'org-1',
      );
      expect(prisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organization: { connect: { id: 'org-1' } },
            type: 'TENANT',
          }),
        }),
      );
    });

    it('defaults the type to BUYER', async () => {
      await service.create(
        { firstName: 'Amina', lastName: 'Wanjiru' },
        'org-1',
      );
      const args = prisma.contact.create.mock.calls[0][0];
      expect(args.data.type).toBe('BUYER');
    });

    it('refuses to link a tenant from another organization', async () => {
      prisma.tenant.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          { firstName: 'A', lastName: 'B', tenantId: 'tenant-x' },
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to steal a tenant already linked to another contact', async () => {
      prisma.tenant.findFirst.mockResolvedValue({
        id: 'tenant-1',
        contactId: 'contact-9',
      });
      await expect(
        service.create(
          { firstName: 'A', lastName: 'B', tenantId: 'tenant-1' },
          'org-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('scopes to the caller organization and filters by type', async () => {
      await service.findAll('org-1', undefined, { type: 'TENANT' });
      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', type: 'TENANT' },
        }),
      );
    });

    it('can limit the list to engaged contacts', async () => {
      await service.findAll('org-1', undefined, { engaged: true });
      const args = prisma.contact.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { leads: { some: {} } },
        { communications: { some: {} } },
      ]);
    });

    it('searches across name, email, phone and company', async () => {
      await service.findAll('org-1', { search: 'amina' });
      const args = prisma.contact.findMany.mock.calls[0][0];
      expect(args.where.OR).toHaveLength(5);
    });
  });

  describe('findOne', () => {
    it('404s for a cross-tenant contact', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      await expect(service.findOne('contact-x', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the contact with its timeline', async () => {
      const result = await service.findOne('contact-1', 'org-1');
      expect(result.timeline).toEqual([]);
      expect(prisma.communicationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', contactId: 'contact-1' },
        }),
      );
    });
  });

  describe('update', () => {
    it('refuses a cross-tenant update before touching the record', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      await expect(
        service.update('contact-1', { phone: '+254' }, 'org-2'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('releases a previous tenant link before linking a new one', async () => {
      await service.update('contact-1', { tenantId: 'tenant-2' }, 'org-1');
      expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
        where: { contactId: 'contact-1', NOT: { id: 'tenant-2' } },
        data: { contactId: null },
      });
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-2' },
        data: { contactId: 'contact-1' },
      });
    });

    it('unlinks the tenant when passed null', async () => {
      await service.update('contact-1', { tenantId: null }, 'org-1');
      expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
        where: { contactId: 'contact-1' },
        data: { contactId: null },
      });
    });
  });

  describe('communications', () => {
    it('refuses a log entry with neither contact nor lead', async () => {
      await expect(
        service.logCommunication({ channel: 'CALL' }, 'org-1'),
      ).rejects.toThrow(/against a contact or a lead/i);
      expect(prisma.communicationLog.create).not.toHaveBeenCalled();
    });

    it('records the actor and the organization as scalars', async () => {
      await service.logCommunication(
        { channel: 'CALL', contactId: 'contact-1', outcome: 'answered' },
        'org-1',
        'user-1',
      );
      expect(prisma.communicationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            loggedById: 'user-1',
            channel: 'CALL',
            outcome: 'answered',
          }),
        }),
      );
    });

    it('404s when the contact belongs to another tenant', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      await expect(
        service.logCommunication(
          { channel: 'CALL', contactId: 'contact-x' },
          'org-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('scopes the timeline read to the organization', async () => {
      await service.timeline('contact-1', 'org-1');
      const args = prisma.communicationLog.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        organizationId: 'org-1',
        contactId: 'contact-1',
      });
      expect(args.orderBy).toEqual([
        { occurredAt: 'desc' },
        { createdAt: 'desc' },
      ]);
    });

    it('refuses to delete another tenant\u2019s log entry', async () => {
      prisma.communicationLog.findFirst.mockResolvedValue(null);
      await expect(
        service.removeCommunication('comm-x', 'org-2'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.communicationLog.delete).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    it('writes one row per contact', async () => {
      const csv = await service.exportCsv('org-1', { type: 'TENANT' });
      const lines = csv.trim().split('\r\n');
      expect(lines[0]).toContain('firstName,lastName,type');
      expect(lines[1]).toContain('Amina');
    });
  });
});
