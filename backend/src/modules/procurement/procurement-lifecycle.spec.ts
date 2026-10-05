import {
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  QuoteStatus,
  RfqStatus,
} from '@prisma/client';
import {
  checkPurchaseOrderAction,
  checkPurchaseRequestAction,
  checkRfqAction,
  daysOverdue,
  isPurchaseOrderOverdue,
  isRfqOverdue,
  nextPurchaseOrderStatus,
  nextPurchaseRequestStatus,
  offerablePurchaseOrderActions,
  offerablePurchaseRequestActions,
  offerableRfqActions,
  warnsSingleSource,
  MINIMUM_QUOTES_FOR_COMPETITION,
} from './procurement-lifecycle';
import {
  billCategoryFor,
  PURCHASE_CATEGORY_TO_BILL_CATEGORY,
} from './procurement-lifecycle';

describe('purchase request lifecycle', () => {
  it('refuses to submit a request with no lines', () => {
    const check = checkPurchaseRequestAction(
      PurchaseRequestStatus.DRAFT,
      'SUBMIT',
      { lineCount: 0 },
    );
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('at least one line');
  });

  it('submits a draft that has lines', () => {
    expect(
      checkPurchaseRequestAction(PurchaseRequestStatus.DRAFT, 'SUBMIT', {
        lineCount: 3,
      }).allowed,
    ).toBe(true);
  });

  it('allows approving without an estimate — the common case', () => {
    expect(
      checkPurchaseRequestAction(PurchaseRequestStatus.PENDING, 'APPROVE', {
        lineCount: 2,
        estimatedAmount: null,
      }).allowed,
    ).toBe(true);
  });

  it('refuses to approve a request with no lines', () => {
    expect(
      checkPurchaseRequestAction(PurchaseRequestStatus.PENDING, 'APPROVE', {
        lineCount: 0,
      }).allowed,
    ).toBe(false);
  });

  it('requires a reason to reject — the requester reads it', () => {
    expect(
      checkPurchaseRequestAction(PurchaseRequestStatus.PENDING, 'REJECT', {
        lineCount: 1,
        rejectionReason: '   ',
      }).allowed,
    ).toBe(false);

    expect(
      checkPurchaseRequestAction(PurchaseRequestStatus.PENDING, 'REJECT', {
        lineCount: 1,
        rejectionReason: 'We already have spares in store.',
      }).allowed,
    ).toBe(true);
  });

  it('refuses a second approval of an approved request', () => {
    const check = checkPurchaseRequestAction(
      PurchaseRequestStatus.APPROVED,
      'APPROVE',
      { lineCount: 1 },
    );
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('approved');
  });

  it('only an approved request can become an RFQ', () => {
    expect(
      checkPurchaseRequestAction(PurchaseRequestStatus.PENDING, 'RAISE_RFQ', {
        lineCount: 1,
      }).allowed,
    ).toBe(false);
    expect(
      checkPurchaseRequestAction(PurchaseRequestStatus.APPROVED, 'RAISE_RFQ', {
        lineCount: 1,
      }).allowed,
    ).toBe(true);
  });

  it('keeps an approved request approved when an RFQ is raised from it', () => {
    expect(
      nextPurchaseRequestStatus(PurchaseRequestStatus.APPROVED, 'RAISE_RFQ', {
        lineCount: 1,
      }),
    ).toBe(PurchaseRequestStatus.APPROVED);
  });

  it('rejects a rejected request only by reopening it', () => {
    expect(
      checkPurchaseRequestAction(PurchaseRequestStatus.REJECTED, 'REJECT', {
        lineCount: 1,
        rejectionReason: 'no',
      }).allowed,
    ).toBe(false);
    expect(
      nextPurchaseRequestStatus(PurchaseRequestStatus.REJECTED, 'REOPEN'),
    ).toBe(PurchaseRequestStatus.DRAFT);
  });

  it('cannot be cancelled or resubmitted once cancelled', () => {
    for (const action of ['CANCEL', 'SUBMIT', 'APPROVE'] as const) {
      expect(
        checkPurchaseRequestAction(PurchaseRequestStatus.CANCELLED, action, {
          lineCount: 1,
        }).allowed,
      ).toBe(false);
    }
  });

  it('offers the buttons a row should have', () => {
    expect(
      offerablePurchaseRequestActions(PurchaseRequestStatus.PENDING, {
        lineCount: 1,
      }).sort(),
    ).toEqual(['APPROVE', 'CANCEL', 'REJECT']);

    // The Complete-style case: a request with no lines offers no Approve,
    // because there is genuinely nothing to approve.
    expect(
      offerablePurchaseRequestActions(PurchaseRequestStatus.PENDING, {
        lineCount: 0,
      }),
    ).not.toContain('APPROVE');
  });

  it('does not offer Approve on an empty draft even though Submit is asked for', () => {
    const offered = offerablePurchaseRequestActions(
      PurchaseRequestStatus.DRAFT,
      { lineCount: 0 },
    );
    expect(offered).not.toContain('SUBMIT');
    expect(offered).toContain('CANCEL');
  });
});

