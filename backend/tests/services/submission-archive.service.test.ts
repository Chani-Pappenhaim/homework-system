import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({ prisma: { assignment: { findUnique: vi.fn() } } }));
vi.mock('../../src/utils/storage', () => ({ toDeliveryUrl: (url: string) => `delivery:${url}` }));

import JSZip from 'jszip';
import { PassThrough } from 'node:stream';
import { prisma } from '../../src/config/prisma';
import { planAssignmentArchive, writeArchive } from '../../src/services/submission-archive.service';

const p = prisma as any;

function submission(studentName: string, fileName: string | null, fileUrl = `https://cdn/x/${Math.random()}.pdf`) {
  return { fileUrl, fileName, student: { name: studentName } };
}

describe('planAssignmentArchive', () => {
  it('puts each file in a folder named after the student', async () => {
    p.assignment.findUnique.mockResolvedValue({
      title: 'תרגיל 1', submissions: [submission('רחל כהן', 'פתרון.pdf', 'https://cdn/a.pdf'), submission('דנה לוי', 'main.py', 'https://cdn/b.py')],
    });
    const plan = await planAssignmentArchive('asg');
    expect(plan.fileName).toBe('תרגיל 1.zip');
    expect(plan.entries).toEqual([
      { path: 'רחל כהן/פתרון.pdf', url: 'https://cdn/a.pdf' },
      { path: 'דנה לוי/main.py', url: 'https://cdn/b.py' },
    ]);
  });

  it('asks only for submissions that have a file, in student order', async () => {
    p.assignment.findUnique.mockResolvedValue({ title: 't', submissions: [submission('א', 'a.txt')] });
    await planAssignmentArchive('asg');
    const arg = p.assignment.findUnique.mock.calls[0][0];
    expect(arg.select.submissions.where).toEqual({ fileUrl: { not: null } });
    expect(arg.select.submissions.orderBy).toEqual({ student: { name: 'asc' } });
  });

  it('keeps two students with the same name in separate folders', async () => {
    p.assignment.findUnique.mockResolvedValue({
      title: 't', submissions: [submission('דנה', 'a.pdf', 'u1.pdf'), submission('דנה', 'a.pdf', 'u2.pdf'), submission('דנה', 'a.pdf', 'u3.pdf')],
    });
    const paths = (await planAssignmentArchive('asg')).entries.map((e) => e.path);
    expect(paths).toEqual(['דנה/a.pdf', 'דנה (2)/a.pdf', 'דנה (3)/a.pdf']);
  });

  it('treats names that differ only in case as the same folder', async () => {
    p.assignment.findUnique.mockResolvedValue({
      title: 't', submissions: [submission('Dana', 'a.pdf', 'u1.pdf'), submission('dana', 'a.pdf', 'u2.pdf')],
    });
    const paths = (await planAssignmentArchive('asg')).entries.map((e) => e.path);
    expect(new Set(paths.map((x) => x.toLowerCase())).size).toBe(2);
  });

  it('makes unsafe names safe', async () => {
    p.assignment.findUnique.mockResolvedValue({
      title: 'תרגיל: מסכם/סופי?', submissions: [submission('../evil', '..\\..\\x:y.pdf', 'u.pdf')],
    });
    const plan = await planAssignmentArchive('asg');
    expect(plan.fileName).toBe('תרגיל_ מסכם_סופי_.zip');
    expect(plan.entries[0]!.path).toBe('_evil/_.._x_y.pdf');
  });

  it('restores a missing extension from the stored url', async () => {
    p.assignment.findUnique.mockResolvedValue({ title: 't', submissions: [submission('רחל', 'פתרון', 'https://cdn/raw/abc.docx')] });
    expect((await planAssignmentArchive('asg')).entries[0]!.path).toBe('רחל/פתרון.docx');
  });

  it('names a file that has no name', async () => {
    p.assignment.findUnique.mockResolvedValue({ title: 't', submissions: [submission('רחל', null, 'https://cdn/raw/abc.zip')] });
    expect((await planAssignmentArchive('asg')).entries[0]!.path).toBe('רחל/file.zip');
  });

  it('falls back when the student or title has no usable name', async () => {
    p.assignment.findUnique.mockResolvedValue({ title: '...', submissions: [submission('???', 'a.txt', 'u.txt')] });
    const plan = await planAssignmentArchive('asg');
    expect(plan.fileName).toBe('הגשות.zip');
    expect(plan.entries[0]!.path).toBe('___/a.txt');
  });

  it('fails when the assignment does not exist', async () => {
    p.assignment.findUnique.mockResolvedValue(null);
    await expect(planAssignmentArchive('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('fails when nobody submitted a file (github links only)', async () => {
    p.assignment.findUnique.mockResolvedValue({ title: 't', submissions: [] });
    await expect(planAssignmentArchive('asg')).rejects.toMatchObject({ status: 404, clientMessage: 'לא הוגשו קבצים למטלה הזו' });
  });
});

describe('writeArchive', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function run(entries: { path: string; url: string }[]) {
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c) => chunks.push(c));
    const done = new Promise<void>((resolve) => out.on('end', resolve));
    await writeArchive(entries, out);
    await done;
    return JSZip.loadAsync(Buffer.concat(chunks));
  }

  const ok = (text: string) => new Response(text, { status: 200 });

  it('writes the files into the zip under their planned paths, Hebrew included', async () => {
    fetchMock.mockImplementation(async (url: string) => ok(`content of ${url}`));
    const zip = await run([
      { path: 'רחל כהן/פתרון סופי.pdf', url: 'u1' },
      { path: 'דנה/main.py', url: 'u2' },
    ]);
    expect(Object.keys(zip.files).sort()).toEqual(['דנה/main.py', 'רחל כהן/פתרון סופי.pdf'].sort());
    expect(await zip.file('רחל כהן/פתרון סופי.pdf')!.async('string')).toBe('content of delivery:u1');
    expect(await zip.file('דנה/main.py')!.async('string')).toBe('content of delivery:u2');
  });

  it('keeps the rest and names the file that could not be fetched', async () => {
    fetchMock.mockImplementation(async (url: string) => (url === 'delivery:bad' ? new Response('', { status: 404 }) : ok('fine')));
    const zip = await run([{ path: 'א/bad.pdf', url: 'bad' }, { path: 'ב/good.pdf', url: 'good' }]);
    expect(await zip.file('ב/good.pdf')!.async('string')).toBe('fine');
    expect(zip.file('א/bad.pdf')).toBeNull();
    const note = await zip.file('_קבצים שלא הורדו.txt')!.async('string');
    expect(note).toContain('א/bad.pdf');
  });

  it('keeps the rest when a fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'delivery:boom') throw new Error('network');
      return ok('fine');
    });
    const zip = await run([{ path: 'א/boom.pdf', url: 'boom' }, { path: 'ב/good.pdf', url: 'good' }]);
    expect(zip.file('ב/good.pdf')).not.toBeNull();
    expect(await zip.file('_קבצים שלא הורדו.txt')!.async('string')).toContain('א/boom.pdf');
  });

  it('adds no note when everything was fetched', async () => {
    fetchMock.mockImplementation(async () => ok('fine'));
    const zip = await run([{ path: 'א/a.txt', url: 'a' }]);
    expect(Object.keys(zip.files)).toEqual(['א/a.txt']);
  });

  it('fetches one file at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    fetchMock.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ok('x');
    });
    await run([1, 2, 3, 4].map((n) => ({ path: `s${n}/f.txt`, url: `u${n}` })));
    expect(peak).toBe(1);
  });

  it('stops fetching when the reader goes away', async () => {
    fetchMock.mockImplementation(async () => ok('x'));
    const out = new PassThrough();
    out.resume();
    out.destroy();
    await writeArchive([{ path: 'a/a.txt', url: 'a' }, { path: 'b/b.txt', url: 'b' }], out).catch(() => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
