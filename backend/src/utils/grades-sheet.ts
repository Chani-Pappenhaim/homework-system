import ExcelJS from 'exceljs';
import { AppError } from './errors';
import { cellText } from './excel';

// The grades sheet the teacher downloads, fills in and uploads back. Column
// numbers are 1-based, as ExcelJS counts them.
const COLUMN = { name: 1, email: 2, status: 3, submissionScore: 4, contentScore: 5, feedback: 6 } as const;
const HEADERS = ['שם התלמידה', 'מייל התלמידה', 'סטטוס הגשה', 'ציון הגשה', 'ציון תוכן', 'משוב'];
const WIDTHS = [24, 30, 16, 12, 12, 60];

export interface GradesSheetStudent {
  name: string;
  email: string;
  status: string;
  submissionScore: number | null;
  contentScore: number | null;
  feedback: string | null;
}

/** A filled-in row of the sheet. A field left blank is `undefined`: leave it as it is. */
export interface GradesSheetRow {
  rowNumber: number;
  email: string;
  submissionScore?: number;
  contentScore?: number;
  feedback?: string;
}

export interface ParsedGradesSheet {
  rows: GradesSheetRow[];
  /** Rows with nothing to apply (a listed student the teacher left alone). */
  empty: number;
  /** Hebrew, one per problem row. */
  errors: string[];
}

/** The sheet to fill in: one row per student, with the grades she already has. */
export async function buildGradesWorkbook(title: string, students: GradesSheetStudent[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ציונים', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  for (const s of students) sheet.addRow([s.name, s.email, s.status, s.submissionScore ?? '', s.contentScore ?? '', s.feedback ?? '']);
  WIDTHS.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  sheet.getColumn(COLUMN.feedback).alignment = { wrapText: true, vertical: 'top' };

  const help = workbook.addWorksheet('הוראות', { views: [{ rightToLeft: true }] });
  for (const line of [
    `ציונים למטלה "${title}"`,
    'כל שורה היא תלמידה בקורס. ממלאים ציון הגשה, ציון תוכן ומשוב, ומעלים את הקובץ בחזרה.',
    'התלמידה מזוהה לפי המייל - אין לשנות אותו. השם והסטטוס הם להתמצאות בלבד.',
    'ציון הוא מספר בין 0 ל-100. תא ריק משאיר את הערך הקיים כמות שהוא.',
    'אי אפשר לתת ציון למי שלא הגישה.',
    'לפני השמירה תוצג סקירה של השינויים והשגיאות.',
  ]) help.addRow([line]);
  help.getRow(1).font = { bold: true };
  help.getColumn(1).width = 100;
  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

/** A score cell as a number in range: `undefined` when blank, a string when it cannot be one. */
function parseScore(text: string, label: string): number | undefined | string {
  if (!text) return undefined;
  const value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > 100) return `${label} "${text}" אינו מספר בין 0 ל-100`;
  return value;
}

/** The rows of an uploaded grades sheet. Throws when the file is not one. */
export async function readGradesSheet(buffer: Buffer): Promise<ParsedGradesSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new AppError('Unreadable workbook', 'לא הצלחנו לקרוא את הקובץ. יש להעלות קובץ אקסל (xlsx.)', 400);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError('Empty workbook', 'הקובץ ריק', 400);
  if (cellText(sheet.getRow(1).getCell(COLUMN.email)).trim() !== HEADERS[COLUMN.email - 1]) {
    throw new AppError('Not the grades sheet', 'הקובץ אינו תבנית הציונים. יש להוריד את התבנית מהמערכת, למלא אותה ולהעלות אותה', 400);
  }

  const rows: GradesSheetRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let empty = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const email = cellText(row.getCell(COLUMN.email)).trim().toLowerCase();
    const submissionScore = parseScore(cellText(row.getCell(COLUMN.submissionScore)).trim(), 'ציון ההגשה');
    const contentScore = parseScore(cellText(row.getCell(COLUMN.contentScore)).trim(), 'ציון התוכן');
    const feedback = cellText(row.getCell(COLUMN.feedback)).trim();

    const problems = [submissionScore, contentScore].filter((v): v is string => typeof v === 'string');
    const hasValue = problems.length > 0 || submissionScore !== undefined || contentScore !== undefined || feedback !== '';
    if (!hasValue) { empty++; return; }
    if (!email) { errors.push(`שורה ${rowNumber}: חסר מייל`); return; }
    if (seen.has(email)) { errors.push(`שורה ${rowNumber}: ${email} מופיעה יותר מפעם אחת בקובץ`); return; }
    seen.add(email);
    if (problems.length > 0) { problems.forEach((p) => errors.push(`שורה ${rowNumber}: ${p}`)); return; }

    rows.push({
      rowNumber, email,
      submissionScore: submissionScore as number | undefined,
      contentScore: contentScore as number | undefined,
      feedback: feedback || undefined,
    });
  });
  return { rows, empty, errors };
}
