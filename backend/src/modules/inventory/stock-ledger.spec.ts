import {
  balanceAfter,
  checkMovement,
  checkTransfer,
  chronological,
  reorderSuggestion,
  round2,
  round4,
  runningBalances,
  stockByWarehouse,
  stockOnHand,
  stockStatus,
  valuation,
  type LedgerMovement,
} from './stock-ledger';

const at = (day: number, hour = 9): Date =>
  new Date(Date.UTC(2026, 0, day, hour));

const movement = (
  id: string,
  quantity: number,
  type: LedgerMovement['type'],
  day: number,
  extra: Partial<LedgerMovement> = {},
): LedgerMovement => ({
  id,
  quantity,
  type,
  createdAt: at(day),
  ...extra,
});

describe('rounding', () => {
  it('keeps two decimals for quantities', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(10 / 3)).toBe(3.33);
  });

  it('keeps four decimals for costs, where a litre really costs cents', () => {
    expect(round4(0.04166)).toBe(0.0417);
    expect(round4(1.00005)).toBe(1.0001);
  });
});

describe('chronological', () => {
  it('orders by createdAt, then by id so a same-millisecond pair is stable', () => {
    const rows = [
      movement('c', 1, 'ADJUSTMENT', 3),
      movement('a', 1, 'ADJUSTMENT', 1),
      movement('b', 1, 'ADJUSTMENT', 1),
    ];

    expect(chronological(rows).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the array it was handed', () => {
    const rows = [
      movement('b', 1, 'ADJUSTMENT', 2),
      movement('a', 1, 'ADJUSTMENT', 1),
    ];
    chronological(rows);
    expect(rows.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('accepts an ISO string as well as a Date, since JSON has no Date', () => {
    const rows: LedgerMovement[] = [
      {
        id: 'b',
        quantity: 1,
        type: 'ADJUSTMENT',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'a',
        quantity: 1,
        type: 'ADJUSTMENT',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    expect(chronological(rows).map((row) => row.id)).toEqual(['a', 'b']);
  });
});

describe('stockOnHand', () => {
  it('is the sum of the movements and nothing else', () => {
    const rows = [
      movement('1', 20, 'OPENING', 1, { unitCost: 1000 }),
      movement('2', -6, 'WORK_ORDER_ISSUE', 2),
      movement('3', 4, 'ADJUSTMENT', 3),
    ];

    expect(stockOnHand(rows)).toBe(18);
  });

  it('is zero for an item nobody has ever moved', () => {
    expect(stockOnHand([])).toBe(0);
  });

  it('can legitimately be negative after a count', () => {
    expect(stockOnHand([movement('1', -3, 'ADJUSTMENT', 1)])).toBe(-3);
  });

  it('reads a Prisma Decimal string as a number rather than NaN', () => {
    expect(
      stockOnHand([{ ...movement('1', 0, 'OPENING', 1), quantity: '12.50' }]),
    ).toBe(12.5);
  });
});

describe('runningBalances', () => {
  it('gives the balance after each movement, in ledger order', () => {
    const rows = [
      movement('3', -6, 'WORK_ORDER_ISSUE', 3),
      movement('1', 20, 'OPENING', 1),
      movement('2', 4, 'ADJUSTMENT', 2),
    ];

    expect(runningBalances(rows)).toEqual([
      { id: '1', quantity: 20, balance: 20 },
      { id: '2', quantity: 4, balance: 24 },
      { id: '3', quantity: -6, balance: 18 },
    ]);
  });

  it('ends on the level on hand', () => {
    const rows = [
      movement('1', 20, 'OPENING', 1),
      movement('2', -6, 'WORK_ORDER_ISSUE', 2),
    ];
    const balances = runningBalances(rows);

    expect(balances[balances.length - 1].balance).toBe(stockOnHand(rows));
  });

  it('is empty for an empty ledger', () => {
    expect(runningBalances([])).toEqual([]);
  });
});

describe('stockByWarehouse', () => {
  it('keeps a separate balance per store', () => {
    const rows = [
      { ...movement('1', 20, 'OPENING', 1), warehouseId: 'main' },
      { ...movement('2', -6, 'WORK_ORDER_ISSUE', 2), warehouseId: 'main' },
      { ...movement('3', -2, 'TRANSFER', 3), warehouseId: 'main' },
      { ...movement('4', 2, 'TRANSFER', 3), warehouseId: 'site' },
    ];

    expect(stockByWarehouse(rows)).toEqual({ main: 12, site: 2 });
  });
});

describe('stockStatus', () => {
  it('reads OK above the level', () => {
    expect(stockStatus(12, 5)).toBe('OK');
  });

  it('reads REORDER strictly below the level, not at it', () => {
    expect(stockStatus(4.99, 5)).toBe('REORDER');
    // At the level is exactly stocked — the alert fires on the next movement.
    expect(stockStatus(5, 5)).toBe('OK');
  });

  it('reads OUT_OF_STOCK at zero and below', () => {
    expect(stockStatus(0, 5)).toBe('OUT_OF_STOCK');
    expect(stockStatus(-3, 5)).toBe('OUT_OF_STOCK');
  });

  it('never alerts on an item with no reorder level', () => {
    expect(stockStatus(0, 0)).toBe('OK');
    expect(stockStatus(-3, 0)).toBe('OK');
  });
});

describe('reorderSuggestion', () => {
  it('suggests nothing while the item is in stock', () => {
    const result = reorderSuggestion({
      onHand: 20,
      reorderLevel: 5,
      unitCost: 100,
    });

    expect(result).toMatchObject({
      needsReorder: false,
      status: 'OK',
      shortfall: null,
      suggestedQuantity: 0,
      estimatedCost: null,
      reason: null,
    });
  });

  it('tops up to twice the level when no quantity is set', () => {
    // Level 10, holding 3: two of the level is 20, so 17 gets bought. A top-up
    // to the level alone would re-trip the alert on the next movement.
    const result = reorderSuggestion({
      onHand: 3,
      reorderLevel: 10,
      unitCost: 250,
    });

    expect(result.needsReorder).toBe(true);
    expect(result.status).toBe('REORDER');
    expect(result.shortfall).toBe(7);
    expect(result.suggestedQuantity).toBe(17);
    expect(result.estimatedCost).toBe(4250);
  });

  it('honours an explicit reorder quantity even when it is smaller', () => {
    // One case of six is what the person who set it meant; topping to 20 would
    // order thirty times what they asked for.
    const result = reorderSuggestion({
      onHand: 3,
      reorderLevel: 10,
      reorderQuantity: 6,
      unitCost: 250,
    });

    expect(result.suggestedQuantity).toBe(6);
  });

  it('never suggests zero, which would produce a purchase request for nothing', () => {
    const result = reorderSuggestion({
      onHand: 10,
      reorderLevel: 10,
      reorderQuantity: 0,
    });

    // At the level reads OK, so nothing is suggested at all.
    expect(result.needsReorder).toBe(false);
  });

  it('estimates nothing when no price is on file, rather than valuing it at zero', () => {
    const result = reorderSuggestion({ onHand: 0, reorderLevel: 4 });

    expect(result.estimatedCost).toBeNull();
    expect(result.suggestedQuantity).toBe(8);
  });

  it('says plainly when nothing is left', () => {
    const result = reorderSuggestion({
      onHand: 0,
      reorderLevel: 4,
      unitCost: 90,
    });

    expect(result.status).toBe('OUT_OF_STOCK');
    expect(result.reason).toContain('Nothing left');
  });

  it('flags a negative balance as needing a stock take, not just an order', () => {
    const result = reorderSuggestion({ onHand: -3, reorderLevel: 4 });

    expect(result.reason).toContain('stock take');
  });

  it('names the unit it counted in', () => {
    const result = reorderSuggestion({
      onHand: 1,
      reorderLevel: 5,
      unitOfMeasure: 'litre',
    });

    expect(result.unitOfMeasure).toBe('litre');
    expect(result.reason).toContain('1 litre left');
  });

  it('falls back to a generic unit when none was given', () => {
    expect(
      reorderSuggestion({ onHand: 0, reorderLevel: 1 }).unitOfMeasure,
    ).toBe('unit');
  });
});

describe('checkMovement', () => {
  it('refuses a zero-quantity movement', () => {
    expect(checkMovement('ADJUSTMENT', 0)).toMatchObject({ allowed: false });
  });

  it('refuses a negative goods receipt', () => {
    const check = checkMovement('GOODS_RECEIPT', -5);

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('positive');
  });

  it('refuses a positive work-order issue', () => {
    expect(checkMovement('WORK_ORDER_ISSUE', 5)).toMatchObject({
      allowed: false,
    });
  });

  it('allows an opening balance in, and an issue out', () => {
    expect(checkMovement('OPENING', 10)).toEqual({ allowed: true });
    expect(checkMovement('WORK_ORDER_ISSUE', -10)).toEqual({ allowed: true });
  });

  it('allows a transfer and an adjustment in either direction', () => {
    expect(checkMovement('TRANSFER', -5).allowed).toBe(true);
    expect(checkMovement('TRANSFER', 5).allowed).toBe(true);
    expect(checkMovement('ADJUSTMENT', -5).allowed).toBe(true);
    expect(checkMovement('ADJUSTMENT', 5).allowed).toBe(true);
    expect(checkMovement('RETURN', -5).allowed).toBe(true);
    expect(checkMovement('RETURN', 5).allowed).toBe(true);
  });

  it('refuses an issue that takes more than is on hand', () => {
    const check = checkMovement('WORK_ORDER_ISSUE', -5, 3);

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Only 3 is on hand');
  });

  it('allows an issue of exactly what is on hand, leaving zero', () => {
    expect(checkMovement('WORK_ORDER_ISSUE', -3, 3)).toEqual({ allowed: true });
  });

  it('lets a count go negative — that is the case where the books are wrong', () => {
    expect(checkMovement('ADJUSTMENT', -8, 3)).toEqual({ allowed: true });
  });

  it('does not check the balance when it was not supplied', () => {
    expect(checkMovement('WORK_ORDER_ISSUE', -500).allowed).toBe(true);
  });
});

describe('balanceAfter', () => {
  it('is the signed sum', () => {
    expect(balanceAfter(20, -6)).toBe(14);
    expect(balanceAfter(-2, 5)).toBe(3);
  });
});

describe('valuation', () => {
  it('values an untouched opening balance at its own snapshot cost', () => {
    const result = valuation([
      movement('1', 20, 'OPENING', 1, { unitCost: 1000 }),
    ]);

    expect(result).toMatchObject({ quantity: 20, value: 20000 });
    expect(result.averageUnitCost).toBe(1000);
  });

  it("carries a rising price rather than revaluing the shelf at today's price", () => {
    // 10 at 1,000, then 10 at 1,450. Reading today's unitCost for both would
    // report 29,000; the weighted average is 27,500.
    const result = valuation([
      movement('1', 10, 'OPENING', 1, { unitCost: 1000 }),
      movement('2', 10, 'GOODS_RECEIPT', 2, { unitCost: 1450 }),
    ]);

    expect(result.quantity).toBe(20);
    expect(result.value).toBe(24500);
    expect(result.averageUnitCost).toBe(1225);
  });

  it('issues at the running average, because an issue creates no new price', () => {
    const result = valuation([
      movement('1', 10, 'OPENING', 1, { unitCost: 1000 }),
      movement('2', 10, 'GOODS_RECEIPT', 2, { unitCost: 1450 }),
      movement('3', -10, 'WORK_ORDER_ISSUE', 3),
    ]);

    expect(result.quantity).toBe(10);
    expect(result.value).toBe(12250);
    expect(result.averageUnitCost).toBe(1225);
  });

  it('respects an explicit cost on the way out (a return at the refunded price)', () => {
    const result = valuation([
      movement('1', 10, 'OPENING', 1, { unitCost: 1000 }),
      movement('2', -4, 'RETURN', 2, { unitCost: 900 }),
    ]);

    expect(result.value).toBe(6400);
    expect(result.averageUnitCost).toBe(1066.6667);
  });

  it('carries the running average forward for an IN with no recorded cost', () => {
    const result = valuation([
      movement('1', 10, 'OPENING', 1, { unitCost: 1000 }),
      movement('2', 10, 'GOODS_RECEIPT', 2),
    ]);

    // Valuing it at zero would understate the shelf by the whole movement and
    // never recover.
    expect(result.value).toBe(20000);
    expect(result.movementsWithoutCost).toBe(1);
  });

  it('never reports negative value, even when the movements go negative', () => {
    const result = valuation([movement('1', -5, 'ADJUSTMENT', 1)]);

    expect(result.quantity).toBe(-5);
    expect(result.value).toBe(0);
    expect(result.averageUnitCost).toBeNull();
  });

  it('has no average for an empty shelf rather than dividing by zero', () => {
    const result = valuation([]);

    expect(result).toMatchObject({
      quantity: 0,
      value: 0,
      averageUnitCost: null,
    });
  });

  it('is independent of the order the rows arrive in', () => {
    const a = movement('1', 10, 'OPENING', 1, { unitCost: 1000 });
    const b = movement('2', 10, 'GOODS_RECEIPT', 2, { unitCost: 1450 });
    const c = movement('3', -5, 'WORK_ORDER_ISSUE', 3);

    expect(valuation([c, a, b])).toEqual(valuation([a, b, c]));
  });
});

describe('checkTransfer', () => {
  it('refuses a transfer to the store it came from', () => {
    const check = checkTransfer({
      fromWarehouseId: 'main',
      toWarehouseId: 'main',
      quantity: 5,
      onHandAtSource: 10,
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('same store');
  });

  it('refuses moving nothing', () => {
    expect(
      checkTransfer({
        fromWarehouseId: 'main',
        toWarehouseId: 'site',
        quantity: 0,
        onHandAtSource: 10,
      }).allowed,
    ).toBe(false);
  });

  it('refuses moving more than the source holds', () => {
    const check = checkTransfer({
      fromWarehouseId: 'main',
      toWarehouseId: 'site',
      quantity: 11,
      onHandAtSource: 10,
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Only 10 is on hand');
  });

  it('allows a real transfer', () => {
    expect(
      checkTransfer({
        fromWarehouseId: 'main',
        toWarehouseId: 'site',
        quantity: 4,
        onHandAtSource: 10,
      }),
    ).toEqual({ allowed: true });
  });

  it('names the real problem when the books are already negative', () => {
    // "Only -969 is on hand" is what the arithmetic says and no use to anybody;
    // the actual fault is that the count has not been done.
    const check = checkTransfer({
      fromWarehouseId: 'main',
      toWarehouseId: 'site',
      quantity: 5,
      onHandAtSource: -969,
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('stock take');
  });

  it('says plainly that an empty source has nothing to move', () => {
    const check = checkTransfer({
      fromWarehouseId: 'main',
      toWarehouseId: 'site',
      quantity: 1,
      onHandAtSource: 0,
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('nothing at the source store');
  });
});
