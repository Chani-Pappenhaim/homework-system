import { describe, it, expect } from 'vitest';
import { detectImageFormat } from '../../src/utils/image';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const riff = (kind: string) => Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from(kind)]);

describe('detectImageFormat', () => {
  it('recognises JPEG, PNG and WEBP by their signatures', () => {
    expect(detectImageFormat(JPEG)).toBe('jpeg');
    expect(detectImageFormat(PNG)).toBe('png');
    expect(detectImageFormat(riff('WEBP'))).toBe('webp');
  });

  it('rejects other formats, even ones that look like images', () => {
    expect(detectImageFormat(Buffer.from('GIF89a....'))).toBeNull();
    expect(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageFormat(riff('WAVE'))).toBeNull();
  });

  it('rejects empty and truncated input', () => {
    expect(detectImageFormat(Buffer.alloc(0))).toBeNull();
    expect(detectImageFormat(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageFormat(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});
