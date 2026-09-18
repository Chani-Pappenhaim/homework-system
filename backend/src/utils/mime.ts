/**
 * Extension → media type, for files we hand back to the browser ourselves.
 *
 * Cloudinary stores anything it doesn't recognise as a `raw` asset and serves
 * it as `application/octet-stream`. The browser reads that as "unknown binary",
 * so it refuses to preview the file and saves it under a name guessed from the
 * URL. We know the real filename from the database, so its extension is the
 * better source of truth — this map turns it into a type the browser trusts.
 */
const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',

  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',

  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',

  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',

  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  js: 'text/plain; charset=utf-8',
  ts: 'text/plain; charset=utf-8',
  jsx: 'text/plain; charset=utf-8',
  tsx: 'text/plain; charset=utf-8',
  py: 'text/plain; charset=utf-8',
  java: 'text/plain; charset=utf-8',
  cs: 'text/plain; charset=utf-8',
  c: 'text/plain; charset=utf-8',
  cpp: 'text/plain; charset=utf-8',
  html: 'text/plain; charset=utf-8',
  css: 'text/plain; charset=utf-8',
  sql: 'text/plain; charset=utf-8',
};

export function extensionOf(name: string): string {
  const match = name.match(/\.([A-Za-z0-9]+)$/);
  return match ? match[1]!.toLowerCase() : '';
}

export function contentTypeFor(name: string): string {
  return TYPES[extensionOf(name)] ?? 'application/octet-stream';
}

/**
 * What Cloudinary says, unless it says nothing useful.
 *
 * A signed delivery URL carries an explicit format and usually comes back
 * typed correctly, but a `raw` asset still arrives as `application/octet-stream`
 * — "unknown binary", which is what makes a browser refuse to preview a file
 * and a download look like a broken one. The filename we hold is better
 * evidence than that, so it wins over the generic answer only.
 */
export function resolveContentType(upstreamType: string | null, name: string): string {
  const generic = !upstreamType
    || upstreamType.startsWith('application/octet-stream')
    || upstreamType.startsWith('binary/octet-stream');
  if (!generic) return upstreamType;
  return contentTypeFor(name);
}

/**
 * `Content-Disposition` that survives Hebrew filenames.
 *
 * The plain `filename=` parameter is limited to ASCII, so a Hebrew name has to
 * travel in the RFC 5987 `filename*` form. Old clients that ignore `filename*`
 * still get a usable — and crucially, still correctly suffixed — ASCII name.
 */
export function contentDisposition(name: string, mode: 'inline' | 'attachment'): string {
  const ext = extensionOf(name);
  // Anything outside printable ascii, plus the two characters that would end
  // the quoted parameter early.
  const ascii = name.replace(/[^\x20-\x7E]|["\\]/g, '_');
  const fallback = ascii.replace(/^_+$/, '') || (ext ? `file.${ext}` : 'file');
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Restores a missing extension from the stored URL.
 *
 * The upload form defaults the display name to the filename *without* its
 * extension, so a file the teacher named herself is stored as "contract" while
 * the asset behind it is a PDF. Serving that name verbatim is what produced
 * downloads called "contract" that no program would open. The Cloudinary URL
 * still ends in the real extension, so it can be put back.
 */
export function ensureExtension(name: string, source: string): string {
  if (extensionOf(name)) return name;
  const ext = extensionOf(source.split('?')[0] ?? '');
  return ext ? `${name}.${ext}` : name;
}
