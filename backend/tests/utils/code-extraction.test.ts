import { describe, it, expect, vi, beforeEach } from 'vitest';

const extractRawText = vi.fn();
vi.mock('mammoth', () => ({
  default: { extractRawText: (...a: any[]) => extractRawText(...a) },
}));

import AdmZip from 'adm-zip';
import {
  fetchGithubCode, extractZipCode, extractDocxText, extractPptxText, extractLessonFiles, quizExcludedFiles,
  ATTACHMENT_MAX_FILES, ATTACHMENT_INLINE_MAX_TOTAL_BYTES, LARGE_REVIEW_LIMITS,
} from '../../src/utils/code-extraction';

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('code-extraction.fetchGithubCode', () => {
  it('throws on an invalid GitHub URL', async () => {
    await expect(fetchGithubCode('https://example.com/foo')).rejects.toThrow('Invalid GitHub URL');
  });

  it('fetches the tree then raw file contents, skipping node_modules', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tree: [
            { type: 'blob', path: 'index.js' },
            { type: 'blob', path: 'node_modules/dep.js' },
            { type: 'blob', path: 'readme.txt' }, // not a code ext
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, text: async () => 'console.log(1)' });
    vi.stubGlobal('fetch', fetchMock);

    const r = await fetchGithubCode('https://github.com/dina/repo');
    expect(r).toContain('--- index.js ---');
    expect(r).toContain('console.log(1)');
    expect(r).not.toContain('node_modules');
    // tree + exactly one raw file fetch
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps files too large to read from taking the place of ones that fit, and tells the AI what it left out', async () => {
    const tree = [
      { type: 'blob', path: 'a-big.js', size: 9000 },
      ...Array.from({ length: 3 }, (_, i) => ({ type: 'blob', path: `f${i}.js`, size: 10 })),
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tree }) })
      .mockResolvedValue({ ok: true, text: async () => 'x()' });
    vi.stubGlobal('fetch', fetchMock);

    const r = await fetchGithubCode('https://github.com/dina/repo', { maxFiles: 2, maxFileChars: 5000 });
    expect(r).toContain('--- f0.js ---');
    expect(r).toContain('--- f1.js ---');
    expect(r).not.toContain('--- f2.js ---');
    // The large file was never downloaded.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r).toContain('[קבצי קוד שלא נכללו בבדיקה - ארוכים מ-5000 תווים: a-big.js; 1 קבצים נוספים מעבר למגבלה של 2 קבצים]');
  });

  it('reads a file of a large exercise that the default limit leaves out', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tree: [{ type: 'blob', path: 'controller.js', size: 9000 }] }) })
      .mockResolvedValue({ ok: true, text: async () => 'y'.repeat(9000) });
    vi.stubGlobal('fetch', fetchMock);

    const r = await fetchGithubCode('https://github.com/dina/repo', LARGE_REVIEW_LIMITS);
    expect(r).toContain('--- controller.js ---');
    expect(r).not.toContain('לא נכללו');
  });

  it('throws when the tree request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchGithubCode('https://github.com/a/b')).rejects.toThrow(/GitHub API error: 404/);
  });
});

