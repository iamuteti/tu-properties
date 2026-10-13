import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TicketPriority, TicketStatus } from '@prisma/client';

/**
 * SaaS administration (Module 19) — support tickets.
 *
 * Two writers, two shapes: a tenant raises with subject + description (+ an
 * optional priority), and the platform answers with a status move + resolution
 * note. The tenant never sets the status directly — closing their own ticket
 * goes through the same validated transition, not a status field.
 */
export class CreateSupportTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: TicketPriority;

  /**
   * SUPER_ADMIN only: the organization this ticket is raised against. Tenant
   * callers always write to their own organization and must not send this —
   * the service ignores it for them rather than trusting it.
   */
  @IsOptional()
  @IsString()
  organizationId?: string;
}

export class UpdateSupportTicketDto {
  /** Tenant edit while the ticket is still OPEN. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description?: string;
}

export class SetTicketStatusDto {
  @IsIn(['IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status!: TicketStatus;

  /**
   * Required when resolving (it is the answer the tenant reads), forbidden
   * nowhere else but only meaningful there.
   */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  resolution?: string;
}
