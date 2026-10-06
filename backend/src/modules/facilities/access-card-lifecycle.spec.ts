import { AccessCardStatus } from '@prisma/client';
import {
  ACCESS_CARD_STATUS_LABEL,
  EXPIRY_WARNING_DAYS,
  availableCardActions,
  cardExpiry,
  cardTransition,
  effectiveStatus,
  formatCardNumber,
  isUsable,
  type CardTransitionContext,
} from './access-card-lifecycle';

const NOW = new Date(2026, 5, 1, 9, 0, 0, 0);
const IN_30_DAYS = new Date(2026, 5, 31, 9, 0, 0, 0);
const PAST = new Date(2026, 4, 1, 9, 0, 0, 0);

const ctx = (
  over: Partial<CardTransitionContext> = {},
): CardTransitionContext => ({
  status: AccessCardStatus.ACTIVE,
  now: NOW,
  ...over,
});

describe('status labels', () => {
  it('covers every state the enum has', () => {
    for (const status of Object.values(AccessCardStatus)) {
      expect(ACCESS_CARD_STATUS_LABEL[status]).toBeTruthy();
    }
  });
});

describe('effectiveStatus', () => {
  it('passes an active card through', () => {
    expect(effectiveStatus(AccessCardStatus.ACTIVE, IN_30_DAYS, NOW)).toBe(
      AccessCardStatus.ACTIVE,
    );
  });

  it('reports an active card past its expiry as expired, without anybody flipping the column', () => {
    // Relying on somebody to notice at a reader is how a contractor badge stays
    // valid for a month past the end of the job.
    expect(effectiveStatus(AccessCardStatus.ACTIVE, PAST, NOW)).toBe(
      AccessCardStatus.EXPIRED,
    );
  });

  it('lets a revocation beat a future expiry', () => {
    expect(effectiveStatus(AccessCardStatus.REVOKED, IN_30_DAYS, NOW)).toBe(
      AccessCardStatus.REVOKED,
    );
  });

  it('keeps a lost card lost whatever its expiry says', () => {
    expect(effectiveStatus(AccessCardStatus.LOST, IN_30_DAYS, NOW)).toBe(
      AccessCardStatus.LOST,
    );
    expect(effectiveStatus(AccessCardStatus.LOST, PAST, NOW)).toBe(
      AccessCardStatus.LOST,
    );
  });

  it('leaves a card with no expiry alone', () => {
    expect(effectiveStatus(AccessCardStatus.ACTIVE, null, NOW)).toBe(
      AccessCardStatus.ACTIVE,
    );
    expect(effectiveStatus(AccessCardStatus.ACTIVE, undefined, NOW)).toBe(
      AccessCardStatus.ACTIVE,
    );
  });
});

describe('isUsable', () => {
  it('is true only for an effective ACTIVE card', () => {
    expect(isUsable(AccessCardStatus.ACTIVE, IN_30_DAYS, NOW)).toBe(true);
    expect(isUsable(AccessCardStatus.ACTIVE, PAST, NOW)).toBe(false);
    expect(isUsable(AccessCardStatus.SUSPENDED, IN_30_DAYS, NOW)).toBe(false);
    expect(isUsable(AccessCardStatus.LOST, null, NOW)).toBe(false);
    expect(isUsable(AccessCardStatus.REVOKED, null, NOW)).toBe(false);
  });
});

