import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { WorkflowApproverKind } from '@prisma/client';
import { CleanOptional, ToBoolean, ToNumber } from '@/common/dto/transforms';
import {
  WORKFLOW_CONDITION_OPS,
  type WorkflowConditionOp,
} from '../workflow-rules';

/**
 * Workflow engine payloads (Module 18).
 *
 * `value` on a condition is deliberately unvalidated beyond being JSON: a
 * threshold can be a number, a currency code or a list, and the rule engine
 * (not the DTO) is the thing that knows how to compare it.
 */

export class WorkflowConditionDto {
  @IsString()
  @MaxLength(120)
  field!: string;

  @IsEnum(WORKFLOW_CONDITION_OPS as unknown as object)
  op!: WorkflowConditionOp;

  // Any JSON scalar, array or object — a threshold can be a number, a
  // currency code or a list, and only the rule engine knows how to compare it.
  @Allow()
  @IsOptional()
  value?: unknown;
}

export class WorkflowStepTemplateDto {
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  name!: string;

  @IsEnum(WorkflowApproverKind)
  approverKind!: WorkflowApproverKind;

  @IsOptional()
  @IsString()
  @CleanOptional()
  approverUserId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  approverRole?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowConditionDto)
  condition?: WorkflowConditionDto | null;

  @IsOptional()
  @IsInt()
  @ToNumber()
  @Min(1)
  escalateAfterHours?: number;

  @IsOptional()
  @IsString()
  @CleanOptional()
  escalateToUserId?: string;
}

export class CreateWorkflowDefinitionDto {
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  entityType!: string;

  @IsString()
  @MaxLength(120)
  @CleanOptional()
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepTemplateDto)
  steps!: WorkflowStepTemplateDto[];

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @ToNumber()
  priority?: number;
}

export class UpdateWorkflowDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepTemplateDto)
  steps?: WorkflowStepTemplateDto[];

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @ToNumber()
  priority?: number;
}

export enum WorkflowDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class DecideWorkflowDto {
  @IsEnum(WorkflowDecision)
  decision!: WorkflowDecision;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  comment?: string;
}

export class CancelWorkflowDto {
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  reason!: string;
}

export class CreateDelegationDto {
  @IsString()
  @CleanOptional()
  toUserId!: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  reason?: string;
}

export class WorkflowInstanceQueryDto {
  @IsOptional()
  @IsString()
  @CleanOptional()
  status?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  entityType?: string;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @ToNumber()
  @Min(1)
  limit?: number;
}
