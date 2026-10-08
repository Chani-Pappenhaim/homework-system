import { prisma } from '../config/prisma';
import { destroyByUrl } from './storage';

/**
 * Number of course/lesson file rows that still point at a stored asset.
 *
 * Copying a course or lesson reuses the same stored asset instead of uploading
 * it again, so one asset can back several rows. Counting live rows (rather than
 * keeping a stored counter) stays correct through cascade deletes.
 */
export async function countFileRefs(url: string): Promise<number> {
  const [courseRefs, lessonRefs] = await Promise.all([
    prisma.courseFile.count({ where: { url } }),
    prisma.lessonFile.count({ where: { url } }),
  ]);
  return courseRefs + lessonRefs;
}

/**
 * Removes stored assets that no row references anymore. Call after the rows
 * themselves are deleted. Best-effort: never throws, so a storage hiccup can't
 * fail the delete that triggered it.
 */
export async function releaseFileUrls(urls: string[]): Promise<void> {
  for (const url of new Set(urls)) {
    try {
      if ((await countFileRefs(url)) > 0) continue;
      await destroyByUrl(url);
    } catch (err) {
      console.error('[storage] failed to release asset:', url, err);
    }
  }
}
