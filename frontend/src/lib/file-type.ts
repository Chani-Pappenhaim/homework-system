export type FileKind = 'image' | 'video' | 'pdf' | 'audio' | 'archive' | 'doc' | 'html' | 'other';

const EXT_MAP: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video', wmv: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', oga: 'audio',
  aac: 'audio', flac: 'audio', wma: 'audio', opus: 'audio', amr: 'audio',
  pdf: 'pdf',
  html: 'html', htm: 'html',
  zip: 'archive', rar: 'archive', '7z': 'archive',
  doc: 'doc', docx: 'doc', docm: 'doc', dotx: 'doc', odt: 'doc', rtf: 'doc',
  ppt: 'doc', pptx: 'doc', pptm: 'doc', pps: 'doc', ppsx: 'doc', potx: 'doc', odp: 'doc',
  xls: 'doc', xlsx: 'doc', xlsm: 'doc', xlsb: 'doc', ods: 'doc',
  txt: 'doc', md: 'doc', csv: 'doc', log: 'doc', json: 'doc', xml: 'doc', yml: 'doc', yaml: 'doc', ini: 'doc',
  js: 'doc', jsx: 'doc', ts: 'doc', tsx: 'doc', css: 'doc', scss: 'doc', py: 'doc', java: 'doc', cs: 'doc',
  c: 'doc', cpp: 'doc', h: 'doc', go: 'doc', rb: 'doc', php: 'doc', kt: 'doc', swift: 'doc', sql: 'doc', sh: 'doc',
};

/** Opened through the online Office viewer. */
export const OFFICE_EXTENSIONS = new Set([
  'doc', 'docx', 'docm', 'dotx', 'odt', 'rtf',
  'ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'potx', 'odp',
  'xls', 'xlsx', 'xlsm', 'xlsb', 'ods',
]);

/** Plain text read and shown as is (code left-to-right, prose in its own direction). */
export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'log', 'json', 'xml', 'yml', 'yaml', 'ini',
  'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'py', 'java', 'cs', 'c', 'cpp', 'h', 'go', 'rb', 'php', 'kt', 'swift', 'sql', 'sh',
]);

export function getExtension(name: string): string {
  const match = name.match(/\.([^.]+)$/);
  return match ? match[1]!.toLowerCase() : '';
}

export function getFileKind(name: string): FileKind {
  return EXT_MAP[getExtension(name)] ?? 'other';
}

export function getFileKindByExtension(ext: string): FileKind {
  return EXT_MAP[ext.toLowerCase()] ?? 'other';
}

/** Shown next to material uploads, so a teacher knows up front what students can open in place. */
export const PREVIEWABLE_TYPES_HINT =
  'תצוגה מקדימה באתר: PDF · תמונות (jpg, png, gif, webp, svg) · וידאו (mp4, webm, mov) · שמע (mp3, wav, m4a, ogg) · '
  + 'Word ו-PowerPoint עד 10MB, Excel עד 5MB (docx, pptx, ppsx, xlsx, גרסאות ישנות ו-OpenOffice) · HTML · '
  + 'טקסט וקוד (txt, md, csv, json, py, js, java, cs, sql ועוד). '
  + 'כל סוג אחר (zip, rar וכדומה) — להורדה בלבד.';

/**
 * The online Office viewer refuses larger files (Word/PowerPoint 10MB, Excel
 * 5MB) and shows nothing useful when it does, so past these sizes the preview
 * says so up front instead of opening an empty frame.
 */
export function officeViewerLimitBytes(ext: string): number {
  return ['xls', 'xlsx', 'xlsm', 'xlsb', 'ods'].includes(ext) ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
}
