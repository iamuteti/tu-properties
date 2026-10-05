import { ConflictException, Injectable } from '@nestjs/common';
import {
  AssetStatus,
  AssetType,
  Prisma,
  WorkOrderStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { AuditService } from '@/modules/audit/audit.service';
import { checkAssetStatusTransition } from './work-order-lifecycle';
import type { CreateAssetDto, UpdateAssetDto } from './dto/maintenance.dto';

export interface AssetFilters {
  type?: string;
  status?: string;
  propertyId?: string;
  unitId?: string;
  search?: string;
  includeRetired?: boolean;
}

/** The states that count as live faults against a piece of plant. */
const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.REQUESTED,
  WorkOrderStatus.INSPECTION,
  WorkOrderStatus.APPROVED,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
];

const ASSET_INCLUDE = {
  property: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true } },
  pmSchedules: {
    where: { active: true },
    select: { id: true, nextDueAt: true, title: true },
    orderBy: { nextDueAt: 'asc' },
  },
  // A filtered count, so the register can show "3 open" without the list page
  // loading every historical work order for the asset. `_count.workOrders` is
  // therefore the *open* count; `totalWorkOrders` comes from the detail view.
  _count: {
    select: {
      workOrders: { where: { status: { in: OPEN_WORK_ORDER_STATUSES } } },
    },
  },
} as const;

const ASSET_EXPORT_HEADERS = [
  'assetTag',
  'name',
  'type',
  'status',
  'property',
  'unit',
  'location',
  'manufacturer',
  'model',
  'serialNumber',
  'installedAt',
  'warrantyExpiresAt',
  'openWorkOrders',
  'nextServiceDue',
];

/**
 * Module 9 — the asset register.
 *
 * The plant a building owns: lifts, generators, pumps, the CCTV that nobody can
 * find the manual for. Two rules carry the weight:
 *
 * - `status` moves through `changeStatus`, which runs the small state machine.
 *   RETIRED is terminal, and that is the point: a retired asset must stop
 *   generating preventive work orders, so it cannot be quietly put back into
 *   service by an update.
 * - Deleting is refused while anything points at the asset. A register that
 *   silently loses the generator's service history is worse than one with a
 *   retired row in it.
 */
