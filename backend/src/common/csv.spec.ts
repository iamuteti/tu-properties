import { parseCsv, toCsv } from './csv';

describe('CSV helpers (bulk import/export)', () => {
  describe('parseCsv', () => {
    it('reads a header row and maps cells onto it', () => {
      const { headers, rows, errors } = parseCsv(
        'code,name\nPR-1,Sunset\nPR-2,Sunrise',
      );

      expect(errors).toEqual([]);
      expect(headers).toEqual(['code', 'name']);
      expect(rows).toEqual([
        { code: 'PR-1', name: 'Sunset' },
        { code: 'PR-2', name: 'Sunrise' },
      ]);
    });

    it('handles quoted fields containing commas, quotes and newlines', () => {
      const { rows } = parseCsv(
        'code,notes\r\nPR-1,"Line one, with comma"\r\nPR-2,"He said ""hi"""\r\nPR-3,"two\nlines"',
      );

      expect(rows[0].notes).toBe('Line one, with comma');
      expect(rows[1].notes).toBe('He said "hi"');
      expect(rows[2].notes).toBe('two\nlines');
    });

    it('tolerates CRLF line endings and a UTF-8 BOM', () => {
      const { rows } = parseCsv('\uFEFFcode,name\r\nPR-1,Sunset\r\n');
      expect(rows).toEqual([{ code: 'PR-1', name: 'Sunset' }]);
    });

    it('skips completely blank lines', () => {
      const { rows } = parseCsv('code,name\nPR-1,Sunset\n\n,\nPR-2,Sunrise\n');
      expect(rows).toHaveLength(2);
    });

    it('reports a row with more cells than headers instead of silently shifting data', () => {
      const { errors } = parseCsv('code,name\nPR-1,Sunset,extra');
      expect(errors[0]).toMatch(/Row 2/);
    });

    it('rejects duplicate headers', () => {
      const { errors } = parseCsv('code,code\nPR-1,PR-2');
      expect(errors[0]).toMatch(/Duplicate column/);
    });

    it('reports an empty file', () => {
      expect(parseCsv('').errors[0]).toMatch(/empty/i);
    });

    it('reports a file with no header row', () => {
      expect(parseCsv(',,\n').errors[0]).toMatch(/no header row/i);
    });
  });

  describe('toCsv', () => {
    it('writes a header row and escapes dangerous values', () => {
      const csv = toCsv(
        ['code', 'notes'],
        [
          { code: 'PR-1', notes: 'has, comma' },
          { code: 'PR-2', notes: 'says "hi"' },
          { code: 'PR-3', notes: null },
        ],
      );

      expect(csv.split('\r\n')).toEqual([
        'code,notes',
        'PR-1,"has, comma"',
        'PR-2,"says ""hi"""',
        'PR-3,',
        '',
      ]);
    });

    it('round-trips through parseCsv', () => {
      const rows = [
        { code: 'PR-1', notes: 'has, comma' },
        { code: 'PR-2', notes: 'plain' },
      ];
      const parsed = parseCsv(toCsv(['code', 'notes'], rows));
      expect(parsed.rows).toEqual(rows);
    });
  });
});
