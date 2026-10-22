const FRAME_ID = 'print-frame';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The printable page: the content under its title, styled like the app (in its light theme). */
export function printDocument(title: string, contentHtml: string): string {
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => node.outerHTML).join('');
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
    + `<base href="${escapeHtml(window.location.origin)}/"><title>${escapeHtml(title)}</title>${styles}</head>`
    + '<body class="bg-sheet p-8 font-sans text-ink">'
    + `<h1 class="mb-4 font-display text-xl font-bold">${escapeHtml(title)}</h1>${contentHtml}</body></html>`;
}

/**
 * Prints one part of the page — a lesson's material, an assignment's brief —
 * without the menus and buttons around it, through a hidden frame that holds
 * only that part.
 */
export function printElement(element: HTMLElement, title: string): void {
  document.getElementById(FRAME_ID)?.remove();
  const frame = document.createElement('iframe');
  frame.id = FRAME_ID;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;bottom:0;right:0;width:0;height:0;border:0;';
  // Printing waits for the frame's stylesheets and pictures, or it would come out unstyled.
  frame.addEventListener('load', () => {
    const win = frame.contentWindow;
    if (!win) return;
    win.addEventListener('afterprint', () => frame.remove(), { once: true });
    win.focus();
    win.print();
  }, { once: true });
  frame.srcdoc = printDocument(title, element.innerHTML);
  document.body.appendChild(frame);
}
