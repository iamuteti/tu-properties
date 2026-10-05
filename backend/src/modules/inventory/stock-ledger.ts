/**
 * Module 11 — the stock ledger's arithmetic.
 *
 * Everything in this file is pure and derives a number from rows. That is the
 * module's whole design in one sentence: **a stock level is the sum of the
 * movements, and this is where that sum is taken.** There is no
 * `InventoryItem.quantityOnHand` column, and the reason is the same one the rest
 * of this schema learned the hard way — `Invoice.paidAmount` and
 * `PurchaseOrderLine.receivedQuantity` are both derived columns now, because a
 * counter has to be kept in step by every writer and drifts the first time one of
 * them forgets. A store's stock is worse than an invoice's balance: there are
 * five kinds of writer here (receipts, issues, transfers, returns, counts) and a
 * counter any of them can leave wrong.
 *
 * Four rules live here rather than in the service, because each has a rule that
 * is easy to get subtly wrong and none of them needs a database:
 *
 * 1. **Sign is not a free choice.** A `GOODS_RECEIPT` that is negative is not a
 *    refund, it is a goods receipt that will quietly subtract from the shelf.
 * 2. **An issue cannot take what is not there** — except a count. An
 *    `ADJUSTMENT` is the one movement allowed to leave stock negative, because a
 *    count that disagrees with the books is precisely the case where the books
 *    are the thing that is wrong.
 * 3. **Valuation walks the history**, weighted average, rather than reading
 *    today's price for everything on the shelf.
 * 4. **Ordering is deterministic.** Two movements written in the same
 *    millisecond must not produce a different running balance on two reads of the
 *    same data, so the ledger sorts by `(createdAt, id)` itself instead of
 *    trusting the order it was handed.
 */

/** Quantities are stored as Decimal(12,2); costs as Decimal(14,4). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/**
 * Anything numeric that arrives from Prisma (a `Decimal`), from JSON (a string,
 * because that is what the frontend receives over the wire) or as a plain number.
 *
 * Typed structurally rather than by importing `Prisma.Decimal`, which keeps this
 * file free of the generated client — a unit test should not need a database to
 * exist to check that a sum is right.
 */
export type Numeric =
  | number
  | string
  | { toString(): string }
  | null
  | undefined;

export function num(value: Numeric): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A stock movement, reduced to what the arithmetic needs.
 *
 * `StockMovementType` is mirrored as a string union rather than imported from
 * `@prisma/client` so this file stays pure and unit-testable without the
 * generated client — the same choice `procurement-lifecycle.ts` makes.
 */
export type MovementType =
  | 'GOODS_RECEIPT'
  | 'WORK_ORDER_ISSUE'
  | 'ADJUSTMENT'
  | 'OPENING'
  | 'TRANSFER'
  | 'RETURN';

export interface LedgerMovement {
  id: string;
  /** Signed: positive brought stock in, negative took it out. */
  quantity: Numeric;
  type: MovementType;
  /** Cost per unit at the time of the movement. Null on an issue. */
  unitCost?: Numeric;
  createdAt: Date | string;
}

/** Where an item sits against its reorder level. Derived, never stored. */
export type StockStatus = 'OUT_OF_STOCK' | 'REORDER' | 'OK';

/**
 * The movement types whose sign is not a matter of opinion.
 *
 * A transfer, a return and an adjustment are deliberately absent: each is
 * legitimately either direction, and deciding which one a particular transfer is
 * belongs to the service that knows whether the warehouse is the source or the
 * destination.
 */
const REQUIRED_DIRECTION: Partial<Record<MovementType, 'IN' | 'OUT'>> = {
  GOODS_RECEIPT: 'IN',
  OPENING: 'IN',
  WORK_ORDER_ISSUE: 'OUT',
};

/**
 * Types that are allowed to leave stock below zero.
 *
 * Only a count. Anything else that would go negative means somebody issued
 * material that was never received, and the correct answer to that is a refused
 * request followed by a stock take — not a negative shelf that quietly hides the
 * mistake until the next purchase order covers it.
 */
