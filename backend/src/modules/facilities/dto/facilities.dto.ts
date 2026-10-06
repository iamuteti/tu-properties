import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AccessCardType, FacilityKind } from '@prisma/client';
import { CleanOptional, ToBoolean, ToNumber } from '@/common/dto/transforms';

/**
 * Module 13 — Facilities DTOs.
 *
 * Three things are deliberately absent from every DTO in this file, and all three
 * are the module's design rather than omissions:
 *
 * 1. **No `endsAt` you may invent freely.** `endsAt` *is* accepted, because the
 *    client has to be able to say when a slot ends, but it is validated against the
 *    facility's own grid and then **recomputed** by `shapeSlot`. A DTO cannot
 *    express that (the grid lives on another row), so the service re-derives it —
 *    see `booking-slots.ts`. What the DTO can do is refuse an end at or before the
 *    start, which is the one shape that is always wrong.
 *
 * 2. **No `status` on any update.** A booking moves through `approve`, `reject`,
 *    `cancel`, `reactivate` and `mark-no-show`; a card through `suspend`,
 *    `reactivate`, `mark-lost`, `mark-expired` and `revoke`. A `PATCH` that could
 *    set `status` directly would skip every gate in `booking-lifecycle.ts` and
 *    `access-card-lifecycle.ts`, which is the only reason those files exist.
 *
 * 3. **No `organizationId`.** It is never accepted from a caller in this module —
 *    the tenant comes from the JWT — so a DTO that declared it would only create
 *    the illusion that it could be set.
 */

/**
 * `"08:30"` → 510.
 *
 * Opening hours are stored as minutes from local midnight (see the model comment),
 * so the wire format is a clock time because that is what a person types and what a
 * browser's `<input type="time">` produces. `null`/`undefined` is allowed through
 * untouched by `@IsOptional` so the two fields can be validated independently — a
 * blank start must produce "opening time is not a time" rather than silently
 * meaning midnight.
 */
export const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minutes from midnight for a `HH:MM` string. Caller has already validated. */
export function minutesFromClock(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

// ─────────────────────────────────────────────────────────────── Facilities

export class CreateFacilityDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEnum(FacilityKind)
  kind?: FacilityKind;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(100000)
  capacity?: number;

  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: 'An opening time looks like 08:30.' })
  @CleanOptional()
  opensAt?: string;

  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: 'A closing time looks like 22:00.' })
  @CleanOptional()
  closesAt?: string;

  /**
   * The booking grid. The four that make sense are 15, 30, 60 and 120 minutes.
   *
   * Constrained to a list rather than "any positive integer" because this is the
   * unit the diary is drawn in: a facility with a 7-minute grid produces a diary
   * nobody can read and a booking form with 300 options. A list also means a new
   * grid size is a deliberate decision rather than a typo.
   */
  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(15)
  @Max(120)
  slotMinutes?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(730)
  maxAdvanceDays?: number;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isBookable?: boolean;

  /**
   * Charged per booking.
   *
   * Accepted and snapshotted onto the booking, but **not invoiced** — see the
   * module's open items. Refusing a fee would be worse than recording one that is
   * not yet billed, because a clubhouse that costs money and has nowhere to put the
   * money is the exact gap this column is here to make visible.
   */
  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  bookingFee?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'A currency is a three-letter ISO-4217 code.',
  })
  @CleanOptional()
  bookingFeeCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  isActive?: boolean;
}

export class UpdateFacilityDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @CleanOptional()
  name?: string;

  @IsOptional()
  @IsEnum(FacilityKind)
  @CleanOptional()
  kind?: FacilityKind;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  description?: string;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(100000)
  @CleanOptional()
  capacity?: number;

  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: 'An opening time looks like 08:30.' })
  @CleanOptional()
  opensAt?: string;

  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: 'A closing time looks like 22:00.' })
  @CleanOptional()
  closesAt?: string;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(15)
  @Max(120)
  @CleanOptional()
  slotMinutes?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(730)
  @CleanOptional()
  maxAdvanceDays?: number;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  @CleanOptional()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  @CleanOptional()
  isBookable?: boolean;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  @CleanOptional()
  bookingFee?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'A currency is a three-letter ISO-4217 code.',
  })
  @CleanOptional()
  bookingFeeCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  @CleanOptional()
  isActive?: boolean;
}

export interface FacilityFilters {
  search?: string;
  propertyId?: string;
  kind?: string;
  isBookable?: string;
  /** Only facilities that are bookable *right now*, i.e. not closed all day. */
  openNow?: string;
  includeInactive?: string;
}

// ─────────────────────────────────────────────────────────────── Bookings

export class CreateBookingDto {
  @IsString()
  @MinLength(1)
  facilityId!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  /**
   * Who the slot is for. One of these three, or a name.
   *
   * `bookedForName` is the fallback rather than the other way round: "a guest of
   * the family in B4, and we do not have their details" is a real booking, and
   * forcing it to become a `Contact` first means the day sheet gets a contact
   * record for somebody who was never a lead. The name is required on the way in
   * anyway, and is filled from the relation when the caller did not supply it.
   */
  @IsOptional()
  @IsString()
  @CleanOptional()
  contactId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @CleanOptional()
  bookedForName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  bookedForPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  purpose?: string;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(100000)
  @CleanOptional()
  attendeeCount?: number;

  /**
   * Explicitly ask for approval on a facility that does not require it.
   *
   * Honoured as "make me PENDING". Withdrawn with `false` on a facility that *does*
   * require approval — the service ignores it and explains why, because silently
   * confirming a resident's request on a book-approval clubhouse is worse than
   * refusing the parameter.
   */
  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  requestApproval?: boolean;
}

