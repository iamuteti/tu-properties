import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CommChannel, CommDirection } from '@prisma/client';
import { CleanOptional, ToBoolean } from '@/common/dto/transforms';
import {
  CONTACT_TYPES,
  type ContactTypeInput,
} from '@/modules/crm/leads/dto/lead.dto';

export class ContactFieldsDto {
  @IsOptional()
  @IsIn(CONTACT_TYPES, {
    message: `type must be one of: ${CONTACT_TYPES.join(', ')}`,
  })
  type?: ContactTypeInput;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
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

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @CleanOptional()
  notes?: string;

  @IsOptional()
  @ToBoolean()
  isActive?: boolean;

  /**
   * Link this contact to a tenant record (Module 3 decision: Tenant stays its
   * own table, the two are linked rather than merged). Pass `null` to unlink.
   */
  @IsOptional()
  @IsString()
  tenantId?: string | null;
}

export class CreateContactDto extends ContactFieldsDto {
  @IsString()
  @MaxLength(120)
  @CleanOptional()
  firstName!: string;

  @IsString()
  @MaxLength(120)
  @CleanOptional()
  lastName!: string;
}

export class UpdateContactDto extends ContactFieldsDto {
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
}

export class CreateCommunicationDto {
  @IsEnum(CommChannel)
  channel!: CommChannel;

  @IsOptional()
  @IsEnum(CommDirection)
  direction?: CommDirection;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @CleanOptional()
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  @CleanOptional()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @CleanOptional()
  outcome?: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;

  /** One of the two must be present — see the service for the 400. */
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;
}
