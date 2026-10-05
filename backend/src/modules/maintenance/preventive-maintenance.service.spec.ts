import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import {
  AssetStatus,
  AssetType,
  MaintenanceCategory,
  PmRunStatus,
  WorkOrderSource,
  WorkOrderStatus,
} from '@prisma/client';
import { PreventiveMaintenanceService } from './preventive-maintenance.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';

/**
 * The sweep is the load-bearing part of this module: a schedule that is due must
 * produce exactly one work order per period, however many times the job runs.
 * These tests pin that, the lead-time window, and the cases where a service must
 * deliberately *not* be raised.
 */
describe('PreventiveMaintenanceService', () => {
  let service: PreventiveMaintenanceService;
  let prisma: ReturnType<typeof mockPrisma>;

  const today = new Date('2026-06-01T00:00:00.000Z');
  const daysAgo = (n: number) =>
    new Date(Date.UTC(2026, 5, 1) - n * 86_400_000);
  const daysAhead = (n: number) =>
    new Date(Date.UTC(2026, 5, 1) + n * 86_400_000);

  function schedule(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pm-1',
      organizationId: 'org-1',
      assetId: 'asset-1',
      title: 'Monthly generator service',
      description: 'Oil, filters, belts, load test.',
      checklist: ['Check oil level', 'Run under load for 10 minutes'],
      frequencyDays: 30,
      leadTimeDays: 0,
      assignedTechnicianId: 'tech-1',
      active: true,
      nextDueAt: today,
      lastRunAt: null,
      asset: {
        id: 'asset-1',
        name: 'Generator 1',
        type: AssetType.GENERATOR,
        status: AssetStatus.OPERATIONAL,
      },
      ...overrides,
    };
  }

  function mockPrisma(rows: any[] = [schedule()]) {
    const created: any[] = [];

    const models = {
      preventiveMaintenanceSchedule: {
        findMany: jest.fn().mockResolvedValue(rows),
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(rows.find((row) => row.id === where.id) ?? null),
          ),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      preventiveMaintenanceRun: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'run-1', ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'run-1',
          ...data,
        })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      workOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const row = { id: 'wo-9', ...data };
          created.push(row);
          return Promise.resolve(row);
        }),
      },
      workOrderTask: { count: jest.fn().mockResolvedValue(0) },
      asset: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ propertyId: 'prop-1' }),
        update: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'tech-1' }) },
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
    };

    return {
      ...models,
      created,
      // The service wraps each raise in a transaction; the tests assert on the
      // same mocks, so the "transaction client" is the client here.
      $transaction: jest.fn(
        async (work: (tx: typeof models) => Promise<unknown>) => work(models),
      ),
    };
  }

  async function build(rows?: any[]) {
    prisma = mockPrisma(rows);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PreventiveMaintenanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { logAction: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(PreventiveMaintenanceService);
  }

  beforeEach(async () => {
    await build();
  });

  // ------------------------------------------------------------------- the sweep

  it('raises one work order for a due schedule and copies its checklist', async () => {
    const run = await service.runForOrganization('org-1', today);

    expect(prisma.workOrder.create).toHaveBeenCalledTimes(1);
    const data = prisma.workOrder.create.mock.calls[0][0].data;
    expect(data.source).toBe(WorkOrderSource.PREVENTIVE);
    expect(data.status).toBe(WorkOrderStatus.REQUESTED);
    expect(data.pmSchedule).toEqual({ connect: { id: 'pm-1' } });
    expect(data.pmDueOn).toEqual(today);
    expect(data.title).toBe('Monthly generator service — Generator 1');
    // A generator is electrical work; the category comes from the asset type so a
    // sweep does not need somebody to pick it by hand every month.
    expect(data.category).toBe(MaintenanceCategory.ELECTRICAL);
    expect(data.tasks.create).toHaveLength(2);
    expect(run.workOrdersCreated).toBe(1);
    expect(run.status).toBe(PmRunStatus.COMPLETED);
  });

  it('advances the schedule by its interval from the period just served', async () => {
    await service.runForOrganization('org-1', today);

    expect(prisma.preventiveMaintenanceSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pm-1' },
        data: { lastRunAt: today, nextDueAt: daysAhead(30) },
      }),
    );
  });

  it('does not raise anything while the lead-time window is still shut', async () => {
    await build([schedule({ nextDueAt: daysAhead(10), leadTimeDays: 7 })]);

    const run = await service.runForOrganization('org-1', today);

    expect(prisma.workOrder.create).not.toHaveBeenCalled();
    expect(run.workOrdersCreated).toBe(0);
    expect(run.schedulesSkipped).toBe(1);
  });

  it('raises early once the lead-time window opens', async () => {
    await build([schedule({ nextDueAt: daysAhead(3), leadTimeDays: 7 })]);

    const run = await service.runForOrganization('org-1', today);

    expect(prisma.workOrder.create).toHaveBeenCalledTimes(1);
    expect(run.workOrdersCreated).toBe(1);
  });

  it('never services a retired asset', async () => {
    await build([
      schedule({
        asset: {
          id: 'asset-1',
          name: 'Old lift',
          type: AssetType.ELEVATOR,
          status: AssetStatus.RETIRED,
        },
      }),
    ]);

    const run = await service.runForOrganization('org-1', today);

    expect(prisma.workOrder.create).not.toHaveBeenCalled();
    expect(run.schedulesSkipped).toBe(1);
    expect(run.details).toMatchObject({
      'pm-1': expect.stringContaining('retired'),
    });
  });

  it('marks the asset as due for service when the work is raised', async () => {
    await service.runForOrganization('org-1', today);

    expect(prisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-1' },
        data: { status: AssetStatus.SERVICE_DUE },
      }),
    );
  });

  it('reports a duplicate period as skipped rather than raising it twice', async () => {
    // The unique (pmScheduleId, pmDueOn) constraint is what actually prevents the
    // second service; the sweep's job is to recognise it and say so.
    prisma.workOrder.create.mockRejectedValueOnce(
      new Error(
        'Unique constraint failed on the fields: (`pmScheduleId`,`pmDueOn`)',
      ),
    );

    const run = await service.runForOrganization('org-1', today);

    expect(run.workOrdersCreated).toBe(0);
    expect(run.schedulesSkipped).toBe(1);
    expect(run.status).toBe(PmRunStatus.COMPLETED);
  });

  it('records one failed schedule without abandoning the rest of the sweep', async () => {
    await build([
      schedule({ id: 'pm-1' }),
      schedule({ id: 'pm-2', title: 'Lift monthly check' }),
    ]);
    prisma.workOrder.create
      .mockRejectedValueOnce(new Error('assigned technician no longer exists'))
      .mockImplementationOnce(({ data }: any) =>
        Promise.resolve({ id: 'wo-9', ...data }),
      );

    const run = await service.runForOrganization('org-1', today);

    expect(run.workOrdersCreated).toBe(1);
    expect(run.schedulesFailed).toBe(1);
    expect(run.status).toBe(PmRunStatus.FAILED);
    expect(run.details).toMatchObject({
      'pm-1': expect.stringContaining('failed'),
      'pm-2': expect.stringContaining('WO-'),
    });
  });

  it('needs a tenant scope to run at all', async () => {
    await expect(service.runForOrganization(undefined, today)).rejects.toThrow(
      /tenant scope is required/i,
    );
  });

  // ------------------------------------------------------------------ run by hand

  it('refuses to raise work for a paused schedule', async () => {
    prisma.preventiveMaintenanceSchedule.findFirst.mockResolvedValue(
      schedule({ active: false }),
    );

    await expect(service.runOne('pm-1', 'org-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('raises one schedule by hand without touching the others', async () => {
    const outcome = await service.runOne('pm-1', 'org-1');

    expect(outcome.created).toBe(true);
    expect(prisma.workOrder.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a hand-run for a period that is not due yet', async () => {
    // The sweep's own due-window test: "run it now" means "raise this period",
    // not "raise the next one early". Compared against the real clock, because
    // `runOne` takes no date.
    const notYetDue = schedule({
      nextDueAt: new Date(Date.now() + 30 * 86_400_000),
      leadTimeDays: 0,
    });
    await build([notYetDue]);
    prisma.preventiveMaintenanceSchedule.findFirst.mockResolvedValue(notYetDue);

    await expect(service.runOne('pm-1', 'org-1')).rejects.toThrow(
      /not until|not due until/i,
    );
    expect(prisma.workOrder.create).not.toHaveBeenCalled();
  });

  it('refuses to run a schedule that does not exist here', async () => {
    prisma.preventiveMaintenanceSchedule.findFirst.mockResolvedValue(null);

    await expect(service.runOne('nope', 'org-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
