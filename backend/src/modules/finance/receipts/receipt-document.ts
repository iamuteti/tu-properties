/**
 * Printable rent receipt.
 *
 * The same reasoning as the owner statement (`statement-document.ts`): there is no
 * PDF library in this stack, and adding one for a single document is a poor trade.
 * So the server emits a self-contained HTML document with print CSS - the browser's
 * own print dialog turns it into a PDF ("Save as PDF"), and `?download=1` serves it
 * as a file for emailing.
 *
 * The reason a receipt needs its own document at all is that a receipt *is* a
 * document: it is what a resident is handed when they pay, and it is what an
 * auditor asks to see. The row on screen - an amount, a date, a method - is not
 * the receipt, because the receipt is the **particulars**: which invoice was
 * settled, what was still owed before it, what the balance became afterwards.
 * Those are the `receiptLines`, and a receipt that does not show them is a
 * receipt that cannot be checked against anything.
 *
 * If a server-side PDF ever becomes a hard requirement (bulk emailing receipts at
 * month end, for example), this template is the single place to swap one in.
 */

export interface ReceiptDocumentLine {
  /** The date on the line - the transaction date, not the recording date. */
  date: string;
  /** The invoice number the line settles. */
  invNo?: string | null;
  /** What the line is for. */
  particular: string;
  /** The invoice's own total. */
  invoiceTotal: number;
  /** How much of it had already been received before this receipt. */
  prevReceipts: number;
  /** What was outstanding on the invoice. */
  amtDue: number;
  /** How much this receipt paid. */
  payment: number;
  /** What was left outstanding afterwards. */
  newBalance: number;
  /** Tax withheld against the payment. */
  whtTax: number;
}

export interface ReceiptDocumentPayment {
  date: string;
  /** The invoice the payment was applied to. Null when it was taken on account. */
  invoiceNumber?: string | null;
  invoiceId?: string | null;
  agreementCode?: string | null;
  method: string;
  reference?: string | null;
  amount: number;
  /** How much of it was actually applied to the invoice. */
  appliedAmount?: number;
}

export interface ReceiptDocumentInput {
  receiptNumber: string;
  receiptType: string;
  receiptCategory: string;
  recordingDate: string;
  recordDate?: string | null;
  bankingDate?: string | null;
  receivedFrom: string;
  paymentMethod: string;
  refNo?: string | null;
  paymentRefNo?: string | null;
  chequeNo?: string | null;
  chequeDate?: string | null;
  paymentBank?: string | null;
  depositIntoAc?: string | null;
  currency: string;
  spotRate?: number | null;
  amountReceived: number;
  amountVatInclusive?: boolean;
  receiptTo?: string | null;
  memo?: string | null;
  notes?: string | null;
  lines: ReceiptDocumentLine[];
  payments: ReceiptDocumentPayment[];
  /**
   * BCP-47 tag for the organization's locale, and its IANA timezone.
   *
   * Both are optional on purpose. A receipt is printed for a person in a
   * particular country, and the two settings that decide how that person
   * expects a date and an amount to look are the organization's, not a
   * constant in this file: "March 3rd" and "3 March" are the same date and
   * only one of them is right for the reader. `null` means "let the runtime
   * decide", which is the correct behaviour and not an omission.
   */
  locale?: string | null;
  timezone?: string | null;
  tenant: {
    code: string;
    accountNumber?: string | null;
    name: string;
    phone?: string | null;
    email?: string | null;
  };
  organization: {
    name: string;
    legalName?: string | null;
    address?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    taxId?: string | null;
  };
}

