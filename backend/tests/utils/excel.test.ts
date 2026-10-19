import { describe, it, expect } from 'vitest';
import ExcelJS, { type Cell, type CellValue } from 'exceljs';
import { cellText, normalizeGithubUsername } from '../../src/utils/excel';

const rich = { richText: [{ text: 'https://github.com/' }, { font: { bold: true }, text: 'rivka' }] };

/** Writes each value to an xlsx file and reads it back, as an uploaded file would be. */
async function roundTrip(values: CellValue[]): Promise<string[]> {
  const out = new ExcelJS.Workbook();
  const sheet = out.addWorksheet('T');
  values.forEach((v, i) => { sheet.getCell(i + 1, 1).value = v; });
  const back = new ExcelJS.Workbook();
  await back.xlsx.load((await out.xlsx.writeBuffer()) as ArrayBuffer);
  return values.map((_, i) => cellText(back.getWorksheet('T')!.getCell(i + 1, 1)));
}

describe('cellText', () => {
  it('reads plain text, numbers and booleans as text', async () => {
    expect(await roundTrip(['rivka', 12345, true])).toEqual(['rivka', '12345', 'true']);
  });

  it('reads the shown text of a hyperlink, including one whose text is formatted', async () => {
    expect(await roundTrip([
      { text: 'rivka', hyperlink: 'https://github.com/rivka' },
      { text: rich, hyperlink: 'https://github.com/rivka' } as unknown as CellValue,
    ])).toEqual(['rivka', 'https://github.com/rivka']);
  });

  it('reads rich text and a formula result', async () => {
    expect(await roundTrip([
      rich,
      { formula: 'CONCAT("riv","ka")', result: 'rivka' } as CellValue,
    ])).toEqual(['https://github.com/rivka', 'rivka']);
  });

  // ExcelJS cannot write these shapes, but reads them from real files: a formula whose
  // result is rich text, a link or an error, and a hyperlink whose text is a link.
  it('reads a formula result or link text that is itself an object', () => {
    const read = (value: unknown) => cellText({ value } as Cell);
    expect(read({ formula: 'A1', result: rich })).toBe('https://github.com/rivka');
    expect(read({ formula: 'HYPERLINK("x","rivka")', result: { text: 'rivka', hyperlink: 'x' } })).toBe('rivka');
    expect(read({ formula: 'VLOOKUP(1,B:C,2)', result: { error: '#N/A' } })).toBe('');
    expect(read({ text: { hyperlink: 'https://github.com/rivka' }, hyperlink: 'https://github.com/rivka' })).toBe('https://github.com/rivka');
  });

  it('never turns an unknown value into "[object Object]"', async () => {
    const texts = await roundTrip([{ error: '#N/A' } as CellValue]);
    expect(texts).toEqual(['']);
  });
});

describe('normalizeGithubUsername', () => {
  it('keeps a bare username and extracts one from a profile link', () => {
    expect(normalizeGithubUsername(' @rivka ')).toBe('rivka');
    expect(normalizeGithubUsername('https://github.com/rivka?tab=repositories')).toBe('rivka');
  });
});
