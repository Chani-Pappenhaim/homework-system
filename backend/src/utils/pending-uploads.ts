import { cloudinary } from '../config/cloudinary';
import { PENDING_TAG, assetRef, destroyByUrl, uploaderTag } from './storage';
import { countFileRefs } from './file-refs';

/**
 * Direct browser uploads land in Cloudinary before the server knows about them,
 * tagged as pending and with their uploader (see createUploadSignature). If the
 * server never registers one — it rejected the submission, the request failed,
 * the tab was closed — nothing in the app points at it, and it would sit in
 * storage unseen. These helpers make sure such a file does not stay.
 */

/** Registered: drop the pending tag so the sweep leaves the file alone. Best-effort. */
export async function confirmUpload(url: string): Promise<void> {
  const ref = assetRef(url);
  if (!ref) return;
  try {
    await cloudinary.uploader.remove_tag(PENDING_TAG, [ref.publicId], { resource_type: ref.resourceType });
  } catch (err) {
    // The sweep still finds it referenced and drops the tag then.
    console.error('[storage] failed to confirm upload:', url, err);
  }
}

/**
 * Deletes a direct upload that never got registered — only one the given user
 * uploaded, that is still pending and that no row points at, so it can never
 * remove someone else's file or one already in use. Never throws.
 */
export async function discardPendingUpload(url: string, userId: string): Promise<boolean> {
  const ref = assetRef(url);
  if (!ref) return false;
  try {
    const resource = await cloudinary.api.resource(ref.publicId, { resource_type: ref.resourceType });
    const tags: string[] = resource?.tags ?? [];
    if (!tags.includes(PENDING_TAG) || !tags.includes(uploaderTag(userId))) return false;
    if ((await countFileRefs(url)) > 0) return false;
    await destroyByUrl(url);
    return true;
  } catch (err) {
    console.error('[storage] failed to discard pending upload:', url, err);
    return false;
  }
}

/** Registration follows the upload within seconds; anything this old was abandoned. */
export const PENDING_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Safety net for what the browser could not report: a crash, a killed tab, a
 * dropped connection. Removes pending uploads older than PENDING_MAX_AGE_MS
 * that nothing references, and un-tags the ones that turned out to be in use.
 */
export async function sweepPendingUploads(now = Date.now()): Promise<number> {
  let removed = 0;
  for (const resource_type of ['image', 'video', 'raw']) {
    let next_cursor: string | undefined;
    do {
      const page = await cloudinary.api.resources_by_tag(PENDING_TAG, { resource_type, max_results: 100, next_cursor });
      for (const r of page.resources ?? []) {
        if (now - new Date(r.created_at).getTime() < PENDING_MAX_AGE_MS) continue;
        try {
          if ((await countFileRefs(r.secure_url)) > 0) {
            await cloudinary.uploader.remove_tag(PENDING_TAG, [r.public_id], { resource_type });
          } else {
            await cloudinary.uploader.destroy(r.public_id, { resource_type });
            removed++;
          }
        } catch (err) {
          console.error('[storage] sweep failed for', r.public_id, err);
        }
      }
      next_cursor = page.next_cursor;
    } while (next_cursor);
  }
  if (removed) console.log(`[storage] removed ${removed} abandoned upload(s)`);
  return removed;
}
