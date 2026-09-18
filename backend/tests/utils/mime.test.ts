import { describe, it, expect } from 'vitest';
import {
  contentDisposition,
  contentTypeFor,
  ensureExtension,
  extensionOf,
  resolveContentType,
} from '../../src/utils/mime';

describe('contentTypeFor', () => {
  it('maps a known extension to its real media type', () => {
    expect(contentTypeFor('a.pdf')).toBe('application/pdf');
    expect(contentTypeFor('a.DOCX')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('falls back to octet-stream for an unknown or missing extension', () => {
    expect(contentTypeFor('notes')).toBe('application/octet-stream');
    expect(contentTypeFor('a.qqq')).toBe('application/octet-stream');
  });
});

describe('contentDisposition', () => {
  it('keeps a Hebrew name in the RFC 5987 form and leaves an ascii fallback', () => {
    const header = contentDisposition('שיעור 1.pdf', 'attachment');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('שיעור 1.pdf'));
    // The ascii fallback must still carry the extension, or the saved file
    // opens in nothing.
    expect(header).toMatch(/filename="[^"]*\.pdf"/);
  });

  it('never lets a quote in the name break out of the ascii parameter', () => {
    const header = contentDisposition('we"ird.zip', 'attachment');
    expect(header).toContain('filename="we_ird.zip"');
  });

  it('carries the requested mode', () => {
    expect(contentDisposition('a.png', 'inline').startsWith('inline;')).toBe(true);
  });
});

describe('ensureExtension', () => {
  it('restores an extension the display name dropped', () => {
    expect(ensureExtension('contract', 'https://res.cloudinary.com/x/raw/upload/v1/lessons/contract.pdf'))
      .toBe('contract.pdf');
  });

  it('leaves a name that already has one alone', () => {
    expect(ensureExtension('contract.docx', 'https://res.cloudinary.com/x/raw/upload/a.pdf'))
      .toBe('contract.docx');
  });

  it('ignores a query string on the url', () => {
    expect(ensureExtension('img', 'https://res.cloudinary.com/x/image/upload/a.png?v=2')).toBe('img.png');
  });

  it('returns the name unchanged when the url has no extension either', () => {
    expect(ensureExtension('thing', 'https://res.cloudinary.com/x/raw/upload/thing')).toBe('thing');
  });
});

describe('extensionOf', () => {
  it('lowercases and ignores a name with no dot', () => {
    expect(extensionOf('A.PNG')).toBe('png');
    expect(extensionOf('plain')).toBe('');
  });
});

describe('resolveContentType', () => {
  it('keeps a real type the storage CDN reported', () => {
    expect(resolveContentType('audio/mpeg', 'a.mp3')).toBe('audio/mpeg');
  });

  it('replaces the generic binary answer with what the filename says', () => {
    expect(resolveContentType('application/octet-stream', 'a.pdf')).toBe('application/pdf');
    expect(resolveContentType(null, 'a.pdf')).toBe('application/pdf');
  });

  it('leaves the generic answer in place when the filename says nothing either', () => {
    expect(resolveContentType('application/octet-stream', 'notes')).toBe('application/octet-stream');
  });
});
