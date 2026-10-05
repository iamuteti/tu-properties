/**
 * Module 10 — bid comparison.
 *
 * Pure arithmetic over the quotations on an RFQ, so the comparison view is a
 * calculation rather than a pile of columns the client sorts itself. Two things
 * are worth saying about how it works:
 *
 * 1. **Every figure is derived.** A quote's total comes from its own lines, the
 *    variance comes from the request's estimate, and the ranking comes from
 *    those two plus the lead time. Nothing is typed in and nothing is cached, so
 *    a comparison can never disagree with the lines printed underneath it.
 * 2. **Cheapest is not first.** A procurement officer choosing between a quote
 *    that is 20% dearer and arrives tomorrow and one that is cheap and arrives
 *    in six weeks needs both facts side by side; silently ordering by price
 *    makes the tool decide something it cannot know. The rows carry
 *    `cheapest`, `fastest` and `recommended` flags, and the recommendation is
 *    only made when one quote is both cheaper *and* faster — otherwise nothing
 *    is recommended and the choice is left visibly to the person.
 *
 * Money here is whole currency units held as numbers (the schema stores
 * Decimal(14,2); services convert on the way in and out). Sums go through
 * `round2` rather than floating-point addition, because three lines of
 * `quantity × unitPrice` is exactly where a comparison table starts showing
 * 100.00000000000001.
 */

/** Two-decimal rounding, the same rule `invoice-allocation` uses. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface ComparableQuoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  /** The requested line this answers, when the supplier named one. */
  requestLineId?: string | null;
}

export interface ComparableQuote {
  id: string;
  supplierId: string;
  supplierName: string;
  /** 'WITHDRAWN' quotations are excluded from ranking but still counted. */
  status: string;
  leadTimeDays: number | null;
  validUntil: Date | null;
  submittedAt: Date;
  lines: ComparableQuoteLine[];
}

export interface ComparableRequestLine {
  id: string;
  description: string;
  quantity: number;
  estimatedAmount?: number | null;
}

export interface ComparisonRequest {
  /** The request's own estimate, for the variance column. Null when unknown. */
  estimatedAmount?: number | null;
  lines: ComparableRequestLine[];
}

export interface ComparisonRow {
  quoteId: string;
  supplierId: string;
  supplierName: string;
  /** Summed from the quote's own lines, never stored on the quote. */
  totalAmount: number;
  leadTimeDays: number | null;
  /** Difference from the request's estimate. Positive = over. Null when the
   *  request had no estimate, which is a legitimate state, not zero. */
  variance: number | null;
  variancePercent: number | null;
  /** How many requested lines this quote priced. */
  linesCovered: number;
  linesTotal: number;
  /** True when it covers every requested line — a partial quote is not
   *  comparable to a complete one, and saying so is the point of the column. */
  coversAllLines: boolean;
  cheapest: boolean;
  fastest: boolean;
  /** Only set when a single quote wins on both price and lead time. */
  recommended: boolean;
  rank: number;
  expired: boolean;
}

export interface ComparisonResult {
  rows: ComparisonRow[];
  /** Totals across ranked quotations, for the summary strip. */
  lowest: number | null;
  highest: number | null;
  average: number | null;
  /** Quotation count including withdrawn ones, so the strip can say
   *  "3 quotations, 2 ranked" rather than quietly dropping one. */
  quotesReceived: number;
  quotesRanked: number;
  /** Set when only one supplier was invited — the single-source warning. */
  singleSource: boolean;
  lowestQuoteId: string | null;
  fastestQuoteId: string | null;
  recommendedQuoteId: string | null;
}

export interface CompareOptions {
  now?: Date;
  /** Suppliers invited; 1 means nobody was given a chance to compete. */
  invitationCount?: number;
}

/**
 * Quotes that can be ranked.
 *
 * WITHDRAWN and REJECTED are excluded — a supplier who took their offer back or
 * was rejected is not a live option — and REJECTED is deliberately *not* removed
 * from the underlying records, only from this arithmetic.
 */
export function isRankable(status: string): boolean {
  return (
    status === 'SUBMITTED' || status === 'SHORTLISTED' || status === 'AWARDED'
  );
}

