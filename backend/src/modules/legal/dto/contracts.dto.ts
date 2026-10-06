import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ContractType } from '@prisma/client';
import { ToBoolean, ToNumber } from '@/common/dto/transforms';

/**
 * Module 15 - Documents & Legal DTOs.
 *
 * Four things are deliberately absent from these DTOs, and all four are the module's
 * design rather than omissions:
 *
 * 1. **No `status` on any DTO.** A contract's status is derived from the clock by
 *    `contract-expiry.ts`, and it is never stored. A `PATCH` that could set it would
 *    let a user file a contract as `EXPIRED` and stay expired after being renewed.
 *
 * 2. **No `organizationId`.** It is never accepted from a caller - the tenant comes
 *    from the JWT - so a DTO declaring it would only create the illusion that it
 *    could be set.
 *
 * 3. **No `isSuperseded`, and no `renewalOfId` on update.** Both belong to the
 *    `renew` action. `renewalOfId` in particular is the chain's integrity: a user who
 *    can point a contract at any predecessor can forge a history in which a contract
 *    was renewed by one that never existed.
 *
 * 4. **No `type` and no related-entity id on `UpdateContractDto`.** This is the one
 *    that costs something, so it is worth stating plainly: `type` is the identity of
 *    the record - it decides which of the four entity columns must be set, and a
 *    `LEASE` and a `VENDOR` contract for the same supplier are different obligations.
 *    Changing it in place means re-pointing a signed document at a different
 *    counterparty, which is exactly what a new contract is for. A mis-filed contract
 *    is deleted and refiled, and `contracts.delete` is documented as meaning "entered
 *    in error" rather than "has lapsed".
 *
 * There is also **no `documentId` cross-field requirement** here: a contract may be
 * filed before the scan exists, because contracts are frequently reconstructed from
 * paperwork that arrives later. The list screen reports the missing attachment rather
 * than blocking the filing.
 */
export class CreateContractDto {
  /**
   * The citable identifier, e.g. `CON-0001`.
   *
   * Unique per organization, not globally - see `contracts_organizationId_reference_key`
   * in the migration. Two organizations in this system are separate businesses that
   * both started their contracts at CON-0001.
   */
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  reference!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  /**
   * `COMPLIANCE` is the reason the shape rule has an exception: a gas safety
   * certificate runs to the authority and has no counterparty, and a schema that
   * required one could not represent the most compliance-critical documents in the
   * register.
   */
  @IsEnum(ContractType)
  type!: ContractType;

  /** Required when `type` is `LEASE`, forbidden otherwise. */
  @IsOptional()
  @IsString()
  rentalAgreementId?: string;

  /** Required when `type` is `SALE`. */
  @IsOptional()
  @IsString()
  saleTransactionId?: string;

  /** Required when `type` is `VENDOR`. */
  @IsOptional()
  @IsString()
  supplierId?: string;

  /** Required when `type` is `MANAGEMENT`. */
  @IsOptional()
  @IsString()
  landlordId?: string;

  /** The authoritative signed agreement. Addenda attach via the Document Center. */
  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  /**
   * Leave unset for an open-ended agreement. It is not defaulted to a rolling term
   * because that would invent an obligation nobody agreed to.
   */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  /**
   * Days of notice required before the term can be ended or extended.
   *
   * Bounded at 730 (two years) because the arithmetic below subtracts it from
   * `expiresAt`, and an unbounded value would put a notice deadline centuries before
   * the contract started.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(730)
  noticeDays?: number;

  /**
   * Records that the contract renews itself. It does not create the renewal - only a
   * person can sign the next term - it changes the warning bands the reminder sweep
   * uses, because a renewal that needs negotiating is exactly when warning is useful.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(730)
  noticeDays?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  autoRenew?: boolean;

  /** Attach or replace the signed scan once it arrives. */
  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * `POST /contracts/:id/renew`.
 *
 * A separate DTO rather than a reuse of `CreateContractDto` because the shape is
 * narrower and the omissions are meaningful: `type` and the related entity are
 * **inherited** from the contract being renewed, not chosen. A renewal that pointed at
 * a different landlord would not be a renewal.
 */
export class RenewContractDto {
  /** New end date of the term. Must be after the predecessor's. */
  @IsDateString()
  expiresAt!: string;

  /** Optional override - most renewals keep the same notice period. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(730)
  noticeDays?: number;

  /** Defaults to the predecessor's value when omitted. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  autoRenew?: boolean;

  /**
   * The signed agreement for the new term. Optional, because the renewal is often
   * agreed verbally and the paperwork follows; the register reports the gap rather
   * than refusing the renewal.
   */
  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ContractQueryDto {
  @IsOptional()
  @IsEnum(ContractType)
  type?: ContractType;

  /**
   * Contracts whose end date falls in `[from, to]`.
   *
   * A date window rather than a `status` filter, and the reason is worth stating: a
   * status is *derived* (rule 1 of `contract-expiry.ts`), so filtering on it would
   * require either a stored column that can contradict `expiresAt` or a second
   * implementation of the same rules in SQL that drifts from the tested one. Filtering
   * on the columns the derivation actually reads cannot drift. `GET
   * /contracts/expiry-report` is where the derived statuses are reported, over a
   * bounded window.
   */
  @IsOptional()
  @IsDateString()
  expiresFrom?: string;

  @IsOptional()
  @IsDateString()
  expiresTo?: string;

  /** Narrow to one counterparty, whichever kind it is. */
  @IsOptional()
  @IsString()
  relatedId?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  hasDocument?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ExpiryReportQueryDto {
  /**
   * How far ahead to look, in days. Default 180, capped at 1095 (three years).
   *
   * Bounded because the report derives a status per contract in JavaScript rather than
   * filtering on it in SQL - see `ContractQueryDto.expiresFrom` for why. Without a cap,
   * an organization with decades of closed contracts would load its entire register to
   * report on the next fortnight.
   */
  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(1095)
  withinDays?: number;

  /** Restrict to one type, e.g. only the leases that need renewing. */
  @IsOptional()
  @IsEnum(ContractType)
  type?: ContractType;
}
