import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, SubscriptionStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import {
  OnboardOrganizationDto,
  SuspendOrganizationDto,
} from './dto/onboarding.dto';
import { ImpersonateDto } from './dto/impersonate.dto';

/** An impersonation session lasts 15 minutes — long enough to reproduce a
 * tenant's problem, short enough that a forgotten tab stops working. */
const IMPERSONATION_TTL_MS = 15 * 60 * 1000;

/**
 * SaaS administration (Module 19) — the code that runs the platform, not a tenant.
 *
 * Two things make this module different from every other one, and both are drawn
 * directly from the master doc's §2 tenancy rule:
 *
 * 1. **It never takes a `tenantId`.** The platform administrator is the *absence* of
 *    a tenant: `getTenantId` returns `undefined` for SUPER_ADMIN, and the existing
 *    tenant services deliberately treat `undefined` as "no filter" (ts-not-a-safe-sign
 *    for them; it is the intended shape for *here*). The methods below therefore take
 *    no organization id from the caller — they are open to every organization,
 *    `SUPER_ADMIN` on the other side of the guard being the only way in
 *    (`PlatformOrganizationsController` carries `@Roles(SUPER_ADMIN)` at class level).
 *
 * 2. **Every write is a transaction that makes the happy path conditional on the
 *    whole shape committing.** Onboarding a tenant creates three rows that should
 *    never be seen apart: the Organization, its first administrator, and the trial
 *    Subscription. If the trial insert failed and the org shipped without it, the
 *    dashboard would show a plan with nothing underneath — the *exact* two-tables-for-
 *    one-thing failure this codebase has already paid for twice
 *    (`landlordId`/`tenantId` and `Supplier` beside `Contact`). One transaction.
 */
/**
 * Machine-readable cause attached to the `ConflictException` `onboard` throws
 * for a unique-violation, so the in-process caller can branch on it.
 */
export interface OnboardConflictCause {
  conflictField: 'slug' | 'email';
}

/**
 * Field names behind a Prisma unique-violation (P2002), across client generations.
 *
 * Prisma ≤6 put them at `meta.target: string[]`. Under Prisma 7's driver adapter
 * there is no `target` at all — the constraint arrives nested at
 * `meta.driverAdapterError.cause.constraint.fields` (verified live: a duplicate
 * `organizations.slug` reports `{modelName, driverAdapterError: {cause:
 * {constraint: {fields: ['slug']}}}}`). Reading only the old shape silently
 * classifies *every* conflict as "admin email", which is how the signup retry
 * below learned to never retry: the message it matched on never named the slug.
 *
 * Exported so `TrialSignupService` decides retry-vs-surface on the same reading
 * rather than string-matching a message that already lied once.
 */
