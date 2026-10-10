export type FileKind = 'image' | 'video' | 'pdf' | 'audio' | 'archive' | 'doc' | 'html' | 'other';

const EXT_MAP: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video', wmv: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', oga: 'audio',
  aac: 'audio', flac: 'audio', wma: 'audio', opus: 'audio', amr: 'audio',
  pdf: 'pdf',
  html: 'html', htm: 'html',
  zip: 'archive', rar: 'archive', '7z': 'archive',
  doc: 'doc', docx: 'doc', ppt: 'doc', pptx: 'doc', xls: 'doc', xlsx: 'doc', txt: 'doc', md: 'doc',
};

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
  + 'Word ו-PowerPoint עד 10MB, Excel עד 5MB (docx, pptx, xlsx וגרסאות ישנות) · HTML · txt ו-md. '
  + 'כל סוג אחר (zip, rar וכדומה) — להורדה בלבד.';

/**
 * The online Office viewer refuses larger files (Word/PowerPoint 10MB, Excel
 * 5MB) and shows nothing useful when it does, so past these sizes the preview
 * says so up front instead of opening an empty frame.
 */
export function officeViewerLimitBytes(ext: string): number {
  return ext === 'xls' || ext === 'xlsx' ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
}
