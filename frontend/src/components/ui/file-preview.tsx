import { useState, useEffect } from 'react';
import { File as FileIcon, Download, ExternalLink } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { getFileKindByExtension, officeViewerLimitBytes, OFFICE_EXTENSIONS, TEXT_EXTENSIONS } from '@/lib/file-type';
import { PreviewableTypes } from '@/components/ui/previewable-types';
import { API_URL } from '@/lib/config';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { filesApi, type FileSource } from '@/api/files.api';

// Text past this size would freeze the tab when rendered in full.
const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

type TextMode = 'plain' | 'markdown' | 'code' | 'csv' | 'html';

function textModeOf(ext: string): TextMode {
  if (ext === 'md') return 'markdown';
  if (ext === 'csv') return 'csv';
  if (ext === 'txt' || ext === 'log') return 'plain';
  return 'code';
}

/**
 * Policy for an HTML file shown in the preview. Its scripts may run, but the
 * page may not send anything anywhere: no fetch/XHR/WebSocket, no forms, no
 * images or media from the web (a URL can carry data out). Scripts, styles and
 * fonts load only from public library CDNs, whose request logs nobody but the
 * CDN can read. The <meta> goes first so it applies before any of the file's
 * own markup, and a CSP the file declares itself can only tighten it further.
 */
const LIBRARY_CDNS = 'https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com';
const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${LIBRARY_CDNS}`,
  `style-src 'unsafe-inline' ${LIBRARY_CDNS} https://fonts.googleapis.com`,
  `font-src data: ${LIBRARY_CDNS} https://fonts.gstatic.com`,
  'img-src data: blob:',
  'media-src data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

export function withPreviewPolicy(html: string): string {
  return `<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}">${html}`;
}

export interface GalleryFile {
  id: string;
  name: string;
  url: string;
  extension?: string;
  sizeBytes?: string | null;
  required?: boolean;
  hidden?: boolean;
  viewed?: boolean;
}

export function resolveFileUrl(url: string): string {
  return `${API_URL}${url}`;
}

type OfficeViewer = 'microsoft' | 'google';

