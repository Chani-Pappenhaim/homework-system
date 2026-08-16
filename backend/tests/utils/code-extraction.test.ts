import { describe, it, expect, vi, beforeEach } from 'vitest';

const extractRawText = vi.fn();
vi.mock('mammoth', () => ({
  default: { extractRawText: (...a: any[]) => extractRawText(...a) },
}));

import AdmZip from 'adm-zip';
import { fetchGithubCode, extractZipCode, extractDocxText } from '../../src/utils/code-extraction';

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

  it('throws when the tree request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchGithubCode('https://github.com/a/b')).rejects.toThrow(/GitHub API error: 404/);
  });
});

describe('code-extraction.extractZipCode', () => {
  it('extracts only code files and skips node_modules/dist entries', () => {
    const zip = new AdmZip();
    zip.addFile('src/app.ts', Buffer.from('export const a = 1;'));
    zip.addFile('node_modules/x.js', Buffer.from('ignored'));
    zip.addFile('notes.md', Buffer.from('ignored too'));
    const out = extractZipCode(zip.toBuffer());
    expect(out).toContain('--- src/app.ts ---');
    expect(out).toContain('export const a = 1;');
    expect(out).not.toContain('ignored');
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
