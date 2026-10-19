/**
 * Money and dates, in the organization's own currency and locale.
 *
 * The rule this file exists to enforce: **a currency is a property of the
 * record, never a constant in the code.** A receipt is denominated in the
 * currency it was received in, an invoice in the currency it was billed in, and
 * an organization has a default for the rows that have not chosen one. Nothing
 * in this product is Kenyan — `KES` appears in this file only as an example of
 * a code that might arrive, and even that is avoided by never defaulting to one.
 *
 * The formatting is delegated to `Intl`, which is the only thing in the stack
 * that knows that `1.234,56 €` is the right way to write an amount in Munich
 * and `€1,234.56` is the right way to write it in Dublin. Hand-rolling that
 * with a `toLocaleString` and a concatenated code gets the symbol right and
 * the separators, the decimal marks and the placement wrong.
 */

/** A currency code, or anything that might turn out not to be one. */
export type CurrencyCode = string | null | undefined;

/**
 * An amount, formatted with its currency.
 *
 * The currency is shown as the reader's locale renders it — `KSh 1,234.00`,
 * `€1,234.56`, `₦1,234.00`. When the code is missing the amount is still
 * printed, without a currency, because a bare number is better than a number
 * labelled in the wrong currency, and better than nothing at all.
 */
export function formatMoney(
    amount: number | string | null | undefined,
    currency?: CurrencyCode,
    locale?: string | null,
): string {
    const value = Number(amount ?? 0);
    if (!Number.isFinite(value)) return '—';

    if (!currency) {
        return formatAmount(value, locale);
    }

    try {
        return new Intl.NumberFormat(locale || undefined, {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        // An unknown code (a typo in a record, a currency Intl has never heard
        // of) must not blank the screen: show the amount and the raw code.
        return `${currency} ${formatAmount(value, locale)}`;
    }
}

/**
 * An amount, formatted without a currency.
 *
 * For the cells of a table whose currency is in the column heading, or whose
 * currency is carried by the row it belongs to.
 */
export function formatAmount(
    amount: number | string | null | undefined,
    locale?: string | null,
    digits = 2,
): string {
    const value = Number(amount ?? 0);
    if (!Number.isFinite(value)) return '—';
    try {
        return new Intl.NumberFormat(locale || undefined, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        }).format(value);
    } catch {
        return value.toLocaleString('en-US', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });
    }
}

/**
 * The currency a set of records is denominated in.
 *
 * Records carry their own currency, so a page that adds them up has to know
 * what it is adding. In practice every row on a page belongs to one
 * organization and one country and shares one currency; when it does not, the
 * **most common** currency wins, because it is the one the reader is most
 * likely to recognise, and the page shows the rest of the rows' own currency
 * next to each amount.
 *
 * Returns `undefined` when nothing has one, which is a real answer: the caller
 * then prints amounts without a currency rather than inventing one.
 */
export function resolveCurrency(
    currencies: Array<CurrencyCode>,
): string | undefined {
    const counts = new Map<string, number>();
    for (const currency of currencies) {
        if (!currency) continue;
        counts.set(currency, (counts.get(currency) ?? 0) + 1);
    }
    if (counts.size === 0) return undefined;

    let best: string | undefined;
    let bestCount = 0;
    for (const [currency, count] of counts) {
        if (count > bestCount) {
            best = currency;
            bestCount = count;
        }
    }
    return best;
}

/**
 * A date, in the reader's locale.
 *
 * The order of the parts — 3 March or March 3rd — is a property of the
 * locale, and so is the calendar (a Buddhist year in `th-TH`, a Japanese era
 * in `ja-JP`). It is not a property of the screen, which is why the locale is
 * a parameter and not a literal.
 */
export function formatDate(
    value: string | Date | null | undefined,
    locale?: string | null,
    timezone?: string | null,
): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';
    try {
        return new Intl.DateTimeFormat(locale || undefined, {
            dateStyle: 'medium',
            ...(timezone ? { timeZone: timezone } : {}),
        }).format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

/** A date and time, in the reader's locale. */
export function formatDateTime(
    value: string | Date | null | undefined,
    locale?: string | null,
    timezone?: string | null,
): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';
    try {
        return new Intl.DateTimeFormat(locale || undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
            ...(timezone ? { timeZone: timezone } : {}),
        }).format(date);
    } catch {
        return date.toISOString().slice(0, 16).replace('T', ' ');
    }
}

/**
 * A month, in the reader's locale — "March 2026", "March 2026", "2026年3月".
 */
export function formatMonth(
    value: string | Date | null | undefined,
    locale?: string | null,
): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';
    try {
        return new Intl.DateTimeFormat(locale || undefined, {
            year: 'numeric',
            month: 'long',
        }).format(date);
    } catch {
        return date.toISOString().slice(0, 7);
    }
}
