/**
 * Module 15 - contract terms, notice deadlines and renewal chains.
 *
 * Everything in this file is pure: it derives a status from two dates and a number,
 * and it needs no database and no Nest. The design in one sentence is
 * **a contract's status is a function of the clock, and this is where that function
 * lives.** Nothing here is stored, for the same reason `MeterReading` stores the
 * register value and not the consumption, and `VisitorVisit` stores nothing but the
 * visit: a stored `status` column on `Contract` is a second copy of a fact that
 * `expiresAt` can contradict, and it drifts the first time somebody corrects an end
 * date and forgets to remember the status sweep. The whole point of an expiry
 * register is that it cannot quietly become wrong.
 *
 * Four rules live here rather than in the service, because each is easy to get
 * subtly wrong and none of them needs a database:
 *
 * 1. **The notice deadline is not the expiry date.** This is the rule the module doc
 *    does not contain and the reason `noticeDays` is a column at all. A contract that
 *    expires in 45 days but needs 90 days' notice is *already* past its notice
 *    deadline - it is already committed, and the expiry date will sail past while the
 *    landlord believes they still have options. An `expiresAt`-only view reports that
 *    contract as comfortably active for another six weeks. `NOTICE_DUE` is what
 *    catches it.
 * 2. **A superseded contract is not an expiring contract.** A replaced contract must
 *    not appear in the expiry report every morning. Note the direction: `renewalOfId`
 *    points at the **predecessor**, so the contract carrying that column is the *new*
 *    term and the superseded one is its parent - which means "am I superseded?" is
 *    **not** answerable from this row and has to be passed in as `isSuperseded` from
 *    the relation. A `renewalOfId IS NOT NULL` test would flag the renewal itself and
 *    mark the original as live, which is precisely backwards.
 * 3. **A contract with no end date is not "expiring".** It is open-ended, which is a
 *    different and quieter thing, and conflating the two would put every rolling
 *    management agreement on a 90-day warning list where nobody would ever act on it.
 * 4. **A related entity is required for four of the five types and forbidden for
 *    `COMPLIANCE`.** A gas safety certificate runs to the authority, not to a
 *    counterparty, so requiring one would make the most compliance-critical
 *    instruments in the register unrepresentable. The service asks
 *    `describeShapeViolation` for the human sentence; the database enforces the same
 *    rule with `num_nonnulls()`.
 *
 * Day arithmetic uses `Math.ceil`, not `Math.round`. A contract with 26 hours left
 * has one day left, not zero, and a warning band that reads zero has no way to say
 * *urgent*.
 */

/** Mirrors the `ContractType` enum. Local so this file stays importable in a unit test. */
export type ContractType =
  | 'LEASE'
  | 'SALE'
  | 'VENDOR'
  | 'MANAGEMENT'
  | 'COMPLIANCE';

/**
 * Derived lifecycle status. Never persisted - see the file header.
 *
 * Ordered by urgency, not by how they were computed. `PENDING` first because a term
 * that has not started cannot be expiring; `SUPERSEDED` next because it is a
 * statement about the contract's history rather than its clock.
 */
export type ContractStatus =
  | 'PENDING'
  | 'SUPERSEDED'
  | 'EXPIRED'
  | 'NOTICE_DUE'
  | 'EXPIRING_SOON'
  | 'ACTIVE'
  | 'OPEN_ENDED'
  | 'UNDATED';

/** Days before expiry at which a contract is called `EXPIRING_SOON`. */
export const EXPIRING_SOON_DAYS = 30;

/**
 * Warning bands, in days before expiry. `1` is in the list because a contract with
 * three days left must still produce an alert - without it, anything inside the
 * seven-day band would go silent at exactly the point it matters most.
 *
 * These are the bands the nightly sweep quantises *towards*: a contract at 62 days
 * remaining is reported against the 60-day band, because a reminder that fires on the
 * exact day is a reminder that depends on the cron landing precisely.
 *
 * Ascending order is load-bearing, not cosmetic: `nextReminderBand` takes the first
 * band at or above the days remaining, which is only the *smallest* such band if the
 * list runs upwards. Written descending, every lookup silently returns 90 and the
 * urgent bands become unreachable.
 */
export const CONTRACT_EXPIRY_WARNING_DAYS = [1, 7, 14, 30, 60, 90] as const;

/** The four counterparty-bearing columns. `COMPLIANCE` uses none of them. */
export interface RelatedEntityFlags {
  rentalAgreementId?: string | null;
  saleTransactionId?: string | null;
  supplierId?: string | null;
  landlordId?: string | null;
}

/** The minimum a contract needs for its dates to be derived from. */
export interface ContractTermShape {
  type: ContractType;
  startDate?: Date | null;
  expiresAt?: Date | null;
  noticeDays?: number | null;
  autoRenew?: boolean;
  /**
   * Whether some other contract names this one as its predecessor.
   *
   * Passed in rather than read off the row - see rule 2. The service resolves it with
   * the `renewals` relation, which is one indexed reverse lookup for the whole page.
   */
  isSuperseded?: boolean;
}

