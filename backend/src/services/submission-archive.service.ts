import archiver from 'archiver';
import { Readable, type Writable } from 'node:stream';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { toDeliveryUrl } from '../utils/storage';
import { ensureExtension } from '../utils/mime';
import { createNameAllocator, safeSegment } from '../utils/archive-names';

export interface ArchiveEntry {
  /** Path inside the archive: "<student>/<file>". */
  path: string;
  /** Where the file is stored. */
  url: string;
}

export interface ArchivePlan {
  /** The archive's own file name, with the extension. */
  fileName: string;
  entries: ArchiveEntry[];
}

const SKIPPED_NOTE_NAME = '_קבצים שלא הורדו.txt';

/**
 * What goes into the archive of one assignment's submitted files: a folder per
 * student, holding her file. Submissions that are only a GitHub link have no
 * file and are left out.
 */
export async function planAssignmentArchive(assignmentId: string): Promise<ArchivePlan> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      title: true,
      submissions: {
        where: { fileUrl: { not: null } },
        select: { fileUrl: true, fileName: true, student: { select: { name: true } } },
        orderBy: { student: { name: 'asc' } },
      },
    },
  });
  if (!assignment) throw new AppError('Assignment not found', 'המטלה לא נמצאה', 404);
  if (assignment.submissions.length === 0) {
    throw new AppError('No files submitted', 'לא הוגשו קבצים למטלה הזו', 404);
  }

  // Two students can share a name, and two files can share a name.
  const allocateFolder = createNameAllocator();
  const entries = assignment.submissions.map((s) => {
    const url = s.fileUrl!;
    const folder = allocateFolder(safeSegment(s.student.name, 'תלמידה'));
    const file = safeSegment(ensureExtension(s.fileName || 'file', url));
    return { path: `${folder}/${file}`, url };
  });
  return { fileName: `${safeSegment(assignment.title, 'הגשות')}.zip`, entries };
}

/**
 * Adds one file to the archive and resolves once the archive has taken all of
 * it, so only one file is in flight at a time and memory stays flat.
 */
function appendAndWait(archive: archiver.Archiver, source: Readable, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      archive.off('entry', onEntry);
      archive.off('error', onError);
      source.off('error', onError);
    };
    const onEntry = (entry: archiver.EntryData) => {
      if (entry.name !== name) return;
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    archive.on('entry', onEntry);
    archive.on('error', onError);
    source.on('error', onError);
    archive.append(source, { name });
  });
}

/** Opens a stored file for reading, or null when it cannot be fetched. */
async function openStoredFile(url: string): Promise<Readable | null> {
  const response = await fetch(toDeliveryUrl(url));
  if (!response.ok || !response.body) return null;
  return Readable.fromWeb(response.body as never);
}

/**
 * Streams the planned files into `out` as a zip. A file that cannot be fetched
 * does not sink the rest: it is left out and named in a note inside the
 * archive. Stops fetching when the reader goes away.
 */
export async function writeArchive(entries: ArchiveEntry[], out: Writable): Promise<void> {
  // Light compression: submissions are mostly formats that are already compressed.
  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.on('warning', (err) => console.warn('[archive] warning', err));
  archive.on('error', (err) => out.destroy(err));
  out.on('close', () => archive.abort());
  archive.pipe(out);

  const skipped: string[] = [];
  for (const entry of entries) {
    if (out.destroyed) break;
    try {
      const source = await openStoredFile(entry.url);
      if (!source) { skipped.push(entry.path); continue; }
      await appendAndWait(archive, source, entry.path);
    } catch (err) {
      console.error('[archive] could not add a file', entry.path, err);
      skipped.push(entry.path);
    }
  }
  if (skipped.length > 0) {
    archive.append(`הקבצים הבאים לא הורדו ויש להוריד אותם ישירות מהמערכת:\r\n${skipped.join('\r\n')}\r\n`, { name: SKIPPED_NOTE_NAME });
  }
  await archive.finalize();
}
