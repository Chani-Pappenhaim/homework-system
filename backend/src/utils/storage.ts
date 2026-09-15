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
 */
export async function destroyByUrl(url: string): Promise<void> {
  const publicId = extractPublicId(url);
  if (!publicId) return;
  const guessed = resourceTypeFromUrl(url);
  const candidates = [guessed, 'raw', 'image', 'video'].filter(
    (t, i, a) => a.indexOf(t) === i
  );
  for (const resource_type of candidates) {
    const res = await cloudinary.uploader.destroy(publicId, { resource_type });
    if (res?.result === 'ok') return;
  }
}

/**
 * Signed params for a browser-to-Cloudinary direct upload.
 *
 * The file bytes never touch our Node process this way, which avoids the
 * memory overhead of buffering large uploads (e.g. video) server-side.
 */
export function createUploadSignature(folder: string) {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET as string
  );
  return {
    timestamp,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
  };
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
export function toFileDTO<T extends { id: string; sizeBytes?: bigint | null; url?: string }>(
  file: T,
  kind: 'lesson' | 'course',
  userId: string
) {
  return {
    ...file,
    sizeBytes: file.sizeBytes?.toString() ?? null,
    ...(file.url
      ? {
          url: `/files/download/${file.id}?token=${signFileToken({ fileId: file.id, kind, userId })}`,
          extension: urlExtension(file.url),
        }
      : {}),
  };
}

export function extractPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
  return match ? match[1] : null;
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
