import { describe, it, expect, vi, afterEach } from 'vitest';
import { getRepoStatus, normalizeRepoName } from '../../src/utils/github';

afterEach(() => vi.unstubAllGlobals());

describe('normalizeRepoName', () => {
  it('keeps a bare repo name', () => {
    expect(normalizeRepoName('  my-repo ')).toBe('my-repo');
  });
  it('extracts the repo from a pasted URL', () => {
    expect(normalizeRepoName('https://github.com/dina/my-repo.git')).toBe('my-repo');
    expect(normalizeRepoName('github.com/dina/my-repo/')).toBe('my-repo');
  });
  it('takes the last segment of owner/repo', () => {
    expect(normalizeRepoName('dina/my-repo')).toBe('my-repo');
  });
});

describe('getRepoStatus', () => {
  it('maps 200 to exists and 404 to missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, status: 200 }).mockResolvedValueOnce({ ok: false, status: 404 }));
    expect(await getRepoStatus('dina', 'a')).toBe('exists');
    expect(await getRepoStatus('dina', 'b')).toBe('missing');
  });
  it('is unknown on a rate limit or network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 403 }).mockRejectedValueOnce(new Error('blocked')));
    expect(await getRepoStatus('dina', 'a')).toBe('unknown');
    expect(await getRepoStatus('dina', 'b')).toBe('unknown');
  });
});
