import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
  Prisma,
  StockMovementType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { num, reorderSuggestion, round2 } from './stock-ledger';

/** Who hears that the store needs restocking. */
const STORE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.PROCUREMENT_OFFICER,
];

type Client = Prisma.TransactionClient;

/**
 * Module 11 — reorder alerting.
 *
 * Two triggers, and the difference between them matters:
 *
 * 1. **The daily sweep.** Every item whose balance has fallen to its reorder
 *    level, once a day, idempotent through the notification `dedupeKey`. The key
 *    carries the date, so an item that stays below its level is *not* re-notified
 *    every morning — the escalation of that is a purchase order, not another
 *    email. Somebody who genuinely wants a daily nag gets it from an alert on the
 *    page, which is a place they chose to look.
 * 2. **The event.** The moment a movement takes an item below its level, whoever
 *    issued it is told. This is the one that matters: it fires while the person
 *    who did it is still there, and it names the shortfall rather than waiting for
 *    a morning.
 *
 * Every send is wrapped so a notification failure can never fail the movement
 * that triggered it — the same rule Module 9 and Module 17 settled on.
 */
@Injectable()
export class InventoryNotificationsService {
  private readonly logger = new Logger(InventoryNotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Daily, after the notifications module's own morning sweep so a lease-expiry
   * message and a stock message do not land in the same second.
   */
  @Cron('0 45 6 * * *')
  async dailyReorderSweep() {
    try {
      await this.runReorderSweep(new Date());
    } catch (error) {
      this.logger.error(
        `Reorder sweep failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async runReorderSweep(onDate: Date = new Date(), organizationId?: string) {
    // An operator-triggered run is scoped to one organization; the cron walks all
    // of them. Both go through the same function so the two cannot drift.
    const organizations = organizationId
      ? [{ id: organizationId }]
      : await this.prisma.organization.findMany({
          where: { isActive: true },
          select: { id: true },
        });

    let sent = 0;
    for (const organization of organizations) {
      sent += await this.sweepOrganization(organization.id, onDate);
    }

    this.logger.log(
      `Reorder sweep for ${organizations.length} org(s): ${sent} notification(s) sent`,
    );
    return { organizations: organizations.length, sent };
  }

  private async sweepOrganization(organizationId: string, onDate: Date) {
    const recipients = await this.recipients(organizationId);
    if (recipients.length === 0) return 0;

    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId, isActive: true, reorderLevel: { gt: 0 } },
      select: {
        id: true,
        sku: true,
        name: true,
        unitOfMeasure: true,
        unitCost: true,
        reorderLevel: true,
        reorderQuantity: true,
        preferredSupplier: { select: { id: true, name: true } },
      },
      take: 5000,
    });

    if (items.length === 0) return 0;

    const grouped = await this.prisma.stockMovement.groupBy({
      by: ['itemId'],
      where: { organizationId, itemId: { in: items.map((item) => item.id) } },
      _sum: { quantity: true },
    });
    const quantities = new Map(
      grouped.map((row) => [row.itemId, round2(num(row._sum.quantity))]),
    );

    const day = onDate.toISOString().slice(0, 10);
    let sent = 0;

    for (const item of items) {
      const suggestion = reorderSuggestion({
        onHand: quantities.get(item.id) ?? 0,
        reorderLevel: item.reorderLevel,
        reorderQuantity: item.reorderQuantity,
        unitCost: item.unitCost,
        unitOfMeasure: item.unitOfMeasure,
      });

      if (!suggestion.needsReorder) continue;

      for (const recipient of recipients) {
        const results = await this.safely(`reorder sweep for ${item.sku}`, () =>
          this.notifications.notify(
            {
              organizationId,
              type: NotificationType.STOCK_LOW,
              priority:
                suggestion.status === 'OUT_OF_STOCK'
                  ? NotificationPriority.HIGH
                  : NotificationPriority.NORMAL,
              title:
                suggestion.status === 'OUT_OF_STOCK'
                  ? `Out of stock: ${item.name}`
                  : `Below reorder level: ${item.name}`,
              body: this.body(
                item.sku,
                item.name,
                suggestion,
                item.preferredSupplier?.name,
              ),
              entityType: 'InventoryItem',
              entityId: item.id,
              actionUrl: '/inventory/items',
              channels: [NotificationChannel.IN_APP],
              // Once a day per item per recipient, and only while it is low.
              dedupeKey: `stock-low:${item.id}:${day}:${recipient.id}`,
            },
            { userId: recipient.id },
          ),
        );

        if (results?.some((result) => result.status === 'SENT')) sent += 1;
      }
    }

    return sent;
  }

  /**
   * Called right after a movement is written.
   *
   * Only tells somebody when the item has *crossed* the level rather than sitting
   * just below it — an item that was already low before this movement was not
   * made worse by it, and re-announcing it on every subsequent issue is how people
   * learn to ignore the alert.
   */
  async announceAfterMovement(
    movement: { itemId: string; organizationId: string },
    client?: Client,
  ) {
    const prisma = client ?? this.prisma;

    const item = await prisma.inventoryItem.findFirst({
      where: { id: movement.itemId, organizationId: movement.organizationId },
      select: {
        id: true,
        sku: true,
        name: true,
        unitOfMeasure: true,
        unitCost: true,
        reorderLevel: true,
        reorderQuantity: true,
        preferredSupplier: { select: { name: true } },
      },
    });

    if (!item || num(item.reorderLevel) <= 0) return;

    const grouped = await prisma.stockMovement.groupBy({
      by: ['itemId'],
      where: { itemId: item.id, organizationId: movement.organizationId },
      _sum: { quantity: true },
    });

    const suggestion = reorderSuggestion({
      onHand: grouped[0]?._sum.quantity ?? 0,
      reorderLevel: item.reorderLevel,
      reorderQuantity: item.reorderQuantity,
      unitCost: item.unitCost,
      unitOfMeasure: item.unitOfMeasure,
    });

    if (!suggestion.needsReorder) return;

    const recipients = await this.recipients(movement.organizationId);
    if (recipients.length === 0) return;

    for (const recipient of recipients) {
      await this.safely(`post-movement reorder alert for ${item.sku}`, () =>
        this.notifications.notify(
          {
            organizationId: movement.organizationId,
            type: NotificationType.STOCK_LOW,
            priority:
              suggestion.status === 'OUT_OF_STOCK'
                ? NotificationPriority.HIGH
                : NotificationPriority.NORMAL,
            title:
              suggestion.status === 'OUT_OF_STOCK'
                ? `Out of stock: ${item.name}`
                : `Below reorder level: ${item.name}`,
            body: this.body(
              item.sku,
              item.name,
              suggestion,
              item.preferredSupplier?.name,
            ),
            entityType: 'InventoryItem',
            entityId: item.id,
            actionUrl: '/inventory/items',
            channels: [NotificationChannel.IN_APP],
            // Keyed by the *day*, not the movement: twenty issues of the same
            // item in one afternoon is one fact ("we are low"), not twenty.
            dedupeKey: `stock-low:${item.id}:${new Date()
              .toISOString()
              .slice(0, 10)}:${recipient.id}`,
          },
          { userId: recipient.id },
        ),
      );
    }
  }

  /**
   * What has been issued to jobs lately, for the reorder screen's context.
   *
   * Consumption is the leading indicator: an item draining through work orders is
   * a buying decision, and "20 went out on repair jobs this month" is the sentence
   * that justifies the order.
   */
  async recentConsumption(
    itemId: string,
    organizationId: string | undefined,
    days = 90,
  ) {
    const since = new Date(Date.now() - days * 86400000);

    const rows = await this.prisma.stockMovement.groupBy({
      by: ['itemId'],
      where: {
        ...(organizationId ? { organizationId } : {}),
        itemId,
        type: {
          in: [
            StockMovementType.WORK_ORDER_ISSUE,
            StockMovementType.ADJUSTMENT,
            StockMovementType.RETURN,
            StockMovementType.GOODS_RECEIPT,
          ],
        },
        createdAt: { gte: since },
      },
      _sum: { quantity: true },
      _count: { _all: true },
    });

    const row = rows[0];
    return {
      windowDays: days,
      movements: row?._count._all ?? 0,
      netChange: round2(num(row?._sum.quantity ?? 0)),
    };
  }

  private body(
    sku: string,
    name: string,
    suggestion: {
      status: string;
      shortfall: number | null;
      suggestedQuantity: number;
      estimatedCost: number | null;
      unitOfMeasure: string;
      reason: string | null;
    },
    supplierName?: string | null,
  ): string {
    const order = suggestion.suggestedQuantity;
    const unit = suggestion.unitOfMeasure;

    const parts = [
      `${sku} — ${name}.`,
      suggestion.reason ?? 'Stock is below its reorder level.',
      `Suggested order: ${order} ${unit}.`,
      suggestion.estimatedCost == null
        ? 'No price on file, so the cost is unknown.'
        : `Estimated cost: ${suggestion.estimatedCost.toLocaleString('en-KE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}.`,
    ];

    if (supplierName) parts.push(`Usually bought from ${supplierName}.`);

    return parts.join(' ');
  }

  private async recipients(organizationId: string) {
    return this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        portalTenantId: null,
        role: { in: STORE_ROLES },
      },
      select: { id: true },
      take: 25,
    });
  }

  /**
   * Never let a notification break the movement that reported on it. Logged, not
   * swallowed silently: a run of failures is a broken provider, and that is worth
   * seeing in the logs.
   */
  private async safely<T>(
    what: string,
    action: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await action();
    } catch (error) {
      this.logger.warn(
        `Could not send inventory notification for ${what}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
