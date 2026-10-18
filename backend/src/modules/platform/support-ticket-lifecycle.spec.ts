import { TicketStatus } from '@prisma/client';
import {
  assertTicketTransition,
  canTransitionTicket,
} from './support-ticket-lifecycle';

/**
 * Module 19 — the support-ticket state machine, pure and without a database.
 *
 * OPEN → IN_PROGRESS → RESOLVED → CLOSED, with CLOSE allowed from OPEN and
 * IN_PROGRESS (a tenant giving up on their own request). CLOSED is terminal:
 * a finished conversation is never rewritten, a new ticket references it.
 */
describe('support-ticket-lifecycle', () => {
  it.each([
    [TicketStatus.OPEN, TicketStatus.IN_PROGRESS],
    [TicketStatus.OPEN, TicketStatus.CLOSED],
    [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED],
    [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
    [TicketStatus.RESOLVED, TicketStatus.CLOSED],
  ])('allows %s → %s', (from, to) => {
    expect(canTransitionTicket(from, to)).toBe(true);
  });

  it.each([
    [TicketStatus.OPEN, TicketStatus.RESOLVED],
    [TicketStatus.IN_PROGRESS, TicketStatus.OPEN],
    [TicketStatus.RESOLVED, TicketStatus.IN_PROGRESS],
    [TicketStatus.RESOLVED, TicketStatus.OPEN],
    [TicketStatus.CLOSED, TicketStatus.OPEN],
    [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  ])('refuses %s → %s', (from, to) => {
    expect(canTransitionTicket(from, to)).toBe(false);
    expect(() => assertTicketTransition(from, to)).toThrow(/cannot move from/);
  });

  it('treats a no-op move as allowed (a restated status is not an error)', () => {
    expect(canTransitionTicket(TicketStatus.OPEN, TicketStatus.OPEN)).toBe(
      true,
    );
  });
});