function escapeHtml(value: unknown): string {
  if (typeof value === 'string') return escapeText(value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return escapeText(String(value));
  }
  // Dates arrive as ISO strings already formatted; anything else (null, an
  // object that slipped through a loose type) renders as nothing rather than
  // as "[object Object]".
  return '';
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(
  amount: number,
  currency: string,
  locale?: string | null,
): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const sign = value < 0 ? '-' : '';
  try {
    // The **ISO code**, not the symbol. A printed receipt is the record a
    // resident keeps and an auditor reads, and "KSh 25,000" is ambiguous
    // the moment it leaves the country that issued it - "KSh" is Kenya's
    // shilling and nothing else, but "$" is five different currencies and
    // "£" is a dozen. The code says exactly which one.
    return (
      sign +
      new Intl.NumberFormat(locale || undefined, {
        style: 'currency',
        currency,
        currencyDisplay: 'code',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(value))
    );
  } catch {
    // An unknown or malformed currency code must not take the document down.
    return `${sign}${currency} ${Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

function day(
  value: string | Date | null | undefined,
  locale?: string | null,
  timezone?: string | null,
): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      dateStyle: 'medium',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function humanise(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function label(value: string | null | undefined): string {
  return escapeHtml(humanise(value));
}

/**
 * The document.
 *
 * Two tables, because a receipt carries two different kinds of detail and
 * flattening them into one loses the sense of each: the **particulars** are what
 * the money was *for* (the invoice, what was owed, what it became), while the
 * **applied payments** are the *movements* that made up the receipt (each one a
 * payment row, with its own method and reference). They are usually the same
 * information seen from two directions, and a receipt that shows only one of them
 * cannot be reconciled against the other.
 */
export function renderReceiptDocument(input: ReceiptDocumentInput): string {
  const { tenant, organization, currency, locale, timezone } = input;

  const appliedTotal = input.payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  );
  const onAccount = Math.max(0, Number(input.amountReceived) - appliedTotal);

  const lineRows = input.lines.length
    ? input.lines
        .map(
          (line) => `
        <tr>
          <td class="ref">${escapeHtml(day(line.date, locale, timezone))}</td>
          <td class="ref">${escapeHtml(line.invNo ?? '—')}</td>
          <td>${escapeHtml(line.particular)}</td>
          <td class="num">${escapeHtml(money(line.invoiceTotal, currency, locale))}</td>
          <td class="num">${escapeHtml(money(line.prevReceipts, currency, locale))}</td>
          <td class="num">${escapeHtml(money(line.amtDue, currency, locale))}</td>
          <td class="num strong">${escapeHtml(money(line.payment, currency, locale))}</td>
          <td class="num">${escapeHtml(money(line.newBalance, currency, locale))}</td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="8" class="empty">This receipt was recorded on account and was not applied to an invoice.</td></tr>';

  const paymentRows = input.payments.length
    ? input.payments
        .map(
          (payment) => `
        <tr>
          <td class="ref">${escapeHtml(day(payment.date, locale, timezone))}</td>
          <td class="ref">${escapeHtml(payment.invoiceNumber ?? 'On account')}</td>
          <td>${label(payment.method)}</td>
          <td>${escapeHtml(payment.reference ?? '—')}</td>
          <td class="num strong">${escapeHtml(money(payment.amount, currency, locale))}</td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="5" class="empty">No payments were applied to this receipt.</td></tr>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt ${escapeHtml(input.receiptNumber)} — ${escapeHtml(tenant.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #f8fafc;
    font-size: 13px;
    line-height: 1.5;
  }
  .sheet { max-width: 860px; margin: 0 auto; background: #fff; padding: 40px; border: 1px solid #e2e8f0; border-radius: 8px; }
  header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #64748b; }
  .right { text-align: right; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e2e8f0; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
  section { margin-top: 28px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #475569; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.strong { font-weight: 600; }
  td.ref { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  td.empty { color: #94a3b8; font-style: italic; }
  .fields { width: 100%; }
  .fields td { border: none; padding: 3px 8px 3px 0; }
  .fields td.k { color: #64748b; width: 170px; }
  .totals { margin-top: 12px; margin-left: auto; width: 340px; }
  .totals td { border: none; padding: 4px 8px; }
  .totals tr.grand td { border-top: 2px solid #0f172a; font-weight: 700; font-size: 15px; padding-top: 8px; }
  .totals tr.onaccount td { color: #b45309; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11px; }
  @media print {
    body { background: #fff; padding: 0; font-size: 11px; }
    .sheet { border: none; border-radius: 0; padding: 0; max-width: none; }
  }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <div>
      <h1>${escapeHtml(organization.legalName || organization.name)}</h1>
      <div class="muted">${escapeHtml(organization.address ?? '')}</div>
      <div class="muted">${escapeHtml(organization.contactEmail ?? '')}${organization.contactPhone ? ` · ${escapeHtml(organization.contactPhone)}` : ''}</div>
      ${organization.taxId ? `<div class="muted">Tax ID: ${escapeHtml(organization.taxId)}</div>` : ''}
    </div>
    <div class="right">
      <h1>Rent receipt</h1>
      <div><strong>${escapeHtml(input.receiptNumber)}</strong></div>
      <div class="muted">${escapeHtml(day(input.recordingDate, locale, timezone))}</div>
      <div style="margin-top:6px"><span class="badge">${label(input.receiptCategory)}</span></div>
      <div class="muted">${label(input.receiptType)}</div>
    </div>
  </header>

  <section>
    <h2>Received from</h2>
    <table class="fields">
      <tbody>
        <tr>
          <td class="k">Tenant</td>
          <td><strong>${escapeHtml(tenant.name)}</strong> (${escapeHtml(tenant.code)})</td>
        </tr>
        <tr>
          <td class="k">Account number</td>
          <td>${escapeHtml(tenant.accountNumber ?? '—')}</td>
        </tr>
        <tr>
          <td class="k">Contact</td>
          <td>${escapeHtml(tenant.phone ?? '')}${tenant.email ? ` · ${escapeHtml(tenant.email)}` : ''}</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Payment details</h2>
    <table class="fields">
      <tbody>
        <tr><td class="k">Method</td><td>${label(input.paymentMethod)}</td></tr>
        <tr><td class="k">Reference</td><td>${escapeHtml(input.refNo ?? input.paymentRefNo ?? '—')}</td></tr>
        ${input.chequeNo ? `<tr><td class="k">Cheque</td><td>${escapeHtml(input.chequeNo)} — ${escapeHtml(day(input.chequeDate, locale, timezone))}</td></tr>` : ''}
        ${input.paymentBank ? `<tr><td class="k">Bank</td><td>${escapeHtml(input.paymentBank)}</td></tr>` : ''}
        ${input.depositIntoAc ? `<tr><td class="k">Account</td><td>${escapeHtml(input.depositIntoAc)}</td></tr>` : ''}
        ${input.recordDate ? `<tr><td class="k">Received on</td><td>${escapeHtml(day(input.recordDate, locale, timezone))}</td></tr>` : ''}
        ${input.bankingDate ? `<tr><td class="k">Banked on</td><td>${escapeHtml(day(input.bankingDate, locale, timezone))}</td></tr>` : ''}
        <tr><td class="k">Currency</td><td>${escapeHtml(currency)}</td></tr>
        <tr><td class="k">Amount VAT inclusive</td><td>${input.amountVatInclusive === false ? 'No' : 'Yes'}</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Particulars</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Invoice</th>
          <th>Particular</th>
          <th class="num">Invoice total</th>
          <th class="num">Previously received</th>
          <th class="num">Amount due</th>
          <th class="num">Payment</th>
          <th class="num">New balance</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Applied payments</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Applied to</th>
          <th>Method</th>
          <th>Reference</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Summary</h2>
    <table class="totals">
      <tbody>
        <tr><td>Total received</td><td class="num">${escapeHtml(money(Number(input.amountReceived), currency, locale))}</td></tr>
        <tr><td>Applied to invoices</td><td class="num">${escapeHtml(money(appliedTotal, currency, locale))}</td></tr>
        ${onAccount > 0 ? `<tr class="onaccount"><td>On account</td><td class="num">${escapeHtml(money(onAccount, currency, locale))}</td></tr>` : ''}
        <tr class="grand"><td>Amount received</td><td class="num">${escapeHtml(money(Number(input.amountReceived), currency, locale))}</td></tr>
      </tbody>
    </table>
  </section>

  ${
    input.memo || input.notes
      ? `<section><h2>Notes</h2><div>${escapeHtml(input.memo || input.notes || '').replace(/\n/g, '<br />')}</div></section>`
      : ''
  }

  <footer>
    Generated ${escapeHtml(day(new Date(), locale, timezone))} from receipt ${escapeHtml(input.receiptNumber)}.
    This receipt is a record of money received; the particulars above are the invoices it settled.
  </footer>
</div>
</body>
</html>`;
}