describe('cardTransition — SUSPEND / REACTIVATE', () => {
  it('suspends an active card when a reason is given', () => {
    expect(
      cardTransition('SUSPEND', ctx({ note: 'reported in the wrong pocket' })),
    ).toEqual({
      ok: true,
      status: AccessCardStatus.SUSPENDED,
    });
  });

  it('refuses a suspension with no reason', () => {
    expect(cardTransition('SUSPEND', ctx()).ok).toBe(false);
  });

  it('refuses to suspend a card that is not active', () => {
    for (const status of [
      AccessCardStatus.SUSPENDED,
      AccessCardStatus.LOST,
      AccessCardStatus.REVOKED,
    ]) {
      expect(cardTransition('SUSPEND', ctx({ status, note: 'x' })).ok).toBe(
        false,
      );
    }
  });

  it('refuses to suspend an expired card — renew it instead', () => {
    const result = cardTransition(
      'SUSPEND',
      ctx({ expiresAt: PAST, note: 'x' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('expired');
  });

  it('brings a suspended card back', () => {
    expect(
      cardTransition('REACTIVATE', ctx({ status: AccessCardStatus.SUSPENDED })),
    ).toEqual({
      ok: true,
      status: AccessCardStatus.ACTIVE,
    });
  });

  it('refuses to bring back a card that expired while it was suspended', () => {
    const result = cardTransition(
      'REACTIVATE',
      ctx({ status: AccessCardStatus.SUSPENDED, expiresAt: PAST }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('passed its expiry date');
  });
});

describe('cardTransition — MARK_LOST', () => {
  it('records a loss with a reason', () => {
    expect(
      cardTransition('MARK_LOST', ctx({ note: 'left in the taxi' })),
    ).toEqual({
      ok: true,
      status: AccessCardStatus.LOST,
    });
  });

  it('refuses without a reason', () => {
    expect(cardTransition('MARK_LOST', ctx()).ok).toBe(false);
  });

  it('accepts a suspended card as lost — a card out of use can still be out there', () => {
    expect(
      cardTransition(
        'MARK_LOST',
        ctx({ status: AccessCardStatus.SUSPENDED, note: 'gone' }),
      ).ok,
    ).toBe(true);
  });

  it('refuses a card already lost or revoked', () => {
    for (const status of [AccessCardStatus.LOST, AccessCardStatus.REVOKED]) {
      expect(cardTransition('MARK_LOST', ctx({ status, note: 'x' })).ok).toBe(
        false,
      );
    }
  });

  it('cannot be undone: LOST has no path back to ACTIVE', () => {
    // The transition everybody expects and must not get. Reactivating a lost card
    // means two people hold the same number and one of them found it.
    for (const action of ['REACTIVATE', 'SUSPEND'] as const) {
      const result = cardTransition(
        action,
        ctx({ status: AccessCardStatus.LOST, note: 'found it' }),
      );
      expect(result.ok).toBe(false);
    }
  });
});

describe('cardTransition — MARK_EXPIRED', () => {
  it('expires an active card by hand, for a visa that ran out first', () => {
    expect(cardTransition('MARK_EXPIRED', ctx())).toEqual({
      ok: true,
      status: AccessCardStatus.EXPIRED,
    });
  });

  it('refuses when it is already expired', () => {
    expect(cardTransition('MARK_EXPIRED', ctx({ expiresAt: PAST })).ok).toBe(
      false,
    );
  });

  it('refuses a card that already opens nothing', () => {
    for (const status of [AccessCardStatus.LOST, AccessCardStatus.REVOKED]) {
      expect(cardTransition('MARK_EXPIRED', ctx({ status })).ok).toBe(false);
    }
  });
});

describe('cardTransition — REVOKE', () => {
  it('revokes an active card with a reason', () => {
    expect(
      cardTransition('REVOKE', ctx({ note: 'resident moved out' })),
    ).toEqual({
      ok: true,
      status: AccessCardStatus.REVOKED,
    });
  });

  it('refuses without a reason — this is the row somebody is asked about', () => {
    expect(cardTransition('REVOKE', ctx()).ok).toBe(false);
  });

  it('refuses an already-revoked card', () => {
    expect(
      cardTransition(
        'REVOKE',
        ctx({ status: AccessCardStatus.REVOKED, note: 'x' }),
      ).ok,
    ).toBe(false);
  });

  it('refuses a lost card, which already opens nothing', () => {
    const result = cardTransition(
      'REVOKE',
      ctx({ status: AccessCardStatus.LOST, note: 'x' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('already reported lost');
  });
});

describe('cardTransition — RECORD_REPLACEMENT', () => {
  it('records a replacement against a lost card without changing its status', () => {
    expect(
      cardTransition(
        'RECORD_REPLACEMENT',
        ctx({ status: AccessCardStatus.LOST, replacementCardId: 'card-2' }),
      ),
    ).toEqual({ ok: true, status: AccessCardStatus.LOST });
  });

  it('works for a revoked card too', () => {
    expect(
      cardTransition(
        'RECORD_REPLACEMENT',
        ctx({ status: AccessCardStatus.REVOKED, replacementCardId: 'card-2' }),
      ).ok,
    ).toBe(true);
  });

  it('needs the replacement card to actually exist', () => {
    expect(
      cardTransition(
        'RECORD_REPLACEMENT',
        ctx({ status: AccessCardStatus.LOST }),
      ).ok,
    ).toBe(false);
    expect(
      cardTransition(
        'RECORD_REPLACEMENT',
        ctx({ status: AccessCardStatus.LOST, replacementCardId: null }),
      ).ok,
    ).toBe(false);
  });

  it('refuses a card that is still in use', () => {
    expect(
      cardTransition('RECORD_REPLACEMENT', ctx({ replacementCardId: 'card-2' }))
        .ok,
    ).toBe(false);
  });
});

describe('availableCardActions', () => {
  it('offers suspend, mark lost and revoke on a healthy active card', () => {
    expect(availableCardActions(ctx()).sort()).toEqual([
      'MARK_EXPIRED',
      'MARK_LOST',
      'REVOKE',
      'SUSPEND',
    ]);
  });

  it('offers reactivate, mark lost, mark expired and revoke on a suspended card', () => {
    // Suspending does not close the other doors: a suspended card can still be
    // reported lost, end-ended early, or revoked outright.
    expect(
      availableCardActions(ctx({ status: AccessCardStatus.SUSPENDED })).sort(),
    ).toEqual(['MARK_EXPIRED', 'MARK_LOST', 'REACTIVATE', 'REVOKE']);
  });

  it('offers only record-replacement on a lost card', () => {
    expect(
      availableCardActions(
        ctx({ status: AccessCardStatus.LOST, replacementCardId: 'x' }),
      ),
    ).toEqual(['RECORD_REPLACEMENT']);
  });

  it('offers nothing on a lost card that has no replacement yet', () => {
    expect(
      availableCardActions(ctx({ status: AccessCardStatus.LOST })),
    ).toEqual([]);
  });

  it('offers record-replacement on a revoked card', () => {
    expect(
      availableCardActions(
        ctx({ status: AccessCardStatus.REVOKED, replacementCardId: 'x' }),
      ),
    ).toEqual(['RECORD_REPLACEMENT']);
  });

  it('offers nothing on a revoked card with no replacement yet', () => {
    // RECORD_REPLACEMENT needs a card id, so with none supplied it is not offered.
    expect(
      availableCardActions(ctx({ status: AccessCardStatus.REVOKED })),
    ).toEqual([]);
  });

  it('does not offer reactivate on a card that expired while suspended', () => {
    expect(
      availableCardActions(
        ctx({ status: AccessCardStatus.SUSPENDED, expiresAt: PAST }),
      ),
    ).not.toContain('REACTIVATE');
  });
});

describe('cardExpiry', () => {
  it('treats a card with no expiry as never expiring', () => {
    expect(cardExpiry(null, NOW)).toEqual({
      expired: false,
      daysUntilExpiry: null,
      expiringSoon: false,
    });
  });

  it('flags a card inside the warning window', () => {
    const result = cardExpiry(IN_30_DAYS, NOW);
    expect(result.expired).toBe(false);
    expect(result.daysUntilExpiry).toBe(30);
    expect(result.expiringSoon).toBe(true);
  });

  it('does not flag a card comfortably in the future', () => {
    expect(cardExpiry(new Date(2026, 8, 1, 9, 0, 0, 0), NOW).expiringSoon).toBe(
      false,
    );
  });

  it('flags an expired card with a negative day count', () => {
    const result = cardExpiry(PAST, NOW);
    expect(result.expired).toBe(true);
    expect(result.daysUntilExpiry).toBeLessThan(0);
    expect(result.expiringSoon).toBe(false);
  });

  it('uses a 30-day window, which is a lease rather than a week', () => {
    expect(EXPIRY_WARNING_DAYS).toBe(30);
  });
});

describe('formatCardNumber', () => {
  it('zero-pads so card numbers sort', () => {
    expect(formatCardNumber(42)).toBe('AC-0042');
  });
});
