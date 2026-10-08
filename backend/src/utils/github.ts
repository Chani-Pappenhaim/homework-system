export type RepoStatus = 'exists' | 'missing' | 'unknown';

/**
 * Checks a public GitHub repo exists. 'unknown' means GitHub couldn't be asked
 * (network block, rate limit, outage) — callers should not reject on it.
 */
export async function getRepoStatus(owner: string, repo: string): Promise<RepoStatus> {
  try {
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'homework-app' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return 'exists';
    if (res.status === 404) return 'missing';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Accepts either a bare repo name or a pasted repo URL ("https://github.com/me/repo.git")
 * and returns just the repo name.
 */
export function normalizeRepoName(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const fromUrl = trimmed.match(/github\.com\/[^/]+\/([^/?#]+)/i);
  return (fromUrl ? fromUrl[1]! : trimmed.split('/').pop() ?? '').trim();
}
