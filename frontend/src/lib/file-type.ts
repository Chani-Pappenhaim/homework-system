export type FileKind = 'image' | 'video' | 'pdf' | 'audio' | 'archive' | 'doc' | 'other';

const EXT_MAP: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video', wmv: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio',
  pdf: 'pdf',
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