export function p2002Fields(
  err: Prisma.PrismaClientKnownRequestError,
): string[] {
  const meta = err.meta as
    | { target?: unknown }
    | {
        driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
      }
    | undefined;
  const direct = meta && 'target' in meta ? meta.target : undefined;
  if (Array.isArray(direct)) {
    return direct.filter((t): t is string => typeof t === 'string');
  }
  const nested =
    meta && 'driverAdapterError' in meta
      ? meta.driverAdapterError?.cause?.constraint?.fields
      : undefined;
  if (Array.isArray(nested)) {
    return nested.filter((t): t is string => typeof t === 'string');
  }
  return [];
}

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private jwtService: JwtService,
  ) {}

  /**
   * Onboard a new tenant end to end.
   *
   * The acceptance criterion is "a new organization can be onboarded end-to-end by a
   * Super Admin and its users can immediately log in." That is met by a single
   * transaction that writes the Organization, the `ADMIN` User with a hashed password,
   * and a `TRIALING` Subscription — so the org is real, the owner of it can sign in,
   * and a subscription record explains the relationship. `POST /auth/login` is then
   * reachable for the first admin with no further setup.
   *
   * The subscription's `status = TRIALING` is load-bearing: the Organization's
   * `plan` column is the tier, the Subscription is the *state* — and the two should
   * never claim two different relationships at once.
   */
  async onboard(dto: OnboardOrganizationDto, actorId?: string) {
    const trialMs = (dto.trialDays ?? 14) * 24 * 60 * 60 * 1000;
    const trialEndsAt = new Date(Date.now() + trialMs);
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    try {
      const org = await this.prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            subdomain: dto.subdomain,
            plan: dto.plan ?? 'STARTER',
            contactEmail: dto.contactEmail,
            isActive: true,
            subscription: {
              create: {
                plan: dto.plan ?? 'STARTER',
                status: SubscriptionStatus.TRIALING,
                trialEndsAt,
              },
            },
          },
        });

        await tx.user.create({
          data: {
            email: dto.adminEmail,
            firstName: dto.adminFirstName,
            lastName: dto.adminLastName,
            passwordHash,
            role: UserRole.ADMIN,
            organizationId: created.id,
          },
        });

        return created;
      });

      this.logger.log(
        `Onboarded ${org.name} (${org.id}) as a ${dto.plan ?? 'STARTER'} trial`,
      );

      await this.safeAudit({
        action: 'ORGANIZATION_ONBOARDED',
        entity: 'Organization',
        entityId: org.id,
        details: `${org.name} onboarded on ${dto.plan ?? 'STARTER'}, trial ends ${trialEndsAt.toISOString()}`,
        actorId,
      });

      return this.prisma.organization.findUnique({
        where: { id: org.id },
        include: { subscription: true, _count: { select: { users: true } } },
      });
    } catch (err) {
      // A unique slug/email is the one conflict a caller can fix; everything else stays
      // a real error rather than asking for a copy.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const fields = p2002Fields(err);
        const field = fields.some((t) => t.includes('slug')) ? 'slug' : 'email';
        // `cause` carries the field machine-readably for the in-process caller
        // (`TrialSignupService` retries slug clashes): the message is for humans
        // and must stay free to be reworded without breaking the retry.
        throw new ConflictException(
          `A record with this ${field} already exists`,
          { cause: { conflictField: field } satisfies OnboardConflictCause },
        );
      }
      throw err;
    }
  }

  /**
   * The platform-wide list. For SUPER_ADMIN this is the entire table; for anyone else
   * it is unreachable (the controller's `@Roles(SUPER_ADMIN)`) plus filtered-to-nothing
   * if it ever were reached, because `getTenantId` returns undefined and this method
   * does not apply a filter.
   */
  async findAll() {
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: true,
        _count: { select: { users: true, properties: true, tenants: true } },
      },
    });
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        subscription: true,
        _count: { select: { users: true, properties: true, tenants: true } },
      },
    });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return org;
  }

  /**
   * Suspend or reactivate a tenant.
   *
   * Two independent effects, both required, and both recorded. The Organization
   * (`isActive`) is what the login path and every request now consult since Phase A;
   * the Subscription (`status`) is the relationship's own state. Sessions are revoked
   * so a suspension stops existing tokens immediately rather than only at their next
   * JWT expiry. A one-line answer to "is this tenant cut off?" now requires zero code
   * reading: `Organization.isActive` is false and `Subscription.status` is SUSPENDED
   * and the two cannot disagree, because here is the only place they are written.
   */
  async setSuspended(
    id: string,
    suspend: boolean,
    dto: SuspendOrganizationDto,
    actorId?: string,
  ) {
    // Guard first: unknown id is a 404 before anything is mutated. The returned org
    // itself is not needed; both branches below read what they need from the query.
    await this.findOne(id);

    if (suspend) {
      const org = await this.prisma.$transaction(async (tx) => {
        await tx.organization.update({
          where: { id },
          data: { isActive: false },
        });
        // The current session row is denormalised with the org, so every active
        // session for this tenant can be enumerated and revoked without a join.
        const revoked = await tx.session.updateMany({
          where: { organizationId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.logger.warn(
          `Suspended tenant ${id}: revoking ${revoked.count} sessions. Reason: ${dto.reason}`,
        );
        await tx.subscription.updateMany({
          where: { organizationId: id },
          data: {
            status: SubscriptionStatus.SUSPENDED,
            statusReason: dto.reason,
          },
        });
        return tx.organization.findUnique({ where: { id } });
      });

      await this.safeAudit({
        action: 'ORGANIZATION_SUSPENDED',
        entity: 'Organization',
        entityId: id,
        details: `Suspended: ${dto.reason}`,
        actorId,
      });
      return org;
    }

    // Reactivate: return the org to usable and the subscription to its pre-suspension
    // *kind* — re-trial if the trial window was still open, otherwise ACTIVE — rather
    // than inventing a new relationship state.
    const result = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({
        where: { organizationId: id },
      });
      const trialStillOpen = sub?.trialEndsAt && sub.trialEndsAt > new Date();
      await tx.organization.update({ where: { id }, data: { isActive: true } });
      if (sub) {
        await tx.subscription.update({
          where: { organizationId: id },
          data: {
            status: trialStillOpen
              ? SubscriptionStatus.TRIALING
              : SubscriptionStatus.ACTIVE,
            statusReason: null,
          },
        });
      }
      this.logger.log(`Reactivated tenant ${id}`);
      return tx.organization.findUnique({ where: { id } });
    });

    await this.safeAudit({
      action: 'ORGANIZATION_REACTIVATED',
      entity: 'Organization',
      entityId: id,
      details: 'Reactivated',
      actorId,
    });
    return result;
  }

  /** A tenant must not hear about its suspension from nobody — audit only, no user in the event. */
  private async safeAudit(input: {
    action: string;
    entity: string;
    entityId: string;
    details: string;
    actorId?: string;
  }) {
    try {
      await this.auditService.logAction({
        ...(input.actorId ? { user: { connect: { id: input.actorId } } } : {}),
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        details: input.details,
      });
    } catch (err) {
      this.logger.warn(
        `audit write failed for ${input.action}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Derived usage for one tenant — counts, never a stored counter.
   *
   * Nothing here is written anywhere: a usage figure that lives in a column
   * rots the moment the thing it counts changes, which is the stored-
   * derivation failure this codebase refuses on invoice balances, stock
   * levels and received quantities alike. The platform dashboard reads this
   * endpoint instead.
   */
  async usage(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        maxUsers: true,
        maxProperties: true,
        isActive: true,
        subscription: true,
      },
    });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);

    const [
      usersTotal,
      usersActive,
      propertiesTotal,
      tenantsTotal,
      unitsTotal,
      docs,
    ] = await Promise.all([
      this.prisma.user.count({ where: { organizationId: id } }),
      this.prisma.user.count({
        where: { organizationId: id, isActive: true },
      }),
      this.prisma.property.count({
        where: { organizationId: id, deletedAt: null },
      }),
      this.prisma.tenant.count({
        where: { organizationId: id, deletedAt: null },
      }),
      this.prisma.unit.count({
        where: { property: { organizationId: id }, deletedAt: null },
      }),
      this.prisma.document.aggregate({
        where: { organizationId: id },
        _count: true,
        _sum: { sizeBytes: true },
      }),
    ]);

    return {
      organizationId: id,
      subscription: org.subscription,
      users: {
        total: usersTotal,
        active: usersActive,
        max: org.maxUsers,
        overLimit: usersTotal > org.maxUsers,
      },
      properties: {
        total: propertiesTotal,
        max: org.maxProperties,
        overLimit: propertiesTotal > org.maxProperties,
      },
      tenants: tenantsTotal,
      units: unitsTotal,
      storage: {
        documents: docs._count,
        bytes: docs._sum.sizeBytes ?? 0,
      },
    };
  }

  /**
   * Minimal user directory for one tenant — the picker the impersonation
   * dialog offers. Separate from `findOne` (which stays a summary) so the
   * org list never pays for rows it does not show.
   */
  async listUsers(id: string) {
    await this.findOne(id);
    return this.prisma.user.findMany({
      where: { organizationId: id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
      orderBy: { email: 'asc' },
    });
  }

  /**
   * Start an impersonation session: a short-lived bearer token that acts as
   * one tenant user.
   *
   * Three properties make this safe rather than merely convenient:
   * - the token carries the *target's* role, so every `@Roles(SUPER_ADMIN)`
   *   platform endpoint — including this one — is structurally unreachable
   *   while impersonating. There is no nested impersonation to forbid because
   *   the token cannot get back here.
   * - the token is a bearer token returned in the body, never a cookie: the
   *   operator's own session stays intact underneath, and ending the
   *   impersonation is discarding the token (plus revoking its session row).
   * - the start is audited with actor, target and reason before the token is
   *   returned — an impersonation nobody recorded is indistinguishable from
   *   a compromised account.
   */
  async impersonate(
    orgId: string,
    dto: ImpersonateDto,
    actorId: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, isActive: true },
    });
    if (!org) throw new NotFoundException(`Organization ${orgId} not found`);
    if (!org.isActive) {
      throw new ForbiddenException(
        `Cannot impersonate into ${org.name}: the organization is suspended`,
      );
    }

    const target = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: orgId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        organizationId: true,
        portalTenantId: true,
      },
    });
    if (!target) {
      throw new NotFoundException(
        'That user does not exist in this organization',
      );
    }
    if (!target.isActive) {
      throw new ForbiddenException('Cannot impersonate a deactivated user');
    }
    if (target.id === actorId) {
      throw new ForbiddenException('You are already yourself');
    }

    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);
    const payload = {
      email: target.email,
      sub: target.id,
      role: target.role,
      organizationId: target.organizationId,
      portalTenantId: target.portalTenantId ?? null,
      impersonatedBy: actorId,
      impersonation: true,
      jti,
    };
    const token = this.jwtService.sign(payload, {
      expiresIn: IMPERSONATION_TTL_MS / 1000,
    });

    await this.prisma.session.create({
      data: {
        jti,
        userId: target.id,
        organizationId: orgId,
        expiresAt,
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    this.logger.warn(
      `IMPERSONATION started by ${actorId} as ${target.email} (${target.id}): ${dto.reason}`,
    );
    try {
      await this.auditService.logAction({
        user: { connect: { id: actorId } },
        organization: { connect: { id: orgId } },
        action: 'IMPERSONATION_STARTED',
        entity: 'User',
        entityId: target.id,
        details: `Impersonating ${target.email}: ${dto.reason}. Expires ${expiresAt.toISOString()}`,
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      });
    } catch (err) {
      this.logger.warn(
        `audit write failed for IMPERSONATION_STARTED: ${(err as Error).message}`,
      );
    }

    const { ...safeTarget } = target;
    return { token, expiresAt, user: safeTarget };
  }

  /**
   * End the caller's impersonation: revoke the impersonation session row so
   * the bearer token stops working immediately, and audit the end. A normal
   * (non-impersonated) session calling this has nothing to end.
   */
  async endImpersonation(
    caller: { userId: string; jti?: string; impersonatedBy?: string | null },
    actorId?: string,
  ) {
    if (!caller.jti || !caller.impersonatedBy) {
      throw new ForbiddenException('This session is not an impersonation');
    }
    await this.prisma.session.updateMany({
      where: { jti: caller.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.warn(
      `IMPERSONATION ended for ${caller.userId} (started by ${caller.impersonatedBy})`,
    );
    await this.safeAudit({
      action: 'IMPERSONATION_ENDED',
      entity: 'User',
      entityId: caller.userId,
      details: `Impersonation session ended (started by ${caller.impersonatedBy})`,
      actorId,
    });
    return { ended: true };
  }
}