export class UpdateBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @CleanOptional()
  bookedForName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  bookedForPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  purpose?: string;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(100000)
  @CleanOptional()
  attendeeCount?: number;

  @IsOptional()
  @IsString()
  @CleanOptional()
  contactId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  tenantId?: string;
}

/**
 * The note every decision and every cancellation carries.
 *
 * One DTO for four actions rather than four classes, because the field is the same
 * field and the *reason it is required* differs per action — which the lifecycle
 * enforces, not the validator. A rejection without a note is refused; a reactivate
 * does not need one; both post `{ note }`.
 */
export class BookingDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  note?: string;
}

export interface BookingFilters {
  search?: string;
  facilityId?: string;
  propertyId?: string;
  status?: string;
  /** `upcoming` | `past` | `today`. Derived from the dates, never stored. */
  when?: string;
  /** Restrict to one tenant, contact or staff booker's own entries. */
  tenantId?: string;
  contactId?: string;
  mine?: string;
  from?: string;
  to?: string;
}

// ─────────────────────────────────────────────────────────────── Blackouts

export class CreateBlackoutDto {
  @IsString()
  @MinLength(1)
  facilityId!: string;

  /**
   * Required. A closure with no stated reason is indistinguishable from a mistake,
   * and the next person to look at it cannot tell whether it is safe to lift.
   */
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}

// ─────────────────────────────────────────────────────────────── Visitors

export class CreateVisitorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @CleanOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @CleanOptional()
  company?: string;

  /**
   * Free text, not an enum: "National ID", "NIN", "SIN", "passport" and "CPF" are
   * five names for the same check, and an enum would mean a migration every time
   * the company hires a guard in a new country. Same reasoning as
   * `Employee.nationalId`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  idType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  idNumber?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

export class UpdateVisitorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @CleanOptional()
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @CleanOptional()
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @CleanOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @CleanOptional()
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  idType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  idNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @CleanOptional()
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  @ToBoolean()
  @CleanOptional()
  isActive?: boolean;
}

/**
 * Barring somebody from the site.
 *
 * Separate from `UpdateVisitorDto` on purpose even though both would write
 * `isBlacklisted`. A bar is a decision with a legal flavour, it needs a reason, it
 * needs to be undone deliberately, and it should be a separate audited action
 * rather than a checkbox that a `PATCH` can flip as an afterthought.
 */
export class BarVisitorDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class UnbarVisitorDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  note?: string;
}

export interface VisitorFilters {
  search?: string;
  isBlacklisted?: string;
  includeInactive?: string;
}

// ─────────────────────────────────────────────────────────────── Visits

export class CreateVisitDto {
  @IsString()
  @MinLength(1)
  visitorId!: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  propertyId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  tenantId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  contactId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  userId?: string;

  /**
   * What the gate book says. Filled from whichever host was given, but accepted
   * because the host may be somebody we hold no record of.
   */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @CleanOptional()
  hostName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @CleanOptional()
  hostPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  purpose?: string;

  /** When they are due. Defaults to now — most visits are somebody at the gate. */
  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @IsOptional()
  @IsDateString()
  expectedOutAt?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  accessCardId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

export interface VisitFilters {
  search?: string;
  visitorId?: string;
  propertyId?: string;
  /** `onsite` | `expected` | `overdue` | `history`. All derived. */
  state?: string;
  from?: string;
  to?: string;
}

// ───────────────────────────────────────────────────────────── Access cards

export class CreateAccessCardDto {
  /** Left out, the service allocates the next number for the organization. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @CleanOptional()
  cardNumber?: string;

  @IsOptional()
  @IsEnum(AccessCardType)
  type?: AccessCardType;

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
  facilityId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  userId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  tenantId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  contactId?: string;

  @IsOptional()
  @IsString()
  @CleanOptional()
  visitorId?: string;

  /**
   * What the guard reads off the card. Filled from whichever holder was given.
   */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @CleanOptional()
  holderName?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

/**
 * Reassigning a card.
 *
 * Not a general update DTO, and the omission is the design. `cardNumber`, `type`,
 * `status`, `issuedAt` and the "what it opens" columns are all absent, because
 * every one of them has an action that exists for it: a number is issued once, a
 * type is what makes a card mean something, a status moves through
 * `access-card-lifecycle.ts`, and moving a card to a different unit or property
 * would hand a resident a fob for a door they were never approved for. If a card
 * needs to be somewhere else, revoke it and issue another.
 */
export class UpdateAccessCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @CleanOptional()
  holderName?: string;

  @IsOptional()
  @IsDateString()
  @CleanOptional()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @CleanOptional()
  notes?: string;
}

/** The reason a card was suspended, reported lost, revoked or replaced. */
export class AccessCardDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @CleanOptional()
  note?: string;

  /** For `record-replacement`: the card issued in place of this one. */
  @IsOptional()
  @IsString()
  @CleanOptional()
  replacementCardId?: string;
}

export interface AccessCardFilters {
  search?: string;
  type?: string;
  status?: string;
  /** Effective status, so `?status=EXPIRED` also finds cards whose date has passed. */
  holder?: string;
  propertyId?: string;
  unitId?: string;
  facilityId?: string;
  expiringSoon?: string;
}

// ─────────────────────────────────────────────────────────────── Bulk ops

/**
 * Bulk state changes, reported per row.
 *
 * `ids` rather than "everything matching this filter" on purpose. A bulk action
 * whose scope is a filter is a bulk action nobody can preview, and the first time
 * somebody selects "all 400 confirmed bookings" by accident is the reason a
 * row-at-a-time fallback has to exist for anything that ends access.
 */
export class BulkBookingActionDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];

  @IsIn(['approve', 'reject', 'cancel'])
  action!: 'approve' | 'reject' | 'cancel';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @CleanOptional()
  note?: string;
}