const MAY_GO_NEGATIVE: ReadonlySet<MovementType> = new Set<MovementType>([
  'ADJUSTMENT',
]);

/**
 * Ledger order: oldest first, ties broken by id.
 *
 * `createdAt` alone is not enough: a transfer writes two rows and a multi-line
 * receipt writes one row per line, all inside one transaction, so they share a
 * timestamp. `id` breaks the tie, and because it is unique the order is the same
 * on every read of the same data — which is the property that matters, since a
 * running balance that changed between two page loads would be indistinguishable
 * from a bug.
 */
export function ledgerOrder(a: LedgerMovement, b: LedgerMovement): number {
  const left = new Date(a.createdAt).getTime();
  const right = new Date(b.createdAt).getTime();
  if (left !== right) return left - right;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function chronological(movements: LedgerMovement[]): LedgerMovement[] {
  return [...movements].sort(ledgerOrder);
}

/** The level on hand: the sum of the movements, and nothing else. */
export function stockOnHand(movements: LedgerMovement[]): number {
  return round2(
    movements.reduce((sum, movement) => sum + num(movement.quantity), 0),
  );
}

/**
 * The balance *after* each movement, so a ledger screen can show the running
 * figure without asking the client to accumulate it (and getting it wrong in the
 * process). The last entry is the level on hand.
 */
export function runningBalances(
  movements: LedgerMovement[],
): { id: string; quantity: number; balance: number }[] {
  let balance = 0;
  return chronological(movements).map((movement) => {
    const quantity = round2(num(movement.quantity));
    balance = round2(balance + quantity);
    return { id: movement.id, quantity, balance };
  });
}

/** Group a mixed bag of movements into one balance per warehouse. */
export function stockByWarehouse(
  movements: (LedgerMovement & { warehouseId: string })[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  // Sorted in place on a copy rather than through `chronological`, which widens
  // the element type back to `LedgerMovement` and would drop `warehouseId`.
  for (const movement of [...movements].sort(ledgerOrder)) {
    const key = movement.warehouseId;
    totals[key] = round2((totals[key] ?? 0) + num(movement.quantity));
  }
  return totals;
}

/**
 * Status against the reorder level.
 *
 * `reorderLevel` of zero means "do not reorder this automatically" — a tracked
 * bracket nobody reorders still needs to read as OK rather than as permanently
 * empty, so zero is compared against zero and not treated as "any stock is low".
 */
export function stockStatus(onHand: number, reorderLevel: number): StockStatus {
  const level = round2(Math.max(0, num(reorderLevel)));
  if (level <= 0) return 'OK';
  const stock = round2(num(onHand));
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock < level) return 'REORDER';
  return 'OK';
}

export interface ReorderInput {
  onHand: Numeric;
  reorderLevel: Numeric;
  /** Null means "top up to twice the level". */
  reorderQuantity?: Numeric;
  /** Last known price per unit; used only to estimate the order's cost. */
  unitCost?: Numeric;
  unitOfMeasure?: string | null;
}

export interface ReorderSuggestion {
  needsReorder: boolean;
  status: StockStatus;
  /** How far below the level the item is. Null when it does not need ordering. */
  shortfall: number | null;
  /** What to put on the order. Never zero when `needsReorder` is true. */
  suggestedQuantity: number;
  /** `suggestedQuantity × unitCost`, or null when no price is on file. */
  estimatedCost: number | null;
  unitOfMeasure: string;
  /** Spelled out for the notification body and the reorder list. */
  reason: string | null;
}

/**
 * What to order, and why.
 *
 * The suggested quantity is a floor, not a suggestion in the advisory sense: it
 * is the amount that brings the item back to twice its reorder level, because a
 * reorder that merely tops the item back up to the level means the same purchase
 * request comes back next week. An explicit `reorderQuantity` always wins,
 * because the person who set it knew what a case of the thing costs.
 */
export function reorderSuggestion(input: ReorderInput): ReorderSuggestion {
  const level = round2(Math.max(0, num(input.reorderLevel)));
  const onHand = round2(num(input.onHand));
  const unit = input.unitOfMeasure?.trim() || 'unit';
  const status = stockStatus(onHand, level);

  if (status === 'OK') {
    return {
      needsReorder: false,
      status,
      shortfall: null,
      suggestedQuantity: 0,
      estimatedCost: null,
      unitOfMeasure: unit,
      reason: null,
    };
  }

  const shortfall = round2(level - onHand);

  // With no explicit quantity, top up to twice the level — the smallest order
  // that does not immediately re-trip the alert.
  const target = round2(level * 2);
  const explicit = input.reorderQuantity == null || input.reorderQuantity === ''
    ? null
    : round2(num(input.reorderQuantity));
  const suggested =
    explicit !== null
      ? // An explicit quantity wins outright, even when it is smaller than the
        // shortfall. Six is one case and the person who set it knows that; the
        // alert firing again next week is the correct consequence of ordering a
        // case, not an argument for quietly ordering four cases instead.
        Math.max(explicit, 0.01)
      : round2(Math.max(target - onHand, 0.01));

  const cost = input.unitCost == null || input.unitCost === '' ? null : num(input.unitCost);
  const estimatedCost = cost === null ? null : round2(suggested * cost);

  const reason =
    status === 'OUT_OF_STOCK'
      ? `Nothing left${onHand < 0 ? ` (the books say ${onHand}, which a stock take needs to settle)` : ''}.`
      : `${onHand} ${unit} left against a reorder level of ${level}.`;

  return {
    needsReorder: true,
    status,
    shortfall,
    suggestedQuantity: suggested,
    estimatedCost,
    unitOfMeasure: unit,
    reason,
  };
}

export interface MovementCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Whether a movement is coherent on its own terms.
 *
 * Two separate questions, asked separately so the caller can report the right
 * one: does the sign agree with the type, and may it take the balance below zero.
 * A zero quantity is refused outright — a movement that changes nothing is a
 * row in the ledger that changes nothing, which is worse than no row because it
 * looks like an event.
 */
export function checkMovement(
  type: MovementType,
  quantity: Numeric,
  balanceBefore?: Numeric,
): MovementCheck {
  const amount = round2(num(quantity));

  if (amount === 0) {
    return {
      allowed: false,
      reason: 'A stock movement needs a quantity — zero would be a row that changes nothing.',
    };
  }

  const required = REQUIRED_DIRECTION[type];
  if (required === 'IN' && amount < 0) {
    return {
      allowed: false,
      reason:
        'Stock coming in has to be a positive quantity. Use a return or an adjustment to take stock back out.',
    };
  }
  if (required === 'OUT' && amount > 0) {
    return {
      allowed: false,
      reason:
        'Stock going out has to be a negative quantity, so the balance is a plain sum.',
    };
  }

  if (
    balanceBefore !== undefined &&
    amount < 0 &&
    !MAY_GO_NEGATIVE.has(type) &&
    round2(num(balanceBefore) + amount) < 0
  ) {
    return {
      allowed: false,
      reason: `Only ${round2(
        num(balanceBefore),
      )} is on hand here, so ${Math.abs(amount)} cannot go out. Record a stock take first if the shelf really holds it.`,
    };
  }

  return { allowed: true };
}

/** How much an issue would leave, for the caller to refuse or record. */
export function balanceAfter(
  balanceBefore: Numeric,
  quantity: Numeric,
): number {
  return round2(num(balanceBefore) + num(quantity));
}

export interface Valuation {
  /** Signed total on hand. Negative only if a count put it there. */
  quantity: number;
  /** Weighted-average value of what is on the shelf. */
  value: number;
  /** `value / quantity`, or null when nothing is on the shelf. */
  averageUnitCost: number | null;
  /** Movements that carried no cost, so the average is partly assumed. */
  movementsWithoutCost: number;
}

/**
 * Perpetual weighted-average valuation.
 *
 * Each `IN` brings in its own snapshot price; each `OUT` leaves at the running
 * average, because an issue does not create a new price — it consumes one that
 * was already paid for. The alternative (value everything at
 * `InventoryItem.unitCost`) is simpler and wrong in a way that only shows up
 * months later: the price changed in March, and the shelf silently revalued
 * itself.
 *
 * Value is floored at zero. If the movements say stock went negative without an
 * adjustment, the cost of that is unknown rather than negative, and reporting
 * negative stock value would make the whole valuation column untrustworthy.
 */
export function valuation(movements: LedgerMovement[]): Valuation {
  let quantity = 0;
  let value = 0;
  let movementsWithoutCost = 0;

  for (const movement of chronological(movements)) {
    const amount = round2(num(movement.quantity));
    const hasCost =
      movement.unitCost !== null &&
      movement.unitCost !== undefined &&
      movement.unitCost !== '';

    if (!hasCost) movementsWithoutCost += 1;

    if (amount > 0) {
      quantity = round2(quantity + amount);
      if (hasCost) {
        value = round2(value + amount * num(movement.unitCost));
      } else if (quantity > 0) {
        // An `IN` with no recorded cost. Carry the running average forward
        // rather than valuing it at zero, which would understate the shelf by
        // the whole of this movement and never recover.
        const average = quantity - amount > 0 ? value / (quantity - amount) : 0;
        value = round2(value + amount * average);
      }
      continue;
    }

    const issued = Math.abs(amount);
    if (hasCost) {
      // An explicit cost on an `OUT` is respected — a return valued at what the
      // supplier refunded, for instance, which is not the shelf average.
      value = round2(value - issued * num(movement.unitCost));
    } else if (quantity > 0) {
      const average = value / quantity;
      value = round2(value - issued * average);
    } else {
      // Issuing from an already-empty shelf. Quantity goes negative, which a
      // stock take settles; value cannot go negative with it.
      movementsWithoutCost += 0;
    }

    quantity = round2(quantity - issued);
    if (value < 0) value = 0;
  }

  return {
    quantity,
    value,
    averageUnitCost: quantity > 0 ? round4(value / quantity) : null,
    movementsWithoutCost,
  };
}

/**
 * A transfer is two rows sharing a `transferGroup`.
 *
 * The service writes the pair; this says what the pair has to look like, so a
 * caller cannot record half a move and leave stock in a store that does not
 * exist. Quantity is checked for equality because a transfer that gains or loses
 * stock on the way is an adjustment wearing a transfer's name.
 */
export function checkTransfer(input: {
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: Numeric;
  onHandAtSource: Numeric;
}): MovementCheck {
  const amount = round2(Math.abs(num(input.quantity)));
  const onHand = round2(num(input.onHandAtSource));

  if (input.fromWarehouseId === input.toWarehouseId) {
    return {
      allowed: false,
      reason:
        'Source and destination are the same store — nothing moves, and the pair of rows would cancel for no reason.',
    };
  }

  if (amount === 0) {
    return {
      allowed: false,
      reason: 'Nothing to move — the quantity is zero.',
    };
  }

  // A negative or empty source gets its own message. "Only -969 is on hand" is
  // what the arithmetic says and no use at all to the person reading it — the
  // real problem is that the books are already wrong, and saying so is what
  // stops somebody "fixing" a negative by moving stock out of it.
  if (onHand <= 0) {
    return {
      allowed: false,
      reason:
        onHand < 0
          ? `The books say ${onHand} at the source store, so nothing can move until a stock take settles it.`
          : 'There is nothing at the source store to move.',
    };
  }

  if (amount > onHand) {
    return {
      allowed: false,
      reason: `Only ${onHand} is on hand at the source store, so ${amount} cannot be moved.`,
    };
  }

  return { allowed: true };
}