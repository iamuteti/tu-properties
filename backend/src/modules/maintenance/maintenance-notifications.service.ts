import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
  UserRole,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { statusLabel } from './work-order-lifecycle';

interface WorkOrderNotificationSubject {
  id: string;
  organizationId: string;
  reference: string;
  title: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  tenantId: string | null;
  assignedTechnicianId: string | null;
  property?: { name?: string | null } | null;
  unit?: { name?: string | null } | null;
}

/** What each state change tells the resident, in their words. */
const RESIDENT_UPDATE: Partial<Record<WorkOrderStatus, string>> = {
  [WorkOrderStatus.INSPECTION]: 'A technician is assessing it.',
  [WorkOrderStatus.APPROVED]: 'It has been approved for repair.',
  [WorkOrderStatus.ASSIGNED]: 'A technician has been assigned to it.',
  [WorkOrderStatus.IN_PROGRESS]: 'Work is under way.',
  [WorkOrderStatus.COMPLETED]: 'The work is finished.',
  [WorkOrderStatus.CLOSED]: 'The request is now closed.',
  [WorkOrderStatus.CANCELLED]: 'The request was cancelled.',
};

/**
 * Module 9 — who hears about a work order, and when.
 *
 * Isolated into its own service for two reasons. The work-order service stays
 * about work orders rather than about channel selection, and — more importantly
 * — this is the one place in the module where a failure is *expected* to be
 * swallowed. Every method here catches: a completed repair must not be reported
 * as failed because a notification row could not be written, and the resident
 * who needs to know has a portal that lists their own requests anyway.
 *
 * All three sends are idempotent through the notification `dedupeKey`, so a
 * retried transition does not produce a second "we're on it" message.
 */
@Injectable()
export class MaintenanceNotificationsService {
  private readonly logger = new Logger(MaintenanceNotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * A new report exists and somebody has to pick it up.
   *
   * Goes to the people who do maintenance work in this organization — the roles
   * that hold `maintenance.view`. Broadcasting to every active user would be
   * easier and would train people to ignore it.
   */
  async announceNewWorkOrder(workOrder: WorkOrderNotificationSubject) {
    await this.safely(`new work order ${workOrder.reference}`, async () => {
      const recipients = await this.prisma.user.findMany({
        where: {
          organizationId: workOrder.organizationId,
          isActive: true,
          portalTenantId: null,
          role: {
            in: [
              UserRole.MAINTENANCE_MANAGER,
              UserRole.TECHNICIAN,
              UserRole.ADMIN,
              UserRole.PROPERTY_MANAGER,
            ],
          },
          // Whoever reported it already knows.
          ...(workOrder.assignedTechnicianId
            ? { id: { not: workOrder.assignedTechnicianId } }
            : {}),
        },
        select: { id: true },
        take: 25,
      });

      const title =
        workOrder.priority === WorkOrderPriority.EMERGENCY
          ? `EMERGENCY: ${workOrder.title}`
          : `New maintenance request: ${workOrder.title}`;

      for (const recipient of recipients) {
        await this.notifications.notify(
          {
            organizationId: workOrder.organizationId,
            type: NotificationType.MAINTENANCE_UPDATE,
            priority:
              workOrder.priority === WorkOrderPriority.EMERGENCY
                ? NotificationPriority.CRITICAL
                : workOrder.priority === WorkOrderPriority.HIGH
                  ? NotificationPriority.HIGH
                  : NotificationPriority.NORMAL,
            title,
            body: `${workOrder.reference} — ${this.place(workOrder)}`,
            entityType: 'WorkOrder',
            entityId: workOrder.id,
            actionUrl: `/maintenance/work-orders/${workOrder.id}`,
            channels: [NotificationChannel.IN_APP],
            dedupeKey: `work-order-new:${workOrder.id}`,
          },
          { userId: recipient.id },
        );
      }
    });
  }

  /**
   * The technician's own copy. This one is email/SMS as well as in-app: a
   * technician with the dashboard closed is the reason a response window is
   * missed, and the `assign` that put the job on them is the moment they need to
   * know.
   */
  async announceAssigned(workOrder: WorkOrderNotificationSubject) {
    if (!workOrder.assignedTechnicianId) return;

    await this.safely(`assignment of ${workOrder.reference}`, async () => {
      await this.notifications.notify(
        {
          organizationId: workOrder.organizationId,
          type: NotificationType.MAINTENANCE_UPDATE,
          priority:
            workOrder.priority === WorkOrderPriority.EMERGENCY
              ? NotificationPriority.CRITICAL
              : NotificationPriority.HIGH,
          title: `Assigned to you: ${workOrder.title}`,
          body: `${workOrder.reference} — ${this.place(workOrder)}. Open it to start the work.`,
          entityType: 'WorkOrder',
          entityId: workOrder.id,
          actionUrl: `/maintenance/work-orders/${workOrder.id}`,
          channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
          dedupeKey: `work-order-assigned:${workOrder.id}:${workOrder.assignedTechnicianId}`,
        },
        { userId: workOrder.assignedTechnicianId },
      );
    });
  }

  /**
   * The resident's copy of every move.
   *
   * Reached through the tenant record, which resolves to their portal login when
   * they have one — the same fallback `notifyRequestDecision` uses. A resident
   * who reports a leak and hears nothing is the failure mode this exists to
   * prevent, so the states that mean "somebody is on it" all get sent.
   */
  async announceStatusToTenant(workOrder: WorkOrderNotificationSubject) {
    const body = RESIDENT_UPDATE[workOrder.status];
    if (!body || !workOrder.tenantId) return;

    await this.safely(`status update on ${workOrder.reference}`, async () => {
      const portalUser = await this.prisma.user.findFirst({
        where: { portalTenantId: workOrder.tenantId, isActive: true },
        select: { id: true },
      });

      await this.notifications.notify(
        {
          organizationId: workOrder.organizationId,
          type: NotificationType.MAINTENANCE_UPDATE,
          priority:
            workOrder.status === WorkOrderStatus.CLOSED ||
            workOrder.status === WorkOrderStatus.COMPLETED
              ? NotificationPriority.NORMAL
              : NotificationPriority.HIGH,
          title: `${workOrder.reference}: ${statusLabel(workOrder.status).toLowerCase()}`,
          body: `${workOrder.title}. ${body}`,
          entityType: 'WorkOrder',
          entityId: workOrder.id,
          actionUrl: '/portal/maintenance',
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
          dedupeKey: `work-order-status:${workOrder.id}:${workOrder.status}`,
        },
        portalUser ? { userId: portalUser.id } : { tenantId: workOrder.tenantId },
      );
    });
  }

  private place(workOrder: WorkOrderNotificationSubject): string {
    return (
      [workOrder.property?.name, workOrder.unit?.name].filter(Boolean).join(' · ') ||
      'No location given'
    );
  }

  /**
   * Never let delivery break the operation it is reporting on. Logged, not
   * swallowed silently: a run of failures is a broken provider, and that is
   * worth seeing in the logs.
   */
  private async safely(what: string, action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      this.logger.warn(
        `Could not send maintenance notification for ${what}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
