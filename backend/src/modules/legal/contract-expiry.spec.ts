import {
  CONTRACT_EXPIRY_WARNING_DAYS,
  EXPIRING_SOON_DAYS,
  buildRenewalChain,
  daysUntil,
  deriveContractStatus,
  describeShapeViolation,
  isPastNoticeDeadline,
  nextReminderBand,
  noticeDueAt,
  reminderDaysFor,
} from './contract-expiry';

const DAY = 86_400_000;
const NOW = new Date('2026-06-15T00:00:00.000Z');

/** A date `days` after NOW. */
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY);

describe('daysUntil', () => {
  it('rounds a partial day up rather than to nearest', () => {
    // 26 hours left. `round` would report 1 here too, so use a case that separates
    // them: 30 hours must read as 2 days, not 1.
    expect(daysUntil(new Date(NOW.getTime() + 30 * 3_600_000), NOW)).toBe(2);
  });

  it('never reports a contract with hours left as zero days', () => {
    expect(daysUntil(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(1);
  });

  it('goes negative once the date is past', () => {
    expect(daysUntil(inDays(-1), NOW)).toBe(-1);
  });

  it('reports exactly zero for this instant', () => {
    expect(daysUntil(NOW, NOW)).toBe(0);
  });
});

describe('noticeDueAt', () => {
  it('counts back from the expiry, not from today', () => {
    expect(noticeDueAt(inDays(120), 90)?.toISOString()).toBe(
      inDays(30).toISOString(),
    );
  });

  it('is undefined with no expiry date', () => {
    expect(noticeDueAt(null, 90)).toBeUndefined();
  });

  it('is undefined when no notice is required', () => {
    expect(noticeDueAt(inDays(120), null)).toBeUndefined();
  });

  it('is the expiry itself when notice is zero days', () => {
    expect(noticeDueAt(inDays(120), 0)?.toISOString()).toBe(
      inDays(120).toISOString(),
    );
  });
});

describe('isPastNoticeDeadline', () => {
  it('is true for a contract that has not expired but can no longer be renewed', () => {
    // The whole point of the column: 45 days left, 90 days' notice required.
    expect(isPastNoticeDeadline(inDays(45), 90, NOW)).toBe(true);
  });

  it('is false while notice can still be served', () => {
    expect(isPastNoticeDeadline(inDays(200), 90, NOW)).toBe(false);
  });

  it('is false once the contract has expired, which is a different problem', () => {
    expect(isPastNoticeDeadline(inDays(-5), 90, NOW)).toBe(false);
  });

  it('is false with no notice requirement', () => {
    expect(isPastNoticeDeadline(inDays(45), null, NOW)).toBe(false);
  });

  it('treats the deadline instant itself as passed', () => {
    expect(isPastNoticeDeadline(inDays(90), 90, NOW)).toBe(true);
  });
});

describe('deriveContractStatus', () => {
  it('reports a term that has not started as PENDING', () => {
    expect(
      deriveContractStatus(
        { type: 'VENDOR', startDate: inDays(10), expiresAt: inDays(200) },
        NOW,
      ),
    ).toBe('PENDING');
  });

  it('reports a superseded contract as SUPERSEDED even after it expired', () => {
    // Rule 2: a replaced contract is history, not an ongoing expiry alarm. Note the
    // flag describes the *original* - the renewal is the live contract.
    expect(
      deriveContractStatus(
        { type: 'VENDOR', expiresAt: inDays(-400), isSuperseded: true },
        NOW,
      ),
    ).toBe('SUPERSEDED');
  });

  it('does not report the renewal itself as superseded', () => {
    // The regression this guards: `renewalOfId` points at the predecessor, so a
    // contract carrying it is the new term. Reading that column as "superseded"
    // flags the renewal and leaves the original looking live - exactly backwards.
    expect(
      deriveContractStatus(
        { type: 'VENDOR', startDate: inDays(10), expiresAt: inDays(400) },
        NOW,
      ),
    ).toBe('PENDING');
  });

  it('reports a contract expiring this instant as EXPIRED', () => {
    expect(deriveContractStatus({ type: 'VENDOR', expiresAt: NOW }, NOW)).toBe(
      'EXPIRED',
    );
  });

  it('reports an already-ended contract as EXPIRED', () => {
    expect(
      deriveContractStatus({ type: 'LEASE', expiresAt: inDays(-1) }, NOW),
    ).toBe('EXPIRED');
  });

  it('reports a contract inside the expiring window as EXPIRING_SOON', () => {
    expect(
      deriveContractStatus({ type: 'VENDOR', expiresAt: inDays(29) }, NOW),
    ).toBe('EXPIRING_SOON');
  });

  it('reports the last day of the expiring window as EXPIRING_SOON, not ACTIVE', () => {
    expect(
      deriveContractStatus(
        { type: 'VENDOR', expiresAt: inDays(EXPIRING_SOON_DAYS) },
        NOW,
      ),
    ).toBe('EXPIRING_SOON');
  });

  it('reports a contract comfortably ahead as ACTIVE', () => {
    expect(
      deriveContractStatus({ type: 'VENDOR', expiresAt: inDays(200) }, NOW),
    ).toBe('ACTIVE');
  });

  it('reports a started contract with no end date as OPEN_ENDED, not expiring', () => {
    // Rule 3: a rolling management agreement belongs on no warning list, and it is
    // not the same as a contract that has a date comfortably in the future.
    expect(
      deriveContractStatus(
        { type: 'MANAGEMENT', startDate: inDays(-400), expiresAt: null },
        NOW,
      ),
    ).toBe('OPEN_ENDED');
  });

  it('reports a contract with no dates at all as UNDATED', () => {
    expect(deriveContractStatus({ type: 'COMPLIANCE' }, NOW)).toBe('UNDATED');
  });

  it('reports a past-notice-deadline contract as NOTICE_DUE, not ACTIVE', () => {
    expect(
      deriveContractStatus(
        { type: 'LEASE', expiresAt: inDays(45), noticeDays: 90 },
        NOW,
      ),
    ).toBe('NOTICE_DUE');
  });

  it('ranks NOTICE_DUE above EXPIRING_SOON even further from expiry', () => {
    expect(
      deriveContractStatus(
        { type: 'LEASE', expiresAt: inDays(25), noticeDays: 90 },
        NOW,
      ),
    ).toBe('NOTICE_DUE');
  });

  it('lets PENDING outrank everything, since a future term cannot be expiring', () => {
    expect(
      deriveContractStatus(
        {
          type: 'LEASE',
          startDate: inDays(10),
          expiresAt: inDays(40),
          noticeDays: 90,
        },
        NOW,
      ),
    ).toBe('PENDING');
  });

  it('ranks SUPERSEDED below PENDING', () => {
    expect(
      deriveContractStatus(
        {
          type: 'LEASE',
          startDate: inDays(10),
          expiresAt: inDays(400),
          isSuperseded: true,
        },
        NOW,
      ),
    ).toBe('PENDING');
  });

  it('ranks SUPERSEDED above the clock, so a replaced contract reads as history', () => {
    expect(
      deriveContractStatus(
        { type: 'LEASE', expiresAt: inDays(5), isSuperseded: true },
        NOW,
      ),
    ).toBe('SUPERSEDED');
  });

  it('does not report a notice-due contract as ACTIVE when the term has started', () => {
    expect(
      deriveContractStatus(
        {
          type: 'VENDOR',
          startDate: inDays(-300),
          expiresAt: inDays(60),
          noticeDays: 90,
        },
        NOW,
      ),
    ).toBe('NOTICE_DUE');
  });
});

describe('reminderDaysFor', () => {
  it('is the standard bands when no notice is required', () => {
    expect(reminderDaysFor(null)).toEqual([...CONTRACT_EXPIRY_WARNING_DAYS]);
  });

  it('adds the notice deadline as a band of its own', () => {
    const bands = reminderDaysFor(90);
    expect(bands).toContain(90);
    expect(bands).toEqual([1, 7, 14, 30, 60, 90]);
  });

  it('does not duplicate a band the standard set already has', () => {
    expect(reminderDaysFor(30).filter((b) => b === 30)).toHaveLength(1);
  });

  it('ignores a negative notice period rather than adding a band below zero', () => {
    expect(reminderDaysFor(-5)).toEqual([...CONTRACT_EXPIRY_WARNING_DAYS]);
  });

  it('accepts a zero notice period', () => {
    expect(reminderDaysFor(0)).toContain(0);
  });
});

describe('nextReminderBand', () => {
  it('buckets upwards, so a contract past a band still alerts', () => {
    // The bucket is "expires within N days", not "the band already crossed". 61 days
    // left means the 60-day reminder has not been sent yet, so this contract must be
    // reported against 90 and then re-fire at 60 - not be treated as done.
    expect(nextReminderBand(61)).toBe(90);
  });

  it('still resolves to a band when the sweep was down and days were missed', () => {
    // A cron miss must not walk a contract past every band in silence.
    expect(nextReminderBand(58)).toBe(60);
    expect(nextReminderBand(22)).toBe(30);
  });

  it('matches an exact band, since that is the day the reminder is for', () => {
    expect(nextReminderBand(30)).toBe(30);
  });

  it('uses the urgent band inside the final week', () => {
    expect(nextReminderBand(6)).toBe(7);
    expect(nextReminderBand(3)).toBe(7);
  });

  it('still alerts inside the last day rather than going silent', () => {
    expect(nextReminderBand(1)).toBe(1);
  });

  it('returns null for a contract that has already expired', () => {
    expect(nextReminderBand(0)).toBeNull();
    expect(nextReminderBand(-3)).toBeNull();
  });

  it('honours a notice-aware band list', () => {
    expect(nextReminderBand(88, reminderDaysFor(90))).toBe(90);
  });
});

describe('buildRenewalChain', () => {
  const a = {
    id: 'a',
    reference: 'CON-1',
    expiresAt: inDays(-100),
    renewalOfId: null,
  };
  const b = {
    id: 'b',
    reference: 'CON-2',
    expiresAt: inDays(-10),
    renewalOfId: 'a',
  };
  const c = {
    id: 'c',
    reference: 'CON-3',
    expiresAt: inDays(300),
    renewalOfId: 'b',
  };
  const map = new Map([a, b, c].map((n) => [n.id, n]));

  it('walks back to the original agreement, newest link first', () => {
    expect(buildRenewalChain(c, map).map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('returns just the contract for one with no predecessor', () => {
    expect(buildRenewalChain(a, map).map((n) => n.id)).toEqual(['a']);
  });

  it('terminates on a cycle instead of hanging the nightly sweep', () => {
    const x = { id: 'x', reference: 'CON-X', renewalOfId: 'y' };
    const y = { id: 'y', reference: 'CON-Y', renewalOfId: 'x' };
    const cyclic = new Map([[x.id, x] as const, [y.id, y] as const]);
    expect(buildRenewalChain(x, cyclic).map((n) => n.id)).toEqual(['x', 'y']);
  });

  it('starts where the evidence starts when the parent was deleted', () => {
    // `renewalOfId` is ON DELETE SET NULL, so a surviving child can point at nothing.
    const orphan = { id: 'z', reference: 'CON-Z', renewalOfId: 'deleted' };
    expect(buildRenewalChain(orphan, new Map()).map((n) => n.id)).toEqual([
      'z',
    ]);
  });
});

describe('describeShapeViolation', () => {
  it('accepts a lease pointing at a rental agreement', () => {
    expect(
      describeShapeViolation('LEASE', { rentalAgreementId: 'r1' }),
    ).toBeUndefined();
  });

  it('accepts a compliance certificate with no related entity', () => {
    expect(describeShapeViolation('COMPLIANCE', {})).toBeUndefined();
    expect(
      describeShapeViolation('COMPLIANCE', { rentalAgreementId: null }),
    ).toBeUndefined();
  });

  it('refuses a contract linked to more than one record, and says how many', () => {
    const sentence = describeShapeViolation('LEASE', {
      rentalAgreementId: 'r1',
      supplierId: 's1',
    });
    expect(sentence).toContain('only be linked to one record');
    expect(sentence).toContain('2');
  });

  it('refuses a vendor contract with no supplier, naming the missing field', () => {
    expect(describeShapeViolation('VENDOR', {})).toContain(
      'must be linked to a record',
    );
    expect(describeShapeViolation('VENDOR', {})).toContain('supplier');
  });

  it('refuses a lease contract pointing at a supplier', () => {
    const sentence = describeShapeViolation('LEASE', { supplierId: 's1' });
    expect(sentence).toContain('own record type');
    expect(sentence).toContain('supplier');
  });

  it('refuses a sale contract pointing at a rental agreement', () => {
    expect(
      describeShapeViolation('SALE', { rentalAgreementId: 'r1' }),
    ).toContain('own record type');
  });

  it('refuses a compliance certificate tied to a tenant, and explains the alternative', () => {
    const sentence = describeShapeViolation('COMPLIANCE', {
      rentalAgreementId: 'r1',
    });
    expect(sentence).toContain('not tied to a tenant');
    expect(sentence).toContain('change the type');
  });

  it('treats an empty string as absent rather than as a linked record', () => {
    expect(describeShapeViolation('VENDOR', { supplierId: '' })).toContain(
      'must be linked',
    );
  });

  it('never leaks a raw column name into a refusal sentence', () => {
    const sentences = [
      describeShapeViolation('VENDOR', {}),
      describeShapeViolation('LEASE', { supplierId: 's1' }),
      describeShapeViolation('COMPLIANCE', { landlordId: 'l1' }),
    ];
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/[a-z][A-Z]/);
      expect(sentence).not.toContain('Id');
    }
  });
});
