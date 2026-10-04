import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AssetStatus,
  AssetType,
  MaintenanceCategory,
  WorkOrderPriority,
  WorkOrderSource,
} from '@prisma/client';
import { CleanOptional, ToBoolean, ToNumber } from '@/common/dto/transforms';

/**
 * Module 9 — Maintenance DTOs.
 *
 * `status` is absent from every one of them on purpose. The status moves only
 * through the transition endpoints, which run the state machine; a `status` on
 * an update body would let a client put a work order straight to COMPLETED
 * without an inspection, an assignment or a resolution note.
 */

export class CreateWorkOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  description!: string;

  @IsEnum(MaintenanceCategory)
  category!: MaintenanceCategory;

  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  /** Where it is. Property is the anchor; unit narrows it to one home. */
  @IsOptional()
  @IsString()
  @CleanOptional()
  propertyId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  unitId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  tenantId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  assetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  accessInstructions?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  scheduledFor?: string;

  /** Staff may pre-assign; the portal path never sets this. */
  @IsOptional()
  @IsString()
  @CleanOptional()
  assignedTechnicianId?: string;
}

export class UpdateWorkOrderDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  @CleanOptional()
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @IsEnum(MaintenanceCategory)
  @CleanOptional()
  category?: MaintenanceCategory;

  @IsOptional()
  @IsEnum(WorkOrderPriority)
  @CleanOptional()
  priority?: WorkOrderPriority;

  @IsOptional()
  @IsString()
  @CleanOptional()
  propertyId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  unitId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  assetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  accessInstructions?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  scheduledFor?: string;
}

/** The resident's own report from the portal. Nothing else about it is theirs. */
export class ReportIssueDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  description!: string;

  @IsEnum(MaintenanceCategory)
  category!: MaintenanceCategory;

  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  accessInstructions?: string;
}

export class InspectWorkOrderDto {
  /** What the inspection found. Required — it is what the approver reads. */
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  inspectionNote!: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;
}

export class AssignWorkOrderDto {
  @IsString()
  technicianId!: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  scheduledFor?: string;
}

export class CompleteWorkOrderDto {
  /** What was actually done. Required — the resident reads this. */
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  resolutionNote!: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  actualCost?: number;
}

export class CancelWorkOrderDto {
  /** Why it is being called off. Required — the resident and owner read this. */
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;
}

export class ReassignWorkOrderDto {
  @IsString()
  technicianId!: string;
}

export class CreateWorkOrderTaskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateWorkOrderTaskDto {
  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isDone?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  @CleanOptional()
  description?: string;
}

export class BulkAssignWorkOrdersDto {
  @IsArray()
  workOrderIds!: string[];

  @IsString()
  technicianId!: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  scheduledFor?: string;
}

export class CreateAssetDto {
  @IsString()
  propertyId!: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  unitId?: string;

  @IsEnum(AssetType)
  type!: AssetType;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  assetTag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  capacity?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  installedAt?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  warrantyExpiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;
}

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @CleanOptional()
  propertyId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  unitId?: string;

  @IsOptional()
  @IsEnum(AssetType)
  @CleanOptional()
  type?: AssetType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @CleanOptional()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  assetTag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  capacity?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  installedAt?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  warrantyExpiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;
}

/** Service state moves through its own endpoint, not through the update DTO. */
export class ChangeAssetStatusDto {
  @IsEnum(AssetStatus)
  status!: AssetStatus;
}

export class CreatePmScheduleDto {
  @IsString()
  assetId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  description?: string;

  /** Days between services. A month is 30, a week is 7 — see the doc comments. */
  @IsInt()
  @Min(1)
  @Max(3650)
  frequencyDays!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  leadTimeDays?: number;

  /** The steps to perform. Copied onto each work order the sweep raises. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklist?: string[];

  @IsOptional()
  @IsString()
  @CleanOptional()
  assignedTechnicianId?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  nextDueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

export class UpdatePmScheduleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @CleanOptional()
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  frequencyDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  leadTimeDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklist?: string[];

  @IsOptional()
  @IsString()
  @CleanOptional()
  assignedTechnicianId?: string;

  @IsOptional()
  @CleanOptional()
  @IsDateString()
  nextDueAt?: string;

  /** Pause a schedule without losing its history or its interval. */
  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

export interface WorkOrderFilters {
  status?: string;
  category?: string;
  priority?: string;
  source?: WorkOrderSource | string;
  propertyId?: string;
  unitId?: string;
  tenantId?: string;
  assetId?: string;
  technicianId?: string;
  /** 'unassigned' is a filter of its own — the queue nobody has picked up. */
  assigned?: string;
  overdue?: boolean;
  open?: boolean;
  search?: string;
}
