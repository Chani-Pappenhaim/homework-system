// Names for the entries of a downloaded archive. They must be safe to extract
// on Windows, macOS and Linux, keep Hebrew readable, and never collide.

const MAX_SEGMENT_LENGTH = 80;
// Windows refuses these as file or folder names, with or without an extension.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * One folder or file name made safe: path separators and characters Windows
 * forbids become "_", control and bidi-override characters are dropped,
 * trailing dots and spaces are trimmed, and a long name is shortened without
 * losing its extension.
 */
export function safeSegment(name: string, fallback = 'file'): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F‎‏‪-‮⁦-⁩]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  if (!cleaned) return fallback;
  const shortened = shorten(cleaned);
  return RESERVED.test(shortened) ? `_${shortened}` : shortened;
}

function shorten(name: string): string {
  if (name.length <= MAX_SEGMENT_LENGTH) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
  return name.slice(0, MAX_SEGMENT_LENGTH - ext.length).trimEnd() + ext;
}

/** Splits "report.pdf" into "report" and ".pdf" ("" when there is no extension). */
function splitExtension(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

/**
 * Hands out names that are unique among everything given out before, ignoring
 * case (a case-insensitive file system would merge "A" and "a"). A repeat gets
 * " (2)", " (3)" ... before its extension.
 */
export function createNameAllocator() {
  const taken = new Set<string>();
  return (wanted: string): string => {
    const [base, ext] = splitExtension(wanted);
    let candidate = wanted;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  };
}
