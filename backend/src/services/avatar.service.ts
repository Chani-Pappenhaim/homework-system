import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { IMAGE_MIME_TYPES, detectImageFormat } from '../utils/image';
import { destroyByUrl, uploadSquareImage } from '../utils/storage';

const AVATAR_FOLDER = 'avatars';
const AVATAR_SIZE = 256; // px, each side

/**
 * Replaces the user's profile picture with `buffer`, stored as a square
 * thumbnail. The previous picture is deleted from storage once the new one is
 * saved; a picture that never got saved is deleted instead.
 */
export async function setAvatar(userId: string, buffer: Buffer): Promise<void> {
  const format = detectImageFormat(buffer);
  if (!format) throw new AppError('Avatar is not a JPEG/PNG/WEBP image', 'יש להעלות תמונה מסוג JPG, PNG או WEBP', 400);

  const previous = await currentAvatarUrl(userId);
  const uploaded = await uploadSquareImage(buffer, IMAGE_MIME_TYPES[format], AVATAR_FOLDER, AVATAR_SIZE);
  try {
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: uploaded.url } });
  } catch (err) {
    await discard(uploaded.url);
    throw err;
  }
  if (previous) await discard(previous);
}

/** Removes the user's profile picture, from her account and from storage. */
export async function removeAvatar(userId: string): Promise<void> {
  const previous = await currentAvatarUrl(userId);
  if (!previous) return;
  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
  await discard(previous);
}

async function currentAvatarUrl(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  if (!user) throw new AppError('User not found', 'המשתמש לא נמצא', 404);
  return user.avatarUrl;
}

// Best-effort: a storage hiccup must not fail a change that is already saved.
async function discard(url: string): Promise<void> {
  await destroyByUrl(url).catch((e) => console.error('[storage] cleanup failed:', url, e));
}
