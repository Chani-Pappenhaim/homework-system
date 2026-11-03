import { cloudinary } from '../config/cloudinary';
import { signFileToken } from './jwt';

/** Recovers a non-ASCII filename (e.g. Hebrew) that multer decodes as latin1 instead of utf8. */
export function fixMulterFilename(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8');
}

export interface UploadedFile {
  url: string;
  bytes: number;
  resourceType: string;
  publicId: string;
}

/** Single home for "put a buffer in Cloudinary". */
export async function uploadBuffer(
  buffer: Buffer,
  mimeType: string,
  folder: string,
  originalName?: string
): Promise<UploadedFile> {
  // A data URI has no filename, and a 'raw' asset (docx/zip/etc.) needs its extension in the public_id
  // or downloads lose their name and type; filename_override supplies the real name.
  const result = await cloudinary.uploader.upload(dataUri(buffer, mimeType), {
    resource_type: 'auto',
    folder,
    ...(originalName ? { use_filename: true, unique_filename: true, filename_override: originalName } : {}),
  });
  return toUploadedFile(result);
}

/** Stores an image as a centered `size`×`size` square; the original and its metadata (camera, location) are not kept. */
export async function uploadSquareImage(
  buffer: Buffer,
  mimeType: string,
  folder: string,
  size: number
): Promise<UploadedFile> {
  const result = await cloudinary.uploader.upload(dataUri(buffer, mimeType), {
    resource_type: 'image',
    folder,
    transformation: [{ width: size, height: size, crop: 'fill' }],
  });
  return toUploadedFile(result);
}

function dataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function toUploadedFile(result: { secure_url: string; bytes: number; resource_type: string; public_id: string }): UploadedFile {
  return {
    url: result.secure_url,
    bytes: result.bytes,
    resourceType: result.resource_type,
    publicId: result.public_id,
  };
}

/**
 * Deletes a stored asset. Destroying with the wrong resource type returns 'not found' without
 * throwing, so the type the URL implies is tried first, then the others.
 */
export async function destroyByUrl(url: string): Promise<void> {
  const key = assetKey(url);
  if (!key) return;
  const bare = key.replace(/\.[^./]+$/, '');
  const guessed = resourceTypeFromUrl(url);
  const candidates = [guessed, 'raw', 'image', 'video']
    .filter((t, i, a) => a.indexOf(t) === i)
    .flatMap((t) => (t === 'raw' ? [key, bare] : [bare]).map((publicId) => ({ publicId, t })))
    .filter((c, i, a) => a.findIndex((o) => o.publicId === c.publicId && o.t === c.t) === i);
  for (const { publicId, t } of candidates) {
    const res = await cloudinary.uploader.destroy(publicId, { resource_type: t });
    if (res?.result === 'ok') return;
  }
}

/** Tag every direct upload carries until the server registers it — see utils/pending-uploads. */
export const PENDING_TAG = 'pending_upload';
export const uploaderTag = (userId: string) => `uploader_${userId}`;

/**
 * Signed params for a direct browser upload into `folder`, so large files never pass through Node.
 * The browser must send every returned param unchanged: `allowedFormats` restricts the file type,
 * and `tags` marks the upload as pending and owned by `uploaderId` until registered, so abandoned
 * uploads can be cleaned up. Without an uploader no tags are signed (for pages loaded before tagging
 * existed); such uploads are only cleaned up when registration fails.
 */
export function createUploadSignature(folder: string, opts: { uploaderId?: string; allowedFormats?: string[] }) {
  const timestamp = Math.round(Date.now() / 1000);
  const allowed = opts.allowedFormats?.join(',');
  const tags = opts.uploaderId ? [PENDING_TAG, uploaderTag(opts.uploaderId)].join(',') : undefined;
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, ...(tags ? { tags } : {}), ...(allowed ? { allowed_formats: allowed } : {}) },
    process.env.CLOUDINARY_API_SECRET as string
  );
  return {
    timestamp,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
    ...(tags ? { tags } : {}),
    ...(allowed ? { allowedFormats: allowed } : {}),
  };
}

