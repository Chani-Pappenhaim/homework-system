import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import { toDeliveryUrl } from './storage';
import { githubHeaders } from './github';

const CODE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.html', '.css', '.java', '.cs', '.cpp', '.c'];

/** How much of a submission the AI review reads: how many code files, and how large each may be. */
export interface ReviewLimits {
  maxFiles: number;
  /** Bytes, as GitHub and the zip directory report a file's size. */
  maxFileChars: number;
}

// Same caps across every extraction path.
export const DEFAULT_REVIEW_LIMITS: ReviewLimits = { maxFiles: 20, maxFileChars: 5000 };
// For an assignment the teacher marked as a large exercise (one that grows over
// several lessons). About three times the reading, so about three times the
// tokens of a review.
export const LARGE_REVIEW_LIMITS: ReviewLimits = { maxFiles: 50, maxFileChars: 12_000 };

/**
 * Told to the AI after the submission: the code files it was not given. Without
 * it a controller left out for its size reads as a controller never written.
 */
function leftOutNote(tooLarge: string[], overLimit: number, limits: ReviewLimits): string {
  const parts: string[] = [];
  if (tooLarge.length) parts.push(`ארוכים מ-${limits.maxFileChars} תווים: ${tooLarge.join(', ')}`);
  if (overLimit) parts.push(`${overLimit} קבצים נוספים מעבר למגבלה של ${limits.maxFiles} קבצים`);
  return parts.length ? `\n\n[קבצי קוד שלא נכללו בבדיקה - ${parts.join('; ')}]` : '';
}

