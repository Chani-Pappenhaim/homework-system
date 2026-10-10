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

type NamedCourse = { id: string; name: string; createdAt?: string; groupName?: string; year?: string };

function byCreation(a: NamedCourse, b: NamedCourse): number {
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);
}

function joinSlug(...parts: (string | undefined)[]): string {
  return parts.map((p) => slugify(p ?? '')).filter(Boolean).join('-');
}

/**
 * Each course's address segment: its name, and when another course shares the
 * name, its group too — then the year, if the same group has both. Whatever is
 * still shared after that gets a number, in creation order so it stays put when
 * more courses are added; the address of every course is always unique.
 */
export function courseSlugs(courses: NamedCourse[]): Map<string, string> {
  const sorted = [...courses].sort(byCreation);
  const nameCount = new Map<string, number>();
  for (const c of sorted) {
    const base = slugify(c.name) || 'course';
    nameCount.set(base, (nameCount.get(base) ?? 0) + 1);
  }
  const groupCount = new Map<string, number>();
  for (const c of sorted) {
    const base = slugify(c.name) || 'course';
    if (nameCount.get(base)! > 1) {
      const key = joinSlug(base, c.groupName);
      groupCount.set(key, (groupCount.get(key) ?? 0) + 1);
    }
  }

  const used = new Set<string>();
  const slugs = new Map<string, string>();
  for (const c of sorted) {
    let base = slugify(c.name) || 'course';
    if (nameCount.get(base)! > 1) {
      const withGroup = joinSlug(base, c.groupName);
      base = groupCount.get(withGroup)! > 1 ? joinSlug(withGroup, c.year) : withGroup;
    }
    let slug = base;
    for (let n = 2; used.has(slug) || RESERVED.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    slugs.set(c.id, slug);
  }
  return slugs;
}

/**
 * The segments the earlier scheme gave — the name plus a bare number — so
 * addresses saved before groups were added to the segment still find the
 * course they meant.
 */
export function legacyCourseSlugs(courses: NamedCourse[]): Map<string, string> {
  return courseSlugs(courses.map(({ id, name, createdAt }) => ({ id, name, createdAt })));
}

/** The lesson's segment: its number in the course, then its topic. */
export function lessonSegment(lessonNumber: number, topic: string): string {
  const slug = slugify(topic);
  return slug ? `${lessonNumber}-${slug}` : String(lessonNumber);
}
