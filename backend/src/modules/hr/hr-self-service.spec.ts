import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { WorkflowsService } from '@/modules/workflow/workflows.service';
import { WorkflowHooksRegistry } from '@/modules/workflow/workflow-hooks';
import { AuditService } from '@/modules/audit/audit.service';
import { EmployeesService } from './employees.service';
import { LeaveService } from './leave.service';

/**
 * Self-service scoping (Module 12).
 *
 * The property under test is the one the whole `self` permission rests on: **a
 * caller cannot name somebody else's employment record.** Everything else here is
 * in service of proving that, so the assertions are mostly negative — a 404, a
 * thrown error, and one check that a deliberately planted `employeeId` in the
 * request body is discarded rather than obeyed.
 *
 * A test that only proved "the employee can see their own payslip" would pass
 * against the vulnerable version of this code, which is exactly why the
 * cross-employee cases are the point.
 */

/** Every model the two services under test touch, as a mock. Declared once so a
 *  new query shows up as a compile error rather than a runtime `undefined.map`. */
type PrismaMock = {
  employee: { findFirst: jest.Mock; findMany: jest.Mock };
  leaveRequest: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  payslip: { findMany: jest.Mock };
  organization: { findUnique: jest.Mock };
  holiday: { findMany: jest.Mock };
  leavePolicy: { findFirst: jest.Mock };
};
const ORG = 'org-1';

const employeeFor = (userId: string, id = `emp-${userId}`) => ({
  id,
  organizationId: ORG,
  userId,
  employeeNumber: id.toUpperCase(),
  firstName: 'Test',
  lastName: 'Person',
  preferredLocale: null,
  department: null,
  jobTitle: null,
  employmentType: 'FULL_TIME' as const,
  hireDate: new Date('2024-01-01'),
  terminationDate: null,
  basicSalary: { toString: () => '100000' },
  salaryCurrency: 'KES',
  payFrequency: 'MONTHLY' as const,
  periodsPerYear: 12,
  nationalId: null,
  taxNumber: null,
  socialSecurityNumber: null,
  bankAccount: null,
  bankName: null,
  bankBranch: null,
  bankCode: null,
  address: null,
  phone: null,
  email: null,
  isActive: true,
  leavePolicyId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  leavePolicy: null,
  user: null,
  components: [],
  basicSalaryOverride: undefined,
});

const emptyCalendar = {
  weekendDays: [6, 7] as number[],
  holidayDates: [] as string[],
};

/** A leave request row as `create()` and `cancel()` re-read it after writing. */
const leaveRow = (id: string, employeeId: string) => ({
  id,
  organizationId: ORG,
  employeeId,
  status: 'PENDING',
  startDate: new Date('2027-06-07'),
  endDate: new Date('2027-06-11'),
  leaveType: 'ANNUAL',
  reason: null,
  decisionNote: null,
  decidedAt: null,
  decidedById: null,
  workflowInstanceId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  employee: {
    id: employeeId,
    employeeNumber: employeeId.toUpperCase(),
    firstName: 'A',
    lastName: 'B',
    preferredName: null,
    userId: null,
    leavePolicyId: null,
    organizationId: ORG,
    leavePolicy: null,
  },
  workingDays: 5,
  balance: { remaining: 16 },
  clashesWith: [],
  employeeName: 'A B',
});

