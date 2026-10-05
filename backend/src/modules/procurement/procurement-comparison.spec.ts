import {
  compareQuotes,
  isRankable,
  receiveOutcome,
  round2,
  type ComparableQuote,
} from './procurement-comparison';

const REQUEST_LINES = [
  {
    id: 'rl1',
    description: 'Lift ropes',
    quantity: 2,
    estimatedAmount: 100000,
  },
  { id: 'rl2', description: 'Oil seals', quantity: 4, estimatedAmount: 20000 },
];

/**
 * A lump-sum quotation covering the whole request — the common shape, and the
 * one `coversAllLines` has to treat as complete. Pass `partialLines` to make a
 * quote that answered only one requested line.
 */
function quote(
  id: string,
  supplierId: string,
  supplierName: string,
  total: number,
  overrides: Partial<ComparableQuote> = {},
): ComparableQuote {
  return {
    id,
    supplierId,
    supplierName,
    status: 'SUBMITTED',
    leadTimeDays: 14,
    validUntil: new Date('2026-06-01T00:00:00Z'),
    submittedAt: new Date('2026-02-01T00:00:00Z'),
    lines: [{ description: 'Supply as quoted', quantity: 1, unitPrice: total }],
    ...overrides,
  };
}

describe('round2', () => {
  it('does not leak floating point noise into a total', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe('compareQuotes', () => {
  it('sums each quote from its own lines rather than trusting a stored total', () => {
    const quotes = [
      quote('q1', 's1', 'Alpha', 100000, {
        lines: [
          {
            description: 'a',
            quantity: 3,
            unitPrice: 100.1,
            requestLineId: 'rl1',
          },
          {
            description: 'b',
            quantity: 2,
            unitPrice: 49.95,
            requestLineId: 'rl2',
          },
        ],
      }),
    ];

    const result = compareQuotes(quotes, { lines: REQUEST_LINES });

    expect(result.rows[0].totalAmount).toBe(400.2);
  });

  it('ranks cheapest first and flags it', () => {
    const result = compareQuotes(
      [quote('q1', 's1', 'Alpha', 120000), quote('q2', 's2', 'Beta', 90000)],
      { lines: REQUEST_LINES },
    );

    expect(result.rows.map((row) => row.quoteId)).toEqual(['q2', 'q1']);
    expect(result.rows[0].rank).toBe(1);
    expect(result.rows[0].cheapest).toBe(true);
    expect(result.rows[1].cheapest).toBe(false);
    expect(result.lowest).toBe(90000);
    expect(result.highest).toBe(120000);
    expect(result.average).toBe(105000);
    expect(result.lowestQuoteId).toBe('q2');
  });

  it('computes variance against the request estimate, and null when unknown', () => {
    const withEstimate = compareQuotes([quote('q1', 's1', 'Alpha', 110000)], {
      estimatedAmount: 100000,
      lines: REQUEST_LINES,
    });
    expect(withEstimate.rows[0].variance).toBe(10000);
    expect(withEstimate.rows[0].variancePercent).toBe(10);

    const without = compareQuotes([quote('q1', 's1', 'Alpha', 110000)], {
      estimatedAmount: null,
      lines: REQUEST_LINES,
    });
    expect(without.rows[0].variance).toBeNull();
    expect(without.rows[0].variancePercent).toBeNull();
  });

  it('does not divide by a zero estimate', () => {
    const result = compareQuotes([quote('q1', 's1', 'Alpha', 50000)], {
      estimatedAmount: 0,
      lines: REQUEST_LINES,
    });
    expect(result.rows[0].variancePercent).toBeNull();
    expect(result.rows[0].variance).toBe(50000);
  });

  it('flags the fastest only among quotes that stated a lead time', () => {
    const result = compareQuotes(
      [
        quote('q1', 's1', 'Alpha', 90000, { leadTimeDays: null }),
        quote('q2', 's2', 'Beta', 120000, { leadTimeDays: 7 }),
      ],
      { lines: REQUEST_LINES },
    );

    // The cheap quote with no lead time is not "fastest" — it is unplannable.
    expect(result.rows.find((row) => row.quoteId === 'q1')!.fastest).toBe(
      false,
    );
    expect(result.rows.find((row) => row.quoteId === 'q2')!.fastest).toBe(true);
    expect(result.fastestQuoteId).toBe('q2');
  });

  it('recommends nothing when the cheapest is not the fastest', () => {
    const result = compareQuotes(
      [
        quote('q1', 's1', 'Alpha', 90000, { leadTimeDays: 45 }),
        quote('q2', 's2', 'Beta', 120000, { leadTimeDays: 3 }),
      ],
      { lines: REQUEST_LINES },
    );

    expect(result.recommendedQuoteId).toBeNull();
    expect(result.rows.every((row) => !row.recommended)).toBe(true);
  });

  it('recommends a quote that is both cheapest and fastest', () => {
    const result = compareQuotes(
      [
        quote('q1', 's1', 'Alpha', 90000, { leadTimeDays: 5 }),
        quote('q2', 's2', 'Beta', 120000, { leadTimeDays: 30 }),
      ],
      { lines: REQUEST_LINES },
    );

    expect(result.recommendedQuoteId).toBe('q1');
    expect(result.rows.find((row) => row.quoteId === 'q1')!.recommended).toBe(
      true,
    );
  });

  it('recommends nothing on a tie, because that is a judgement call', () => {
    const result = compareQuotes(
      [
        quote('q1', 's1', 'Alpha', 90000, { leadTimeDays: 5 }),
        quote('q2', 's2', 'Beta', 90000, { leadTimeDays: 30 }),
      ],
      { lines: REQUEST_LINES },
    );

    expect(result.recommendedQuoteId).toBeNull();
    // Both are still flagged cheapest, so the table shows the tie honestly.
    expect(result.rows.filter((row) => row.cheapest)).toHaveLength(2);
  });

  it('will not recommend a partial quote', () => {
    const result = compareQuotes(
      [
        quote('q1', 's1', 'Alpha', 50000, {
          leadTimeDays: 5,
          lines: [
            {
              description: 'Lift ropes only',
              quantity: 2,
              unitPrice: 25000,
              requestLineId: 'rl1',
            },
          ],
        }),
        quote('q2', 's2', 'Beta', 120000, { leadTimeDays: 30 }),
      ],
      { lines: REQUEST_LINES },
    );

    const alpha = result.rows.find((row) => row.quoteId === 'q1')!;
    expect(alpha.coversAllLines).toBe(false);
    expect(alpha.linesCovered).toBe(1);
    expect(alpha.linesTotal).toBe(2);
    expect(result.recommendedQuoteId).toBeNull();
  });

  it('excludes withdrawn and rejected quotes from ranking but still counts them', () => {
    const result = compareQuotes(
      [
        quote('q1', 's1', 'Alpha', 90000),
        quote('q2', 's2', 'Beta', 50000, { status: 'WITHDRAWN' }),
        quote('q3', 's3', 'Gamma', 60000, { status: 'REJECTED' }),
      ],
      { lines: REQUEST_LINES },
    );

    expect(result.quotesReceived).toBe(3);
    expect(result.quotesRanked).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(isRankable('WITHDRAWN')).toBe(false);
    expect(isRankable('SUBMITTED')).toBe(true);
    expect(isRankable('SHORTLISTED')).toBe(true);
  });

  it('treats a lump-sum quote as covering everything', () => {
    // No explicit requestLineId matches, which happens when a supplier quotes
    // the whole job in one line. Calling that partial would mean a legitimate
    // quotation could never be recommended.
    const result = compareQuotes(
      [
        quote('q1', 's1', 'Alpha', 90000, {
          leadTimeDays: 5,
          lines: [
            {
              description: 'Lift overhaul, all in',
              quantity: 1,
              unitPrice: 90000,
            },
          ],
        }),
        quote('q2', 's2', 'Beta', 120000, { leadTimeDays: 30 }),
      ],
      { lines: REQUEST_LINES },
    );

    expect(
      result.rows.find((row) => row.quoteId === 'q1')!.coversAllLines,
    ).toBe(true);
    expect(result.recommendedQuoteId).toBe('q1');
  });

  it('flags an expired quotation without dropping it from the ranking', () => {
    const now = new Date('2026-07-01T00:00:00Z');
    const result = compareQuotes(
      [
        quote('q1', 's1', 'Alpha', 90000, {
          validUntil: new Date('2026-03-01T00:00:00Z'),
        }),
        quote('q2', 's2', 'Beta', 120000, {
          validUntil: new Date('2026-09-01T00:00:00Z'),
        }),
      ],
      { lines: REQUEST_LINES },
      { now },
    );

    expect(result.rows.find((row) => row.quoteId === 'q1')!.expired).toBe(true);
    expect(result.rows.find((row) => row.quoteId === 'q2')!.expired).toBe(
      false,
    );
    expect(result.rows).toHaveLength(2);
  });

  it('flags a single-source round', () => {
    const result = compareQuotes(
      [quote('q1', 's1', 'Alpha', 90000)],
      {
        lines: REQUEST_LINES,
      },
      { invitationCount: 1 },
    );

    expect(result.singleSource).toBe(true);
    expect(
      compareQuotes(
        [quote('q1', 's1', 'Alpha', 90000)],
        { lines: REQUEST_LINES },
        {
          invitationCount: 3,
        },
      ).singleSource,
    ).toBe(false);
  });

  it('copes with no quotations at all', () => {
    const result = compareQuotes([], { lines: REQUEST_LINES });

    expect(result.rows).toEqual([]);
    expect(result.lowest).toBeNull();
    expect(result.average).toBeNull();
    expect(result.quotesReceived).toBe(0);
    expect(result.recommendedQuoteId).toBeNull();
  });
});

describe('receiveOutcome', () => {
  it('reports nothing received when every line is at zero', () => {
    expect(
      receiveOutcome([
        { orderedQuantity: 10, receivedQuantity: 0 },
        { orderedQuantity: 5, receivedQuantity: 0 },
      ]),
    ).toBe('NOTHING_RECEIVED');
  });

  it('reports partial delivery when some lines are complete', () => {
    expect(
      receiveOutcome([
        { orderedQuantity: 10, receivedQuantity: 10 },
        { orderedQuantity: 5, receivedQuantity: 2 },
      ]),
    ).toBe('PARTIALLY_RECEIVED');
  });

  it('reports full receipt when every line is complete', () => {
    expect(
      receiveOutcome([
        { orderedQuantity: 10, receivedQuantity: 10 },
        { orderedQuantity: 5, receivedQuantity: 5 },
      ]),
    ).toBe('RECEIVED');
  });

  it('tolerates decimal quantities', () => {
    expect(
      receiveOutcome([{ orderedQuantity: 2.5, receivedQuantity: 2.5 }]),
    ).toBe('RECEIVED');
  });

  it('treats an order with no lines as nothing received', () => {
    expect(receiveOutcome([])).toBe('NOTHING_RECEIVED');
  });
});
