// Mirrors the backend's profile picture rules (middleware/upload.ts, utils/image.ts).
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Up to two initials of a name, for a user without a picture. */
export function initialsOf(name: string): string {
  const letters = name.split(/\s+/).filter(Boolean).map((word) => Array.from(word)[0]);
  return letters.slice(0, 2).join('') || '?';
}

const COLORS = ['bg-clay', 'bg-indigo', 'bg-sage', 'bg-coral'];

/** A background color that is always the same for the same name. */
export function avatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return COLORS[hash % COLORS.length];
}

/** Why a file cannot be a profile picture, or null when it can. */
export function avatarFileProblem(file: File): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return 'יש לבחור תמונה מסוג JPG, PNG או WEBP';
  if (file.size > MAX_AVATAR_BYTES) return 'התמונה גדולה מדי (עד 2MB)';
  return null;
}