describe('code-extraction.extractZipCode', () => {
  it('extracts only code files and skips node_modules/dist entries', async () => {
    const zip = new AdmZip();
    zip.addFile('src/app.ts', Buffer.from('export const a = 1;'));
    zip.addFile('node_modules/x.js', Buffer.from('ignored'));
    zip.addFile('notes.md', Buffer.from('ignored too'));
    const out = await extractZipCode(zip.toBuffer());
    expect(out).toContain('--- src/app.ts ---');
    expect(out).toContain('export const a = 1;');
    expect(out).not.toContain('ignored');
  });

  it('tells the AI which code files in the zip were too large to read', async () => {
    const zip = new AdmZip();
    zip.addFile('big.js', Buffer.from('z'.repeat(6000)));
    zip.addFile('small.js', Buffer.from('ok()'));
    const out = await extractZipCode(zip.toBuffer());
    expect(out).toBe('--- small.js ---\nok()\n\n[קבצי קוד שלא נכללו בבדיקה - ארוכים מ-5000 תווים: big.js]');
    expect(await extractZipCode(zip.toBuffer(), LARGE_REVIEW_LIMITS)).toContain('--- big.js ---');
  });

  it('reads Word and PowerPoint files inside the zip as text', async () => {
    extractRawText.mockResolvedValue({ value: 'תשובה לשאלה 1' });
    const zip = new AdmZip();
    zip.addFile('answers/hw1.docx', Buffer.from('docx bytes'));
    zip.addFile('slides.pptx', pptx({ 'slide1.xml': slideXml(['שקף ראשון']) }));
    const out = await extractZipCode(zip.toBuffer());
    expect(out).toContain('--- answers/hw1.docx ---\nתשובה לשאלה 1');
    expect(out).toContain('--- slides.pptx ---');
    expect(out).toContain('שקף ראשון');
  });

  it('skips Word lock files, macOS copies and damaged documents, keeping the rest', async () => {
    extractRawText.mockRejectedValueOnce(new Error('corrupt'));
    const zip = new AdmZip();
    zip.addFile('broken.docx', Buffer.from('x'));
    zip.addFile('~$hw1.docx', Buffer.from('lock'));
    zip.addFile('__MACOSX/._hw1.docx', Buffer.from('fork'));
    zip.addFile('main.py', Buffer.from('print(1)'));
    const out = await extractZipCode(zip.toBuffer());
    expect(out).toBe('--- main.py ---\nprint(1)');
    expect(extractRawText).toHaveBeenCalledTimes(1);
  });

  it('cuts a very long document short', async () => {
    extractRawText.mockResolvedValue({ value: 'א'.repeat(25_000) });
    const zip = new AdmZip();
    zip.addFile('long.docx', Buffer.from('x'));
    const out = await extractZipCode(zip.toBuffer());
    expect(out.length).toBeLessThan(21_000);
    expect(out).toContain('[...הקובץ קוצר]');
  });
});

describe('code-extraction.extractDocxText', () => {
  it('delegates to mammoth.extractRawText', async () => {
    extractRawText.mockResolvedValue({ value: 'hello from docx' });
    const r = await extractDocxText(Buffer.from('x'));
    expect(r).toBe('hello from docx');
    expect(extractRawText).toHaveBeenCalledWith({ buffer: expect.any(Buffer) });
  });
});

/** A minimal .pptx: only the slide XML entries the extractor reads. */
function pptx(slides: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, xml] of Object.entries(slides)) zip.addFile(`ppt/slides/${name}`, Buffer.from(xml));
  return zip.toBuffer();
}

const slideXml = (...paragraphs: string[][]) =>
  `<p:sld>${paragraphs.map((runs) => `<a:p>${runs.map((t) => `<a:r><a:t>${t}</a:t></a:r>`).join('')}</a:p>`).join('')}</p:sld>`;

describe('code-extraction.extractPptxText', () => {
  it('reads the slides in numeric order, joining runs into paragraphs', () => {
    const text = extractPptxText(pptx({
      'slide10.xml': slideXml(['עשר']),
      'slide2.xml': slideXml(['לולאת ', 'for'], ['שורה שנייה']),
    }));
    expect(text).toBe('שקופית 2:\nלולאת for\nשורה שנייה\n\nשקופית 10:\nעשר');
  });

  it('decodes XML entities and skips empty slides', () => {
    const text = extractPptxText(pptx({
      'slide1.xml': slideXml(['a &lt; b &amp;&amp; c &#x5D0;']),
      'slide2.xml': '<p:sld></p:sld>',
    }));
    expect(text).toBe('שקופית 1:\na < b && c א');
  });
});

