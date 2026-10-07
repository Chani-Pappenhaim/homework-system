import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { AppError } from './errors';

/** File types a text field can be filled from — the frontend's file pickers list the same. */
export const CONTENT_EXTENSIONS = ['.md', '.markdown', '.txt', '.html', '.htm', '.docx'];

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
// Scripts and styles carry no content; dropping them also keeps them out of the page.
turndown.remove(['script', 'style', 'head', 'title']);

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
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
    const { value: html } = await mammoth.convertToHtml({ buffer });
    return htmlToMarkdown(html);
  }
  const text = buffer.toString('utf-8').replace(/^﻿/, '');
  return ext === '.html' || ext === '.htm' ? htmlToMarkdown(text) : text;
}
