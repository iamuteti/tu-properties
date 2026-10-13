import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SupportTicketsService } from './support-tickets.service';

/**
 * Module 19 — support tickets: scoping first, transitions second.
 *
 * A tenant sees exactly their own organization (cross-tenant reads 404, the
 * issue-24 rule), never writes `status` directly, and may only CLOSE their
 * own tickets — the resolution is the platform's answer. SUPER_ADMIN sees
 * everything and moves anything, with a resolution required for RESOLVED.
 */
describe('SupportTicketsService', () => {
  let service: SupportTicketsService;
  let prisma: {
    supportTicket: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    organization: { findUnique: jest.Mock };
  };

  const tenantActor = {
    userId: 'u-tenant',
    role: 'ADMIN',
    tenantId: 'org-1',
  };
  const platformActor = { userId: 'sup-1', role: 'SUPER_ADMIN' };

  const openTicket = {
    id: 't-1',
    organizationId: 'org-1',
    raisedByUserId: 'u-tenant',
    subject: 'Missing receipt',
    description: 'The January receipt never arrived in my inbox.',
    status: TicketStatus.OPEN,
  };

  beforeEach(async () => {
    prisma = {
      supportTicket: {
        create: jest.fn().mockResolvedValue(openTicket),
        findMany: jest.fn().mockResolvedValue([openTicket]),
        findFirst: jest.fn().mockResolvedValue(openTicket),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          ...openTicket,
          ...data,
        })),
        delete: jest.fn().mockResolvedValue(openTicket),
        count: jest.fn().mockResolvedValue(1),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportTicketsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SupportTicketsService);
  });

  it('creates a ticket in the caller organization, ignoring a planted org id', async () => {
    await service.create(
      {
        subject: 'Missing receipt',
        description: 'The January receipt never arrived in my inbox.',
        organizationId: 'org-other',
      },
      tenantActor,
    );
    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization: { connect: { id: 'org-1' } },
        raisedBy: { connect: { id: 'u-tenant' } },
      }),
      include: expect.anything(),
    });
  });

  it('requires an explicit org when the platform raises on paper', async () => {
    await expect(
      service.create(
        {
          subject: 'On behalf',
          description: 'Raised by phone on behalf of the tenant.',
        },
        platformActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes reads to the caller organization — cross-tenant is 404', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue(null);
    await expect(service.findOne('t-9', tenantActor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.supportTicket.findFirst).toHaveBeenCalledWith({
      where: { id: 't-9', organizationId: 'org-1' },
      include: expect.anything(),
    });
  });

  it('lets a tenant close their own ticket but nothing else', async () => {
    const closed = await service.setStatus(
      't-1',
      { status: TicketStatus.CLOSED } as any,
      tenantActor,
    );
    expect(closed.status).toBe(TicketStatus.CLOSED);

    await expect(
      service.setStatus(
        't-1',
        { status: TicketStatus.IN_PROGRESS } as any,
        tenantActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a tenant-written resolution — it is the platform answer', async () => {
    await expect(
      service.setStatus(
        't-1',
        { status: TicketStatus.CLOSED, resolution: 'fixed it' } as any,
        tenantActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a resolution when the platform resolves', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue({
      ...openTicket,
      status: TicketStatus.IN_PROGRESS,
    });
    await expect(
      service.setStatus(
        't-1',
        { status: TicketStatus.RESOLVED } as any,
        platformActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const resolved = await service.setStatus(
      't-1',
      { status: TicketStatus.RESOLVED, resolution: 'Re-sent.' } as any,
      platformActor,
    );
    expect(resolved.status).toBe(TicketStatus.RESOLVED);
    expect(resolved.resolvedById).toBe('sup-1');
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
  });

  it('refuses an illegal jump even for the platform (OPEN → RESOLVED)', async () => {
    await expect(
      service.setStatus(
        't-1',
        { status: TicketStatus.RESOLVED, resolution: 'Too fast.' } as any,
        platformActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only deletes OPEN tickets', async () => {
    await expect(service.remove('t-1', tenantActor)).resolves.toEqual({
      deleted: true,
    });
    prisma.supportTicket.findFirst.mockResolvedValue({
      ...openTicket,
      status: TicketStatus.CLOSED,
    });
    await expect(service.remove('t-1', tenantActor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
