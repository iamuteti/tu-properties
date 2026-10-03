/**
 * Printable owner statement (Module 6).
 *
 * The module doc asks for a "downloadable statement PDF" and says to check for
 * existing PDF tooling first — there is none in either app, and adding a
 * rendering library for one document is a poor trade. So the server emits a
 * self-contained HTML document with print CSS: the browser's own print dialog
 * turns it into a PDF ("Save as PDF"), and `?download=1` serves it as a file
 * for emailing. It renders identically in every browser, needs no client-side
 * charting or fonts, and stays inspectable when a landlord disputes a line.
 *
 * If a server-side PDF ever becomes a hard requirement (bulk emailing hundreds
 * of owners, for example), this template is the single place to swap in one.
 */

export interface StatementDocumentLine {
  ref: string;
  description: string;
  property?: string | null;
  amount: number;
  /** Income lines are dated by the payment; expense lines by the charge. */
  paymentDate?: string;
  chargeDate?: string;
  category?: string;
}

export interface StatementDocumentInput {
  statementNumber: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  issuedAt: Date | null;
  currency: string;
  grossIncome: number;
  expenses: number;
  managementFee: number;
  carriedForward: number;
  netPayout: number;
  settledAmount: number;
  outstandingAmount: number;
  notes?: string | null;
  incomeLines: StatementDocumentLine[];
  expenseLines: StatementDocumentLine[];
  landlord: {
    code: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    bankName?: string | null;
    accountName?: string | null;
    accountNumber?: string | null;
  };
  organization: {
    name: string;
    legalName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    address?: string | null;
    taxId?: string | null;
  };
  managementFeeRate?: number | null;
  managementFeeType?: string | null;
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

function money(amount: number, currency: string): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${currency} ${Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function day(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

function lineDate(line: StatementDocumentLine): string {
  return line.paymentDate ?? line.chargeDate ?? '';
}

export function renderStatementDocument(input: StatementDocumentInput): string {
  const { landlord, organization, currency, periodStart, periodEnd } = input;

  const incomeRows = input.incomeLines
    .map(
      (line) => `
        <tr>
          <td class="ref">${escapeHtml(line.ref)}</td>
          <td>${escapeHtml(line.property ?? '—')}</td>
          <td>${escapeHtml(lineDate(line))}</td>
          <td class="num">${escapeHtml(money(line.amount, currency))}</td>
        </tr>`,
    )
    .join('');

  const expenseRows = input.expenseLines.length
    ? input.expenseLines
        .map(
          (line) => `
        <tr>
          <td class="ref">${escapeHtml(line.category ?? '—')}</td>
          <td>${escapeHtml(line.description)}${line.property ? ` — ${escapeHtml(line.property)}` : ''}</td>
          <td>${escapeHtml(lineDate(line))}</td>
          <td class="num">${escapeHtml(money(line.amount, currency))}</td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="4" class="empty">No expenses were charged to you in this period.</td></tr>';

  const feeNote =
    input.managementFeeType === 'FIXED'
      ? 'flat fee for the period'
      : input.managementFeeRate
        ? `${input.managementFeeRate}% of rent collected`
        : 'no management fee';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Owner statement ${escapeHtml(input.statementNumber)} — ${escapeHtml(landlord.name)}</title>
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
  .sheet { max-width: 820px; margin: 0 auto; background: #fff; padding: 40px; border: 1px solid #e2e8f0; border-radius: 8px; }
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
  td.ref { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  td.empty { color: #94a3b8; font-style: italic; }
  .totals { margin-top: 12px; margin-left: auto; width: 320px; }
  .totals td { border: none; padding: 4px 8px; }
  .totals tr.grand td { border-top: 2px solid #0f172a; font-weight: 700; font-size: 15px; padding-top: 8px; }
  .totals tr.deduct td { color: #b91c1c; }
  .paid td { color: #15803d; }
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
      <h1>Owner statement</h1>
      <div><strong>${escapeHtml(input.statementNumber)}</strong></div>
      <div class="muted">${escapeHtml(day(periodStart))} — ${escapeHtml(day(periodEnd))}</div>
      <div style="margin-top:6px"><span class="badge">${escapeHtml(input.status)}</span></div>
      ${input.issuedAt ? `<div class="muted">Issued ${escapeHtml(day(input.issuedAt))}</div>` : ''}
    </div>
  </header>

  <section>
    <h2>Statement for</h2>
    <table>
      <tbody>
        <tr>
          <td style="width:120px" class="muted">Landlord</td>
          <td><strong>${escapeHtml(landlord.name)}</strong> (${escapeHtml(landlord.code)})</td>
        </tr>
        <tr>
          <td class="muted">Contact</td>
          <td>${escapeHtml(landlord.email ?? '')}${landlord.phone ? ` · ${escapeHtml(landlord.phone)}` : ''}</td>
        </tr>
        <tr>
          <td class="muted">Address</td>
          <td>${escapeHtml([landlord.address, landlord.city, landlord.country].filter(Boolean).join(', '))}</td>
        </tr>
        <tr>
          <td class="muted">Paid to</td>
          <td>${escapeHtml(
            [landlord.bankName, landlord.accountName, landlord.accountNumber]
              .filter(Boolean)
              .join(' · ') || 'Not on file — please update your bank details',
          )}</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Rental income collected</h2>
    <table>
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Property</th>
          <th>Date</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${incomeRows || '<tr><td colspan="4" class="empty">No rent was collected in this period.</td></tr>'}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Expenses charged to you</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Description</th>
          <th>Date</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${expenseRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Summary</h2>
    <table class="totals">
      <tbody>
        <tr><td>Rent collected</td><td class="num">${escapeHtml(money(input.grossIncome, currency))}</td></tr>
        <tr class="deduct"><td>Expenses charged</td><td class="num">-${escapeHtml(money(input.expenses, currency))}</td></tr>
        <tr class="deduct"><td>Management fee <span class="muted">(${escapeHtml(feeNote)})</span></td><td class="num">-${escapeHtml(money(input.managementFee, currency))}</td></tr>
        <tr class="deduct"><td>Balance brought forward</td><td class="num">-${escapeHtml(money(input.carriedForward, currency))}</td></tr>
        <tr class="grand"><td>Net ${input.netPayout < 0 ? 'owed by you' : 'payable to you'}</td><td class="num">${escapeHtml(money(input.netPayout, currency))}</td></tr>
        <tr class="paid"><td>Already paid against this statement</td><td class="num">${escapeHtml(money(input.settledAmount, currency))}</td></tr>
        <tr><td><strong>Still outstanding</strong></td><td class="num"><strong>${escapeHtml(money(input.outstandingAmount, currency))}</strong></td></tr>
      </tbody>
    </table>
  </section>

  ${input.notes ? `<section><h2>Notes</h2><div>${escapeHtml(input.notes).replace(/\n/g, '<br />')}</div></section>` : ''}

  <footer>
    Generated ${escapeHtml(new Date().toISOString().slice(0, 10))} from rent payments recorded against your properties.
    Figures are derived from the underlying invoices and payments — quote ${escapeHtml(input.statementNumber)} in any query.
  </footer>
</div>
</body>
</html>`;
}