/**
 * Whole days from `now` until `at`, rounded up, negative once the date is past.
 *
 * `Math.ceil` is load-bearing. Rounding to nearest would report a contract with 30
 * hours remaining as `-0`/zero days and quietly drop it out of every warning band,
 * because it would read as *not yet due* and also *not due at all*.
 */
export function daysUntil(at: Date, now: Date): number {
  return Math.ceil((at.getTime() - now.getTime()) / 86_400_000);
}

/**
 * The last moment notice can still be served, or `undefined` when the contract
 * carries no notice requirement or no end date.
 *
 * `undefined` rather than `null` so a caller can distinguish "no deadline" from
 * "deadline is the epoch" - a contract whose notice deadline has already passed is
 * the interesting case, and it must not collapse into the same branch as a contract
 * that never had one.
 */
export function noticeDueAt(
  expiresAt: Date | null | undefined,
  noticeDays: number | null | undefined,
): Date | undefined {
  if (!expiresAt) return undefined;
  if (noticeDays === null || noticeDays === undefined) return undefined;
  return new Date(expiresAt.getTime() - noticeDays * 86_400_000);
}

/**
 * Whether the moment to serve notice on this contract has passed while the contract
 * is still running.
 *
 * This is the whole reason for rule 1. `now >= noticeDueAt && now < expiresAt` is
 * true for a contract that has *not* expired and cannot be renewed, which is the
 * state that an expiry-only register reports as healthy.
 */
export function isPastNoticeDeadline(
  expiresAt: Date | null | undefined,
  noticeDays: number | null | undefined,
  now: Date,
): boolean {
  const due = noticeDueAt(expiresAt, noticeDays);
  if (!due) return false;
  return now.getTime() >= due.getTime() && now.getTime() < expiresAt!.getTime();
}

/**
 * The derived lifecycle status of a contract.
 *
 * Precedence, and why each step can stop the walk:
 *
 * - **`PENDING`** - `startDate` is in the future. Nothing else can be true, because
 *   `expiresAt > startDate` is enforced by the database.
 * - **`SUPERSEDED`** - another contract renews this one. Checked before the clock on
 *   purpose: a replaced contract's end date is history, and reporting it as expired
 *   for ever is a false alarm that trains people to ignore the report. Note this
 *   describes the **original**, not the renewal - `renewalOfId` points at the
 *   predecessor, so the renewal that carries it is the live contract.
 * - **`EXPIRED`** - `expiresAt <= now`. The `<=` is deliberate, and it is what makes
 *   the boundary honest: a contract expiring exactly now has expired.
 * - **`NOTICE_DUE`** - the notice deadline has passed but the term has not. Strictly
 *   more urgent than `EXPIRING_SOON` even though it may sit further from the expiry
 *   date, because it is the state where action has stopped being optional.
 * - **`EXPIRING_SOON`** - inside `EXPIRING_SOON_DAYS`.
 * - **`ACTIVE`** - running, with an end date ahead of it.
 * - **`OPEN_ENDED`** - running, with no end date at all. Kept separate from `ACTIVE`
 *   because the two call for different actions: an active contract has a date to work
 *   backwards from, an open-ended one is a rolling agreement that has no date to miss.
 * - **`UNDATED`** - neither date recorded. This is a data-entry gap rather than a
 *   lifecycle state, and conflating it with either of the above would let a contract
 *   nobody ever dated sit on the register looking like an asset.
 */
export function deriveContractStatus(
  contract: ContractTermShape,
  now: Date,
): ContractStatus {
  const { startDate, expiresAt, isSuperseded } = contract;

  if (startDate && now.getTime() < startDate.getTime()) return 'PENDING';
  if (isSuperseded) return 'SUPERSEDED';
  if (!expiresAt) return startDate ? 'OPEN_ENDED' : 'UNDATED';
  if (now.getTime() >= expiresAt.getTime()) return 'EXPIRED';
  if (isPastNoticeDeadline(expiresAt, contract.noticeDays, now))
    return 'NOTICE_DUE';
  return daysUntil(expiresAt, now) <= EXPIRING_SOON_DAYS
    ? 'EXPIRING_SOON'
    : 'ACTIVE';
}

/**
 * The warning bands actually relevant to one contract: the standard set, plus the
 * notice deadline itself when there is one.
 *
 * Adding `noticeDays` as a band is what turns rule 1 into an alert. A 90-day-notice
 * contract gets its own reminder 90 days out, at the moment the obligation becomes
 * binding, rather than first surfacing at the generic 30-day band - by which point
 * serving notice was already impossible.
 */
