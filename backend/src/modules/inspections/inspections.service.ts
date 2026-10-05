import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ConditionRating,
  InspectionStatus,
  InspectionType,
} from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import type {
  CreateInspectionDto,
  UpdateInspectionItemDto,
} from '@/modules/leases/dto/lease.dto';

/**
 * Move-in / periodic / move-out condition reports (Module 5).
 *
 * The audit found no inspection workflow at all, which is why damage disputes
 * turn into arguments: there is no record of the condition a tenant received the
 * unit in. Reports hold the checklist; photos attach through the Document Center
 * under `entityType = 'InspectionReport'` rather than a bespoke upload path.
 */
@Injectable()
export class InspectionsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateInspectionDto, tenantId: string) {
    await assertTenantRecord(this.prisma.unit, {
      id: dto.unitId,
      property: { organizationId: tenantId },
    });

    if (dto.rentalAgreementId) {
      await assertTenantRecord(this.prisma.rentalAgreement, {
        id: dto.rentalAgreementId,
        OR: [{ organizationId: tenantId }, { organizationId: null }],
      });
    }

    return this.prisma.inspectionReport.create({
      data: {
        unit: { connect: { id: dto.unitId } },
        ...(dto.rentalAgreementId
          ? { rentalAgreement: { connect: { id: dto.rentalAgreementId } } }
          : {}),
        ...(tenantId ? { organization: { connect: { id: tenantId } } } : {}),
        type: dto.type as InspectionType,
        scheduledDate: new Date(dto.scheduledDate),
        notes: dto.notes ?? null,
        items: dto.items?.length
          ? {
              create: dto.items.map((item) => ({
                area: item.area,
                item: item.item,
                condition: (item.condition ?? 'GOOD') as ConditionRating,
                notes: item.notes ?? null,
                estimatedCost: item.estimatedCost ?? null,
                requiresAction: item.requiresAction ?? false,
              })),
            }
          : undefined,
      },
      include: this.include(),
    });
  }

  list(tenantId: string, options: { unitId?: string; type?: string } = {}) {
    return this.prisma.inspectionReport.findMany({
      where: {
        ...(tenantId
          ? { OR: [{ organizationId: tenantId }, { organizationId: null }] }
          : {}),
        ...(options.unitId ? { unitId: options.unitId } : {}),
        ...(options.type ? { type: options.type as InspectionType } : {}),
      },
      include: this.include(),
      orderBy: { scheduledDate: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, tenantId: string) {
    const report = await requireRecord(
      this.prisma.inspectionReport.findFirst({
        where: {
          id,
          OR: [{ organizationId: tenantId }, { organizationId: null }],
        },
        include: this.include(),
      }),
      'Inspection',
    );

    // The comparison against the last report of the same type is what makes a
    // deposit dispute decidable: "the walls were marked POOR at move-in".
    const previous = await this.findPrevious(report);

    return {
      ...report,
      previous,
      comparison: compareReports(previous, report),
    };
  }

  async updateItem(
    id: string,
    itemId: string,
    dto: UpdateInspectionItemDto,
    tenantId: string,
  ) {
    await this.assertDraft(id, tenantId);

    const item = await requireRecord(
      this.prisma.inspectionItem.findFirst({
        where: { id: itemId, reportId: id },
      }),
      'Inspection item',
    );

    return this.prisma.inspectionItem.update({
      where: { id: item.id },
      data: {
        ...(dto.condition
          ? { condition: dto.condition as ConditionRating }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.estimatedCost !== undefined
          ? { estimatedCost: dto.estimatedCost }
          : {}),
        ...(dto.requiresAction !== undefined
          ? { requiresAction: dto.requiresAction }
          : {}),
      },
    });
  }

  addItem(
    id: string,
    item: {
      area: string;
      item: string;
      condition?: string;
      notes?: string;
      estimatedCost?: number;
    },
    tenantId: string,
  ) {
    return this.assertDraft(id, tenantId).then(() =>
      this.prisma.inspectionItem.create({
        data: {
          report: { connect: { id } },
          area: item.area,
          item: item.item,
          condition: (item.condition ?? 'GOOD') as ConditionRating,
          notes: item.notes ?? null,
          estimatedCost: item.estimatedCost ?? null,
        },
      }),
    );
  }

  /** Complete a report. Refuses an empty checklist — a blank report is useless. */
  async complete(id: string, tenantId: string, userId?: string) {
    await this.assertDraft(id, tenantId);

    const items = await this.prisma.inspectionItem.count({
      where: { reportId: id },
    });
    if (items === 0) {
      throw new BadRequestException(
        'Add the checklist items before completing the report — an empty inspection is not a record of anything.',
      );
    }

    return this.prisma.inspectionReport.update({
      where: { id },
      data: {
        status: InspectionStatus.COMPLETED,
        completedAt: new Date(),
        ...(userId ? { completedBy: { connect: { id: userId } } } : {}),
      },
      include: this.include(),
    });
  }

  async remove(id: string, tenantId: string) {
    await assertTenantRecord(this.prisma.inspectionReport, {
      id,
      OR: [{ organizationId: tenantId }, { organizationId: null }],
    });

    const report = await this.prisma.inspectionReport.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (report.status === InspectionStatus.COMPLETED) {
      throw new ConflictException(
        'A completed inspection is part of the tenancy record — void it instead of deleting it.',
      );
    }

    return this.prisma.inspectionReport.delete({ where: { id } });
  }

  // ---------------------------------------------------------------- helpers

  private async assertDraft(id: string, tenantId: string) {
    const report = await requireRecord(
      this.prisma.inspectionReport.findFirst({
        where: {
          id,
          OR: [{ organizationId: tenantId }, { organizationId: null }],
        },
        select: { id: true, status: true },
      }),
      'Inspection',
    );

    if (report.status !== InspectionStatus.DRAFT) {
      throw new ConflictException(
        'This inspection is already completed and cannot be edited.',
      );
    }

    return report;
  }

  private async findPrevious(report: {
    id: string;
    unitId: string;
    type: InspectionType;
    scheduledDate: Date;
  }) {
    return this.prisma.inspectionReport.findFirst({
      where: {
        unitId: report.unitId,
        type:
          report.type === InspectionType.MOVE_OUT
            ? InspectionType.MOVE_IN
            : report.type,
        status: InspectionStatus.COMPLETED,
        scheduledDate: { lt: report.scheduledDate },
      },
      include: this.include(),
      orderBy: { scheduledDate: 'desc' },
    });
  }

  private include() {
    return {
      items: { orderBy: { area: 'asc' } },
      unit: {
        select: {
          id: true,
          name: true,
          property: { select: { id: true, name: true } },
        },
      },
      rentalAgreement: {
        select: {
          id: true,
          code: true,
          status: true,
          tenant: { select: { id: true, surname: true, otherNames: true } },
        },
      },
      completedBy: { select: { id: true, firstName: true, lastName: true } },
    } as const;
  }
}

const CONDITION_ORDER: Record<ConditionRating, number> = {
  GOOD: 0,
  FAIR: 1,
  POOR: 2,
  DAMAGED: 3,
};

export interface ConditionDifference {
  area: string;
  item: string;
  from: ConditionRating | null;
  to: ConditionRating;
  worse: boolean;
  estimatedCost: number;
}

/** Decimal | number | string, without importing the Prisma Decimal type. */
type AmountLike = { toString(): string } | number | string;

/**
 * Compare the completed items of two reports (usually move-in vs move-out) and
 * return only what got worse, with the cost the tenant may be charged.
 */
export function compareReports(
  previous: {
    items: Array<{
      area: string;
      item: string;
      condition: ConditionRating;
      estimatedCost: AmountLike | null;
    }>;
  } | null,
  current: {
    items: Array<{
      area: string;
      item: string;
      condition: ConditionRating;
      estimatedCost: AmountLike | null;
    }>;
  },
): ConditionDifference[] {
  if (!previous) return [];

  const before = new Map<string, ConditionRating>();
  for (const item of previous.items) {
    before.set(
      `${item.area.toLowerCase()}|${item.item.toLowerCase()}`,
      item.condition,
    );
  }

  return current.items
    .map((item) => {
      const key = `${item.area.toLowerCase()}|${item.item.toLowerCase()}`;
      const from = before.get(key) ?? null;
      const worse =
        from === null ||
        CONDITION_ORDER[item.condition] > CONDITION_ORDER[from];
      return {
        area: item.area,
        item: item.item,
        from,
        to: item.condition,
        worse,
        estimatedCost: Number(item.estimatedCost ?? 0),
      };
    })
    .filter((difference) => difference.worse);
}
