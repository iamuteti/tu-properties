import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { LeadSource, LeadStage } from '@prisma/client';
import { CleanOptional, ToBoolean } from '@/common/dto/transforms';

/**
 * `ContactType` is mirrored as a literal map instead of importing Prisma's
 * generated enum, so an invalid value is rejected with a 400 by
 * class-validator rather than blowing up inside Prisma. `contact.service.ts`
 * checks the value against the Prisma enum before writing.
 */
export const CONTACT_TYPES = [
  'BUYER',
  'TENANT',
  'LANDLORD',
  'INVESTOR',
  'AGENT',
  'LAWYER',
] as const;

export type ContactTypeInput = (typeof CONTACT_TYPES)[number];

/**
 * Every editable lead field except the identity details (`firstName`, `email`,
 * `phone`), shared by create and update. Those three are declared per subclass
 * because create requires a name while update treats everything as optional.
 */
export class LeadFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  message?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  sourceDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  lostReason?: string;

  /** Pass `null` to unlink. */
  @IsOptional()
  @IsString()
  interestedPropertyId?: string | null;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  assignedAgentId?: string | null;

  // `stage` and `organizationId` are intentionally not editable here: stage
  // only moves through `PATCH /crm/leads/:id/stage` (which enforces the
  // pipeline rules), and the organization always comes from the caller.
}

export class CreateLeadDto extends LeadFieldsDto {
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  firstName!: string;

  // At least one of email/phone is enforced in the service: a lead with no way
  // to reply cannot be worked, but which one is present is not a DTO concern.
  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
  @CleanOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;
}

export class UpdateLeadDto extends LeadFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  firstName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
  @CleanOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;
}

/**
 * Public webhook payload (website form / Facebook Lead Ads).
 *
 * Strict about identity — `firstName` plus at least one of `email`/`phone` —
 * because a lead with no way to reply cannot be worked.
 */
export class PublicLeadDto {
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @CleanOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  message?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  sourceDetail?: string;

  @IsOptional()
  @IsString()
  interestedPropertyId?: string;
}

/** Move a lead through the pipeline. */
export class UpdateLeadStageDto {
  @IsEnum(LeadStage)
  stage!: LeadStage;

  /** Required when moving to LOST — "why did we lose it" is the useful field. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  reason?: string;
}

/**
 * Convert a lead into a contact.
 *
 * By default the contact is created from the lead's own details; `contactId`
 * links an existing contact instead (someone already in the directory).
 */
export class ConvertLeadDto {
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsIn(CONTACT_TYPES, {
    message: `type must be one of: ${CONTACT_TYPES.join(', ')}`,
  })
  type?: ContactTypeInput;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @CleanOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  company?: string;

  /** Also create a Tenant record for this contact (Module 5 consumes it). */
  @IsOptional()
  @ToBoolean()
  createTenant?: boolean;
}
