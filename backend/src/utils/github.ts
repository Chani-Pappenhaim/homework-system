export type RepoStatus = 'exists' | 'missing' | 'unknown';

/**
 * Headers for GitHub REST API calls. Unauthenticated calls share a 60/hour limit
 * per IP — on a shared host (Render) that is exhausted by other tenants, every
 * call comes back 403 and repo checks silently degrade to 'unknown'.
 *
 * Authenticating as the GitHub-login OAuth app (its existing client ID/secret as
 * Basic auth, which GitHub allows for reading public data) raises that to
 * 5000/hour with no extra setup. GITHUB_TOKEN, if set, takes precedence.
 */
export function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'homework-app' };
  const token = process.env.GITHUB_TOKEN?.trim();
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (clientId && clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }
  return headers;
}

async function statusFrom(url: string, init: RequestInit): Promise<RepoStatus> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
    if (res.ok) return 'exists';
    if (res.status === 404) return 'missing';
    console.warn(`[github] ${url} got ${res.status}`);
    return 'unknown';
  } catch (err) {
    console.warn(`[github] ${url} failed`, err);
    return 'unknown';
  }
}

/**
 * Checks a public GitHub repo exists. The REST API is asked first; when it
 * can't answer (rate limit, outage) the repo's public page is tried, which
 * GitHub serves under separate limits — a private or missing repo is a 404
 * there too. 'unknown' means neither could be reached, so the repo was not
 * verified either way.
 */
export async function getRepoStatus(owner: string, repo: string): Promise<RepoStatus> {
  const path = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const fromApi = await statusFrom(`https://api.github.com/repos/${path}`, { headers: githubHeaders() });
  if (fromApi !== 'unknown') return fromApi;
  return statusFrom(`https://github.com/${path}`, { method: 'HEAD', headers: { 'User-Agent': 'homework-app' }, redirect: 'follow' });
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

const GITHUB_NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * Reads a repo reference typed by a person: a bare repo name, "owner/repo",
 * or a pasted repo URL. The owner is left out when only a name was given.
 * Returns null when the text is not a valid GitHub repo reference.
 */
export function parseRepoRef(input: string): { owner?: string; repo: string } | null {
  const trimmed = input.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const fromUrl = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)/i);
  const parts = fromUrl ? [fromUrl[1]!, fromUrl[2]!.replace(/\.git$/i, '')] : trimmed.split('/');
  if (parts.length > 2 || !parts.every((p) => GITHUB_NAME.test(p))) return null;
  return parts.length === 2 ? { owner: parts[0], repo: parts[1]! } : { repo: parts[0]! };
}