@Injectable()
export class AssetsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(
    organizationId: string | undefined,
    filters: AssetFilters = {},
  ) {
    return this.prisma.asset.findMany({
      where: this.buildWhere(organizationId, filters),
      include: ASSET_INCLUDE,
      orderBy: [{ property: { name: 'asc' } }, { name: 'asc' }],
      take: 500,
    });
  }

  async findOne(id: string, organizationId: string | undefined) {
    const asset = await requireRecord(
      this.prisma.asset.findFirst({
        where: { id, organizationId },
        include: ASSET_INCLUDE,
      }),
      'Asset',
    );

    // Everything anybody has ever done to this machine, in one place: the
    // faults it has had and the services it has had.
    const [workOrders, history, totalWorkOrders] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { assetId: id },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          source: true,
          priority: true,
          reportedAt: true,
          completedAt: true,
          actualCost: true,
        },
        orderBy: { reportedAt: 'desc' },
        take: 50,
      }),
      this.prisma.asset.findUnique({
        where: { id },
        select: {
          workOrders: {
            where: { source: 'PREVENTIVE' },
            select: {
              id: true,
              reference: true,
              reportedAt: true,
              completedAt: true,
              pmSchedule: { select: { title: true, frequencyDays: true } },
            },
            orderBy: { reportedAt: 'desc' },
            take: 20,
          },
        },
      }),
      this.prisma.workOrder.count({ where: { assetId: id } }),
    ]);

    return {
      ...asset,
      openWorkOrders: workOrders.filter((row) =>
        OPEN_WORK_ORDER_STATUSES.includes(row.status as never),
      ).length,
      totalWorkOrders,
      workOrders,
      serviceHistory: history?.workOrders ?? [],
      nextServiceDue: asset.pmSchedules[0]?.nextDueAt ?? null,
    };
  }

  async create(dto: CreateAssetDto, organizationId: string) {
    await this.assertReferences(organizationId, {
      propertyId: dto.propertyId,
      unitId: dto.unitId,
    });

    const asset = await this.prisma.asset.create({
      data: {
        organization: { connect: { id: organizationId } },
        property: { connect: { id: dto.propertyId } },
        ...(dto.unitId ? { unit: { connect: { id: dto.unitId } } } : {}),
        type: dto.type,
        name: dto.name.trim(),
        ...(dto.assetTag ? { assetTag: dto.assetTag.trim() } : {}),
        ...(dto.serialNumber ? { serialNumber: dto.serialNumber.trim() } : {}),
        ...(dto.manufacturer ? { manufacturer: dto.manufacturer.trim() } : {}),
        ...(dto.model ? { model: dto.model.trim() } : {}),
        ...(dto.location ? { location: dto.location.trim() } : {}),
        ...(dto.capacity ? { capacity: dto.capacity.trim() } : {}),
        ...(dto.installedAt ? { installedAt: new Date(dto.installedAt) } : {}),
        ...(dto.warrantyExpiresAt
          ? { warrantyExpiresAt: new Date(dto.warrantyExpiresAt) }
          : {}),
        ...(dto.notes ? { notes: dto.notes.trim() } : {}),
      },
      include: ASSET_INCLUDE,
    });

    await this.auditAsset('ASSET_CREATED', asset, organizationId);
    return asset;
  }

  async update(id: string, dto: UpdateAssetDto, organizationId: string) {
    const existing = await this.record(id, organizationId);

    if (existing.status === AssetStatus.RETIRED) {
      throw new ConflictException(
        'This asset is retired. Its details can no longer be changed — it is kept for its service history.',
      );
    }

    await this.assertReferences(organizationId, {
      propertyId: dto.propertyId,
      unitId: dto.unitId,
    });

    const asset = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.propertyId
          ? { property: { connect: { id: dto.propertyId } } }
          : {}),
        ...(dto.unitId !== undefined
          ? dto.unitId
            ? { unit: { connect: { id: dto.unitId } } }
            : { unit: { disconnect: true } }
          : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.assetTag !== undefined
          ? { assetTag: dto.assetTag?.trim() || null }
          : {}),
        ...(dto.serialNumber !== undefined
          ? { serialNumber: dto.serialNumber?.trim() || null }
          : {}),
        ...(dto.manufacturer !== undefined
          ? { manufacturer: dto.manufacturer?.trim() || null }
          : {}),
        ...(dto.model !== undefined
          ? { model: dto.model?.trim() || null }
          : {}),
        ...(dto.location !== undefined
          ? { location: dto.location?.trim() || null }
          : {}),
        ...(dto.capacity !== undefined
          ? { capacity: dto.capacity?.trim() || null }
          : {}),
        ...(dto.installedAt !== undefined
          ? { installedAt: dto.installedAt ? new Date(dto.installedAt) : null }
          : {}),
        ...(dto.warrantyExpiresAt !== undefined
          ? {
              warrantyExpiresAt: dto.warrantyExpiresAt
                ? new Date(dto.warrantyExpiresAt)
                : null,
            }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
      },
      include: ASSET_INCLUDE,
    });

    await this.auditAsset('ASSET_UPDATED', asset, organizationId);
    return asset;
  }

  /**
   * Move an asset's service state.
   *
   * Refused while open work orders exist, because taking the lift out of service
   * is a decision that needs the outstanding faults to be visible — and taking it
   * out of service with an open repair on it hides the fault.
   */
  async changeStatus(
    id: string,
    status: AssetStatus,
    organizationId: string,
    userId?: string,
  ) {
    const existing = await this.record(id, organizationId);

    const check = checkAssetStatusTransition(existing.status, status);
    if (!check.allowed) {
      throw new ConflictException(
        check.reason ?? 'That service-state change is not allowed.',
      );
    }

    if (status !== existing.status) {
      const openFaults = await this.prisma.workOrder.count({
        where: {
          assetId: id,
          status: {
            in: [
              'REQUESTED',
              'INSPECTION',
              'APPROVED',
              'ASSIGNED',
              'IN_PROGRESS',
            ],
          },
        },
      });
      if (openFaults > 0) {
        throw new ConflictException(
          `This asset has ${openFaults} open work order${openFaults === 1 ? '' : 's'} against it. Deal with ${openFaults === 1 ? 'it' : 'them'} before changing its service state.`,
        );
      }
    }

    const asset = await this.prisma.asset.update({
      where: { id },
      data: { status },
      include: ASSET_INCLUDE,
    });

    await this.auditAsset('ASSET_STATUS_CHANGED', asset, organizationId, {
      from: existing.status,
      to: status,
      userId,
    });
    return asset;
  }

  /**
   * Remove an asset with nothing attached to it.
   *
   * Anything else must be retired instead: the whole value of a register is the
   * service history, and deleting a row is how that history disappears while the
   * invoices for the repairs are still in the ledger.
   */
  async remove(id: string, organizationId: string) {
    const existing = await this.record(id, organizationId);

    const [schedules, workOrders] = await Promise.all([
      this.prisma.preventiveMaintenanceSchedule.count({
        where: { assetId: id },
      }),
      this.prisma.workOrder.count({ where: { assetId: id } }),
    ]);

    if (schedules > 0 || workOrders > 0) {
      throw new ConflictException(
        `This asset has ${schedules} maintenance schedule${schedules === 1 ? '' : 's'} and ${workOrders} work order${workOrders === 1 ? '' : 's'} against it. Retire it instead of deleting it so the history survives.`,
      );
    }

    await this.prisma.asset.delete({ where: { id } });

    await this.auditAsset('ASSET_DELETED', existing, organizationId);
    return { message: 'Asset deleted.' };
  }

  async exportCsv(
    organizationId: string | undefined,
    filters: AssetFilters = {},
  ): Promise<string> {
    const rows = await this.findAll(organizationId, filters);

    return toCsv(
      ASSET_EXPORT_HEADERS,
      rows.map((row) => ({
        assetTag: row.assetTag ?? '',
        name: row.name,
        type: row.type,
        status: row.status,
        property: row.property?.name ?? '',
        unit: row.unit?.name ?? '',
        location: row.location ?? '',
        manufacturer: row.manufacturer ?? '',
        model: row.model ?? '',
        serialNumber: row.serialNumber ?? '',
        installedAt: row.installedAt?.toISOString() ?? '',
        warrantyExpiresAt: row.warrantyExpiresAt?.toISOString() ?? '',
        openWorkOrders: row._count.workOrders,
        nextServiceDue: row.pmSchedules[0]?.nextDueAt?.toISOString() ?? '',
      })),
    );
  }

  /** Counts for the register header: by type, by status, how many are overdue. */
  async stats(organizationId: string | undefined) {
    const base = organizationId ? { organizationId } : {};
    const [byType, byStatus, schedules] = await Promise.all([
      this.prisma.asset.groupBy({
        by: ['type'],
        where: { ...base, status: { not: AssetStatus.RETIRED } },
        _count: { _all: true },
      }),
      this.prisma.asset.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.preventiveMaintenanceSchedule.findMany({
        where: { ...base, active: true },
        select: { nextDueAt: true },
      }),
    ]);

    const now = new Date();

    return {
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      byType: Object.fromEntries(
        byType.map((row) => [row.type, row._count._all]),
      ) as Partial<Record<AssetType, number>>,
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count._all]),
      ) as Partial<Record<AssetStatus, number>>,
      serviceOverdue: schedules.filter((row) => row.nextDueAt < now).length,
    };
  }

  // ================================================================== helpers

  private async record(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.asset.findFirst({
        where: { id, organizationId },
        include: ASSET_INCLUDE,
      }),
      'Asset',
    );
  }

  private buildWhere(
    organizationId: string | undefined,
    filters: AssetFilters,
  ): Prisma.AssetWhereInput {
    const where: Prisma.AssetWhereInput = {};

    if (organizationId) where.organizationId = organizationId;
    if (filters.type) where.type = filters.type as AssetType;
    if (filters.status) where.status = filters.status as AssetStatus;
    if (!filters.includeRetired && !filters.status) {
      // Retired kit is history, not work in progress: hidden by default so the
      // register is a to-do list rather than an archive.
      where.status = { not: AssetStatus.RETIRED };
    }
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.unitId) where.unitId = filters.unitId;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { assetTag: { contains: filters.search, mode: 'insensitive' } },
        { serialNumber: { contains: filters.search, mode: 'insensitive' } },
        { location: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async assertReferences(
    organizationId: string | undefined,
    refs: { propertyId?: string; unitId?: string },
  ) {
    const org = organizationId ?? undefined;

    if (refs.propertyId) {
      await requireRecord(
        this.prisma.property.findFirst({
          where: {
            id: refs.propertyId,
            ...(org ? { organizationId: org } : {}),
          },
          select: { id: true },
        }),
        'Property',
      );
    }

    if (refs.unitId) {
      await requireRecord(
        this.prisma.unit.findFirst({
          where: {
            id: refs.unitId,
            ...(org ? { property: { organizationId: org } } : {}),
          },
          select: { id: true },
        }),
        'Unit',
      );
    }
  }

  private async auditAsset(
    action: string,
    asset: { id: string; organizationId: string; name: string },
    organizationId: string | undefined,
    extra: Record<string, unknown> = {},
  ) {
    try {
      await this.audit.logAction({
        action,
        entity: 'Asset',
        entityId: asset.id,
        details: JSON.stringify({ name: asset.name, ...extra }),
        ipAddress: null,
        userAgent: null,
        ...(extra.userId
          ? { user: { connect: { id: extra.userId as string } } }
          : {}),
        organization: {
          connect: { id: asset.organizationId ?? organizationId },
        },
      });
    } catch {
      // Best-effort, like the rest of the codebase's audit calls.
    }
  }
}