describe('code-extraction.quizExcludedFiles', () => {
  it('lists unusable formats', () => {
    expect(quizExcludedFiles(['a.docx', 'b.pdf', 'c.zip', 'd.mp4', 'e.PNG', 'f.doc'])).toEqual(['c.zip', 'd.mp4', 'f.doc']);
  });

  it('lists usable files past the limit, counting only usable ones toward it', () => {
    const usable = Array.from({ length: ATTACHMENT_MAX_FILES + 2 }, (_, i) => `${i}.txt`);
    expect(quizExcludedFiles(['x.zip', ...usable])).toEqual([
      'x.zip', `${ATTACHMENT_MAX_FILES}.txt`, `${ATTACHMENT_MAX_FILES + 1}.txt`,
    ]);
  });
});

describe('code-extraction.extractLessonFiles', () => {
  const body = (content: string | Buffer, headers: Record<string, string> = {}) => {
    const buf = typeof content === 'string' ? Buffer.from(content) : content;
    return {
      ok: true,
      headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
      text: async () => buf.toString('utf8'),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    };
  };
  const file = (name: string, sizeBytes?: number) => ({ name, url: `https://files.test/${name}`, sizeBytes });

  it('reads text files into the prompt and hands PDFs and images to Gemini as files', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake');
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('.pdf') ? body(pdf) : url.endsWith('.png') ? body(Buffer.from([1, 2, 3])) : body('print(1)')
    ));
    const r = await extractLessonFiles([file('notes.pdf'), file('main.py'), file('diagram.png')]);
    expect(r.text).toBe('--- main.py ---\nprint(1)');
    expect(r.inline).toEqual([
      { name: 'notes.pdf', mimeType: 'application/pdf', data: pdf.toString('base64') },
      { name: 'diagram.png', mimeType: 'image/png', data: Buffer.from([1, 2, 3]).toString('base64') },
    ]);
    expect(r.used).toEqual(['notes.pdf', 'main.py', 'diagram.png']);
    expect(r.skipped).toEqual([]);
  });

  it('reads a PowerPoint deck as text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(body(pptx({ 'slide1.xml': slideXml(['משתנים']) }))));
    const r = await extractLessonFiles([file('lesson.pptx')]);
    expect(r.text).toBe('--- lesson.pptx ---\nשקופית 1:\nמשתנים');
  });

  it('reports what it left out and why, without downloading unusable files', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('broken.txt')) return { ...body(''), ok: false };
      if (url.endsWith('slow.txt')) throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      return body('   ');
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await extractLessonFiles([
      file('code.zip'), file('huge.txt', 50 * 1024 * 1024), file('broken.txt'), file('slow.txt'), file('blank.txt'),
    ]);
    expect(r.skipped).toEqual([
      { name: 'code.zip', reason: 'unsupported' },
      { name: 'huge.txt', reason: 'too-large' },
      { name: 'broken.txt', reason: 'unreadable' },
      { name: 'slow.txt', reason: 'timeout' },
      { name: 'blank.txt', reason: 'empty' },
    ]);
    expect(r.used).toEqual([]);
    // Neither the zip nor the oversized file was downloaded.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops at the file limit and says so for each file past it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => body('x')));
    const files = Array.from({ length: ATTACHMENT_MAX_FILES + 1 }, (_, i) => file(`${i}.md`));
    const r = await extractLessonFiles(files);
    expect(r.used).toHaveLength(ATTACHMENT_MAX_FILES);
    expect(r.skipped).toEqual([{ name: `${ATTACHMENT_MAX_FILES}.md`, reason: 'too-many' }]);
  });

  it('keeps PDFs and images together under the request size Gemini accepts', async () => {
    const half = ATTACHMENT_INLINE_MAX_TOTAL_BYTES / 2 + 1;
    const fetchMock = vi.fn(async () => body(Buffer.alloc(half, 1)));
    vi.stubGlobal('fetch', fetchMock);
    // The second is refused before download when its size is known, after it when not.
    const r = await extractLessonFiles([file('a.pdf', half), file('b.pdf', half), file('c.pdf')]);
    expect(r.used).toEqual(['a.pdf']);
    expect(r.skipped).toEqual([{ name: 'b.pdf', reason: 'too-large' }, { name: 'c.pdf', reason: 'too-large' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
