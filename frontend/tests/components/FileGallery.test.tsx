import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileGallery, parseCsv, withPreviewPolicy } from '@/components/ui/file-gallery';

const PDF = {
  id: 'f1',
  // The upload form strips the extension from the display name, so the kind has
  // to come from `extension`, which the API sends alongside.
  name: 'חוזה',
  url: '/files/download/f1?token=t',
  extension: 'pdf',
  sizeBytes: '7168',
};

describe('FileGallery', () => {
  it('renders nothing when there are no files', () => {
    const { container } = render(<FileGallery files={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the preview across the screen rather than beside the grid', async () => {
    const { baseElement } = render(<FileGallery files={[PDF]} />);
    expect(baseElement.querySelector('[role="dialog"]')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /חוזה/ }));

    const dialog = baseElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    // The panel is sized to the viewport, not to a column beside the grid.
    expect(dialog.className).toContain('w-[calc(100vw-2rem)]');
    expect(dialog.className).toContain('h-[calc(100vh-2rem)]');
  });

  it('previews a pdf in the dialog and offers it for download', async () => {
    const { baseElement } = render(<FileGallery files={[PDF]} />);
    await userEvent.click(screen.getByRole('button', { name: /חוזה/ }));

    const frames = baseElement.querySelectorAll('iframe');
    // Only the dialog frames the file — a tile thumbnail never does.
    expect(frames.length).toBe(1);
    const link = screen.getByRole('link', { name: /הורדה/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('dl=1');
  });

  it('closes the preview again', async () => {
    const { baseElement } = render(<FileGallery files={[PDF]} />);
    await userEvent.click(screen.getByRole('button', { name: /חוזה/ }));
    await userEvent.click(screen.getByRole('button', { name: 'סגירה' }));
    expect(baseElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('falls back to a download prompt for a type nothing can render', async () => {
    render(<FileGallery files={[{ id: 'f2', name: 'code.zip', url: '/files/download/f2?token=t', extension: 'zip' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /code.zip/ }));
    expect(screen.getByText(/אין תצוגה מקדימה/)).toBeInTheDocument();
  });

  it('reads a text file in place instead of making the user download it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('שורה ראשונה')));
    render(<FileGallery files={[{ id: 'f3', name: 'notes.txt', url: '/files/download/f3?token=t', extension: 'txt' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /notes.txt/ }));
    expect(await screen.findByText('שורה ראשונה')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('never frames a file inside a tile, so opening a page cannot trigger a download', () => {
    const { container } = render(<FileGallery files={[PDF, { id: 'f4', name: 'deck', url: '/files/download/f4/file.pptx?token=t', extension: 'pptx' }]} />);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('runs an html file isolated from the app and cut off from the network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<h1>שלום</h1><script>alert(1)</script>')));
    const { baseElement } = render(<FileGallery files={[{ id: 'f5', name: 'page.html', url: '/files/download/f5/file.html?token=t', extension: 'html' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /page.html/ }));
    const frame = await waitFor(() => {
      const f = baseElement.querySelector('iframe[title="page.html"]');
      if (!f) throw new Error('no frame yet');
      return f as HTMLIFrameElement;
    });
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    const doc = frame.getAttribute('srcdoc')!;
    expect(doc).toContain('<h1>שלום</h1>');
    // The policy precedes every byte of the file, so none of its markup runs unguarded.
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<h1>'));
    vi.unstubAllGlobals();
  });

  it('opens a show-mode presentation in the office viewer', async () => {
    const { baseElement } = render(<FileGallery files={[{ id: 'f9', name: 'מצגת', url: '/files/download/f9/file.ppsx?token=t', extension: 'ppsx' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /מצגת/ }));
    expect(baseElement.querySelector('iframe')!.getAttribute('src')).toContain('view.officeapps.live.com');
  });

  it('shows a code file as left-to-right text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('print("hi")')));
    render(<FileGallery files={[{ id: 'f10', name: 'main.py', url: '/files/download/f10/file.py?token=t', extension: 'py' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /main.py/ }));
    expect((await screen.findByText('print("hi")')).getAttribute('dir')).toBe('ltr');
    vi.unstubAllGlobals();
  });

  it('shows a csv file as a table', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('שם,ציון\nרחל,95')));
    render(<FileGallery files={[{ id: 'f11', name: 'grades.csv', url: '/files/download/f11/file.csv?token=t', extension: 'csv' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /grades.csv/ }));
    expect(await screen.findByRole('columnheader', { name: 'ציון' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'רחל' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('renders a markdown file as formatted text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('# כותרת\n\n**מודגש**')));
    render(<FileGallery files={[{ id: 'f6', name: 'notes.md', url: '/files/download/f6/file.md?token=t', extension: 'md' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /notes.md/ }));
    expect(await screen.findByRole('heading', { name: 'כותרת' })).toBeInTheDocument();
    expect(screen.getByText('מודגש').tagName).toBe('STRONG');
    vi.unstubAllGlobals();
  });

  it('offers a second viewer for an office file', async () => {
    const { baseElement } = render(<FileGallery files={[{ id: 'f4', name: 'deck', url: '/files/download/f4/file.pptx?token=t', extension: 'pptx' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /deck/ }));
    expect(baseElement.querySelector('iframe')!.getAttribute('src')).toContain('view.officeapps.live.com');
    await userEvent.click(screen.getByRole('button', { name: /צופה חלופי/ }));
    expect(baseElement.querySelector('iframe')!.getAttribute('src')).toContain('docs.google.com/gview');
  });

  it('lists the previewable types when a file has no preview', async () => {
    render(<FileGallery files={[{ id: 'f2', name: 'code.zip', url: '/files/download/f2?token=t', extension: 'zip' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /code.zip/ }));
    expect(screen.getByText(/תצוגה מקדימה באתר:/)).toBeInTheDocument();
  });

  it('offers buttons instead of a frame when the browser downloads pdfs', async () => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false, configurable: true });
    try {
      const { baseElement } = render(<FileGallery files={[PDF]} />);
      await userEvent.click(screen.getByRole('button', { name: /חוזה/ }));
      expect(baseElement.querySelector('iframe')).toBeNull();
      expect(screen.getByText(/מוגדר להוריד קובצי PDF/)).toBeInTheDocument();
      expect(screen.getAllByText('פתיחה בכרטיסייה חדשה').length).toBeGreaterThan(0);
    } finally {
      delete (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
    }
  });

  it('explains a presentation too large for the online viewer instead of framing it', async () => {
    const big = { id: 'p1', name: 'מצגת', url: '/files/download/p1?token=t', extension: 'pptx', sizeBytes: String(12 * 1024 * 1024) };
    const { baseElement } = render(<FileGallery files={[big]} />);
    await userEvent.click(screen.getByRole('button', { name: /מצגת/ }));
    expect(baseElement.querySelector('iframe')).toBeNull();
    expect(screen.getByText(/עד 10MB/, { selector: 'p.text-sm' })).toBeInTheDocument();
  });

  it('keeps the teacher and student controls on the tiles', async () => {
    const onDelete = vi.fn();
    const onToggleRequired = vi.fn();
    render(<FileGallery files={[PDF]} onDelete={onDelete} onToggleRequired={onToggleRequired} />);
    expect(screen.getByLabelText('מחיקת קובץ')).toBeInTheDocument();
    expect(screen.getByLabelText('סימון כקובץ חובה')).toBeInTheDocument();
  });
});

describe('withPreviewPolicy', () => {
  it('blocks every way of sending data out', () => {
    const doc = withPreviewPolicy('<p>x</p>');
    for (const rule of ["connect-src 'none'", "form-action 'none'", 'img-src data: blob:', "default-src 'none'"]) {
      expect(doc).toContain(rule);
    }
  });
});

describe('parseCsv', () => {
  it('keeps commas, quotes and line breaks inside quoted fields', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere']]);
  });

  it('reads semicolon-separated files', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});
