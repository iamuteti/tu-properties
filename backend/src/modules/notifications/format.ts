/**
 * Money for message bodies.
 *
 * A notification saying "Rent of 1,234.5678 is due" is worse than no
 * notification, and a decimal separator is not a formatting detail you can
 * settle at the call site when a reminder body is assembled in four places. The
 * organization is not threaded into the formatter, so this is plain and
 * consistent: two decimals and thousands separators.
 */
export function money(value: number | string): string {
  return Number(value).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
