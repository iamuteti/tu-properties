import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, SubscriptionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
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
    user: { create: jest.Mock };
    session: { updateMany: jest.Mock };
    subscription: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { logAction: jest.Mock };

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
    prisma = {
      organization: {
        create: jest.fn().mockResolvedValue(createdOrg),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { create: jest.fn().mockResolvedValue({ id: 'u-1' }) },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      subscription: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
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
    expect(orgData.subscription.create.status).toBe(SubscriptionStatus.TRIALING);
    const trialEnd = orgData.subscription.create.trialEndsAt;
    // ~14 days from now, within a generous window — the point is that it *exists*.
    expect(trialEnd.getTime() - Date.now()).toBeGreaterThan(13 * 24 * 3600_000);

    const userData = callArg<{ data: UserCreateData }>(prisma.user.create, 0)
      .data;
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
});
