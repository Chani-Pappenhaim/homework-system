import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdmZip from 'adm-zip';

vi.mock('../../src/utils/storage', () => ({ uploadBuffer: vi.fn(), destroyByUrl: vi.fn() }));

import { destroyByUrl, uploadBuffer } from '../../src/utils/storage';
import { fileToMarkdown } from '../../src/utils/content-convert';

const upload = uploadBuffer as unknown as ReturnType<typeof vi.fn>;
const destroy = destroyByUrl as unknown as ReturnType<typeof vi.fn>;
// A 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const NAMESPACES = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  wpg: 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
};

/** A .docx whose body is the given WordprocessingML, with optional pictures under word/media. */
function docxOf(body: string, media: Record<string, Buffer> = {}): Buffer {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + '<Default Extension="emf" ContentType="image/x-emf"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
  zip.addFile('_rels/.rels', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
  zip.addFile('word/_rels/document.xml.rels', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + Object.keys(media).map((name, i) => `<Relationship Id="rIdM${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`).join('')
    + '</Relationships>'));
  for (const [name, data] of Object.entries(media)) zip.addFile(`word/media/${name}`, data);
  const ns = Object.entries(NAMESPACES).map(([k, v]) => ` xmlns:${k}="${v}"`).join('');
  zip.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document${ns}><w:body>${body}</w:body></w:document>`));
  return zip.toBuffer();
}

const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const mr = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`;
const picture = (rid: string) => `<pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic>`;
const drawing = (graphicData: string) =>
  `<w:r><w:drawing><wp:anchor><wp:docPr id="1" name="d"/><a:graphic><a:graphicData uri="x">${graphicData}</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;

describe('Word documents the plain conversion lost parts of', () => {
  const savedCloud = process.env.CLOUDINARY_CLOUD_NAME;
  beforeEach(() => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { process.env.CLOUDINARY_CLOUD_NAME = savedCloud; vi.restoreAllMocks(); });

  it('keeps a table as a Markdown table, its first row the header', async () => {
    const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
    const md = await fileToMarkdown('t.docx', docxOf(
      `<w:tbl><w:tr>${cell('שם')}${cell('ציון')}</w:tr><w:tr>${cell('א | ב')}${cell('90')}</w:tr></w:tbl>${para('אחרי הטבלה')}`));
    expect(md).toBe('| שם | ציון |\n| --- | --- |\n| א \\| ב | 90 |\n\nאחרי הטבלה');
  });

  it('keeps an equation inside a sentence, written as LaTeX', async () => {
    const md = await fileToMarkdown('t.docx', docxOf(
      '<w:p><w:r><w:t xml:space="preserve">הנוסחה </w:t></w:r>'
      + `<m:oMath><m:f><m:num>${mr('a')}</m:num><m:den>${mr('2')}</m:den></m:f></m:oMath>`
      + '<w:r><w:t xml:space="preserve"> כאן</w:t></w:r></w:p>'));
    expect(md).toBe('הנוסחה $$\\frac{a}{2}$$ כאן');
  });

  it('keeps an equation on its own line as a formula block', async () => {
    const md = await fileToMarkdown('t.docx', docxOf(
      `<w:p><m:oMathPara><m:oMath><m:sSup><m:e>${mr('E')}</m:e><m:sup>${mr('2')}</m:sup></m:sSup></m:oMath></m:oMathPara></w:p>${para('סוף')}`));
    expect(md).toBe('$$\n{E}^{2}\n$$\n\nסוף');
  });

  it('prefers the equation of a compatibility block over the picture of it', async () => {
    const md = await fileToMarkdown('t.docx', docxOf(
      `<w:p><mc:AlternateContent><mc:Choice Requires="a14"><m:oMath>${mr('x')}</m:oMath></mc:Choice>`
      + '<mc:Fallback><w:r><w:t>תמונה</w:t></w:r></mc:Fallback></mc:AlternateContent></w:p>'));
    expect(md).toBe('$$x$$');
  });

  it('keeps text wrapped in tags mammoth does not know, instead of cutting it out', async () => {
    const md = await fileToMarkdown('t.docx', docxOf(
      `${para('התחלה')}<w:customXml w:element="x"><w:p><w:dir w:val="rtl"><w:r><w:t>אמצע</w:t></w:r></w:dir></w:p></w:customXml>`
      + '<w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>סוף הקובץ</w:t></w:r></w:fldSimple></w:p>'));
    expect(md).toBe('התחלה\n\nאמצע\n\nסוף הקובץ');
  });

  it('keeps the text of a modern text box', async () => {
    const md = await fileToMarkdown('t.docx', docxOf(
      `<w:p>${drawing('<wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>בתוך תיבה</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp>')}</w:p>`));
    expect(md).toBe('בתוך תיבה');
  });

  it('finds a picture inside a group of shapes', async () => {
    const md = await fileToMarkdown('t.docx', docxOf(
      `<w:p>${drawing(`<wpg:wgp><wpg:grpSpPr/>${picture('rIdM0')}</wpg:wgp>`)}</w:p>`, { 'image1.png': PNG }));
    expect(md).toContain(`data:image/png;base64,${PNG.toString('base64')}`);
  });

  it('rejects a file that is not really a Word document with a 400', async () => {
    await expect(fileToMarkdown('t.docx', Buffer.from('plain text'))).rejects.toMatchObject({ status: 400 });
  });
});

describe('pictures browsers do not show (EMF/WMF)', () => {
  const savedCloud = process.env.CLOUDINARY_CLOUD_NAME;
  const EMF = Buffer.from('not really an emf');
  const doc = () => docxOf(`<w:p>${drawing(picture('rIdM0'))}</w:p>`, { 'image1.emf': EMF });
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { process.env.CLOUDINARY_CLOUD_NAME = savedCloud; vi.restoreAllMocks(); });

  it('links the stored picture as a PNG when the storage converts it', async () => {
    upload.mockResolvedValue({ url: 'https://res.cloudinary.com/demo/image/upload/v1/content-images/a.emf', resourceType: 'image' });
    expect(await fileToMarkdown('t.docx', doc())).toBe('![](https://res.cloudinary.com/demo/image/upload/v1/content-images/a.png)');
  });

  it('says a picture is missing, rather than showing an empty box, when it cannot be converted', async () => {
    upload.mockResolvedValue({ url: 'https://res.cloudinary.com/demo/raw/upload/v1/content-images/a.emf', resourceType: 'raw' });
    destroy.mockResolvedValue(undefined);
    expect(await fileToMarkdown('t.docx', doc())).toBe('*[כאן מופיעה בקובץ המקורי תמונה בפורמט EMF, שהדפדפן לא מציג]*');
    expect(destroy).toHaveBeenCalledWith('https://res.cloudinary.com/demo/raw/upload/v1/content-images/a.emf');
  });

  it('never inlines it, since it would not display', async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    expect(await fileToMarkdown('t.docx', doc())).not.toContain('data:');
  });
});
