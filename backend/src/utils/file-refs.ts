import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { destroyByUrl } from './storage';

/**
 * Number of rows (course/lesson files, submissions) that still point at a
 * stored asset.
 *
 * Copying a course or lesson reuses the same stored asset instead of uploading
 * it again, so one asset can back several rows. Counting live rows (rather than
 * keeping a stored counter) stays correct through cascade deletes.
 */
export async function countFileRefs(url: string): Promise<number> {
  const [courseRefs, lessonRefs, submissionRefs] = await Promise.all([
    prisma.courseFile.count({ where: { url } }),
    prisma.lessonFile.count({ where: { url } }),
    prisma.submission.count({ where: { fileUrl: url } }),
  ]);
  return courseRefs + lessonRefs + submissionRefs;
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

/**
 * Stored files of the submissions a cascade delete is about to remove — read
 * before the delete, released after it. The cascade takes the rows but not the
 * files behind them.
 */
export async function submissionFileUrls(where: Prisma.SubmissionWhereInput): Promise<string[]> {
  const rows = await prisma.submission.findMany({ where: { ...where, fileUrl: { not: null } }, select: { fileUrl: true } });
  return rows.map((r) => r.fileUrl!);
}
