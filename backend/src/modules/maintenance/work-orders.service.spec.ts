import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  MaintenanceCategory,
  UserRole,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
} from '@prisma/client';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { MaintenanceNotificationsService } from './maintenance-notifications.service';

/**
 * The parts of the work-order service that are rules rather than plumbing:
 * tenant scoping on every reference, the reference sequence, the gates the state
 * machine enforces at the boundary, and the cases where a refusal is better
 * than a half-written record.
 */
describe('WorkOrdersService', () => {
  let service: WorkOrdersService;
  let prisma: ReturnType<typeof mockPrisma>;
  let notifications: {
    announceNewWorkOrder: jest.Mock;
    announceAssigned: jest.Mock;
    announceStatusToTenant: jest.Mock;
  };

  const technician = {
    id: 'tech-1',
    firstName: 'Sam',
    lastName: 'Otieno',
    isActive: true,
  };

  function workOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'wo-1',
      organizationId: 'org-1',
      reference: 'WO-2026-0001',
      title: 'Kitchen tap dripping',
      description: 'Constant drip from the cold tap.',
      category: MaintenanceCategory.PLUMBING,
      priority: WorkOrderPriority.NORMAL,
      status: WorkOrderStatus.REQUESTED,
      source: WorkOrderSource.STAFF,
      reportedAt: new Date(),
      inspectionNote: null,
      resolutionNote: null,
      assignedTechnicianId: null,
      tasks: [],
      ...overrides,
    };
  }

  function mockPrisma() {
    // A tiny in-memory stand-in that actually honours `where`, because several
    // rules here are "only while it is still X" — a mock that ignores the filter
    // would happily let a withdrawn request be withdrawn twice.
    const rows: any[] = [workOrder()];
    const matches = (row: Record<string, any>, where: Record<string, any> = {}) =>
      Object.entries(where).every(([key, value]) => {
        if (value === undefined) return true;
        if (key === 'status' && typeof value === 'object') {
          return Object.values(value as object).includes(row.status);
        }
        return row[key] === value;
      });

    const workOrderModel = {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
        ),
      findMany: jest.fn().mockImplementation(() => Promise.resolve([...rows])),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
        ),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const row = {
          ...workOrder(),
          ...data,
          id: 'wo-new',
          reference: 'WO-2026-0002',
          status: data.status ?? WorkOrderStatus.REQUESTED,
          tasks: data.tasks?.create ?? [],
          organizationId: 'org-1',
        };
        delete (row as any).tasks?.create;
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const row = rows.find((candidate) => candidate.id === where.id) ?? workOrder();
        Object.assign(row, data);
        return Promise.resolve({ ...row });
      }),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    };

    return {
      workOrder: workOrderModel,
      workOrderTask: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'task-1',
          ...data,
        })),
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          workOrderId: 'wo-1',
          isDone: false,
          organizationId: 'org-1',
        }),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'task-1',
          ...data,
        })),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      property: { findFirst: jest.fn().mockResolvedValue({ id: 'prop-1' }) },
      unit: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'unit-1', propertyId: 'prop-1' }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'unit-1', propertyId: 'prop-1' }),
      },
      tenant: { findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      asset: { findFirst: jest.fn().mockResolvedValue({ id: 'asset-1' }) },
      user: {
        findFirst: jest.fn().mockResolvedValue(technician),
        findMany: jest.fn().mockResolvedValue([technician]),
      },
      rentalAgreement: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lease-1',
          organizationId: 'org-1',
          unitId: 'unit-1',
          unit: { propertyId: 'prop-1' },
        }),
      },
      organization: { findMany: jest.fn().mockResolvedValue([]) },
      /** Seed a row directly — used by the tests that need a specific state. */
      __rows: rows,
    };
  }

  const portalSession = {
    user: { userId: 'user-1', portalTenantId: 'tenant-1' },
  };

  beforeEach(async () => {
    prisma = mockPrisma();
    notifications = {
      announceNewWorkOrder: jest.fn().mockResolvedValue(undefined),
      announceAssigned: jest.fn().mockResolvedValue(undefined),
      announceStatusToTenant: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { logAction: jest.fn() } },
        {
          provide: MaintenanceNotificationsService,
          useValue: notifications,
        },
      ],
    }).compile();

    service = moduleRef.get(WorkOrdersService);
  });

  // ------------------------------------------------------------- tenant scoping

  it('404s a work order belonging to another organization', async () => {
    await expect(service.findOne('wo-1', 'org-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to attach a work order to another tenant’s property', async () => {
    prisma.property.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          title: 'Broken lock',
          description: 'The front door will not open.',
          category: MaintenanceCategory.SECURITY,
          propertyId: 'prop-theirs',
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a unit that belongs to a different property than the one claimed', async () => {
    prisma.unit.findFirst.mockResolvedValue({
      id: 'unit-1',
      propertyId: 'prop-other',
    });

    await expect(
      service.create(
        {
          title: 'Broken lock',
          description: 'The front door will not open.',
          category: MaintenanceCategory.SECURITY,
          propertyId: 'prop-1',
          unitId: 'unit-1',
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to assign work to somebody who is not a technician here', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.assign(
        'wo-1',
        { technicianId: 'someone-else' },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---------------------------------------------------------------- portal side

  it('takes the tenant, unit and property from the session lease, not the body', async () => {
    await service.createFromPortal(
      {
        title: 'Bathroom tap will not stop',
        description: 'Water is running all night.',
        category: MaintenanceCategory.PLUMBING,
      },
      portalSession,
    );

    expect(prisma.rentalAgreement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1' }),
      }),
    );

    const data = prisma.workOrder.create.mock.calls[0][0].data;
    expect(data.tenant.connect).toEqual({ id: 'tenant-1' });
    expect(data.unit.connect).toEqual({ id: 'unit-1' });
    expect(data.property.connect).toEqual({ id: 'prop-1' });
    expect(data.source).toBe(WorkOrderSource.TENANT_PORTAL);
  });

  it('refuses a portal report with no active lease behind it', async () => {
    prisma.rentalAgreement.findFirst.mockResolvedValue(null);

    await expect(
      service.createFromPortal(
        {
          title: 'Bathroom tap will not stop',
          description: 'Water is running all night.',
          category: MaintenanceCategory.PLUMBING,
        },
        portalSession,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only lets a resident withdraw their own request while it is untouched', async () => {
    prisma.__rows.push(workOrder({ id: 'wo-mine', tenantId: 'tenant-1' }));

    await expect(
      service.withdrawFromPortal('wo-mine', portalSession),
    ).resolves.toMatchObject({ status: WorkOrderStatus.CANCELLED });

    // A report that is already being worked on is not withdrawable: that is a
    // cancellation with a reason, not a silent disappearance.
    prisma.__rows.push(
      workOrder({
        id: 'wo-started',
        tenantId: 'tenant-1',
        status: WorkOrderStatus.IN_PROGRESS,
      }),
    );
    await expect(
      service.withdrawFromPortal('wo-started', portalSession),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Nor somebody else's report.
    prisma.__rows.push(workOrder({ id: 'wo-theirs', tenantId: 'tenant-2' }));
    await expect(
      service.withdrawFromPortal('wo-theirs', portalSession),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // --------------------------------------------------------------- references

  it('allocates the next sequential reference for the organization', async () => {
    prisma.workOrder.findFirst.mockResolvedValueOnce({
      reference: 'WO-2026-0007',
    } as never);

    await service.create(
      {
        title: 'Kitchen tap dripping',
        description: 'Constant drip from the cold tap.',
        category: MaintenanceCategory.PLUMBING,
      },
      'org-1',
    );

    expect(prisma.workOrder.create.mock.calls[0][0].data.reference).toBe(
      'WO-2026-0008',
    );
  });

  it('starts a fresh organization at WO-…-0001', async () => {
    prisma.workOrder.findFirst.mockResolvedValueOnce(null);

    await service.create(
      {
        title: 'Kitchen tap dripping',
        description: 'Constant drip from the cold tap.',
        category: MaintenanceCategory.PLUMBING,
      },
      'org-1',
    );

    expect(prisma.workOrder.create.mock.calls[0][0].data.reference).toBe(
      `WO-${new Date().getFullYear()}-0001`,
    );
  });

  // --------------------------------------------------------------- transitions

  it('refuses an inspection that records no finding', async () => {
    await expect(
      service.inspect('wo-1', { inspectionNote: '   ' }, 'org-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records the finding and moves to INSPECTION', async () => {
    const result = await service.inspect(
      'wo-1',
      { inspectionNote: 'Failed fill valve, needs replacing.' },
      'org-1',
    );

    expect(result.status).toBe(WorkOrderStatus.INSPECTION);
    expect(result.inspectionNote).toBe(
      'Failed fill valve, needs replacing.',
    );
  });

  it('refuses to complete while checklist items are open', async () => {
    prisma.workOrder.findFirst.mockResolvedValue(
      workOrder({ status: WorkOrderStatus.IN_PROGRESS }),
    );
    prisma.workOrderTask.count.mockResolvedValue(2);

    await expect(
      service.complete(
        'wo-1',
        { resolutionNote: 'Replaced the valve.' },
        'org-1',
      ),
    ).rejects.toThrow(/2 checklist items are still open/i);
  });

  it('refuses a completion with no resolution note', async () => {
    prisma.workOrder.findFirst.mockResolvedValue(
      workOrder({ status: WorkOrderStatus.IN_PROGRESS }),
    );

    await expect(
      service.complete(
        'wo-1',
        { resolutionNote: '   ' },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('completes with the note the resident will read', async () => {
    prisma.workOrder.findFirst.mockResolvedValue(
      workOrder({ status: WorkOrderStatus.IN_PROGRESS }),
    );

    const result = await service.complete(
      'wo-1',
      { resolutionNote: 'Replaced the fill valve.', actualCost: 4500 },
      'org-1',
    );

    expect(result.status).toBe(WorkOrderStatus.COMPLETED);
    expect(result.resolutionNote).toBe('Replaced the fill valve.');
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(Number(result.actualCost)).toBe(4500);
  });

  it('approves and assigns in one action', async () => {
    prisma.workOrder.findFirst.mockResolvedValue(
      workOrder({
        status: WorkOrderStatus.INSPECTION,
        inspectionNote: 'Failed fill valve.',
      }),
    );

    const result = await service.approve(
      'wo-1',
      { technicianId: 'tech-1' },
      'org-1',
    );

    expect(result.status).toBe(WorkOrderStatus.ASSIGNED);
    expect(notifications.announceAssigned).toHaveBeenCalled();
  });

  it('will not cancel a job that has already started', async () => {
    prisma.workOrder.findFirst.mockResolvedValue(
      workOrder({ status: WorkOrderStatus.IN_PROGRESS }),
    );

    await expect(
      service.cancel('wo-1', { reason: 'Fixed by the tenant.' }, 'org-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // -------------------------------------------------------------- delete rules

  it('refuses to delete a work order that is already being worked on', async () => {
    prisma.workOrder.findFirst.mockResolvedValue(
      workOrder({ status: WorkOrderStatus.ASSIGNED }),
    );

    await expect(service.remove('wo-1', 'org-1')).rejects.toThrow(
      /cancel it instead of deleting/i,
    );
    expect(prisma.workOrder.delete).not.toHaveBeenCalled();
  });

  it('deletes a work order that is still just a report', async () => {
    await expect(service.remove('wo-1', 'org-1')).resolves.toMatchObject({
      message: 'Work order deleted.',
    });
  });

  // --------------------------------------------------------------- bulk assign

  it('reports per-row outcomes when a bulk assign hits an illegal row', async () => {
    prisma.workOrder.findFirst
      .mockResolvedValueOnce(workOrder({ id: 'wo-1', status: WorkOrderStatus.APPROVED }))
      .mockResolvedValueOnce(
        workOrder({ id: 'wo-2', status: WorkOrderStatus.COMPLETED }),
      );

    const result = await service.bulkAssign(
      { workOrderIds: ['wo-1', 'wo-2'], technicianId: 'tech-1' },
      'org-1',
    );

    expect(result.assigned).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[1].ok).toBe(false);
  });

  // -------------------------------------------------------------------- stats

  it('counts overdue work from the derived response window, not a flag', async () => {
    const longAgo = new Date(Date.now() - 30 * 86_400_000);
    prisma.workOrder.findMany.mockResolvedValue([
      {
        priority: WorkOrderPriority.EMERGENCY,
        reportedAt: longAgo,
        status: WorkOrderStatus.REQUESTED,
        scheduledFor: null,
        assignedTechnicianId: null,
      },
      {
        priority: WorkOrderPriority.NORMAL,
        reportedAt: new Date(),
        status: WorkOrderStatus.ASSIGNED,
        scheduledFor: null,
        assignedTechnicianId: 'tech-1',
      },
    ]);

    const stats = await service.stats('org-1');

    expect(stats.overdue).toBe(1);
    expect(stats.unassigned).toBe(1);
    expect(stats.open).toBe(2);
  });

  // ---------------------------------------------------------------- technicians

  it('offers only maintenance-capable roles for assignment', async () => {
    await service.listTechnicians('org-1');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: expect.objectContaining({
            in: expect.arrayContaining([UserRole.TECHNICIAN, UserRole.MAINTENANCE_MANAGER]),
          }),
        }),
      }),
    );
  });
});
