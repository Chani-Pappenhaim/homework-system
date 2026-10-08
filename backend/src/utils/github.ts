export type RepoStatus = 'exists' | 'missing' | 'unknown';

/**
 * Headers for GitHub REST API calls. Unauthenticated calls share a 60/hour limit
 * per IP — on a shared host (Render) that is exhausted by other tenants, every
 * call comes back 403 and repo checks silently degrade to 'unknown'. A token
 * (any fine-grained PAT, no scopes needed for public repos) raises it to 5000/hour.
 */
export function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'homework-app' };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Checks a public GitHub repo exists. 'unknown' means GitHub couldn't be asked
 * (network block, rate limit, outage) — callers should not reject on it.
 */
export async function getRepoStatus(owner: string, repo: string): Promise<RepoStatus> {
  try {
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return 'exists';
    if (res.status === 404) return 'missing';
    console.warn(`[github] repo check for ${owner}/${repo} got ${res.status} — accepting without verification`);
    return 'unknown';
  } catch (err) {
    console.warn(`[github] repo check for ${owner}/${repo} failed — accepting without verification`, err);
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
