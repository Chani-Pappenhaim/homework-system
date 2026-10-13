import ExcelJS, { type Cell } from 'exceljs';

/**
 * Unwraps an ExcelJS cell value to plain text. ExcelJS returns a plain string
 * only for simple text cells — hyperlinks, rich text, and formula results are
 * returned as objects that would otherwise stringify to "[object Object]".
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

// Extracts a bare GitHub username from either a username or a full profile URL.
export function normalizeGithubUsername(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/github\.com\/([^\/\s?#]+)/i);
  return (match ? match[1] : trimmed).replace(/^@/, '');
}

/**
 * Builds an xlsx template with a header row and one example row. Instructions,
 * when given, go on a second sheet (one line per row) so the first sheet stays
 * the one that is read back.
 */
export async function buildTemplateWorkbook(
  headers: string[], example: (string | number)[], instructions?: string[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Template');
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.addRow(example);
  sheet.columns.forEach((col) => { col.width = 24; });
  if (instructions?.length) {
    const help = workbook.addWorksheet('הוראות', { views: [{ rightToLeft: true }] });
    instructions.forEach((line) => help.addRow([line]));
    help.getRow(1).font = { bold: true };
    help.getColumn(1).width = 90;
  }
  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}
