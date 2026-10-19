'use client';

import { useAuth } from '@/hooks/use-auth';
import {
    formatAmount,
    formatDate,
    formatDateTime,
    formatMoney,
    resolveCurrency,
    type CurrencyCode,
} from '@/lib/currency';

/**
 * The organization's money and calendar settings, ready to use.
 *
 * The organization is the thing that knows which country it is in: it holds the
 * default currency, the timezone and the locale, and those three decide how
 * every amount and date in the product should read. A hook rather than a
 * constant, because the same screen is read by a Nairobi office and a London
 * one and the difference is a setting, not a build.
 *
 * **A record's own currency still wins.** `money(amount, currency)` takes the
 * currency from the record being shown and only falls back to the
 * organization's default — because an invoice denominated in USD is denominated
 * in USD whatever the organization's default happens to be, and quietly
 * relabelling it would be worse than showing a number with no currency at all.
 */
export function useOrgFormat() {
    const { organization } = useAuth();

    const currency = organization?.currency || undefined;
    const locale = organization?.defaultLocale || undefined;
    const timezone = organization?.timezone || undefined;

    return {
        /** The organization's default currency, if it has one. */
        currency,
        /** The organization's BCP-47 locale, if it has one. */
        locale,
        /** The organization's IANA timezone, if it has one. */
        timezone,
        /** An amount with its currency. The record's currency, or the default. */
        money: (amount: number | string | null | undefined, own?: CurrencyCode) =>
            formatMoney(amount, own ?? currency, locale),
        /** An amount with no currency — for table cells that carry their own. */
        amount: (value: number | string | null | undefined) =>
            formatAmount(value, locale),
        /**
         * The currency a set of records is in, falling back to the
         * organization's default. For a page that adds several records up, the
         * currency has to come from the records rather than from a constant.
         */
        resolve: (currencies: Array<CurrencyCode>) =>
            resolveCurrency(currencies) ?? currency,
        /** A date, in the organization's locale. */
        date: (value: string | Date | null | undefined) =>
            formatDate(value, locale, timezone),
        /** A date and time, in the organization's locale. */
        dateTime: (value: string | Date | null | undefined) =>
            formatDateTime(value, locale, timezone),
    };
}
