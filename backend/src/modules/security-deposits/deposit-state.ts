import { Prisma } from '@prisma/client';

/**
 * The invoice class a deposit is billed on.
 *
 * A deposit is not rent, so it is not billed as rent: the invoice carries this
 * class instead, which is what tells the ledger to book it against
 * `Security Deposits Receivable` and `Security Deposits Held` rather than
 * against rent income, and what tells the arrears sweep to leave it alone.
 */
export const DEPOSIT_TRANSACTION_CLASS = 'DEPOSIT';

type Tx = Prisma.TransactionClient;

export interface DepositInvoiceState {
  /** The invoice the deposit was billed on, if there is one. */
  invoiceId: string | null;
  invoiceNumber: string | null;
  status: string | null;
  /** What was billed. */
  invoiced: number;
  /** What has actually been received against it. */
  received: number;
  /** What is still owed. */
  balance: number;
  /** Fully paid. A partly-paid deposit is not a deposit in hand. */
  settled: boolean;
}

const EMPTY_STATE: DepositInvoiceState = {
  invoiceId: null,
  invoiceNumber: null,
  status: null,
  invoiced: 0,
  received: 0,
  balance: 0,
  settled: false,
};

/**
 * The deposit invoice of an agreement, following the renewal chain.
 *
 * A renewal does not bill a second deposit — the resident is not moving in and
 * keeps the money they paid — so the successor agreement has no invoice of its
 * own and the money it holds is the predecessor's. Walking the chain is what
 * lets the register say "received" for a renewed tenancy, and what lets the
 * activation gate accept an inherited deposit.
 *
 * The walk is bounded and cycle-safe: a renewal chain is a straight line, but
 * a bug elsewhere must not turn this into an infinite loop.
 */
export async function depositInvoiceFor(
  tx: Tx,
  agreementId: string,
): Promise<DepositInvoiceState> {
  const seen = new Set<string>();
  let current: string | null = agreementId;

  for (let depth = 0; depth < 10; depth += 1) {
    if (!current || seen.has(current)) break;
    seen.add(current);

    const invoice = await tx.invoice.findFirst({
      where: {
        agreementId: current,
        transactionClass: DEPOSIT_TRANSACTION_CLASS,
      },
      orderBy: { issueDate: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
      },
    });

    if (invoice) {
      const invoiced = Number(invoice.totalAmount);
      const received = Number(invoice.paidAmount);
      const balance = Number(invoice.balanceAmount);
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiced,
        received,
        balance,
        settled: invoiced > 0 && balance <= 0 && received >= invoiced,
      };
    }

    const agreement = (await tx.agreement.findUnique({
      where: { id: current },
      select: { renewedFromId: true },
    })) as { renewedFromId: string | null } | null;
    current = agreement?.renewedFromId ?? null;
  }

  return EMPTY_STATE;
}

/**
 * The same, for a whole set of agreements, without a query per row.
 *
 * The register shows every tenancy that carries a deposit, and asking the
 * database once per row is how a register becomes slow. The chain is walked in
 * passes instead: every agreement with no invoice of its own is looked up
 * alongside its predecessor, and so on, until nothing is left to look up or the
 * chain is out of depth.
 */
export async function depositInvoiceStates(
  tx: Tx,
  agreementIds: string[],
): Promise<Map<string, DepositInvoiceState>> {
  const states = new Map<string, DepositInvoiceState>();
  if (agreementIds.length === 0) return states;

  let pending = [...agreementIds];
  const seen = new Set<string>();

  for (let depth = 0; depth < 10 && pending.length > 0; depth += 1) {
    const invoices = await tx.invoice.findMany({
      where: {
        agreementId: { in: pending },
        transactionClass: DEPOSIT_TRANSACTION_CLASS,
      },
      select: {
        agreementId: true,
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
      },
      orderBy: { issueDate: 'desc' },
    });

    const byAgreement = new Map<string, (typeof invoices)[number]>();
    for (const invoice of invoices) {
      if (!invoice.agreementId) continue;
      if (!byAgreement.has(invoice.agreementId)) {
        byAgreement.set(invoice.agreementId, invoice);
      }
    }

    for (const agreementId of pending) {
      const invoice = byAgreement.get(agreementId);
      if (!invoice) continue;
      const invoiced = Number(invoice.totalAmount);
      const received = Number(invoice.paidAmount);
      states.set(agreementId, {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiced,
        received,
        balance: Number(invoice.balanceAmount),
        settled:
          invoiced > 0 &&
          Number(invoice.balanceAmount) <= 0 &&
          received >= invoiced,
      });
    }

    // Whatever is left has no deposit invoice of its own; look at its
    // predecessor's, if it has one.
    const unresolved = pending.filter((id) => !states.has(id));
    if (unresolved.length === 0) break;

    const predecessors = await tx.agreement.findMany({
      where: { id: { in: unresolved } },
      select: { id: true, renewedFromId: true },
    });

    pending = predecessors
      .map((agreement) => agreement.renewedFromId)
      .filter(
        (id): id is string =>
          typeof id === 'string' && !seen.has(id) && !states.has(id),
      );
    predecessors.forEach((agreement) => seen.add(agreement.id));
  }

  for (const agreementId of agreementIds) {
    if (!states.has(agreementId)) states.set(agreementId, EMPTY_STATE);
  }

  return states;
}
