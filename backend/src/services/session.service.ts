import { prisma } from '../config/prisma';

// How long a user's known tokenVersion is trusted before the next check reads
// it again, so a signed-out device is turned away within this time at most.
const VERSION_CACHE_MS = 30 * 1000;
// lastSeenAt is written at most this often per user, keeping it a cheap update.
const LAST_SEEN_THROTTLE_MS = 2 * 60 * 1000;
// A student seen within this window counts as online on the dashboard.
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

interface CachedVersion { tokenVersion: number; checkedAt: number }

const versions = new Map<string, CachedVersion>();
const lastSeenWrites = new Map<string, number>();

async function readTokenVersion(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
  if (!user) return null;
  versions.set(userId, { tokenVersion: user.tokenVersion, checkedAt: Date.now() });
  return user.tokenVersion;
}

/**
 * Whether a token signed at `tokenVersion` (missing = 0, as in tokens signed
 * before versions were added) still belongs to a live session of the user.
 * A recent matching answer is reused; anything else is read from the database.
 */
export async function isSessionCurrent(userId: string, tokenVersion: number | undefined): Promise<boolean> {
  const version = tokenVersion ?? 0;
  const cached = versions.get(userId);
  if (cached && cached.tokenVersion === version && Date.now() - cached.checkedAt < VERSION_CACHE_MS) return true;
  return (await readTokenVersion(userId)) === version;
}

/**
 * Ends every session of the user, the calling device's included, and returns
 * the new version the caller signs a fresh session with.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  versions.set(userId, { tokenVersion: user.tokenVersion, checkedAt: Date.now() });
  return user.tokenVersion;
}

/** Records that the user is active now, unless that was recorded only moments ago. Never throws. */
export function touchLastSeen(userId: string, now = Date.now()): void {
  const last = lastSeenWrites.get(userId);
  if (last !== undefined && now - last < LAST_SEEN_THROTTLE_MS) return;
  lastSeenWrites.set(userId, now);
  prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date(now) } })
    .catch((err) => console.error('[session] lastSeenAt update failed:', err));
}

/** The students active within the online window, most recent first. */
export async function getOnlineStudents(now = Date.now()) {
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', lastSeenAt: { gte: new Date(now - ONLINE_WINDOW_MS) } },
    select: { id: true, name: true, lastSeenAt: true },
    orderBy: { lastSeenAt: 'desc' },
  });
  return { count: students.length, windowMinutes: ONLINE_WINDOW_MS / 60000, students };
}

/** Forgets the cached versions and write times (tests start from a clean slate). */
export function resetSessionCache(): void {
  versions.clear();
  lastSeenWrites.clear();
}
