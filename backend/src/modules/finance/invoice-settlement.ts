import { InvoiceStatus, Prisma } from '@prisma/client';
import { requireRecord } from '@/common/utils';
import { deriveInvoiceProgress, round2 } from './invoice-allocation';

type Tx = Prisma.TransactionClient;

/**
 * Module 8 — Payments: the single definition of "how much has actually been
 * paid on this invoice".
 *
 * Three things can move money off an invoice again — a reversed payment, a
 * refund, a credit note — and each has its own table. Anything that needs the
 * current paid/balance/status of an invoice derives it here instead of
 * decrementing a stored number, so no path can double-subtract and drive an
 * invoice below zero.
 *
 * The figure comes from `PaymentAllocation` rows — how much of each payment
 * settled this invoice — not from `Payment.amount`, because a payment is
 * usually bigger than the invoice it paid and the difference is credit.
 */
export async function livePaidAmount(
  tx: Tx,
  invoiceId: string,
): Promise<number> {
  const allocations = await tx.paymentAllocation.findMany({
    where: { invoiceId, payment: { isReversed: false } },
    select: { paymentId: true, amount: true },
  });
  if (allocations.length === 0) return 0;

  const refunds = await tx.paymentRefund.groupBy({
    by: ['paymentId'],
    where: { paymentId: { in: allocations.map((row) => row.paymentId) } },
    _sum: { amount: true },
  });
  const refundedByPayment = new Map(
    refunds.map((row) => [row.paymentId, Number(row._sum.amount ?? 0)]),
  );

  // One payment can be allocated to this invoice more than once, and a refund
  // can only unwind what that payment put here.
  const byPayment = new Map<string, number>();
  for (const row of allocations) {
    byPayment.set(
      row.paymentId,
      round2((byPayment.get(row.paymentId) ?? 0) + Number(row.amount)),
    );
  }

  const paid = [...byPayment.entries()].reduce((sum, [paymentId, amount]) => {
    const refunded = Math.min(refundedByPayment.get(paymentId) ?? 0, amount);
    return sum + amount - refunded;
  }, 0);
  return Math.max(0, round2(paid));
}

/**
 * Payments recorded before `PaymentAllocation` existed carry no allocation
 * rows. For an invoice that only has those, fall back to the payment amounts —
 * otherwise every pre-existing invoice would suddenly read as unpaid the first
 * time anything re-derives it.
 */
export async function livePaidAmountLegacySafe(
  tx: Tx,
  invoiceId: string,
): Promise<number> {
  const allocated = await livePaidAmount(tx, invoiceId);
  if (allocated > 0) return allocated;

  const payments = await tx.payment.findMany({
    where: { invoiceId, isReversed: false },
    select: { id: true, amount: true },
  });
  if (payments.length === 0) return 0;

  const refunds = await tx.paymentRefund.groupBy({
    by: ['paymentId'],
    where: { paymentId: { in: payments.map((payment) => payment.id) } },
    _sum: { amount: true },
  });
  const refundedByPayment = new Map(
    refunds.map((row) => [row.paymentId, Number(row._sum.amount ?? 0)]),
  );

  const paid = payments.reduce(
    (sum, payment) =>
      sum + Number(payment.amount) - (refundedByPayment.get(payment.id) ?? 0),
    0,
  );
  return Math.max(0, round2(paid));
}

/** Credit already spent against this invoice — a credit is not cash, but it
 *  does settle a bill, so it counts as paid. */
export async function creditAppliedAmount(
  tx: Tx,
  invoiceId: string,
): Promise<number> {
  const applied = await tx.creditApplication.aggregate({
    where: { invoiceId },
    _sum: { amount: true },
  });
  return Math.max(0, Number(applied._sum.amount ?? 0));
}

/**
 * Recompute an invoice's money columns from payments, refunds and credit, and
 * write them back. `previousStatus` keeps an untouched OVERDUE invoice overdue.
 */
export async function syncInvoiceSettlement(
  tx: Tx,
  invoiceId: string,
  organizationId?: string,
  previousStatus?: InvoiceStatus,
): Promise<void> {
  const invoice = await requireRecord(
    tx.invoice.findFirst({
      where: { id: invoiceId, ...(organizationId && { organizationId }) },
      select: { totalAmount: true, status: true },
    }),
    'Invoice',
  );
  const paid =
    (await livePaidAmountLegacySafe(tx, invoiceId)) +
    (await creditAppliedAmount(tx, invoiceId));

  const progress = deriveInvoiceProgress(
    Number(invoice.totalAmount),
    paid,
    previousStatus ?? invoice.status,
  );
  await tx.invoice.update({ where: { id: invoiceId }, data: progress });
}
