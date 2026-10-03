/**
 * Minimal RFC 4180 CSV helpers.
 *
 * Properties and units are high-volume import entities (`00-UX-CROSS-CUTTING-
 * STANDARDS.md` requires bulk import for them), so the parsing/serialisation
 * lives on the server: one implementation, one set of rules, and the browser
 * just uploads a file and downloads a report.
 */

export interface CsvParseResult {
  headers: string[];
  /** Row index in the source file (1-based, header is row 1). */
  rows: Record<string, string>[];
  errors: string[];
}

export function parseCsv(input: string): CsvParseResult {
  const text = input.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      field = '';
      records.push(record);
      record = [];
    } else {
      field += char;
    }
  }

  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  if (records.length === 0) {
    return { headers: [], rows: [], errors: ['The uploaded file is empty.'] };
  }

  const headers = records[0].map((header) => header.trim());

  if (headers.length === 0 || headers.every((header) => header === '')) {
    return {
      headers: [],
      rows: [],
      errors: ['The uploaded file has no header row.'],
    };
  }

  const duplicateHeaders = headers.filter(
    (header, index) => header !== '' && headers.indexOf(header) !== index,
  );
  if (duplicateHeaders.length > 0) {
    return {
      headers,
      rows: [],
      errors: [
        `Duplicate column(s) in header row: ${duplicateHeaders.join(', ')}`,
      ],
    };
  }

  const errors: string[] = [];
  const rows: Record<string, string>[] = [];

  records.slice(1).forEach((cells, index) => {
    if (cells.every((cell) => cell.trim() === '')) return;
    if (cells.length > headers.length) {
      errors.push(
        `Row ${index + 2}: expected ${headers.length} column(s), found ${cells.length}.`,
      );
    }
    const row: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      row[header] = (cells[columnIndex] ?? '').trim();
    });
    rows.push(row);
  });

  return { headers, rows, errors };
}

/** Escape a single CSV field (quotes doubled, wrapped when necessary). */
export function csvEscape(value: unknown): string {
  const text = toCellText(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // Objects would stringify to "[object Object]" — write nothing rather than
  // a meaningless cell.
  return '';
}

export function toCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
