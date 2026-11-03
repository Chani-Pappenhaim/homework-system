/**
 * Extension → media type for files we serve ourselves. Cloudinary serves unrecognised files as
 * `application/octet-stream`, which browsers will not preview, so the stored filename's extension is used instead.
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

/** Cloudinary's content type, unless it is the generic `application/octet-stream` (e.g. a `raw` asset), in which case the filename decides. */
export function resolveContentType(upstreamType: string | null, name: string): string {
  const generic = !upstreamType
    || upstreamType.startsWith('application/octet-stream')
    || upstreamType.startsWith('binary/octet-stream');
  if (!generic) return upstreamType;
  return contentTypeFor(name);
}

/** `Content-Disposition` that survives Hebrew filenames: RFC 5987 `filename*`, with an ASCII fallback that keeps the extension. */
export function contentDisposition(name: string, mode: 'inline' | 'attachment'): string {
  const ext = extensionOf(name);
  // Non-printable-ASCII characters, plus those that would end the quoted parameter early.
  const ascii = name.replace(/[^\x20-\x7E]|["\\]/g, '_');
  const fallback = ascii.replace(/^_+$/, '') || (ext ? `file.${ext}` : 'file');
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Restores a missing extension from the stored URL, since display names are saved without one. */
export function ensureExtension(name: string, source: string): string {
  if (extensionOf(name)) return name;
  const ext = extensionOf(source.split('?')[0] ?? '');
  return ext ? `${name}.${ext}` : name;
}
