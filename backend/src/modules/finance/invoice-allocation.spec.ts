import { InvoiceStatus } from '@prisma/client';
import {
  allocateToInvoice,
  deriveInvoiceProgress,
  deriveInvoiceStatus,
  round2,
} from './invoice-allocation';

/**
 * Allocation rules worth pinning:
 *   - an invoice absorbs only what it still owes, and the rest is surplus the
 *     caller must credit,
 *   - status follows coverage, and an untouched invoice keeps its own status,
 *   - a cancelled invoice absorbs nothing,
 *   - progress derived after a refund can never go negative.
 */
describe('invoice allocation', () => {
  const openInvoice = {
    totalAmount: 10_000,
    balanceAmount: 10_000,
    paidAmount: 0,
    status: InvoiceStatus.PENDING,
  };

  it('round-trips cents without drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1160.005)).toBe(1160.01);
  });

  it('applies part of a payment and leaves the rest as surplus', () => {
    const result = allocateToInvoice(
      { ...openInvoice, balanceAmount: 4_000, paidAmount: 6_000 },
      5_000,
    );
    expect(result.applied).toBe(4_000);
    expect(result.surplus).toBe(1_000);
    expect(result.paidAmount).toBe(10_000);
    expect(result.balanceAmount).toBe(0);
    expect(result.status).toBe(InvoiceStatus.PAID);
  });

  it('marks a partial payment PARTIALLY_PAID', () => {
    const result = allocateToInvoice(openInvoice, 2_500);
    expect(result.applied).toBe(2_500);
    expect(result.surplus).toBe(0);
    expect(result.balanceAmount).toBe(7_500);
    expect(result.status).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it('never drives an invoice below zero on a full overpayment', () => {
    const result = allocateToInvoice(openInvoice, 25_000);
    expect(result.applied).toBe(10_000);
    expect(result.surplus).toBe(15_000);
    expect(result.balanceAmount).toBe(0);
    expect(result.paidAmount).toBe(10_000);
  });

  it('refuses to absorb anything on a cancelled invoice', () => {
    const result = allocateToInvoice(
      { ...openInvoice, status: InvoiceStatus.CANCELLED },
      5_000,
    );
    expect(result.applied).toBe(0);
    expect(result.surplus).toBe(5_000);
    expect(result.status).toBe(InvoiceStatus.CANCELLED);
  });

  it('keeps an overdue invoice overdue when nothing has been applied', () => {
    expect(deriveInvoiceStatus(0, 10_000, InvoiceStatus.OVERDUE)).toBe(
      InvoiceStatus.OVERDUE,
    );
    expect(deriveInvoiceStatus(1_000, 9_000, InvoiceStatus.OVERDUE)).toBe(
      InvoiceStatus.PARTIALLY_PAID,
    );
  });

  it('treats a zero or negative amount as a no-op', () => {
    const result = allocateToInvoice(openInvoice, 0);
    expect(result.applied).toBe(0);
    expect(result.surplus).toBe(0);
    expect(result.status).toBe(InvoiceStatus.PENDING);
  });

  it('re-derives progress after a refund without going negative', () => {
    const progress = deriveInvoiceProgress(10_000, 4_000, InvoiceStatus.PAID);
    expect(progress).toEqual({
      paidAmount: 4_000,
      balanceAmount: 6_000,
      status: InvoiceStatus.PARTIALLY_PAID,
    });

    // More was refunded than was paid — the invoice floors at zero, and a
    // status that asserted coverage cannot survive the rewind.
    expect(deriveInvoiceProgress(10_000, -500, InvoiceStatus.PAID)).toEqual({
      paidAmount: 0,
      balanceAmount: 10_000,
      status: InvoiceStatus.PENDING,
    });
  });
});
