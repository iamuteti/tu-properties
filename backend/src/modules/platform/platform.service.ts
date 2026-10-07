import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubscriptionStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import {
  OnboardOrganizationDto,
  SuspendOrganizationDto,
} from './dto/onboarding.dto';

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
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
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
        const target = (err.meta?.target as string[] | undefined) ?? [];
        throw new ConflictException(
          `A record with this ${target.some((t) => t.includes('slug')) ? 'slug' : 'admin email'} already exists`,
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
}