export function compareQuotes(
  quotes: ComparableQuote[],
  request: ComparisonRequest,
  options: CompareOptions = {},
): ComparisonResult {
  const now = options.now ?? new Date();

  // Rank only the live ones, but count everything: the strip shows both.
  const live = quotes.filter((quote) => isRankable(quote.status));
  const quotesReceived = quotes.length;

  const requestLineIds = new Set(request.lines.map((line) => line.id));

  const totals = new Map<string, number>();
  for (const quote of live) {
    let total = 0;
    for (const line of quote.lines) {
      total += round2(Number(line.quantity ?? 0) * Number(line.unitPrice ?? 0));
    }
    totals.set(quote.id, round2(total));
  }

  const lowest = live.length ? Math.min(...[...totals.values()]) : null;
  const highest = live.length ? Math.max(...[...totals.values()]) : null;

  // "Fastest" is only meaningful among quotes that stated a lead time. A quote
  // with no lead time is not the fastest; it is the one nobody can plan around.
  const withLeadTimes = live.filter((quote) => quote.leadTimeDays != null);
  const fastestDays = withLeadTimes.length
    ? Math.min(...withLeadTimes.map((quote) => quote.leadTimeDays as number))
    : null;

  const cheapestIds = live
    .filter((quote) => totals.get(quote.id) === lowest)
    .map((quote) => quote.id);
  const fastestIds = withLeadTimes
    .filter((quote) => quote.leadTimeDays === fastestDays)
    .map((quote) => quote.id);

  const estimated = request.estimatedAmount ?? null;

  const rows: ComparisonRow[] = live
    .map((quote) => {
      const totalAmount = totals.get(quote.id) ?? 0;
      const coveredIds = new Set(
        quote.lines
          .map((line) => line.requestLineId)
          .filter((id): id is string => Boolean(id)),
      );

      const linesCovered = requestLineIds.size
        ? [...coveredIds].filter((id) => requestLineIds.has(id)).length
        : quote.lines.length;
      const linesTotal = request.lines.length;
      // A supplier who quoted one line in one lump still covered it, so with no
      // explicit matches the quote is treated as complete rather than as a
      // partial that can never win.
      const coversAllLines =
        linesTotal === 0 ||
        linesCovered === linesTotal ||
        coveredIds.size === 0;

      const variance =
        estimated != null ? round2(totalAmount - Number(estimated)) : null;
      const variancePercent =
        estimated != null && Number(estimated) !== 0
          ? round2(
              ((totalAmount - Number(estimated)) / Number(estimated)) * 100,
            )
          : null;

      return {
        quoteId: quote.id,
        supplierId: quote.supplierId,
        supplierName: quote.supplierName,
        totalAmount,
        leadTimeDays: quote.leadTimeDays,
        variance,
        variancePercent,
        linesCovered,
        linesTotal,
        coversAllLines,
        cheapest: cheapestIds.includes(quote.id),
        fastest: fastestIds.includes(quote.id),
        recommended: false,
        rank: 0,
        expired:
          quote.validUntil != null &&
          quote.validUntil.getTime() < now.getTime(),
      };
    })
    .sort((a, b) => a.totalAmount - b.totalAmount);

  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  // Recommend only on a clean sweep: one quote strictly cheaper *and* strictly
  // faster than every other complete quotation. A tie in either column means the
  // decision is a judgement, and the table should say so by recommending nobody.
  const complete = rows.filter((row) => row.coversAllLines);
  let recommendedQuoteId: string | null = null;
  if (complete.length > 1) {
    const bestPrice = Math.min(...complete.map((row) => row.totalAmount));
    const priced = complete.filter((row) => row.totalAmount === bestPrice);
    if (priced.length === 1 && priced[0].leadTimeDays != null) {
      const bestDays = priced[0].leadTimeDays;
      const others = complete.filter(
        (row) => row.quoteId !== priced[0].quoteId,
      );
      const everyoneSlowerOrUnstated = others.every(
        (row) => row.leadTimeDays == null || row.leadTimeDays > bestDays,
      );
      if (everyoneSlowerOrUnstated) {
        recommendedQuoteId = priced[0].quoteId;
      }
    }
  }

  for (const row of rows) {
    row.recommended = row.quoteId === recommendedQuoteId;
  }

  const average = live.length
    ? round2(
        live.reduce((sum, quote) => sum + (totals.get(quote.id) ?? 0), 0) /
          live.length,
      )
    : null;

  return {
    rows,
    lowest,
    highest,
    average,
    quotesReceived,
    quotesRanked: live.length,
    singleSource: (options.invitationCount ?? 0) < 2,
    lowestQuoteId: cheapestIds[0] ?? null,
    fastestQuoteId: fastestIds[0] ?? null,
    recommendedQuoteId,
  };
}

/**
 * Whether every line has been received in full.
 *
 * The decision between "received" and "partially received" is a comparison
 * against what was ordered, in whole units, and it is the only place that
 * comparison lives — the service reads the receipts, this reads the arithmetic.
 */
export function receiveOutcome(
  lines: { orderedQuantity: number; receivedQuantity: number }[],
): 'RECEIVED' | 'PARTIALLY_RECEIVED' | 'NOTHING_RECEIVED' {
  if (!lines.length) return 'NOTHING_RECEIVED';

  const anythingReceived = lines.some(
    (line) => Number(line.receivedQuantity ?? 0) > 0,
  );
  if (!anythingReceived) return 'NOTHING_RECEIVED';

  const allComplete = lines.every(
    (line) =>
      Number(line.receivedQuantity ?? 0) + 1e-9 >=
      Number(line.orderedQuantity ?? 0),
  );

  return allComplete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
}
