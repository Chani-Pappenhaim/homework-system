/**
 * Readable address segments built from names — `תחביר בסיסי` → `תחביר-בסיסי`.
 * Hebrew stays Hebrew (browsers show it as is in the address bar); niqqud,
 * punctuation and spaces collapse into single dashes.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '') // niqqud and cantillation marks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Segments the course routes already use for something else. */
const RESERVED = new Set(['new']);

type NamedCourse = { id: string; name: string; createdAt?: string };

/**
 * Each course's address segment. Two courses with the same name are told apart
 * by a number, given in creation order so it stays put when more are added.
 */
export function courseSlugs(courses: NamedCourse[]): Map<string, string> {
  const sorted = [...courses].sort((a, b) =>
    (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  const used = new Set<string>();
  const slugs = new Map<string, string>();
  for (const c of sorted) {
    const base = slugify(c.name) || 'course';
    let slug = base;
    for (let n = 2; used.has(slug) || RESERVED.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    slugs.set(c.id, slug);
  }
  return slugs;
}

/** The lesson's segment: its number in the course, then its topic. */
export function lessonSegment(lessonNumber: number, topic: string): string {
  const slug = slugify(topic);
  return slug ? `${lessonNumber}-${slug}` : String(lessonNumber);
}
