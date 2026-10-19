export interface RentInvoice {
    amount?: number | string | null;
    totalAmount?: number | string | null;
    paidAmount?: number | string | null;
    balanceAmount?: number | string | null;
    dueDate?: string | Date | null;
    issueDate?: string | Date | null;
    status?: string | null;
}

export type RentTone = 'paid' | 'overdue' | 'partial' | 'due' | 'none';

export interface RentStatus {
    tone: RentTone;
    /** Share of the scoped period(s) that is settled (0-100). */
    paidPct: number;
    /** Billed for the scoped period(s). */
    billed: number;
    /** Settled for the scoped period(s). */
    paid: number;
    /** What the bar covers, e.g. "October 2026" or "2 periods". */
    scopeLabel: string;
    /** Money still owed for every period that has started. */
    outstanding: number;
    /** Part of `outstanding` that is already past its due date. */
    arrears: number;
}

const toNumber = (value: unknown): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const paidOf = (invoice: RentInvoice): number => Math.max(toNumber(invoice.paidAmount), 0);

const billedOf = (invoice: RentInvoice): number =>
    toNumber(invoice.totalAmount ?? invoice.amount ?? 0);

const dueTimeOf = (invoice: RentInvoice): number => {
    const due = invoice.dueDate ? new Date(invoice.dueDate).getTime() : NaN;
    if (Number.isFinite(due)) return due;
    const issued = invoice.issueDate ? new Date(invoice.issueDate).getTime() : NaN;
    return Number.isFinite(issued) ? issued : 0;
};

const isPastDue = (invoice: RentInvoice, now: Date): boolean => {
    const due = invoice.dueDate ? new Date(invoice.dueDate).getTime() : NaN;
    return Number.isFinite(due) && due < now.getTime();
};

const periodLabelOf = (invoice: RentInvoice): string =>
    invoice.dueDate
        ? new Date(invoice.dueDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : '';

const isBillable = (invoice: RentInvoice): boolean =>
    invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED';

/**
 * Payment standing of a tenancy.
 *
 * The balance is derived from what was billed and what was paid, not from
 * `Invoice.balanceAmount`: finance never reconciles that column, so trusting
 * it reports tenants as fully outstanding.
 *
 * Only periods that have started are counted - the next period's rent is not
 * money the tenant already owes - and "overdue" is decided by the due date
 * rather than by how much is outstanding.
 *
 * The bar covers the periods that are still unsettled, so the tinted part of
 * the bar is exactly the outstanding balance reported next to it. A tenant
 * with nothing outstanding is shown the current period, fully settled.
 */
export function computeRentStatus(
    invoices: RentInvoice[] | undefined | null,
    now: Date = new Date(),
): RentStatus {
    const empty: RentStatus = {
        tone: 'none',
        paidPct: 0,
        billed: 0,
        paid: 0,
        scopeLabel: '',
        outstanding: 0,
        arrears: 0,
    };

    const list = (invoices ?? []).filter((invoice) => invoice && isBillable(invoice));
    if (!list.length) return empty;

    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const sorted = [...list].sort((a, b) => dueTimeOf(a) - dueTimeOf(b));

    // Periods that have begun, oldest first. The last one is the current period.
    const started = sorted.filter((invoice) => dueTimeOf(invoice) <= periodEnd.getTime());
    const current = (started.length ? started : sorted)[(started.length ? started : sorted).length - 1];

    let outstanding = 0;
    let arrears = 0;
    const unsettled: RentInvoice[] = [];
    for (const invoice of started) {
        const unpaid = Math.max(billedOf(invoice) - paidOf(invoice), 0);
        if (unpaid <= 0) continue;
        unsettled.push(invoice);
        outstanding += unpaid;
        if (isPastDue(invoice, now)) arrears += unpaid;
    }

    // Nothing owed: the bar shows the current period, settled in full.
    const scope = unsettled.length ? unsettled : [current];
    const billed = scope.reduce((sum, invoice) => sum + billedOf(invoice), 0);
    const paid = scope.reduce((sum, invoice) => sum + Math.min(paidOf(invoice), billedOf(invoice)), 0);
    const paidPct = billed > 0 ? Math.round((paid / billed) * 100) : 0;
    const scopeLabel = unsettled.length
        ? unsettled.length === 1
            ? periodLabelOf(unsettled[0])
            : `${unsettled.length} periods`
        : periodLabelOf(current);

    let tone: RentTone;
    if (outstanding <= 0) {
        tone = 'paid';
    } else if (arrears > 0) {
        tone = 'overdue';
    } else if (paid > 0) {
        tone = 'partial';
    } else {
        tone = 'due';
    }

    return { tone, paidPct, billed, paid, scopeLabel, outstanding, arrears };
}
