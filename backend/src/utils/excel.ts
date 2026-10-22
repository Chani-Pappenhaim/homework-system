import ExcelJS, { type Cell } from 'exceljs';

/**
 * Unwraps an ExcelJS cell value to plain text. ExcelJS returns a plain string
 * only for simple text cells — hyperlinks, rich text, and formula results are
 * returned as objects that would otherwise stringify to "[object Object]".
 */
export function cellText(cell: Cell): string {
  return valueText(cell.value);
}

/**
 * A cell value as text. Hyperlink text and formula results can themselves be rich text,
 * a link or an error object, so each nested value is read the same way; an unknown
 * object becomes '' rather than "[object Object]".
 */
function valueText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v !== 'object') return String(v);
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.richText)) return o.richText.map((r: { text?: unknown }) => valueText(r.text)).join('');
  if ('text' in o) {
    const text = valueText(o.text);
    if (text) return text;
  }
  if ('result' in o) return valueText(o.result);
  if ('hyperlink' in o) return valueText(o.hyperlink);
  return '';
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
 * A right-to-left sheet for an export: a bold header row that stays in view
 * while scrolling, and the given column widths.
 */
export function addReportSheet(workbook: ExcelJS.Workbook, name: string, columns: { header: string; width: number }[]) {
  const sheet = workbook.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  });
  return sheet;
}

const israelClockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/**
 * A moment as the clock read in Israel at the time. Excel cells have no time
 * zone, so a stored UTC time would otherwise show two or three hours off.
 */
export function israelClock(date: Date): Date {
  const p = Object.fromEntries(israelClockFormat.formatToParts(date).map((part) => [part.type, part.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second));
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