// Both viewers fetch the file from their own servers, so they only work against
// a publicly reachable API (not localhost). Microsoft's renders presentations
// far more reliably; Google's stays available as a fallback.
function officeViewerUrl(url: string, viewer: OfficeViewer): string {
  return viewer === 'microsoft'
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    : `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
}

export function FilePreviewDialog({ file, source, onClose }: { file: GalleryFile | undefined; source: FileSource; onClose: () => void }) {
  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => { if (!open) onClose(); }}>
      {file && <FilePreviewBody file={file} source={source} />}
    </Dialog>
  );
}

function FilePreviewBody({ file, source }: { file: GalleryFile; source: FileSource }) {
  const ext = file.extension ?? '';
  const kind = getFileKindByExtension(ext);
  const isOffice = OFFICE_EXTENSIONS.has(ext);
  const isText = TEXT_EXTENSIONS.has(ext);
  const textTooBig = isText && Number(file.sizeBytes ?? 0) > TEXT_PREVIEW_MAX_BYTES;
  const url = resolveFileUrl(file.url);
  const downloadUrl = `${url}${url.includes('?') ? '&' : '?'}dl=1`;
  const [viewer, setViewer] = useState<OfficeViewer>('microsoft');
  // A browser set to "download PDFs instead of opening them" saves the file the
  // moment it lands in an <iframe> — the downloads that seemed to happen at
  // random on click. Such a browser says so, and gets buttons instead.
  const pdfInline = typeof navigator === 'undefined' || navigator.pdfViewerEnabled !== false;
  const officeTooBig = isOffice && Number(file.sizeBytes ?? 0) > officeViewerLimitBytes(ext);

  return (
    <DialogContent size="full">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-5 py-3.5 pe-12">
        <div className="min-w-0">
          <DialogTitle className="truncate text-sm">{file.name}</DialogTitle>
          {file.sizeBytes && <p className="text-xs text-ink/50">{formatBytes(file.sizeBytes)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {kind === 'doc' && isOffice && !officeTooBig && (
            <button
              type="button"
              onClick={() => setViewer((v) => (v === 'microsoft' ? 'google' : 'microsoft'))}
              className="rounded-input border border-rule px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ground/40"
              title="אם הקובץ לא מוצג - לנסות להציג אותו בצופה אחר"
            >
              {viewer === 'microsoft' ? 'לא מוצג? צופה חלופי' : 'חזרה לצופה הראשי'}
            </button>
          )}
          {(kind === 'pdf' || kind === 'image' || kind === 'video') && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-input border border-rule px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ground/40"
            >
              <ExternalLink size={12} /> פתיחה בכרטיסייה חדשה
            </a>
          )}
          <a
            href={downloadUrl}
            download={file.name}
            className="flex items-center gap-1.5 rounded-input bg-indigo px-3 py-1.5 text-xs font-semibold text-sheet hover:bg-indigo/90"
          >
            <Download size={12} /> הורדה
          </a>
        </div>
      </div>

      {/* min-h-0 lets this row actually shrink inside the flex column, which is
          what allows the viewer to fill the remaining height instead of
          overflowing past the bottom of the screen. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-sheet p-3">
        {kind === 'image' && (
          <img src={url} alt={file.name} className="max-h-full max-w-full rounded-sm object-contain" />
        )}
        {kind === 'video' && (
          <video src={url} controls className="max-h-full max-w-full rounded-sm" />
        )}
        {kind === 'audio' && <audio src={url} controls className="w-full" />}
        {kind === 'pdf' && pdfInline && (
          <iframe src={url} title={file.name} className="h-full w-full rounded-sm border border-rule" />
        )}
        {kind === 'pdf' && !pdfInline && (
          <NoPreview
            downloadUrl={downloadUrl}
            name={file.name}
            reason="הדפדפן שלך מוגדר להוריד קובצי PDF במקום להציג אותם, לכן אין כאן תצוגה מקדימה."
            openUrl={url}
          />
        )}
        {kind === 'doc' && officeTooBig && (
          <NoPreview
            downloadUrl={downloadUrl}
            name={file.name}
            reason={`הצופה המקוון של Office מציג קבצים עד ${officeViewerLimitBytes(ext) / 1024 / 1024}MB, והקובץ הזה גדול יותר.`}
          />
        )}
        {kind === 'doc' && isOffice && !officeTooBig && (
          <OfficePreview key={viewer} file={file} source={source} viewer={viewer} downloadUrl={downloadUrl} />
        )}
        {kind === 'doc' && isText && !textTooBig && <TextFilePreview url={url} mode={textModeOf(ext)} />}
        {kind === 'doc' && textTooBig && (
          <NoPreview downloadUrl={downloadUrl} name={file.name} reason="הקובץ גדול מדי להצגה כאן (מעל 2MB)." />
        )}
        {kind === 'html' && <TextFilePreview url={url} mode="html" title={file.name} />}
        {(kind === 'archive' || kind === 'other') && (
          <NoPreview downloadUrl={downloadUrl} name={file.name} reason="אין תצוגה מקדימה זמינה לסוג קובץ זה" />
        )}
      </div>
    </DialogContent>
  );
}

/**
 * The page's own download link only opens for the signed-in reader's session,
 * which the viewer's servers do not have, so the viewer gets a link of its own:
 * asked for when the preview opens, and valid only for the few minutes it takes
 * the viewer to fetch the file.
 */
function OfficePreview({ file, source, viewer, downloadUrl }: { file: GalleryFile; source: FileSource; viewer: OfficeViewer; downloadUrl: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    filesApi.viewerLink(file.id, source)
      .then((path) => { if (!cancelled) setSrc(officeViewerUrl(resolveFileUrl(path), viewer)); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [file.id, source, viewer]);

  if (failed) {
    return <NoPreview downloadUrl={downloadUrl} name={file.name} reason="לא הצלחנו לפתוח את התצוגה המקדימה של הקובץ." />;
  }
  if (!src) return <p className="text-sm text-ink/50">טוען…</p>;
  return <iframe src={src} title={file.name} className="h-full w-full rounded-sm border border-rule bg-sheet" />;
}

function NoPreview({ downloadUrl, name, reason, openUrl }: { downloadUrl: string; name: string; reason: string; openUrl?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <FileIcon size={40} className="text-ink/40" />
      <p className="max-w-md text-sm text-ink/70">{reason}</p>
      <PreviewableTypes className="max-w-md" />
      <div className="flex gap-2">
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-input border border-rule px-4 py-2 text-sm font-semibold text-ink hover:bg-ground/40"
          >
            פתיחה בכרטיסייה חדשה
          </a>
        )}
        <a
          href={downloadUrl}
          download={name}
          className="rounded-input bg-indigo px-4 py-2 text-sm font-semibold text-sheet hover:bg-indigo/90"
        >
          הורדת הקובץ
        </a>
      </div>
    </div>
  );
}

function TextFilePreview({ url, mode, title }: { url: string; mode: TextMode; title?: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // With the API on another origin, the session cookie the link needs is only sent when asked for.
    fetch(url, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setContent(t);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <p className="text-sm text-ink/70">שגיאה בטעינת תוכן הקובץ</p>;
  if (content === null) return <p className="text-sm text-ink/50">טוען…</p>;

  if (mode === 'html') {
    // Scripts run, but without allow-same-origin the page gets an opaque origin
    // and can't reach this app's storage, cookies or DOM; without allow-forms,
    // allow-popups, allow-top-navigation, allow-modals and allow-downloads it
    // can't submit, open windows, leave, prompt or save. The injected policy
    // cuts off the network, and the app's own frame-src keeps the frame from
    // navigating itself anywhere outside the site.
    return (
      <iframe
        sandbox="allow-scripts"
        srcDoc={withPreviewPolicy(content)}
        title={title}
        className="h-full w-full rounded-sm border border-rule bg-white"
      />
    );
  }

  if (mode === 'csv') return <CsvTable content={content} />;

  if (mode === 'code') {
    return (
      <pre dir="ltr" className="h-full w-full overflow-auto rounded-sm border border-rule bg-ground/40 p-4 text-left font-mono text-xs leading-relaxed text-ink">
        {content}
      </pre>
    );
  }

  if (mode === 'markdown') {
    return (
      <div dir="auto" className="h-full w-full overflow-auto rounded-sm border border-rule bg-sheet p-6 text-start">
        <MarkdownRenderer content={content} />
      </div>
    );
  }

  return (
    <pre dir="auto" className="h-full w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-rule bg-ground/40 p-4 text-start text-xs text-ink">
      {content}
    </pre>
  );
}

/** Splits CSV text into rows, honoring quoted fields that hold commas, quotes or line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const delimiter = !text.split('\n', 1)[0]!.includes(',') && text.includes(';') ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function CsvTable({ content }: { content: string }) {
  const [header, ...rows] = parseCsv(content.replace(/^\uFEFF/, ''));
  if (!header) return <p className="text-sm text-ink/50">הקובץ ריק</p>;
  return (
    <div className="h-full w-full overflow-auto rounded-sm border border-rule bg-sheet">
      <table dir="auto" className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-ground">
          <tr>{header.map((h, i) => <th key={i} className="border-b border-rule px-3 py-2 text-start font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-ground/30">
              {header.map((_, j) => <td key={j} className="border-b border-rule/60 px-3 py-1.5">{r[j] ?? ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
