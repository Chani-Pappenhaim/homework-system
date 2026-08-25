import AdmZip from 'adm-zip';
import mammoth from 'mammoth';

// Same caps across every extraction path: max 20 files, max 5KB per file
const CODE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.html', '.css', '.java', '.cs', '.cpp', '.c'];
const MAX_FILES = 20;
const MAX_FILE_CHARS = 5000;

export async function fetchGithubCode(githubUrl: string): Promise<string> {
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error('Invalid GitHub URL');
  const [, owner, repo] = match;

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  const treeRes = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'homework-app' },
  });
  if (!treeRes.ok) throw new Error(`GitHub API error: ${treeRes.status}`);
  const tree = await treeRes.json() as any;

  const files = (tree.tree || []).filter((f: any) =>
    f.type === 'blob' && CODE_EXTENSIONS.some((ext) => f.path.endsWith(ext)) &&
    !f.path.includes('node_modules') && !f.path.includes('.min.')
  ).slice(0, MAX_FILES);

  const contents: string[] = [];
  for (const file of files) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file.path}`;
    const res = await fetch(rawUrl, { headers: { 'User-Agent': 'homework-app' } });
    if (!res.ok) continue;
    const text = await res.text();
    if (text.length > MAX_FILE_CHARS) continue;
    contents.push(`--- ${file.path} ---\n${text}`);
  }

  return contents.join('\n\n');
}

export function extractZipCode(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const entries = zip
    .getEntries()
    .filter((entry) => {
      const name = entry.entryName;
      return (
        !entry.isDirectory &&
        CODE_EXTENSIONS.some((ext) => name.endsWith(ext)) &&
        !name.includes('node_modules/') &&
        !name.includes('dist/') &&
        !name.includes('.min.')
      );
    })
    .slice(0, MAX_FILES);

  const contents: string[] = [];
  for (const entry of entries) {
    const text = entry.getData().toString('utf8');
    if (text.length > MAX_FILE_CHARS) continue;
    contents.push(`--- ${entry.entryName} ---\n${text}`);
  }

  return contents.join('\n\n');
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
