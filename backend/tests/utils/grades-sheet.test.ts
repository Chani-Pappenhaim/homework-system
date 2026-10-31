import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildGradesWorkbook, readGradesSheet } from '../../src/utils/grades-sheet';

const HEADER = ['שם התלמידה', 'מייל התלמידה', 'סטטוס הגשה', 'ציון הגשה', 'ציון תוכן', 'משוב'];

async function sheetOf(rows: unknown[][], header: unknown[] = HEADER): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ציונים');
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

describe('readGradesSheet', () => {
  it('reads filled-in rows', async () => {
    const out = await readGradesSheet(await sheetOf([['רחל', 'Rachel@X.com', 'הגישה', 90, 85.5, 'כל הכבוד']]));
    expect(out.errors).toEqual([]);
    expect(out.rows).toEqual([{ rowNumber: 2, email: 'rachel@x.com', submissionScore: 90, contentScore: 85.5, feedback: 'כל הכבוד' }]);
  });

  it('leaves a blank cell as undefined, meaning unchanged', async () => {
    const out = await readGradesSheet(await sheetOf([['רחל', 'r@x.com', 'הגישה', '', 70, '']]));
    expect(out.rows[0]).toEqual({ rowNumber: 2, email: 'r@x.com', submissionScore: undefined, contentScore: 70, feedback: undefined });
  });

  it('accepts scores typed as text, with a decimal comma', async () => {
    const out = await readGradesSheet(await sheetOf([['רחל', 'r@x.com', '', '80', '72,5', '']]));
    expect(out.rows[0]).toMatchObject({ submissionScore: 80, contentScore: 72.5 });
  });

  it('accepts the limits 0 and 100', async () => {
    const out = await readGradesSheet(await sheetOf([['א', 'a@x.com', '', 0, 100, '']]));
    expect(out.rows[0]).toMatchObject({ submissionScore: 0, contentScore: 100 });
  });

  it('counts a listed student with nothing filled in as empty', async () => {
    const out = await readGradesSheet(await sheetOf([['רחל', 'r@x.com', 'לא הגישה', '', '', ''], ['דנה', 'd@x.com', 'הגישה', '', 60, '']]));
    expect(out.empty).toBe(1);
    expect(out.rows).toHaveLength(1);
  });

  it('reports a score above 100', async () => {
    const out = await readGradesSheet(await sheetOf([['רחל', 'r@x.com', '', 101, '', '']]));
    expect(out.rows).toEqual([]);
    expect(out.errors).toEqual(['שורה 2: ציון ההגשה "101" אינו מספר בין 0 ל-100']);
  });

  it('reports a negative score', async () => {
    const out = await readGradesSheet(await sheetOf([['רחל', 'r@x.com', '', '', -1, '']]));
    expect(out.errors).toEqual(['שורה 2: ציון התוכן "-1" אינו מספר בין 0 ל-100']);
  });

  it('reports a score that is not a number', async () => {
    const out = await readGradesSheet(await sheetOf([['רחל', 'r@x.com', '', 'מצוין', '', '']]));
    expect(out.errors).toEqual(['שורה 2: ציון ההגשה "מצוין" אינו מספר בין 0 ל-100']);
  });

  it('reports both bad scores of one row', async () => {
    const out = await readGradesSheet(await sheetOf([['רחל', 'r@x.com', '', 200, 'x', '']]));
    expect(out.errors).toHaveLength(2);
  });

  it('reports a filled-in row without an email', async () => {
    const out = await readGradesSheet(await sheetOf([['רחל', '', '', 90, '', '']]));
    expect(out.errors).toEqual(['שורה 2: חסר מייל']);
  });

  it('reports an email that appears twice, keeping the first', async () => {
    const out = await readGradesSheet(await sheetOf([['א', 'a@x.com', '', 90, '', ''], ['א', 'A@x.com', '', 80, '', '']]));
    expect(out.rows).toHaveLength(1);
    expect(out.errors).toEqual(['שורה 3: a@x.com מופיעה יותר מפעם אחת בקובץ']);
  });

  it('reads a hyperlinked email as text', async () => {
    const out = await readGradesSheet(await sheetOf([['א', { text: 'a@x.com', hyperlink: 'mailto:a@x.com' }, '', 90, '', '']]));
    expect(out.rows[0]?.email).toBe('a@x.com');
  });

  it('refuses a file that is not an Excel workbook', async () => {
    await expect(readGradesSheet(Buffer.from('not a workbook'))).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a workbook that is not the grades sheet', async () => {
    const buffer = await sheetOf([['x', 'y']], ['עמודה', 'אחרת']);
    await expect(readGradesSheet(buffer)).rejects.toMatchObject({ status: 400 });
  });
});

describe('buildGradesWorkbook', () => {
  it('lists the students with their grades, and can be read back as unchanged input', async () => {
    const buffer = await buildGradesWorkbook('תרגיל 1', [
      { name: 'רחל', email: 'r@x.com', status: 'הגישה', submissionScore: 90, contentScore: null, feedback: 'יפה' },
      { name: 'דנה', email: 'd@x.com', status: 'לא הגישה', submissionScore: null, contentScore: null, feedback: null },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['ציונים', 'הוראות']);
    expect(wb.worksheets[0]!.getRow(2).values).toEqual([undefined, 'רחל', 'r@x.com', 'הגישה', 90, '', 'יפה']);

    const read = await readGradesSheet(buffer);
    expect(read.errors).toEqual([]);
    expect(read.rows).toEqual([{ rowNumber: 2, email: 'r@x.com', submissionScore: 90, contentScore: undefined, feedback: 'יפה' }]);
    expect(read.empty).toBe(1);
  });
});
