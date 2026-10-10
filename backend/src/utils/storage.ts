import { cloudinary } from '../config/cloudinary';
import { signFileToken } from './jwt';

/**
 * Multer/busboy decode multipart `filename` headers as latin1, not utf8, so a
 * non-ASCII original filename (e.g. Hebrew) arrives mojibake'd on
 * `req.file.originalname`. Re-decoding the bytes as utf8 recovers it.
 */
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
  // A base64 data URI carries no filename, so Cloudinary has nothing to derive
  // one from and falls back to a random public_id with no extension — fine for
  // images/video (format is detected from content), but for 'raw' resources
  // (docx/zip/etc.) the extension IS part of the public_id, so without it the
  // stored asset has no extension and downloads lose both their name and type.
  // filename_override tells Cloudinary the real name even though the data URI
  // itself is anonymous.
  const result = await cloudinary.uploader.upload(
    `data:${mimeType};base64,${buffer.toString('base64')}`,
    {
      resource_type: 'auto',
      folder,
      ...(originalName ? { use_filename: true, unique_filename: true, filename_override: originalName } : {}),
    }
  );
  return {
    url: result.secure_url,
    bytes: result.bytes,
    resourceType: result.resource_type,
    publicId: result.public_id,
  };
}

/**
 * Uploads use resource_type 'auto', so a PDF or image is stored as 'image'/'video'.
 * Destroying it as 'raw' returns {result:'not found'} without throwing, which would
 * silently leave the asset undeleted. Try the type the URL implies, then fall back.
 * A 'raw' asset's public id keeps its extension, unlike an image's or a video's.
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
 * Signed params for a direct browser upload into `folder`. The file bytes never
 * touch our Node process, which avoids buffering large uploads server-side.
 *
 * Everything returned besides the signature itself is part of what was signed,
 * so the browser must send it unchanged: `allowedFormats` makes Cloudinary
 * refuse any other file type even if the signature is reused outside the app,
 * and `tags` marks the upload as pending and owned by `uploaderId` until it is
 * registered, so an upload that never gets registered can be found and removed.
 */
/**
 * Without an uploader the upload is not tagged: a page loaded before tagging
 * existed doesn't send the tags, and Cloudinary refuses any signed param it
 * is missing. Such uploads are only cleaned up when registration fails.
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

/**
 * A file in our own Cloudinary account, inside `folder`. A direct upload's URL
 * is reported by the browser, so it is never trusted until it passes this.
 */
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

function urlExtension(url: string): string {
  const match = url.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1]!.toLowerCase() : '';
}

/**
 * Prisma returns sizeBytes as BigInt, which JSON.stringify throws on.
 *
 * `url` is replaced with a link to our own short-lived download redirect
 * (see files.controller) instead of a permanently-valid signed Cloudinary URL —
 * `extension` ships alongside it so the client can still tell a PDF from a
 * video without an extension to parse out of that URL.
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
          // Files uploaded before names were passed to Cloudinary have none in
          // their URL; the stored name may still carry one.
          const extension = urlExtension(file.url) || urlExtension(file.name ?? '');
          const suffix = extension ? `/file.${extension}` : '';
          return {
            url: `/files/download/${file.id}${suffix}?token=${signFileToken({ fileId: file.id, kind, userId })}`,
            extension,
          };
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
 * Cloudinary blocks unsigned delivery of 'raw' assets (docx/xlsx/zip/etc.) and
 * of PDFs by default; a signed URL bypasses that restriction without needing
 * an account-level toggle. Rebuilds it from the stored (unsigned) URL on every
 * read rather than persisting a signed one, since a signature should always be
 * freshly generated, not stored as if it were the file's permanent address.
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
