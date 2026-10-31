import { setAvatar } from './avatar.service';

const MAX_BYTES = 2 * 1024 * 1024; // same ceiling as an uploaded picture
const FETCH_TIMEOUT_MS = 5000;
const WANTED_SIZE = 256;

/** Google serves profile pictures only from its own image hosts. */
export function isProviderPhotoUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'));
  } catch {
    return false;
  }
}

// The provider's link ends in a size hint ("=s96-c"); ask for the size we store.
function withWantedSize(url: string): string {
  return url.replace(/=s\d+(-c)?$/, `=s${WANTED_SIZE}-c`);
}

/**
 * Gives a user who has no profile picture the one from her Google account, as
 * a copy in our own storage (the provider's link expires and would leak her
 * IP address to Google on every page view). A picture she uploaded herself is
 * never touched. Best-effort: signing in must not fail because of a picture.
 */
export async function adoptProviderAvatar(
  user: { id: string; avatarUrl: string | null },
  photoUrl: string | undefined,
): Promise<void> {
  if (user.avatarUrl || !photoUrl || !isProviderPhotoUrl(photoUrl)) return;
  try {
    const res = await fetch(withWantedSize(photoUrl), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_BYTES) return;
    await setAvatar(user.id, buffer);
  } catch (err) {
    console.error('[avatar] could not copy the Google profile picture:', err);
  }
}