describe('LeaveService self-service scoping (Module 12)', () => {
  let prisma: PrismaMock;
  let leave: LeaveService;

  const build = async () => {
    prisma = {
      employee: { findFirst: jest.fn(), findMany: jest.fn() },
      leaveRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      payslip: { findMany: jest.fn() },
      organization: { findUnique: jest.fn() },
      holiday: { findMany: jest.fn() },
      leavePolicy: { findFirst: jest.fn() },
    };

    const employees = {
      workingCalendar: jest.fn().mockResolvedValue(emptyCalendar),
      resolvePolicy: jest.fn().mockResolvedValue({
        id: 'pol-1',
        code: 'DEFAULT',
        name: 'Standard',
        annualEntitlementDays: 21,
        carryoverLimitDays: 5,
        minNoticeDays: 7,
        minNoticeWaivedDays: 1,
        unpaidAllowed: true,
        maxConsecutiveDays: null,
      }),
      record: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmployeesService, useValue: employees },
        {
          provide: WorkflowsService,
          useValue: {
            start: jest
              .fn()
              .mockResolvedValue({ id: 'wf-1', status: 'APPROVED' }),
          },
        },
        { provide: WorkflowHooksRegistry, useValue: { register: jest.fn() } },
      ],
    }).compile();

    leave = moduleRef.get(LeaveService);
  };

  beforeEach(async () => {
    await build();
  });

  describe('createForSelf', () => {
    it('files the request for the caller, not for the employee id in the body', async () => {
      prisma.employee.findFirst.mockResolvedValue(
        employeeFor('user-a', 'emp-a'),
      );
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.create.mockImplementation(({ data }) => ({
        id: 'lr-1',
        ...data,
      }));
      prisma.leaveRequest.findFirst.mockResolvedValue(
        leaveRow('lr-1', 'emp-a'),
      );

      const result = await leave.createForSelf(
        'user-a',
        {
          // Deliberately pointing at somebody else.
          employeeId: 'emp-somebody-else',
          startDate: '2027-06-07',
          endDate: '2027-06-11',
          leaveType: 'ANNUAL' as never,
        },
        ORG,
      );

      // Asserted on the relation rather than a flat field, because that is what
      // Prisma actually writes and a flat `employeeId` assertion would pass on a
      // payload that never set the link at all.
      const created = prisma.leaveRequest.create.mock.calls[0][0].data;
      expect(created.employee.connect.id).toBe('emp-a');
      expect(created.employee.connect.id).not.toBe('emp-somebody-else');
      expect(JSON.stringify(created)).not.toContain('emp-somebody-else');
      expect(result.employeeId).toBe('emp-a');
    });

    it('refuses when the login has no employment record', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        leave.createForSelf(
          'user-a',
          {
            employeeId: 'emp-a',
            startDate: '2027-06-07',
            endDate: '2027-06-11',
          },
          ORG,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("never writes a row for the body's employee id, whatever it said", async () => {
      prisma.employee.findFirst.mockResolvedValue(
        employeeFor('user-a', 'emp-a'),
      );
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.create.mockImplementation(({ data }) => ({
        id: 'lr-1',
        ...data,
      }));
      prisma.leaveRequest.findFirst.mockResolvedValue(
        leaveRow('lr-1', 'emp-a'),
      );

      await leave.createForSelf(
        'user-a',
        {
          employeeId: 'emp-victim',
          startDate: '2027-06-07',
          endDate: '2027-06-11',
          leaveType: 'UNPAID' as never,
        },
        ORG,
      );

      for (const call of prisma.leaveRequest.create.mock.calls) {
        expect(JSON.stringify(call[0].data)).not.toContain('emp-victim');
      }
    });
  });

  describe('cancelForSelf', () => {
    it("refuses somebody else's request with a 404, not a 403", async () => {
      prisma.employee.findFirst.mockResolvedValue(
        employeeFor('user-a', 'emp-a'),
      );
      prisma.leaveRequest.findFirst.mockResolvedValue({
        id: 'lr-9',
        organizationId: ORG,
        employeeId: 'emp-victim',
        status: 'PENDING',
        startDate: new Date(),
        endDate: new Date(),
        leaveType: 'ANNUAL',
        reason: null,
        decisionNote: null,
        decidedAt: null,
        decidedById: null,
        workflowInstanceId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        employee: {
          id: 'emp-victim',
          employeeNumber: 'EMP-V',
          firstName: 'V',
          lastName: 'Ictim',
          preferredName: null,
          userId: null,
          leavePolicyId: null,
          organizationId: ORG,
        },
      });

      await expect(leave.cancelForSelf('user-a', 'lr-9', ORG)).rejects.toThrow(
        NotFoundException,
      );

      // Nothing was written: a refusal that still mutated would be worse than
      // showing the wrong thing.
      expect(prisma.leaveRequest.update).not.toHaveBeenCalled();
    });

    it("cancels the caller's own request", async () => {
      prisma.employee.findFirst.mockResolvedValue(
        employeeFor('user-a', 'emp-a'),
      );
      prisma.leaveRequest.findFirst.mockResolvedValue({
        id: 'lr-1',
        organizationId: ORG,
        employeeId: 'emp-a',
        status: 'PENDING',
        startDate: new Date(),
        endDate: new Date(),
        leaveType: 'ANNUAL',
        reason: null,
        decisionNote: null,
        decidedAt: null,
        decidedById: null,
        workflowInstanceId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        employee: {
          id: 'emp-a',
          employeeNumber: 'EMP-A',
          firstName: 'A',
          lastName: 'B',
          preferredName: null,
          userId: 'user-a',
          leavePolicyId: null,
          organizationId: ORG,
        },
      });
      prisma.leaveRequest.update.mockResolvedValue({});
      // `findOne` re-reads the request and then computes the balance, which is a
      // second query against approved leave. Empty is fine — a balance with
      // nothing taken is the interesting case anyway.
      prisma.leaveRequest.findFirst.mockResolvedValue(
        leaveRow('lr-1', 'emp-a'),
      );
      prisma.leaveRequest.findMany.mockResolvedValue([]);

      await leave.cancelForSelf('user-a', 'lr-1', ORG);

      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lr-1' },
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    });
  });

  describe('listForSelf', () => {
    it('scopes to the caller even when the caller is in a tenant with many staff', async () => {
      prisma.employee.findFirst.mockResolvedValue(
        employeeFor('user-a', 'emp-a'),
      );
      prisma.leaveRequest.findMany.mockResolvedValue([]);

      await leave.listForSelf('user-a', ORG);

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employeeId: 'emp-a' }),
        }),
      );
    });
  });
});

describe('EmployeesService.selfRecord (Module 12)', () => {
  let prisma: PrismaMock;
  let employees: EmployeesService;

  beforeEach(async () => {
    prisma = {
      employee: { findFirst: jest.fn(), findMany: jest.fn() },
      leaveRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      payslip: { findMany: jest.fn().mockResolvedValue([]) },
      organization: { findUnique: jest.fn() },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      leavePolicy: { findFirst: jest.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: { logAction: jest.fn() },
        },
      ],
    }).compile();

    employees = moduleRef.get(EmployeesService);
  });

  it('looks the employee up by the login, not by an id', async () => {
    prisma.employee.findFirst.mockResolvedValue(employeeFor('user-a', 'emp-a'));

    await employees.selfRecord('user-a', ORG);

    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-a', organizationId: ORG },
      }),
    );
  });

  it('explains itself when the login has no employment record', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(employees.selfRecord('user-a', ORG)).rejects.toThrow(
      /not linked to an employment record/,
    );
  });
});
