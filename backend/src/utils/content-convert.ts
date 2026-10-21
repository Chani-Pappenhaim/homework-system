import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { AppError } from './errors';
import { destroyByUrl, uploadBuffer } from './storage';
import { addTableRule } from './markdown-tables';
import { prepareDocx, type DocxFormula } from './docx/prepare-docx';

/** File types a text field can be filled from — the frontend's file pickers list the same. */
export const CONTENT_EXTENSIONS = ['.md', '.markdown', '.txt', '.html', '.htm', '.docx'];

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
// Scripts and styles carry no content; dropping them also keeps them out of the page.
turndown.remove(['script', 'style', 'head', 'title']);
addTableRule(turndown);

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}

// Picture types a browser shows as they are.
const WEB_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];

// Stands in for a picture no browser can show (Word's own vector formats,
// EMF/WMF, which equations from older editors are saved as) until the
// Markdown is final; then it becomes a note saying so, not an empty box.
const UNSHOWN_IMAGE = 'unshown-image:';

/**
 * Where a picture inside a Word file ends up. mammoth inlines each one as a
 * base64 data URI by default, which made a document with a single screenshot
 * hundreds of KB of Markdown: too large to save, and slow in every list that
 * carries the text. Stored as its own file it is a short link instead.
 *
 * A picture in a format browsers do not show is stored converted to PNG when
 * the storage can convert it. If the upload fails a web picture stays inline
 * rather than being lost.
 */
async function storeImage(image: { contentType: string; read(encoding: 'base64'): Promise<string> }) {
  const base64 = await image.read('base64');
  const type = (image.contentType ?? 'image/unknown').toLowerCase();
  const webImage = WEB_IMAGE_TYPES.includes(type);
  if (process.env.CLOUDINARY_CLOUD_NAME?.trim()) {
    try {
      const { url, resourceType } = await uploadBuffer(Buffer.from(base64, 'base64'), type, 'content-images');
      if (webImage) return { src: url };
      if (resourceType === 'image') return { src: url.replace(/\.[a-z0-9]+$/i, '.png') };
      // Stored as a plain file, it would not display either.
      await destroyByUrl(url).catch(() => undefined);
    } catch (err) {
      console.error('[content-convert] image upload failed', type, err);
    }
  }
  if (webImage) return { src: `data:${type};base64,${base64}` };
  return { src: `${UNSHOWN_IMAGE}${type.replace(/^image\/(x-)?/, '').toUpperCase()}` };
}

/** The final Markdown: formulas as LaTeX, unshowable pictures as a note. */
function finishDocxMarkdown(markdown: string, formulas: DocxFormula[]): string {
  let out = markdown.replace(
    /!\[[^\]]*\]\(unshown-image:([A-Z0-9+.-]+)\)/g,
    (_m, format: string) => `*[כאן מופיעה בקובץ המקורי תמונה בפורמט ${format}, שהדפדפן לא מציג]*`
  );
  for (const { token, latex, display } of formulas) {
    // A display formula on its own line becomes a math block; one inside a
    // sentence, a list item or a table cell stays inline.
    const alone = new RegExp(`^[ \t]*${token}[ \t]*$`, 'm');
    out = display && alone.test(out)
      ? out.replace(alone, () => `$$\n${latex}\n$$`)
      : out.replace(token, () => `$$${latex}$$`);
  }
  return out;
}

/**
 * Turns an uploaded MD, HTML or Word file into Markdown, so every text field
 * stores and renders one format no matter what the teacher wrote it in.
 */
export async function fileToMarkdown(fileName: string, buffer: Buffer): Promise<string> {
  const name = fileName.toLowerCase();
  const ext = name.slice(name.lastIndexOf('.'));
  if (!CONTENT_EXTENSIONS.includes(ext)) {
    throw new AppError(
      `Unsupported content file type: ${ext}`,
      'ניתן לטעון תוכן מקובץ Markdown ‏(.md), ‏HTML או Word ‏(.docx) בלבד',
      400
    );
  }
  if (ext === '.docx') {
    const prepared = await prepareDocx(buffer).catch((err) => {
      throw new AppError(`Unreadable docx: ${err}`, 'לא ניתן לקרוא את קובץ ה-Word - יש לוודא שזה קובץ ‎.docx תקין', 400);
    });
    const { value: html, messages } = await mammoth.convertToHtml(
      { buffer: prepared.buffer },
      { convertImage: mammoth.images.imgElement(storeImage) }
    );
    if (messages.length > 0) console.warn('[content-convert] docx conversion notes', messages.map((m) => m.message));
    return finishDocxMarkdown(htmlToMarkdown(html), prepared.formulas);
  }
  const text = buffer.toString('utf-8').replace(/^﻿/, '');
  return ext === '.html' || ext === '.htm' ? htmlToMarkdown(text) : text;
}
