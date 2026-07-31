import { cloudinary } from '../config/cloudinary';

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
  folder: string
): Promise<UploadedFile> {
  const result = await cloudinary.uploader.upload(
    `data:${mimeType};base64,${buffer.toString('base64')}`,
    { resource_type: 'auto', folder }
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
 * Destroying it as 'raw' returns {result:'not found'} without throwing, which used to
 * leave the asset billed forever. Try the type the URL implies, then fall back.
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
 * The file bytes never touch our Node process this way — needed for video
 * submissions, which were blowing past Render's 512MB memory limit going
 * through multer.memoryStorage() + a base64 buffer copy in uploadBuffer.
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

/** Prisma returns sizeBytes as BigInt, which JSON.stringify throws on. */
export function toFileDTO<T extends { sizeBytes?: bigint | null }>(file: T) {
  return { ...file, sizeBytes: file.sizeBytes?.toString() ?? null };
}

export function extractPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
  return match ? match[1] : null;
}

function resourceTypeFromUrl(url: string): string {
  const match = url.match(/\/(image|video|raw)\/upload\//);
  return match ? match[1]! : 'raw';
}
