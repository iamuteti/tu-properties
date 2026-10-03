import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AgreementStatus, TenantRequestStatus, TenantRequestType } from '@prisma/client';
import { TenantRequestsService } from './tenant-requests.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { RentalAgreementsService } from '@/modules/leases/rental-agreements.service';
import { MoveoutsService } from '@/modules/moveouts/moveouts.service';

/**
 * The queue's own rules — the part that is new rather than delegated:
 *   1. a resident can only ever request against their own active lease,
 *   2. one open request per (lease, type),
 *   3. a short-notice move-out is flagged for staff, not refused,
 *   4. approval **delegates** to the leasing / move-out services, so the same
 *      gates and audit trail apply as for a staff-initiated change,
 *   5. the decision is a state machine (one decision per request).
 */
describe('TenantRequestsService', () => {
  let service: TenantRequestsService;

  const activeLease = {
    id: 'lease-1',
    code: 'RA-1',
    organizationId: 'org-1',
    status: AgreementStatus.ACTIVE,
    endDate: new Date(Date.now() + 30 * 86_400_000),
    noticePeriodDays: 60,
    rentAmount: 45_000,
    currency: 'KES',
    unit: { id: 'unit-1', name: 'Flat 1' },
  };

  const pendingRequest: any = {
    id: 'req-1',
    organizationId: 'org-1',
    tenantId: 'tenant-1',
    rentalAgreementId: 'lease-1',
    type: TenantRequestType.RENEWAL,
    status: TenantRequestStatus.PENDING,
    payload: { termMonths: 12 },
    preferredDate: null,
    earlyNotice: false,
  };

  const portalSession = {
    user: { userId: 'user-1', email: 'resident@example.com', portalTenantId: 'tenant-1' },
  };
  const staffSession = {
    user: { userId: 'admin-1', email: 'a@x.co' },
  };

  function mockPrisma() {
    const requestModel = {
      create: jest.fn().mockImplementation(({ data }: any) => ({
        ...pendingRequest,
        ...data,
      })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([pendingRequest]),
      update: jest.fn().mockImplementation(({ where, data }: any) => ({
        ...pendingRequest,
        ...where,
        ...data,
      })),
    };
    return {
      tenantRequest: requestModel,
      rentalAgreement: {
        findFirst: jest.fn().mockResolvedValue(activeLease),
      },
    };
  }

  let prisma: ReturnType<typeof mockPrisma>;
  let leases: { renew: jest.Mock };
  let moveouts: { create: jest.Mock; approve: jest.Mock };

  beforeEach(async () => {
    prisma = mockPrisma();
    leases = { renew: jest.fn().mockResolvedValue({ previous: { id: 'lease-1', code: 'RA-1' }, lease: { id: 'lease-2', code: 'RA-2' } }) };
    moveouts = {
      create: jest.fn().mockResolvedValue({ id: 'mo-1' }),
      approve: jest.fn().mockResolvedValue({ id: 'mo-1', status: 'APPROVED' }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TenantRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { logAction: jest.fn() } },
        { provide: RentalAgreementsService, useValue: leases },
        { provide: MoveoutsService, useValue: moveouts },
      ],
    }).compile();
    service = moduleRef.get(TenantRequestsService);
  });

  describe('resident submission', () => {
    it('scopes the request to the tenant on the session, resolving their active lease', async () => {
      await service.createFromPortal(
        { type: TenantRequestType.RENEWAL, payload: { termMonths: 12 } },
        portalSession,
      );

      expect(prisma.rentalAgreement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', status: 'ACTIVE' }),
        }),
      );
      const args = prisma.tenantRequest.create.mock.calls[0][0];
      expect(args.data.tenantId).toBe('tenant-1');
      expect(args.data.rentalAgreementId).toBe('lease-1');
      // The payload is snapshotted so a later lease change cannot rewrite it.
      expect(args.data.payload).toEqual({ termMonths: 12 });
    });

    it('refuses a staff session outright', async () => {
      await expect(
        service.createFromPortal({ type: TenantRequestType.RENEWAL }, staffSession),
      ).rejects.toThrow(/not a tenant portal account/i);
    });

    it('refuses a request against another household\u2019s lease', async () => {
      prisma.rentalAgreement.findFirst.mockResolvedValue(null);
      await expect(
        service.createFromPortal(
          { type: TenantRequestType.RENEWAL, rentalAgreementId: 'someone-elses-lease' },
          portalSession,
        ),
      ).rejects.toThrow(/need an active lease/i);
      expect(prisma.tenantRequest.create).not.toHaveBeenCalled();
    });

    it('allows only one open request per lease and type', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue({ id: 'req-existing' });
      await expect(
        service.createFromPortal(
          { type: TenantRequestType.RENEWAL },
          portalSession,
        ),
      ).rejects.toThrow(/already have a renewal request/i);
    });

    it('flags a move-out inside the notice period instead of refusing it', async () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 10);

      await service.createFromPortal(
        { type: TenantRequestType.MOVE_OUT, preferredDate: soon.toISOString() },
        portalSession,
      );

      const args = prisma.tenantRequest.create.mock.calls[0][0];
      expect(args.data.earlyNotice).toBe(true);
      // Still submitted: the short notice is a flag for staff, not a refusal.
      expect(args.data).not.toHaveProperty('status');
    });

    it('does not flag a move-out that respects the notice period', async () => {
      const later = new Date();
      later.setDate(later.getDate() + 90);

      await service.createFromPortal(
        { type: TenantRequestType.MOVE_OUT, preferredDate: later.toISOString() },
        portalSession,
      );

      expect(prisma.tenantRequest.create.mock.calls[0][0].data.earlyNotice).toBe(false);
    });
  });

  describe('withdrawal', () => {
    it('lets the resident withdraw while it is pending', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        status: TenantRequestStatus.PENDING,
      });

      const result = await service.withdraw('req-1', portalSession);

      expect(prisma.tenantRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: TenantRequestStatus.WITHDRAWN }),
        }),
      );
      expect(result.status).toBe(TenantRequestStatus.WITHDRAWN);
    });

    it('refuses to withdraw an already decided request', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        status: TenantRequestStatus.REJECTED,
      });

      await expect(service.withdraw('req-1', portalSession)).rejects.toThrow(
        /no longer be withdrawn/i,
      );
    });
  });

  describe('staff decisions', () => {
    it('approving a renewal delegates to the leasing service', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue(pendingRequest);

      const result = await service.decide(
        'req-1',
        { decision: 'APPROVE' },
        'org-1',
        'admin-1',
        staffSession,
      );

      expect(leases.renew).toHaveBeenCalledWith(
        'lease-1',
        expect.objectContaining({ termMonths: 12 }),
        'org-1',
      );
      expect(prisma.tenantRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TenantRequestStatus.APPROVED,
            decidedById: 'admin-1',
            result: expect.objectContaining({ action: 'LEASE_RENEWED', newLeaseId: 'lease-2' }),
          }),
        }),
      );
      expect(result.status).toBe(TenantRequestStatus.APPROVED);
    });

    it('approving a move-out raises and approves the move-out request', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        type: TenantRequestType.MOVE_OUT,
        preferredDate: new Date('2026-12-01'),
      });

      await service.decide('req-1', { decision: 'APPROVE' }, 'org-1', 'admin-1');

      expect(moveouts.create).toHaveBeenCalled();
      expect(moveouts.approve).toHaveBeenCalledWith(
        'mo-1',
        expect.anything(),
        'org-1',
        'admin-1',
      );
    });

    it('a type with no delegate records the decision instead of pretending to act', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        type: TenantRequestType.PAYMENT_PLAN,
      });

      await service.decide('req-1', { decision: 'APPROVE' }, 'org-1', 'admin-1');

      expect(prisma.tenantRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: expect.objectContaining({ action: 'RECORDED_ONLY' }),
          }),
        }),
      );
    });

    it('propagates a refusal from the delegated service and leaves the request pending', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue(pendingRequest);
      leases.renew.mockRejectedValue(
        new ConflictException('This lease runs until 2027-06-01. Renewal opens 60 days before it ends.'),
      );

      await expect(
        service.decide('req-1', { decision: 'APPROVE' }, 'org-1', 'admin-1'),
      ).rejects.toThrow(/Renewal opens 60 days before/);
      expect(prisma.tenantRequest.update).not.toHaveBeenCalled();
    });

    it('requires a note for a rejection — it is what the resident reads', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue(pendingRequest);
      await expect(
        service.decide('req-1', { decision: 'REJECT' }, 'org-1', 'admin-1'),
      ).rejects.toThrow(/rejection needs a note/i);
    });

    it('stores the rejection note', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue(pendingRequest);
      await service.decide(
        'req-1',
        { decision: 'REJECT', decisionNote: 'Renewal is not possible this year.' },
        'org-1',
        'admin-1',
      );

      expect(prisma.tenantRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TenantRequestStatus.REJECTED,
            decisionNote: 'Renewal is not possible this year.',
          }),
        }),
      );
    });

    it('refuses a second decision on the same request', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        status: TenantRequestStatus.APPROVED,
      });

      await expect(
        service.decide('req-1', { decision: 'APPROVE' }, 'org-1', 'admin-1'),
      ).rejects.toThrow(/already approved/i);
      expect(leases.renew).not.toHaveBeenCalled();
    });

    it('refuses a request from another organization', async () => {
      prisma.tenantRequest.findFirst.mockResolvedValue(null);
      await expect(
        service.decide('req-1', { decision: 'APPROVE' }, 'org-2', 'admin-2'),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('queue listing', () => {
    it('scopes the staff queue to the organization and filters', async () => {
      await service.findAll('org-1', { status: 'PENDING', type: 'RENEWAL' });

      expect(prisma.tenantRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', status: 'PENDING', type: 'RENEWAL' },
        }),
      );
    });
  });
});