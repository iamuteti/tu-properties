import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * SaaS administration (Module 19) — impersonating a tenant user.
 *
 * The reason is required for the same cause a suspension needs one: starting
 * somebody else's session must be a decision with a record, never a bare
 * click. It lands in the IMPERSONATION_STARTED audit row verbatim.
 */
export class ImpersonateDto {
  /** The tenant user to act as. Must belong to the organization in the path. */
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(400)
  reason!: string;
}
