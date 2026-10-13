import { TicketStatus } from '@prisma/client';

/**
 * Support-ticket status machine (Module 19) — pure, no database, no Nest.
 *
 * Four states, deliberately without a REOPENED one: a CLOSED ticket is a
 * finished conversation, and a tenant whose issue came back raises a new
 * ticket. Reopening in place would rewrite the history of what "resolved"
 * meant, which is exactly the rewriting the frozen owner statements (Module 6)
 * exist to refuse.
 *
 * Who may move what is enforced by the service, not here: tenants may close
 * their own OPEN/IN_PROGRESS tickets; only the platform may move anything to
 * IN_PROGRESS or RESOLVED. This file answers only "is this transition legal".
 */
const ALLOWED: Record<TicketStatus, readonly TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
  // RESOLVED is the tenant's confirmation window: they close it, or the
  // platform closes it after the answer has sat unread.
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
};

export function canTransitionTicket(
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}

export function assertTicketTransition(
  from: TicketStatus,
  to: TicketStatus,
): void {
  if (!canTransitionTicket(from, to)) {
    throw new Error(
      `Ticket cannot move from ${from} to ${to} (allowed: ${ALLOWED[from].join(', ') || 'none — CLOSED is terminal'})`,
    );
  }
}
