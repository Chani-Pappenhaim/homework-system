import { describe, it, expect, vi, afterEach } from 'vitest';
import { getRepoStatus, githubHeaders, normalizeRepoName } from '../../src/utils/github';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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
  it('checks the public repo page when the API is rate-limited', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 429 }).mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    expect(await getRepoStatus('dina', 'a')).toBe('exists');
    expect(fetchMock.mock.calls[1][0]).toBe('https://github.com/dina/a');
    expect(await getRepoStatus('dina', 'b')).toBe('missing');
  });
  it('is unknown only when both the API and the public page fail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403 }).mockRejectedValueOnce(new Error('blocked'))
      .mockRejectedValueOnce(new Error('blocked')).mockResolvedValueOnce({ ok: false, status: 503 }));
    expect(await getRepoStatus('dina', 'a')).toBe('unknown');
    expect(await getRepoStatus('dina', 'b')).toBe('unknown');
  });
});

describe('githubHeaders', () => {
  it('sends no Authorization header without any credentials', () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GITHUB_CLIENT_ID', '');
    vi.stubEnv('GITHUB_CLIENT_SECRET', '');
    expect(githubHeaders().Authorization).toBeUndefined();
  });
  it('falls back to the OAuth app credentials as Basic auth', () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GITHUB_CLIENT_ID', 'cid');
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'secret');
    expect(githubHeaders().Authorization).toBe(`Basic ${Buffer.from('cid:secret').toString('base64')}`);
  });
  it('authenticates with GITHUB_TOKEN when set', () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
    expect(githubHeaders().Authorization).toBe('Bearer ghp_test');
  });
});