describe('RFQ lifecycle', () => {
  it('will not issue an RFQ nobody was invited to', () => {
    const check = checkRfqAction(RfqStatus.DRAFT, 'ISSUE', {
      invitationCount: 0,
    });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('at least one supplier');
  });

  it('issues an RFQ with one invite, and warns that it is single-source', () => {
    expect(
      checkRfqAction(RfqStatus.DRAFT, 'ISSUE', { invitationCount: 1 }).allowed,
    ).toBe(true);
    expect(warnsSingleSource({ invitationCount: 1 })).toBe(true);
    expect(warnsSingleSource({ invitationCount: 2 })).toBe(false);
    expect(MINIMUM_QUOTES_FOR_COMPETITION).toBe(2);
  });

  it('requires a chosen quotation to award', () => {
    expect(
      checkRfqAction(RfqStatus.QUOTES_RECEIVED, 'AWARD', { quoteCount: 2 })
        .allowed,
    ).toBe(false);
  });

  it('refuses to award a withdrawn quotation', () => {
    expect(
      checkRfqAction(RfqStatus.QUOTES_RECEIVED, 'AWARD', {
        quoteId: 'q1',
        quoteStatus: QuoteStatus.WITHDRAWN,
        quoteCount: 2,
      }).allowed,
    ).toBe(false);
  });

  it('refuses a second award on the same RFQ', () => {
    const check = checkRfqAction(RfqStatus.QUOTES_RECEIVED, 'AWARD', {
      quoteId: 'q2',
      quoteStatus: QuoteStatus.SUBMITTED,
      quoteCount: 2,
      alreadyAwarded: true,
    });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('already been awarded');
  });

  it('allows a clean award', () => {
    expect(
      checkRfqAction(RfqStatus.QUOTES_RECEIVED, 'AWARD', {
        quoteId: 'q2',
        quoteStatus: QuoteStatus.SUBMITTED,
        quoteCount: 2,
        alreadyAwarded: false,
      }).allowed,
    ).toBe(true);
  });

  it('allows closing an RFQ nobody quoted — that is a real outcome', () => {
    expect(
      checkRfqAction(RfqStatus.ISSUED, 'CLOSE', {
        invitationCount: 3,
        quoteCount: 0,
      }).allowed,
    ).toBe(true);
  });

  it('requires a reason to cancel', () => {
    expect(
      checkRfqAction(RfqStatus.ISSUED, 'CANCEL', {
        cancellationReason: '',
      }).allowed,
    ).toBe(false);
  });

  it('is frozen once awarded', () => {
    for (const action of ['ISSUE', 'RECORD_QUOTE', 'AWARD', 'CLOSE'] as const) {
      expect(
        checkRfqAction(RfqStatus.AWARDED, action, {
          invitationCount: 2,
          quoteCount: 1,
          quoteId: 'q1',
          quoteStatus: QuoteStatus.SUBMITTED,
        }).allowed,
      ).toBe(false);
    }
  });

  it('reports an overdue RFQ only while it is still collecting', () => {
    const past = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-02-01T00:00:00Z');

    expect(
      isRfqOverdue({ quotesDueAt: past, status: RfqStatus.ISSUED }, now),
    ).toBe(true);
    // A round with one answer is still collecting, so a passed deadline still
    // matters — the second supplier has not replied yet.
    expect(
      isRfqOverdue(
        { quotesDueAt: past, status: RfqStatus.QUOTES_RECEIVED },
        now,
      ),
    ).toBe(true);
    expect(
      isRfqOverdue({ quotesDueAt: null, status: RfqStatus.ISSUED }, now),
    ).toBe(false);

    // Once the round has stopped waiting for answers, an old due date is not
    // overdue, it is history.
    for (const status of [
      RfqStatus.CLOSED,
      RfqStatus.AWARDED,
      RfqStatus.CANCELLED,
    ]) {
      expect(isRfqOverdue({ quotesDueAt: past, status }, now)).toBe(false);
    }
  });

  it('closes a round to CLOSED rather than cancelling it', () => {
    // The distinction is the reason CLOSED exists: closing needs no reason,
    // cancelling does. Closing is "we ran it and are not buying", cancelling is
    // "we called it off", and only the second tells a supplier anything.
    expect(
      checkRfqAction(RfqStatus.ISSUED, 'CLOSE', { quoteCount: 1 }).allowed,
    ).toBe(true);
    expect(
      checkRfqAction(RfqStatus.QUOTES_RECEIVED, 'CLOSE', { quoteCount: 2 })
        .allowed,
    ).toBe(true);
    expect(
      checkRfqAction(RfqStatus.ISSUED, 'CLOSE', { cancellationReason: '' })
        .allowed,
    ).toBe(true);
  });

  it('only reopens a closed round', () => {
    expect(checkRfqAction(RfqStatus.CLOSED, 'REOPEN').allowed).toBe(true);
    expect(checkRfqAction(RfqStatus.AWARDED, 'REOPEN').allowed).toBe(false);
    expect(checkRfqAction(RfqStatus.ISSUED, 'REOPEN').allowed).toBe(false);
  });

  it('offers Cancel on an issued RFQ because the dialog asks for the reason', () => {
    expect(
      offerableRfqActions(RfqStatus.ISSUED, { invitationCount: 2 }),
    ).toContain('CANCEL');
  });
});

