import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { aiUsageLog: { create: vi.fn() } },
}));

const extractRawText = vi.fn();
vi.mock('mammoth', () => ({
  default: { extractRawText: (...a: any[]) => extractRawText(...a) },
}));

import AdmZip from 'adm-zip';
import { prisma } from '../../src/config/prisma';
import {
  reviewCode,
  fetchGithubCode,
  extractZipCode,
  extractDocxText,
} from '../../src/services/gemini.service';

const p = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('gemini.service.reviewCode', () => {
  it('parses the Gemini JSON response and logs usage/cost', async () => {
    const geminiJson = JSON.stringify({ code_review: '• fix', verbal_review: 'good work', score: 85 });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: geminiJson }] } }],
        usageMetadata: { promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    p.aiUsageLog.create.mockResolvedValue({});

    const r = await reviewCode('const x=1', 'Task', 'be strict');
    expect(r).toEqual({ codeReview: '• fix', verbalReview: 'good work', score: 85 });
    // cost = 1M/1M*0.10 + 1M/1M*0.40 = 0.5
    expect(p.aiUsageLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'homework_review', costUsd: expect.closeTo(0.5, 5) }),
    }));
  });

  it('throws when the Gemini API responds not-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => 'boom',
    }));
    await expect(reviewCode('x', 'T')).rejects.toThrow(/Gemini API error: 500/);
  });

  it('defaults missing fields to empty/0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }], usageMetadata: {} }),
    }));
    p.aiUsageLog.create.mockResolvedValue({});
    const r = await reviewCode('x', 'T');
    expect(r).toEqual({ codeReview: '', verbalReview: '', score: 0 });
  });
});

describe('gemini.service.fetchGithubCode', () => {
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

describe('gemini.service.extractZipCode', () => {
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

describe('gemini.service.extractDocxText', () => {
  it('delegates to mammoth.extractRawText', async () => {
    extractRawText.mockResolvedValue({ value: 'hello from docx' });
    const r = await extractDocxText(Buffer.from('x'));
    expect(r).toBe('hello from docx');
    expect(extractRawText).toHaveBeenCalledWith({ buffer: expect.any(Buffer) });
  });
});