export async function fetchGithubCode(githubUrl: string, limits: ReviewLimits = DEFAULT_REVIEW_LIMITS): Promise<string> {
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error('Invalid GitHub URL');
  const [, owner, repo] = match;

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  const treeRes = await fetch(apiUrl, { headers: githubHeaders() });
  if (!treeRes.ok) {
    const detail = treeRes.status === 404 ? ` - repo ${owner}/${repo} not found or private` : '';
    throw Object.assign(new Error(`GitHub API error: ${treeRes.status}${detail}`), { status: treeRes.status });
  }
  const tree = await treeRes.json() as any;

  const codeFiles = (tree.tree || []).filter((f: any) =>
    f.type === 'blob' && CODE_EXTENSIONS.some((ext) => f.path.endsWith(ext)) &&
    !f.path.includes('node_modules') && !f.path.includes('.min.')
  );
  // Sorted out by the size the tree reports, before the file limit: a file too
  // large to read must not take the place of one that fits.
  const tooLarge: string[] = codeFiles.filter((f: any) => f.size > limits.maxFileChars).map((f: any) => f.path);
  const fitting = codeFiles.filter((f: any) => !(f.size > limits.maxFileChars));
  const files = fitting.slice(0, limits.maxFiles);

  const contents: string[] = [];
  for (const file of files) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file.path}`;
    const res = await fetch(rawUrl, { headers: { 'User-Agent': 'homework-app' } });
    if (!res.ok) continue;
    const text = await res.text();
    if (text.length > limits.maxFileChars) { tooLarge.push(file.path); continue; }
    contents.push(`--- ${file.path} ---\n${text}`);
  }

  if (!contents.length) return '';
  return contents.join('\n\n') + leftOutNote(tooLarge, fitting.length - files.length, limits);
}

// Word and PowerPoint files inside a zip are read as text too: plenty of
// homework is a written answer, not code. They are zips themselves, so their
// size cap is a file's, not a code file's 5KB; their text gets a cap of its own.
const ZIP_DOCUMENT_EXTENSIONS = ['.docx', '.pptx'];
const ZIP_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const ZIP_DOCUMENT_MAX_CHARS = 20_000;

export async function extractZipCode(buffer: Buffer, limits: ReviewLimits = DEFAULT_REVIEW_LIMITS): Promise<string> {
  const zip = new AdmZip(buffer);
  const isDocument = (name: string) => ZIP_DOCUMENT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
  const tooLarge: string[] = [];
  const readable = zip
    .getEntries()
    .filter((entry) => {
      const name = entry.entryName;
      const baseName = name.split('/').pop() ?? '';
      if (entry.isDirectory || name.includes('node_modules/') || name.includes('dist/') || name.includes('.min.')) return false;
      // macOS resource forks and Word's "~$" lock files look like documents but hold none.
      if (name.startsWith('__MACOSX/') || baseName.startsWith('~$')) return false;
      // Declared (uncompressed) size, read straight from the central
      // directory — rejecting oversized entries here, before getData()
      // inflates them, is what actually stops a zip bomb. Checking the
      // decompressed text's length afterwards is too late: the inflate
      // itself is the memory blowup.
      if (isDocument(name)) return entry.header.size <= ZIP_DOCUMENT_MAX_BYTES;
      if (!CODE_EXTENSIONS.some((ext) => name.endsWith(ext))) return false;
      if (entry.header.size > limits.maxFileChars) { tooLarge.push(name); return false; }
      return true;
    });
  const entries = readable.slice(0, limits.maxFiles);

  const contents: string[] = [];
  for (const entry of entries) {
    let text: string;
    if (isDocument(entry.entryName)) {
      const data = entry.getData();
      // A damaged document is left out; the rest of the zip is still worth reviewing.
      try {
        text = entry.entryName.toLowerCase().endsWith('.docx') ? await extractDocxText(data) : extractPptxText(data);
      } catch {
        continue;
      }
      if (!text.trim()) continue;
      if (text.length > ZIP_DOCUMENT_MAX_CHARS) text = `${text.slice(0, ZIP_DOCUMENT_MAX_CHARS)}\n[...הקובץ קוצר]`;
    } else {
      text = entry.getData().toString('utf8');
    }
    contents.push(`--- ${entry.entryName} ---\n${text}`);
  }

  if (!contents.length) return '';
  return contents.join('\n\n') + leftOutNote(tooLarge, readable.length - entries.length, limits);
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// ---- lesson attachments (quiz generation) ---------------------------------
// Same per-file caps as code extraction above — this feeds the same Gemini
// call budget, just from lesson attachments instead of a submission.
export const ATTACHMENT_MAX_FILES = 10;
const ATTACHMENT_MAX_FILE_CHARS = 5000;
// A file this large is a video or a scanned book, not lesson notes; downloading
// it would only slow the job down to throw most of it away.
const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
// A hung download must not hold the whole generation hostage: each file gets
// its own limit, and all of them together get a second, overall one.
const ATTACHMENT_FETCH_TIMEOUT_MS = 15_000;
const ATTACHMENT_TOTAL_BUDGET_MS = 60_000;
// Slide XML is small; a huge entry is a zip bomb, not a slide.
const PPTX_MAX_SLIDE_BYTES = 1024 * 1024;
// PDFs and images travel inside the Gemini request itself, base64-encoded (a
// third larger). Google refuses a request over 20MB, so all of them together
// must stay well below that once encoded.
export const ATTACHMENT_INLINE_MAX_TOTAL_BYTES = 14 * 1024 * 1024;

/** Read as plain UTF-8 text. */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'xml', 'sql', 'sh', 'yml', 'yaml',
  ...CODE_EXTENSIONS.map((ext) => ext.slice(1)),
]);

/**
 * Sent to Gemini as the file itself rather than as extracted text: Gemini reads
 * PDFs (layout, tables and all) and looks at images natively, so neither needs
 * a parser here. Only the formats Gemini documents as supported are listed.
 */
const INLINE_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/**
 * Whether quiz generation can use this file at all — as text, or handed to
 * Gemini as a file. The teacher's page lists the rest as "not included".
 */
export function isQuizReadableFile(name: string): boolean {
  const ext = extensionOf(name);
  return ext === 'docx' || ext === 'pptx' || TEXT_EXTENSIONS.has(ext) || ext in INLINE_MIME_TYPES;
}

/**
 * The files generation will leave out before reading anything: formats it
 * cannot use, and whatever is past the file limit. What the teacher is told
 * next to the "include files" checkbox.
 */
export function quizExcludedFiles(names: string[]): string[] {
  // Same counting as extractLessonFiles: only usable files count toward the limit.
  let readable = 0;
  return names.filter((name) => !isQuizReadableFile(name) || ++readable > ATTACHMENT_MAX_FILES);
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[lower] ?? whole;
  });
}

/**
 * Text of a PowerPoint deck, slide by slide. A .pptx is a zip whose slides are
 * ppt/slides/slideN.xml; the visible text sits in <a:t> runs, grouped into
 * paragraphs by <a:p>.
 */
export function extractPptxText(buffer: Buffer): string {
  const slideNumber = (entryName: string) => Number(entryName.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
  const slides = new AdmZip(buffer)
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName) && e.header.size <= PPTX_MAX_SLIDE_BYTES)
    .sort((a, b) => slideNumber(a.entryName) - slideNumber(b.entryName));

  return slides
    .map((entry) => {
      const xml = entry.getData().toString('utf8');
      const paragraphs = xml
        .split('</a:p>')
        .map((p) => [...p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]!)).join(''))
        .filter((line) => line.trim());
      return paragraphs.length ? `שקופית ${slideNumber(entry.entryName)}:\n${paragraphs.join('\n')}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

