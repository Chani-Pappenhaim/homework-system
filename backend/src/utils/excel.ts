import ExcelJS, { type Cell } from 'exceljs';

/**
 * ExcelJS gives back a plain string only for a "plain text" cell. If Excel
 * auto-linked the cell (e.g. a GitHub URL/username pasted in and turned into
 * a hyperlink) the value is `{text, hyperlink}`; rich text is `{richText:[...]}`;
 * a formula result is `{formula, result}`. Reading any of those with
 * `String(cell.value)` produces the literal text "[object Object]" — this is
 * the single place that unwraps all of them to plain text.
 */
export function cellText(cell: Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('text' in v && typeof (v as any).text === 'string') return (v as any).text;
    if ('richText' in v && Array.isArray((v as any).richText)) {
      return (v as any).richText.map((r: any) => r.text ?? '').join('');
    }
    if ('result' in v) return String((v as any).result ?? '');
    if ('hyperlink' in v) return String((v as any).hyperlink ?? '');
    return '';
  }
  return String(v);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

// A GitHub username, not a full URL: letters/digits/hyphens, no slashes.
// Teachers sometimes paste the full profile URL instead — strip it down.
export function normalizeGithubUsername(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/github\.com\/([^\/\s?#]+)/i);
  return (match ? match[1] : trimmed).replace(/^@/, '');
}

/** A tiny one-sheet xlsx: a header row plus one example row, for "download a sample file" links next to Excel imports. */
export async function buildTemplateWorkbook(headers: string[], example: (string | number)[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Template');
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.addRow(example);
  sheet.columns.forEach((col) => { col.width = 24; });
  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}
