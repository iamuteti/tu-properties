import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeadStage } from '@prisma/client';
import { LeadsService } from './leads.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * The CRM rules the module must not get wrong:
 *   1. tenant scoping on every read/write,
 *   2. a lead needs a way to reply (email or phone),
 *   3. property/branch/agent references must belong to the caller's org,
 *   4. stage only moves through `setStage`, which enforces the pipeline rules,
 *   5. conversion creates (or links) exactly one contact and is idempotent-safe
 *      (a second attempt is refused rather than duplicating).
 */
describe('LeadsService', () => {
  let service: LeadsService;

  const lead: any = {
    id: 'lead-1',
    organizationId: 'org-1',
    firstName: 'Amina',
    lastName: 'Wanjiru',
    email: 'amina@example.com',
    phone: '+254700000000',
    source: 'WEBSITE',
    stage: LeadStage.NEW,
    contactId: null,
    message: 'Interested in a 2-bed',
  };

  function mockPrisma() {
    const leadModel = {
      create: jest.fn().mockResolvedValue(lead),
      findMany: jest.fn().mockResolvedValue([lead]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(lead),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ ...lead, ...data })),
      delete: jest.fn().mockResolvedValue(lead),
    };
    const contactModel = {
      create: jest.fn().mockResolvedValue({ id: 'contact-1' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'contact-1' }),
    };
    const tx = { lead: leadModel, contact: contactModel };
    return {
      lead: leadModel,
      contact: contactModel,
      communicationLog: {
        create: jest.fn().mockResolvedValue({ id: 'comm-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'comm-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'comm-1' }),
      },
      tenant: {
        create: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
        count: jest.fn().mockResolvedValue(3),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'tenant-1', contactId: null }),
        update: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      property: { findFirst: jest.fn().mockResolvedValue({ id: 'prop-1' }) },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
  }

  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [LeadsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(LeadsService);
  });

  describe('create', () => {
    it('attaches the caller organization and logs the enquiry', async () => {
      await service.create(
        { firstName: 'Amina', email: 'a@b.co' },
        'org-1',
        'user-1',
      );

      const args = prisma.lead.create.mock.calls[0][0];
      expect(args.data.organization).toEqual({ connect: { id: 'org-1' } });
      expect(args.data.communications.create).toMatchObject({
        channel: 'NOTE',
        direction: 'INBOUND',
        organizationId: 'org-1',
        loggedById: 'user-1',
      });
    });

    it('refuses a lead with neither email nor phone', async () => {
      await expect(
        service.create({ firstName: 'Amina' }, 'org-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });

    it('refuses a property from another organization', async () => {
      prisma.property.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          {
            firstName: 'Amina',
            email: 'a@b.co',
            interestedPropertyId: 'prop-other',
          },
          'org-1',
        ),
      ).rejects.toThrow(/does not exist in your organization/i);
    });

    it('refuses an agent from another organization', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          {
            firstName: 'Amina',
            email: 'a@b.co',
            assignedAgentId: 'user-other',
          },
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('scopes the where clause to the caller organization', async () => {
      await service.findAll('org-1');
      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('applies stage/source/agent filters', async () => {
      await service.findAll('org-1', undefined, {
        stage: 'CONTACTED',
        source: 'FACEBOOK',
        assignedAgentId: 'user-1',
      });
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({
        organizationId: 'org-1',
        stage: 'CONTACTED',
        source: 'FACEBOOK',
        assignedAgentId: 'user-1',
      });
    });

    it('supports the unassigned-only filter', async () => {
      await service.findAll('org-1', undefined, { unassigned: true });
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.assignedAgentId).toBeNull();
    });

    it('ignores an unknown sortBy', async () => {
      await service.findAll('org-1', { sortBy: 'stage; DROP TABLE' });
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('pipeline', () => {
    it('excludes won and lost leads from the board', async () => {
      await service.pipeline('org-1');
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.stage).toEqual({ notIn: ['WON', 'LOST'] });
      expect(args.take).toBeLessThanOrEqual(500);
    });
  });

  describe('findOne', () => {
    it('404s for a cross-tenant lead', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(service.findOne('lead-x', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('reports the stages the lead can move to', async () => {
      const result = await service.findOne('lead-1', 'org-1');
      expect(result.pipeline.availableStages).toEqual(
        expect.arrayContaining([LeadStage.CONTACTED, LeadStage.LOST]),
      );
      expect(result.pipeline.availableStages).not.toContain(LeadStage.WON);
    });
  });

  describe('setStage', () => {
    it('refuses to mark a lead won before conversion', async () => {
      await expect(
        service.setStage('lead-1', LeadStage.WON, 'org-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('requires a reason when marking a lead lost', async () => {
      await expect(
        service.setStage('lead-1', LeadStage.LOST, 'org-1'),
      ).rejects.toThrow(/reason is required/i);
    });

    it('records the reason when a lead is lost', async () => {
      await service.setStage(
        'lead-1',
        LeadStage.LOST,
        'org-1',
        'Went with a competitor',
      );
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { stage: 'LOST', lostReason: 'Went with a competitor' },
        }),
      );
    });

    it('refuses to move a lost lead again', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        ...lead,
        stage: LeadStage.LOST,
      });
      await expect(
        service.setStage('lead-1', LeadStage.CONTACTED, 'org-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('allows the forward move', async () => {
      const result = await service.setStage(
        'lead-1',
        LeadStage.CONTACTED,
        'org-1',
      );
      expect(result.stage).toBe(LeadStage.CONTACTED);
    });
  });

  describe('convert', () => {
    it('creates a contact from the lead and marks the lead won', async () => {
      const result = await service.convert('lead-1', {}, 'org-1');

      expect(prisma.contact.create).toHaveBeenCalled();
      expect(result.contactId).toBe('contact-1');
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contactId: 'contact-1',
            stage: 'WON',
          }),
        }),
      );
    });

    it('links an existing contact instead of creating a duplicate', async () => {
      const result = await service.convert(
        'lead-1',
        { contactId: 'contact-9' },
        'org-1',
      );
      expect(prisma.contact.create).not.toHaveBeenCalled();
      expect(result.contactId).toBe('contact-9');
    });

    it('404s when the contact to link belongs to another tenant', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      await expect(
        service.convert('lead-1', { contactId: 'contact-other' }, 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to convert the same lead twice', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        ...lead,
        contactId: 'contact-1',
      });
      await expect(service.convert('lead-1', {}, 'org-1')).rejects.toThrow(
        /already been converted/i,
      );
    });

    it('refuses to convert a lost lead', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        ...lead,
        stage: LeadStage.LOST,
      });
      await expect(service.convert('lead-1', {}, 'org-1')).rejects.toThrow(
        /marked lost/i,
      );
    });

    it('creates a linked tenant when asked', async () => {
      const result = await service.convert(
        'lead-1',
        { createTenant: true },
        'org-1',
      );
      expect(prisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ contactId: 'contact-1' }),
        }),
      );
      expect(result.tenantId).toBe('tenant-1');
    });
  });

  describe('update / remove', () => {
    it('refuses a cross-tenant update before touching the record', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.update('lead-1', { phone: '+254700' }, 'org-2'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it('can unlink the interested property with null', async () => {
      await service.update('lead-1', { interestedPropertyId: null }, 'org-1');
      const args = prisma.lead.update.mock.calls[0][0];
      expect(args.data.interestedProperty).toEqual({ disconnect: true });
    });

    it('refuses a cross-tenant delete', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(service.remove('lead-1', 'org-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.lead.delete).not.toHaveBeenCalled();
    });
  });

  describe('createFromPublicSource', () => {
    it('records the source and opens the timeline without a user', async () => {
      await service.createFromPublicSource(
        { firstName: 'Web', email: 'web@example.com', source: 'WEBSITE' },
        'org-1',
      );
      const args = prisma.lead.create.mock.calls[0][0];
      expect(args.data.source).toBe('WEBSITE');
      expect(args.data.communications.create).toMatchObject({
        direction: 'INBOUND',
        organizationId: 'org-1',
      });
    });

    it('rejects a payload with no way to reply', async () => {
      await expect(
        service.createFromPublicSource({ firstName: 'Nobody' }, 'org-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a property that is not in the webhook organization', async () => {
      prisma.property.findFirst.mockResolvedValue(null);
      await expect(
        service.createFromPublicSource(
          {
            firstName: 'Web',
            email: 'web@example.com',
            interestedPropertyId: 'prop-x',
          },
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('export', () => {
    it('writes the current filters into the CSV', async () => {
      const csv = await service.exportCsv('org-1', { stage: 'NEW' });
      const lines = csv.trim().split('\r\n');
      expect(lines[0]).toContain('firstName,lastName');
      expect(lines[1]).toContain('Amina');
    });
  });
});
