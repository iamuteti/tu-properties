import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubscriptionStatus, UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { FILE_STORAGE } from '@/modules/documents/storage/file-storage.interface';
import { PlatformService } from './platform.service';

/**
 * Module 19 — the platform-owner surface.
 *
 * Unlike the tenant modules, these methods take no `organizationId`: the platform
 * administrator is the *absence* of a tenant. The correctness story is therefore not
 * a where-clause a reader has to find, but three transactional guarantees that the
 * shape of the rows depends on:
 *
 * 1. Onboarding is one transaction — org, first admin, trial subscription, or none.
 * 2. Suspension writes three things (org, subscription, sessions) and can't leave
 *    two of them; and a suspension reason is always recorded, never a bare flag.
 * 3. A conflicting slug/email is a 409 with the *duplicate path* named — not a raw
 *    Prisma P2002 text that names nothing actionable.
 */
describe('PlatformService', () => {
  let service: PlatformService;
  let prisma: {
    organization: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    property: { count: jest.Mock };
    tenant: { count: jest.Mock };
    unit: { count: jest.Mock };
    document: { aggregate: jest.Mock };
    session: { create: jest.Mock; updateMany: jest.Mock };
    subscription: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { logAction: jest.Mock };
  let jwt: { sign: jest.Mock };
  let storage: { remove: jest.Mock };

  // ── Onboard ──────────────────────────────────────────────────────────────────
  //
  // The prisma mock is intentionally typed (an explicit shape, like Module 12), so a
  // query the tests did not anticipate fails to compile instead of returning
  // `undefined.map` at runtime. Because `jest.Mock.calls` is `any[]`, every read of an
  // argument goes through this named accessor — that gives the field a real type rather
  // than silencing the `no-unsafe-*` rules on each `expect.objectContaining`.
  /**
   * The first argument of the i-th call to a `jest.fn`, typed.
   *
   * `jest.Mock.calls` is `any[][]` by design, so `mock.calls[i][0]` is an unchecked
   * `any`: a renamed field compares `undefined` and the assertion quietly passes, or
   * the value flows on as `any` into the rest of the test. Every read goes through
   * here so the shape is declared once, at the call site, where it is checked by tsc.
   */
  function callArg<A>(mock: jest.Mock, i: number): A {
    expect(mock).toHaveBeenCalledTimes(i + 1);
    return (mock.mock.calls as unknown[][])[i][0] as A;
  }

  const createdOrg = {
    id: 'org-new',
    name: 'Test',
    slug: 'test',
    plan: 'PROFESSIONAL',
  };

  beforeEach(async () => {
    audit = { logAction: jest.fn().mockResolvedValue({}) };
    jwt = { sign: jest.fn().mockReturnValue('impersonation-token') };
    storage = { remove: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      organization: {
        create: jest.fn().mockResolvedValue(createdOrg),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        create: jest.fn().mockResolvedValue({ id: 'u-1' }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      property: { count: jest.fn().mockResolvedValue(0) },
      tenant: { count: jest.fn().mockResolvedValue(0) },
      unit: { count: jest.fn().mockResolvedValue(0) },
      document: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _count: 0, _sum: { sizeBytes: 0 } }),
      },
      session: {
        create: jest.fn().mockResolvedValue({ id: 's-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      subscription: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      // Make the "transaction" an identity: invoke the callback against this same
      // mock, which is what makes the tx methods observable. Typed so the callback's
      // return is `Promise<unknown>` rather than an `any` flowing back out.
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) =>
          cb(prisma),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: JwtService, useValue: jwt },
        { provide: FILE_STORAGE, useValue: storage },
      ],
    }).compile();

    service = module.get(PlatformService);
  });

  it('onboards org, first admin and trial subscription as one transaction', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      ...createdOrg,
      subscription: { status: SubscriptionStatus.TRIALING },
      _count: { users: 1 },
    });

    await service.onboard(
      {
        name: 'Test',
        slug: 'test',
        plan: 'PROFESSIONAL',
        adminEmail: 'owner@test.co.ke',
        adminFirstName: 'A',
        adminLastName: 'B',
        adminPassword: 'Str0ngPass!2026',
        trialDays: 14,
      },
      'sup-1',
    );

    interface OrgCreateData {
      plan: string;
      subscription: {
        create: { status: SubscriptionStatus; trialEndsAt: Date };
      };
    }
    interface UserCreateData {
      role: UserRole;
      organizationId: string;
    }

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Typed accessor: `mock.calls` is `any` by design, so narrow once here instead
    // of checking through `expect.objectContaining`, which is an `any` that never
    // type-errors. A renamed field now fails the test rather than comparing undefined.
    const orgData = callArg<{ data: OrgCreateData }>(
      prisma.organization.create,
      0,
    ).data;
    expect(orgData.plan).toBe('PROFESSIONAL');
    expect(orgData.subscription.create.status).toBe(
      SubscriptionStatus.TRIALING,
    );
    const trialEnd = orgData.subscription.create.trialEndsAt;
    // ~14 days from now, within a generous window — the point is that it *exists*.
    expect(trialEnd.getTime() - Date.now()).toBeGreaterThan(13 * 24 * 3600_000);

    const userData = callArg<{ data: UserCreateData }>(
      prisma.user.create,
      0,
    ).data;
    expect(userData.role).toBe(UserRole.ADMIN);
    expect(userData.organizationId).toBe('org-new');

    expect(callArg<{ action: string }>(audit.logAction, 0).action).toBe(
      'ORGANIZATION_ONBOARDED',
    );
  });

  it('fails cleanly on a duplicate slug instead of a raw P2002', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '7.4.0',
        meta: { target: ['slug'] },
      }),
    );

    await expect(
      service.onboard(
        {
          name: 'T',
          slug: 'taken',
          adminEmail: 'o@t.co',
          adminFirstName: 'A',
          adminLastName: 'B',
          adminPassword: 'Str0ngPass!2026',
        },
        'sup-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    // And explicitly: the error names the slug, not a constraint name.
    await expect(
      service.onboard(
        {
          name: 'T',
          slug: 'taken',
          adminEmail: 'o@t.co',
          adminFirstName: 'A',
          adminLastName: 'B',
          adminPassword: 'Str0ngPass!2026',
        },
        'sup-1',
      ),
    ).rejects.toThrow(/slug/i);
  });

  it('names the slug under the Prisma 7 meta shape, which has no `target`', async () => {
    // Regression: the old reader looked only at `meta.target`, which the driver
    // adapter never sends — every conflict was reported as "admin email" while
    // this suite stayed green on the Prisma 6 shape. This is the exact `meta`
    // a duplicate `organizations.slug` produces live (captured 2026-10-11).
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '7.4.0',
        meta: {
          modelName: 'Organization',
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: {
              originalCode: '23505',
              kind: 'UniqueConstraintViolation',
              constraint: { fields: ['slug'] },
            },
          },
        },
      }),
    );

    await expect(
      service.onboard(
        {
          name: 'T',
          slug: 'taken',
          adminEmail: 'o@t.co',
          adminFirstName: 'A',
          adminLastName: 'B',
          adminPassword: 'Str0ngPass!2026',
        },
        'sup-1',
      ),
    ).rejects.toThrow(/slug/i);
  });

  it('suspend sets all three marks and revokes sessions, in one transaction', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      ...createdOrg,
      subscription: true,
    });
    prisma.organization.update.mockResolvedValue(createdOrg);

    await service.setSuspended(
      'org-new',
      true,
      { reason: 'non-payment' },
      'sup-1',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-new' },
      data: { isActive: false },
    });
    // Revoke every unrevoked session for this tenant — the immediate-kill of the
    // already-issued tokens that Phase A's jwt check catches at the edge.
    const revoke = callArg<{
      where: { organizationId: string; revokedAt: null };
      data: { revokedAt: Date };
    }>(prisma.session.updateMany, 0);
    expect(revoke.where).toEqual({
      organizationId: 'org-new',
      revokedAt: null,
    });
    expect(revoke.data.revokedAt).toBeInstanceOf(Date);

    expect(
      callArg<{
        where: { organizationId: string };
        data: { status: SubscriptionStatus; statusReason: string };
      }>(prisma.subscription.updateMany, 0).data,
    ).toEqual({
      status: SubscriptionStatus.SUSPENDED,
      statusReason: 'non-payment',
    });
    expect(callArg<{ action: string }>(audit.logAction, 0).action).toBe(
      'ORGANIZATION_SUSPENDED',
    );
  });

  it('reactivate returns to no-cost trial if the trial never ended, else paid', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      ...createdOrg,
      subscription: true,
    });
    prisma.subscription.findUnique.mockResolvedValue({
      status: SubscriptionStatus.SUSPENDED,
      trialEndsAt: new Date(Date.now() + 5 * 24 * 3600_000), // still open
    });

    await service.setSuspended(
      'org-new',
      false,
      { reason: 'paid up' },
      'sup-1',
    );

    expect(
      callArg<{ data: { status: SubscriptionStatus } }>(
        prisma.subscription.update,
        0,
      ).data.status,
    ).toBe(SubscriptionStatus.TRIALING);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-new' },
      data: { isActive: true },
    });
    expect(callArg<{ action: string }>(audit.logAction, 0).action).toBe(
      'ORGANIZATION_REACTIVATED',
    );
  });

  it('reactivate goes ACTIVE when the trial window has closed', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      ...createdOrg,
      subscription: true,
    });
    prisma.subscription.findUnique.mockResolvedValue({
      status: SubscriptionStatus.SUSPENDED,
      trialEndsAt: new Date(Date.now() - 24 * 3600_000), // closed
    });

    await service.setSuspended(
      'org-new',
      false,
      { reason: 'paid up' },
      'sup-1',
    );

    expect(
      callArg<{ data: { status: SubscriptionStatus } }>(
        prisma.subscription.update,
        0,
      ).data.status,
    ).toBe(SubscriptionStatus.ACTIVE);
  });

  it('findOne throws 404 for an unknown org', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.findOne('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ── Usage (Phase C) ──────────────────────────────────────────────────────
  //
  // Derived, never stored: six parallel reads, one shaped answer. The test
  // pins the shape (limits beside totals, over-limit flags) rather than the
  // queries, because the queries are Prisma and the shape is the contract.

  it('usage derives counts beside plan limits and flags over-limit orgs', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-new',
      name: 'Test',
      slug: 'test',
      plan: 'STARTER',
      maxUsers: 3,
      maxProperties: 10,
      isActive: true,
      subscription: { status: SubscriptionStatus.ACTIVE },
    });
    prisma.user.count
      .mockResolvedValueOnce(5) // total users — over the 3-seat plan
      .mockResolvedValueOnce(4); // active
    prisma.property.count.mockResolvedValue(2);
    prisma.tenant.count.mockResolvedValue(7);
    prisma.unit.count.mockResolvedValue(20);
    prisma.document.aggregate.mockResolvedValue({
      _count: 9,
      _sum: { sizeBytes: 1024 },
    });

    const usage = await service.usage('org-new');

    expect(usage.users).toEqual({
      total: 5,
      active: 4,
      max: 3,
      overLimit: true,
    });
    expect(usage.properties).toEqual({ total: 2, max: 10, overLimit: false });
    expect(usage.tenants).toBe(7);
    expect(usage.units).toBe(20);
    expect(usage.storage).toEqual({ documents: 9, bytes: 1024 });
  });

  it('usage 404s for an unknown org before counting anything', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.usage('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  // ── Subscription terms ───────────────────────────────────────────────────
  //
  // The plan, the limits and the dates are denormalised across two rows, and
  // the status has a second effect on the organization (access) and a third
  // on the sessions. The tests pin all three: the two rows move together, a
  // block needs a reason, and a block without a reason never reaches the
  // database.

  interface SubscriptionRow {
    id: string;
    plan: string;
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
    renewsAt: Date | null;
    statusReason: string | null;
    enabledModules: string[];
  }

  function mockOrgWithSubscription(
    status: SubscriptionStatus,
    overrides: Partial<SubscriptionRow> = {},
  ) {
    const subscription: SubscriptionRow = {
      id: 'sub-1',
      plan: 'STARTER',
      status,
      trialEndsAt: new Date('2026-11-01T00:00:00.000Z'),
      renewsAt: null,
      statusReason: null,
      enabledModules: ['properties'],
      ...overrides,
    };
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-new',
      name: 'Test',
      slug: 'test',
      plan: subscription.plan,
      maxUsers: 3,
      maxProperties: 10,
      isActive: true,
      subscription,
    });
    prisma.subscription.upsert.mockResolvedValue(subscription);
    return subscription;
  }

  it('updateSubscription writes the plan and the limits to both rows', async () => {
    mockOrgWithSubscription(SubscriptionStatus.TRIALING);

    await service.updateSubscription(
      'org-new',
      { plan: 'ENTERPRISE', maxUsers: 50, maxProperties: 500 },
      'sup-1',
    );

    const subCall = callArg<{
      where: { organizationId: string };
      update: Record<string, unknown>;
    }>(prisma.subscription.upsert, 0);
    expect(subCall.where).toEqual({ organizationId: 'org-new' });
    expect(subCall.update).toMatchObject({
      plan: 'ENTERPRISE',
      status: SubscriptionStatus.TRIALING,
    });

    const orgCall = callArg<{
      where: { id: string };
      data: Record<string, unknown>;
    }>(prisma.organization.update, 0);
    expect(orgCall.data).toEqual({
      plan: 'ENTERPRISE',
      maxUsers: 50,
      maxProperties: 500,
    });

    expect(callArg<{ action: string }>(audit.logAction, 0).action).toBe(
      'ORGANIZATION_SUBSCRIPTION_UPDATED',
    );
  });

  it('updateSubscription converts a trial to a paid subscription without a reason', async () => {
    mockOrgWithSubscription(SubscriptionStatus.TRIALING);

    await service.updateSubscription(
      'org-new',
      { status: SubscriptionStatus.ACTIVE },
      'sup-1',
    );

    const subCall = callArg<{ update: Record<string, unknown> }>(
      prisma.subscription.upsert,
      0,
    );
    expect(subCall.update).toMatchObject({ status: SubscriptionStatus.ACTIVE });
    // Access is untouched by a conversion — the tenant was never blocked.
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('updateSubscription refuses to block a tenant without a reason', async () => {
    mockOrgWithSubscription(SubscriptionStatus.ACTIVE);

    await expect(
      service.updateSubscription(
        'org-new',
        { status: SubscriptionStatus.SUSPENDED },
        'sup-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('updateSubscription blocking a tenant moves the organization and the sessions with it', async () => {
    mockOrgWithSubscription(SubscriptionStatus.ACTIVE);

    await service.updateSubscription(
      'org-new',
      { status: SubscriptionStatus.SUSPENDED, statusReason: 'non-payment' },
      'sup-1',
    );

    const subCall = callArg<{ update: Record<string, unknown> }>(
      prisma.subscription.upsert,
      0,
    );
    expect(subCall.update).toMatchObject({
      status: SubscriptionStatus.SUSPENDED,
      statusReason: 'non-payment',
    });

    const orgCall = callArg<{ data: Record<string, unknown> }>(
      prisma.organization.update,
      0,
    );
    expect(orgCall.data).toEqual({ isActive: false });

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-new', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('updateSubscription refuses to restore a blocked tenant without a reason', async () => {
    mockOrgWithSubscription(SubscriptionStatus.SUSPENDED);

    await expect(
      service.updateSubscription(
        'org-new',
        { status: SubscriptionStatus.ACTIVE },
        'sup-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it('updateSubscription restoring a blocked tenant gives access back and clears the reason', async () => {
    mockOrgWithSubscription(SubscriptionStatus.SUSPENDED, {
      statusReason: 'non-payment',
    });

    await service.updateSubscription(
      'org-new',
      { status: SubscriptionStatus.ACTIVE, statusReason: 'payment received' },
      'sup-1',
    );

    const subCall = callArg<{ update: Record<string, unknown> }>(
      prisma.subscription.upsert,
      0,
    );
    expect(subCall.update).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      statusReason: null,
    });

    const orgCall = callArg<{ data: Record<string, unknown> }>(
      prisma.organization.update,
      0,
    );
    expect(orgCall.data).toEqual({ isActive: true });
    // A restore revokes nothing: the sessions were revoked when it was blocked.
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('setEnabledModules creates the subscription for a tenant that has none', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-new',
      name: 'Test',
      slug: 'test',
      plan: 'STARTER',
      subscription: null,
    });
    prisma.subscription.upsert.mockResolvedValue({
      id: 'sub-1',
      enabledModules: ['properties'],
    });

    const result = await service.setEnabledModules(
      'org-new',
      ['properties'],
      'sup-1',
    );

    expect(result).toEqual(['properties']);
    const subCall = callArg<{
      where: { organizationId: string };
      create: {
        plan: string;
        status: SubscriptionStatus;
        enabledModules: string[];
      };
      update: { enabledModules: { set: string[] } };
    }>(prisma.subscription.upsert, 0);
    expect(subCall.where).toEqual({ organizationId: 'org-new' });
    expect(subCall.create).toMatchObject({
      plan: 'STARTER',
      status: SubscriptionStatus.TRIALING,
      enabledModules: ['properties'],
    });
    expect(subCall.update).toEqual({ enabledModules: { set: ['properties'] } });
  });

  // ── Impersonation (Phase C) ──────────────────────────────────────────────
  //
  // The safety story in four refusals: a suspended org, a user from another
  // org, a deactivated user, and yourself. The happy path mints a 15-minute
  // bearer token carrying the *target's* role and audits the start.

  const targetUser = {
    id: 'u-target',
    email: 'manager@rohi.co.ke',
    firstName: 'M',
    lastName: 'N',
    role: UserRole.ADMIN,
    isActive: true,
    organizationId: 'org-new',
    portalTenantId: null,
  };

  function mockImpersonationTargets() {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-new',
      name: 'Test',
      isActive: true,
    });
    prisma.user.findFirst.mockResolvedValue(targetUser);
  }

  it('impersonate mints a short-lived target-role token and audits the start', async () => {
    mockImpersonationTargets();

    const result = await service.impersonate(
      'org-new',
      { userId: 'u-target', reason: 'reproduce the missing receipt' },
      'sup-1',
    );

    expect(result.token).toBe('impersonation-token');
    expect(result.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      15 * 60 * 1000,
    );
    interface SignPayload {
      sub: string;
      role: UserRole;
      impersonatedBy: string;
      impersonation: boolean;
      jti: string;
    }
    const payload = callArg<SignPayload>(jwt.sign, 0);
    expect(payload.sub).toBe('u-target');
    expect(payload.role).toBe(UserRole.ADMIN);
    expect(payload.impersonatedBy).toBe('sup-1');
    expect(payload.impersonation).toBe(true);
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-target',
        organizationId: 'org-new',
        jti: payload.jti,
      }),
    });
    expect(callArg<{ action: string }>(audit.logAction, 0).action).toBe(
      'IMPERSONATION_STARTED',
    );
  });

  it('impersonate refuses a suspended organization', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-new',
      name: 'Test',
      isActive: false,
    });
    await expect(
      service.impersonate(
        'org-new',
        { userId: 'u-target', reason: 'reproduce the missing receipt' },
        'sup-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('impersonate 404s when the user is not in that organization', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-new',
      name: 'Test',
      isActive: true,
    });
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.impersonate(
        'org-new',
        { userId: 'u-stranger', reason: 'reproduce the missing receipt' },
        'sup-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('impersonate refuses a deactivated user and yourself', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-new',
      name: 'Test',
      isActive: true,
    });
    prisma.user.findFirst.mockResolvedValue({ ...targetUser, isActive: false });
    await expect(
      service.impersonate(
        'org-new',
        { userId: 'u-target', reason: 'reproduce the missing receipt' },
        'sup-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.user.findFirst.mockResolvedValue(targetUser);
    prisma.user.findFirst.mockResolvedValueOnce({ ...targetUser, id: 'sup-1' });
    await expect(
      service.impersonate(
        'org-new',
        { userId: 'sup-1', reason: 'reproduce the missing receipt' },
        'sup-1',
      ),
    ).rejects.toThrow(/already yourself/);
  });

  it('endImpersonation revokes the impersonation session and audits the end', async () => {
    const result = await service.endImpersonation(
      { userId: 'u-target', jti: 'jti-1', impersonatedBy: 'sup-1' },
      'sup-1',
    );
    expect(result).toEqual({ ended: true });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { jti: 'jti-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(callArg<{ action: string }>(audit.logAction, 0).action).toBe(
      'IMPERSONATION_ENDED',
    );
  });

  it('endImpersonation refuses a normal session with nothing to end', async () => {
    await expect(
      service.endImpersonation({ userId: 'u-1', jti: 'jti-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });
});