export type SkippedFileReason = 'unsupported' | 'too-large' | 'unreadable' | 'empty' | 'timeout' | 'too-many';

/** A file handed to Gemini as-is (see INLINE_MIME_TYPES). */
export interface InlineAttachment {
  name: string;
  mimeType: string;
  /** base64 */
  data: string;
}

export interface LessonFilesExtraction {
  /** Ready to append to the prompt; empty when no file had text. */
  text: string;
  inline: InlineAttachment[];
  used: string[];
  skipped: { name: string; reason: SkippedFileReason }[];
}

/**
 * Content of lesson files for Gemini (a quiz, or an assignment's AI review), in
 * the order given: text for documents and slides, the file itself for PDFs and
 * images. A file that cannot be used is skipped and reported rather than
 * failing the whole request - the rest is still worth reading.
 */
export async function extractLessonFiles(
  files: { name: string; url: string; sizeBytes?: bigint | number | null }[]
): Promise<LessonFilesExtraction> {
  const result: LessonFilesExtraction = { text: '', inline: [], used: [], skipped: [] };
  const contents: string[] = [];
  const deadline = Date.now() + ATTACHMENT_TOTAL_BUDGET_MS;
  let inlineBytes = 0;
  let attempted = 0;

  for (const file of files) {
    const ext = extensionOf(file.name);
    const skip = (reason: SkippedFileReason) => result.skipped.push({ name: file.name, reason });

    if (!isQuizReadableFile(file.name)) { skip('unsupported'); continue; }
    // Reported, not silently dropped: she should know the eleventh file was not read.
    if (++attempted > ATTACHMENT_MAX_FILES) { skip('too-many'); continue; }
    if (file.sizeBytes != null && Number(file.sizeBytes) > ATTACHMENT_MAX_BYTES) { skip('too-large'); continue; }
    const mimeType = INLINE_MIME_TYPES[ext];
    if (mimeType && file.sizeBytes != null && inlineBytes + Number(file.sizeBytes) > ATTACHMENT_INLINE_MAX_TOTAL_BYTES) {
      skip('too-large');
      continue;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) { skip('timeout'); continue; }

    try {
      const res = await fetch(toDeliveryUrl(file.url), {
        signal: AbortSignal.timeout(Math.min(ATTACHMENT_FETCH_TIMEOUT_MS, remaining)),
      });
      if (!res.ok) { skip('unreadable'); continue; }
      // Older rows have no sizeBytes; the response header is the next best check.
      if (Number(res.headers.get('content-length') ?? 0) > ATTACHMENT_MAX_BYTES) { skip('too-large'); continue; }

      if (mimeType) {
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length === 0) { skip('empty'); continue; }
        // Checked again on the real size: older rows have no sizeBytes.
        if (inlineBytes + buffer.length > ATTACHMENT_INLINE_MAX_TOTAL_BYTES) { skip('too-large'); continue; }
        inlineBytes += buffer.length;
        result.inline.push({ name: file.name, mimeType, data: buffer.toString('base64') });
        result.used.push(file.name);
        continue;
      }

      let text: string;
      if (ext === 'docx') text = await extractDocxText(Buffer.from(await res.arrayBuffer()));
      else if (ext === 'pptx') text = extractPptxText(Buffer.from(await res.arrayBuffer()));
      else text = await res.text();

      if (!text.trim()) { skip('empty'); continue; }
      contents.push(`--- ${file.name} ---\n${text.slice(0, ATTACHMENT_MAX_FILE_CHARS)}`);
      result.used.push(file.name);
    } catch (err: any) {
      skip(err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : 'unreadable');
    }
  }

  result.text = contents.join('\n\n');
  return result;
}