describe('purchase order lifecycle', () => {
  it('will not send an order with no lines', () => {
    expect(
      checkPurchaseOrderAction(PurchaseOrderStatus.DRAFT, 'SEND', {
        lineCount: 0,
      }).allowed,
    ).toBe(false);
  });

  it('will not send an order worth nothing', () => {
    expect(
      checkPurchaseOrderAction(PurchaseOrderStatus.DRAFT, 'SEND', {
        lineCount: 2,
        totalAmount: 0,
      }).allowed,
    ).toBe(false);
  });

  it('sends a priced order with lines', () => {
    expect(
      checkPurchaseOrderAction(PurchaseOrderStatus.DRAFT, 'SEND', {
        lineCount: 2,
        totalAmount: 45000,
      }).allowed,
    ).toBe(true);
  });

  it('cannot receive goods before the supplier has accepted', () => {
    expect(
      checkPurchaseOrderAction(PurchaseOrderStatus.SENT, 'RECEIVE', {
        hasReceipt: true,
        outstandingQuantity: 5,
      }).allowed,
    ).toBe(false);
  });

  it('refuses a receipt with no lines on it', () => {
    expect(
      checkPurchaseOrderAction(PurchaseOrderStatus.ACCEPTED, 'RECEIVE', {
        hasReceipt: false,
        outstandingQuantity: 5,
      }).allowed,
    ).toBe(false);
  });

  it('refuses to receive an order that is already complete', () => {
    expect(
      checkPurchaseOrderAction(
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
        'RECEIVE',
        {
          hasReceipt: true,
          outstandingQuantity: 0,
        },
      ).allowed,
    ).toBe(false);
  });

  it('accepts a receipt on an accepted order', () => {
    expect(
      checkPurchaseOrderAction(PurchaseOrderStatus.ACCEPTED, 'RECEIVE', {
        hasReceipt: true,
        outstandingQuantity: 3,
      }).allowed,
    ).toBe(true);
  });

  it('refuses to cancel an order that already has goods against it', () => {
    const check = checkPurchaseOrderAction(
      PurchaseOrderStatus.PARTIALLY_RECEIVED,
      'CANCEL',
      { cancellationReason: 'changed our minds', hasReceipt: true },
    );
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('already been received');
  });

  it('cancels an accepted order that has nothing against it, with a reason', () => {
    expect(
      checkPurchaseOrderAction(PurchaseOrderStatus.ACCEPTED, 'CANCEL', {
        cancellationReason: 'Supplier could not deliver',
        hasReceipt: false,
      }).allowed,
    ).toBe(true);
    expect(
      checkPurchaseOrderAction(PurchaseOrderStatus.ACCEPTED, 'CANCEL', {
        cancellationReason: '',
        hasReceipt: false,
      }).allowed,
    ).toBe(false);
  });

  it('only closes a fully received order', () => {
    expect(
      checkPurchaseOrderAction(PurchaseOrderStatus.RECEIVED, 'CLOSE').allowed,
    ).toBe(true);
    expect(
      checkPurchaseOrderAction(PurchaseOrderStatus.PARTIALLY_RECEIVED, 'CLOSE')
        .allowed,
    ).toBe(false);
  });

  it('sends a partially received order to the right state', () => {
    expect(
      nextPurchaseOrderStatus(
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
        'RECEIVE_PART',
        { hasReceipt: true, outstandingQuantity: 2 },
      ),
    ).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);

    expect(
      nextPurchaseOrderStatus(
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
        'RECEIVE',
        { hasReceipt: true, outstandingQuantity: 2 },
      ),
    ).toBe(PurchaseOrderStatus.RECEIVED);
  });

  it('returns null for a refused transition', () => {
    expect(
      nextPurchaseOrderStatus(PurchaseOrderStatus.CLOSED, 'REOPEN'),
    ).toBeNull();
  });

  it('reports an overdue order only while it is still open', () => {
    const past = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-02-01T00:00:00Z');

    expect(
      isPurchaseOrderOverdue(
        { expectedDelivery: past, status: PurchaseOrderStatus.ACCEPTED },
        now,
      ),
    ).toBe(true);
    expect(
      isPurchaseOrderOverdue(
        { expectedDelivery: past, status: PurchaseOrderStatus.RECEIVED },
        now,
      ),
    ).toBe(false);
    expect(
      daysOverdue(
        { expectedDelivery: past, status: PurchaseOrderStatus.SENT },
        now,
      ),
    ).toBe(31);
    expect(
      daysOverdue(
        { expectedDelivery: null, status: PurchaseOrderStatus.SENT },
        now,
      ),
    ).toBe(0);
  });

  it('offers only the actions a received order can take', () => {
    expect(
      offerablePurchaseOrderActions(PurchaseOrderStatus.RECEIVED, {
        lineCount: 1,
        totalAmount: 100,
        hasReceipt: true,
      }),
    ).toEqual(['CLOSE']);
  });
});

describe('purchase category to bill category', () => {
  it('maps maintenance parts onto the repairs account', () => {
    expect(billCategoryFor('MAINTENANCE_PARTS')).toBe('MAINTENANCE');
    expect(billCategoryFor('PROFESSIONAL_SERVICES')).toBe('PROFESSIONAL');
    expect(billCategoryFor('UTILITIES')).toBe('UTILITIES');
  });

  it('falls back to OTHER for an unmapped category', () => {
    expect(billCategoryFor('SOMETHING_NEW')).toBe('OTHER');
  });

  it('covers every declared purchase category', () => {
    const declared = [
      'MAINTENANCE_PARTS',
      'EQUIPMENT',
      'FURNITURE',
      'IT_AND_TECH',
      'STATIONERY',
      'CLEANING',
      'SECURITY',
      'UTILITIES',
      'PROFESSIONAL_SERVICES',
      'OTHER',
    ];
    for (const category of declared) {
      expect(
        Object.prototype.hasOwnProperty.call(
          PURCHASE_CATEGORY_TO_BILL_CATEGORY,
          category,
        ),
      ).toBe(true);
    }
  });
});
