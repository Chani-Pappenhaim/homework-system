/** The picture formats a profile picture may be uploaded in. */
export type ImageFormat = 'jpeg' | 'png' | 'webp';

export const IMAGE_MIME_TYPES: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  return buffer.length >= offset + bytes.length && bytes.every((b, i) => buffer[offset + i] === b);
}

/**
 * The image format the bytes themselves declare, or null for anything else.
 *
 * The browser-reported type and the filename are chosen by the sender, so they
 * prove nothing about the content; the file's own signature does.
 */
export function detectImageFormat(buffer: Buffer): ImageFormat | null {
  if (startsWith(buffer, JPEG_SIGNATURE)) return 'jpeg';
  if (startsWith(buffer, PNG_SIGNATURE)) return 'png';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