/** Whether the URL is a file in our own Cloudinary account inside `folder`; browser-reported URLs must pass this. */
export function isOwnUpload(url: string, folder: string): boolean {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  return parsed.protocol === 'https:'
    && parsed.hostname === 'res.cloudinary.com'
    && parsed.pathname.startsWith(`/${cloud}/`)
    && new RegExp(`/upload/(?:[^/]+/)*${folder}/`).test(parsed.pathname);
}

/** The path, relative to the API root, that serves a study-material file to the holder of `token`. */
export function fileDownloadPath(fileId: string, extension: string, token: string): string {
  const suffix = extension ? `/file.${extension}` : '';
  return `/files/download/${fileId}${suffix}?token=${token}`;
}

/** The short-lived, session-bound download link for a submission's file, instead of a permanent signed Cloudinary URL. */
export function submissionFileLink(
  submission: { id: string; fileUrl: string | null; fileName?: string | null },
  userId: string
): string | null {
  if (!submission.fileUrl) return submission.fileUrl;
  const extension = fileExtension({ url: submission.fileUrl, name: submission.fileName ?? undefined });
  return fileDownloadPath(submission.id, extension, signFileToken({ fileId: submission.id, kind: 'submission', userId }));
}

/** The session-bound download link `viewerId` opens `user`'s profile picture by; null without one. */
export function avatarLink(user: { id: string; avatarUrl: string | null }, viewerId: string): string | null {
  if (!user.avatarUrl) return null;
  const token = signFileToken({ fileId: user.id, kind: 'avatar', userId: viewerId });
  return fileDownloadPath(user.id, fileExtension({ url: user.avatarUrl }), token);
}

// Older uploads have no extension in the URL, so fall back to the stored name.
export function fileExtension(file: { url: string; name?: string }): string {
  return urlExtension(file.url) || urlExtension(file.name ?? '');
}

function urlExtension(url: string): string {
  const match = url.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1]!.toLowerCase() : '';
}

/**
 * Serializable file shape: sizeBytes (BigInt) becomes a string, and `url` becomes a short-lived
 * download link (see files.controller) with `extension` alongside so the client can tell file types apart.
 */
export function toFileDTO<T extends { id: string; sizeBytes?: bigint | null; url?: string; name?: string }>(
  file: T,
  kind: 'lesson' | 'course',
  userId: string
) {
  return {
    ...file,
    sizeBytes: file.sizeBytes?.toString() ?? null,
    ...(file.url
      ? (() => {
          const extension = fileExtension(file as { url: string; name?: string });
          return { url: fileDownloadPath(file.id, extension, signFileToken({ fileId: file.id, kind, userId })), extension };
        })()
      : {}),
  };
}

export function extractPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
  return match ? match[1] : null;
}

/** The stored path after `/upload/` and its version: the public id, plus the extension. */
export function assetKey(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?([^?#]+)$/);
  return match ? match[1]! : null;
}

/** The public id and resource type Cloudinary's API addresses this asset by. */
export function assetRef(url: string): { publicId: string; resourceType: string } | null {
  const key = assetKey(url);
  if (!key) return null;
  const resourceType = resourceTypeFromUrl(url);
  return { publicId: resourceType === 'raw' ? key : key.replace(/\.[^./]+$/, ''), resourceType };
}

export function resourceTypeFromUrl(url: string): string {
  const match = url.match(/\/(image|video|raw)\/upload\//);
  return match ? match[1]! : 'raw';
}

/**
 * A signed delivery URL, since Cloudinary blocks unsigned delivery of 'raw' assets and PDFs.
 * Built from the stored unsigned URL on every read; signed URLs are never persisted.
 */
export function toDeliveryUrl(url: string): string {
  const publicId = extractPublicId(url);
  if (!publicId) return url;
  const formatMatch = url.match(/\.([a-zA-Z0-9]+)$/);
  return cloudinary.url(publicId, {
    resource_type: resourceTypeFromUrl(url),
    format: formatMatch ? formatMatch[1] : undefined,
    secure: true,
    sign_url: true,
  });
}