export function reminderDaysFor(
  noticeDays: number | null | undefined,
): number[] {
  const bands = new Set<number>(CONTRACT_EXPIRY_WARNING_DAYS);
  if (typeof noticeDays === 'number' && noticeDays >= 0) bands.add(noticeDays);
  return [...bands].sort((a, b) => a - b);
}

/**
 * The band a contract with `daysRemaining` left should be reported against: the
 * smallest band at or above the days remaining.
 *
 * This buckets **upwards**, and that is what makes it survive a missed run. The sweep
 * is a cron at a fixed hour, so it will eventually be down on a day; a contract at 58
 * days remaining when it comes back still resolves to the 60-day band and alerts,
 * rather than finding that every band above 58 has already passed and staying silent
 * through the entire notice window.
 *
 * Exact matches count - a contract at exactly 30 days remaining is reported against
 * the 30-day band, because that is the day the reminder is *for*, and `ceil` on a
 * timestamp means a contract expiring tomorrow already reads as 1.
 *
 * Returns `null` only when there is nothing left to warn about, i.e. it has already
 * expired; the caller should not treat that as "no action needed".
 */
export function nextReminderBand(
  daysRemaining: number,
  bands: readonly number[] = CONTRACT_EXPIRY_WARNING_DAYS,
): number | null {
  if (daysRemaining <= 0) return null;
  return bands.find((band) => band >= daysRemaining) ?? null;
}

/**
 * One link in a contract's renewal history.
 *
 * Only the identity and the link are needed to walk a chain, so this is deliberately
 * narrower than the Prisma row - it keeps the walk testable without a database.
 */
export interface RenewalNode {
  id: string;
  reference: string;
  renewalOfId?: string | null;
  expiresAt?: Date | null;
}

/**
 * Walk a contract's renewal chain to its root, newest link first.
 *
 * Two properties matter and both are defensive, because renewal chains are entered by
 * hand from scanned paperwork:
 *
 * - **A cycle terminates.** A is renewed by B renewed by A is possible to type and
 *   would otherwise hang the nightly sweep forever. The `seen` set makes the walk
 *   stop at the repeat and return what was proven rather than looping.
 * - **A dangling parent does not stop the walk.** `renewalOfId` is `ON DELETE SET
 *   NULL`, so the original contract may have been deleted; the chain simply starts
 *   where the surviving evidence starts.
 */
export function buildRenewalChain(
  contract: RenewalNode,
  byId: ReadonlyMap<string, RenewalNode>,
): RenewalNode[] {
  const chain: RenewalNode[] = [contract];
  const seen = new Set<string>([contract.id]);
  let current = contract;

  while (current.renewalOfId) {
    const parent = byId.get(current.renewalOfId);
    if (!parent || seen.has(parent.id)) break;
    chain.push(parent);
    seen.add(parent.id);
    current = parent;
  }

  return chain;
}

/** The type of related entity each non-`COMPLIANCE` contract type must point at. */
const REQUIRED_ENTITY: Record<
  Exclude<ContractType, 'COMPLIANCE'>,
  keyof RelatedEntityFlags
> = {
  LEASE: 'rentalAgreementId',
  SALE: 'saleTransactionId',
  VENDOR: 'supplierId',
  MANAGEMENT: 'landlordId',
};

/**
 * The human sentence for a malformed contract, or `undefined` when the shape is fine.
 *
 * The database enforces the same rule (`contracts_one_related_entity` and
 * `contracts_entity_matches_type`), so this is not the only line of defence - it is
 * the one that gets read. A refusal that says `violates check constraint
 * "contracts_entity_matches_type"` tells the user nothing about which dropdown to fix;
 * a sentence naming the type and the field does.
 *
 * Checks in severity order: too many entities, then the type's own requirement, then
 * `COMPLIANCE`'s prohibition. Only one sentence is returned because a user with two
 * problems fixes them one at a time.
 */
export function describeShapeViolation(
  type: ContractType,
  related: RelatedEntityFlags,
): string | undefined {
  const present = Object.values(REQUIRED_ENTITY).filter((key) =>
    Boolean(related[key]),
  );

  if (present.length > 1) {
    return `A contract can only be linked to one record, but this one is linked to ${present.length}. Remove all but one.`;
  }

  if (type === 'COMPLIANCE') {
    if (present.length === 1) {
      return 'A compliance certificate is not tied to a tenant, buyer, supplier or landlord - it is tied to a property. Remove the linked record, or change the type if this is a counterparty agreement.';
    }
    return undefined;
  }

  const required = REQUIRED_ENTITY[type];
  if (present.length === 0) {
    return `A ${type.toLowerCase()} contract must be linked to a record. Set the linked ${required
      .replace(/Id$/, '')
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim()}.`;
  }

  if (present[0] !== required) {
    return `A ${type.toLowerCase()} contract must be linked to its own record type, but this one is linked to a ${present[0]
      .replace(/Id$/, '')
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim()}.`;
  }

  return undefined;
}
