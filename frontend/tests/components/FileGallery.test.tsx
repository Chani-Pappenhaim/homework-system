import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileGallery, parseCsv, withPreviewPolicy } from '@/components/ui/file-gallery';

vi.mock('@/api/files.api', () => ({ filesApi: { viewerLink: vi.fn() } }));
import { filesApi } from '@/api/files.api';

const viewerLink = filesApi.viewerLink as unknown as ReturnType<typeof vi.fn>;
viewerLink.mockImplementation(async (id: string) => `/files/download/${id}/file.pptx?token=viewer`);

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
    const { container } = render(<FileGallery source="lesson" files={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the preview across the screen rather than beside the grid', async () => {
    const { baseElement } = render(<FileGallery source="lesson" files={[PDF]} />);
    expect(baseElement.querySelector('[role="dialog"]')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /חוזה/ }));

    const dialog = baseElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    // The panel is sized to the viewport, not to a column beside the grid.
    expect(dialog.className).toContain('w-[calc(100vw-2rem)]');
    expect(dialog.className).toContain('h-[calc(100vh-2rem)]');
  });

  it('previews a pdf in the dialog and offers it for download', async () => {
    const { baseElement } = render(<FileGallery source="lesson" files={[PDF]} />);
    await userEvent.click(screen.getByRole('button', { name: /חוזה/ }));

    const frames = baseElement.querySelectorAll('iframe');
    // Only the dialog frames the file — a tile thumbnail never does.
    expect(frames.length).toBe(1);
    const link = screen.getByRole('link', { name: /הורדה/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('dl=1');
  });

  it('closes the preview again', async () => {
    const { baseElement } = render(<FileGallery source="lesson" files={[PDF]} />);
    await userEvent.click(screen.getByRole('button', { name: /חוזה/ }));
    await userEvent.click(screen.getByRole('button', { name: 'סגירה' }));
    expect(baseElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('falls back to a download prompt for a type nothing can render', async () => {
    render(<FileGallery source="lesson" files={[{ id: 'f2', name: 'code.zip', url: '/files/download/f2?token=t', extension: 'zip' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /code.zip/ }));
    expect(screen.getByText(/אין תצוגה מקדימה/)).toBeInTheDocument();
  });

  it('reads a text file in place instead of making the user download it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('שורה ראשונה')));
    render(<FileGallery source="lesson" files={[{ id: 'f3', name: 'notes.txt', url: '/files/download/f3?token=t', extension: 'txt' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /notes.txt/ }));
    expect(await screen.findByText('שורה ראשונה')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('never frames a file inside a tile, so opening a page cannot trigger a download', () => {
    const { container } = render(<FileGallery source="lesson" files={[PDF, { id: 'f4', name: 'deck', url: '/files/download/f4/file.pptx?token=t', extension: 'pptx' }]} />);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('runs an html file isolated from the app and cut off from the network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<h1>שלום</h1><script>alert(1)</script>')));
    const { baseElement } = render(<FileGallery source="lesson" files={[{ id: 'f5', name: 'page.html', url: '/files/download/f5/file.html?token=t', extension: 'html' }]} />);
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
    const { baseElement } = render(<FileGallery source="lesson" files={[{ id: 'f9', name: 'מצגת', url: '/files/download/f9/file.ppsx?token=t', extension: 'ppsx' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /מצגת/ }));
    await waitFor(() => expect(baseElement.querySelector('iframe')?.getAttribute('src')).toContain('view.officeapps.live.com'));
  });

  it('shows a code file as left-to-right text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('print("hi")')));
    render(<FileGallery source="lesson" files={[{ id: 'f10', name: 'main.py', url: '/files/download/f10/file.py?token=t', extension: 'py' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /main.py/ }));
    expect((await screen.findByText('print("hi")')).getAttribute('dir')).toBe('ltr');
    vi.unstubAllGlobals();
  });

  it('shows a csv file as a table', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('שם,ציון\nרחל,95')));
    render(<FileGallery source="lesson" files={[{ id: 'f11', name: 'grades.csv', url: '/files/download/f11/file.csv?token=t', extension: 'csv' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /grades.csv/ }));
    expect(await screen.findByRole('columnheader', { name: 'ציון' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'רחל' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('renders a markdown file as formatted text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('# כותרת\n\n**מודגש**')));
    render(<FileGallery source="lesson" files={[{ id: 'f6', name: 'notes.md', url: '/files/download/f6/file.md?token=t', extension: 'md' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /notes.md/ }));
    expect(await screen.findByRole('heading', { name: 'כותרת' })).toBeInTheDocument();
    expect(screen.getByText('מודגש').tagName).toBe('STRONG');
    vi.unstubAllGlobals();
  });

  it('offers a second viewer for an office file', async () => {
    const { baseElement } = render(<FileGallery source="lesson" files={[{ id: 'f4', name: 'deck', url: '/files/download/f4/file.pptx?token=t', extension: 'pptx' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /deck/ }));
    await waitFor(() => expect(baseElement.querySelector('iframe')?.getAttribute('src')).toContain('view.officeapps.live.com'));
    await userEvent.click(screen.getByRole('button', { name: /צופה חלופי/ }));
    await waitFor(() => expect(baseElement.querySelector('iframe')?.getAttribute('src')).toContain('docs.google.com/gview'));
  });

  it('hands the office viewer its own short-lived link, not the session-bound one of the page', async () => {
    const { baseElement } = render(<FileGallery source="course" files={[{ id: 'f4', name: 'deck', url: '/files/download/f4/file.pptx?token=t', extension: 'pptx' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /deck/ }));
    await waitFor(() => expect(baseElement.querySelector('iframe')).not.toBeNull());
    expect(viewerLink).toHaveBeenCalledWith('f4', 'course');
    const src = decodeURIComponent(baseElement.querySelector('iframe')!.getAttribute('src')!);
    expect(src).toContain('token=viewer');
    expect(src).not.toContain('token=t');
  });

  it('offers the download when the viewer link cannot be had', async () => {
    viewerLink.mockRejectedValueOnce(new Error('403'));
    const { baseElement } = render(<FileGallery source="lesson" files={[{ id: 'f4', name: 'deck', url: '/files/download/f4/file.pptx?token=t', extension: 'pptx' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /deck/ }));
    expect(await screen.findByText('לא הצלחנו לפתוח את התצוגה המקדימה של הקובץ.')).toBeInTheDocument();
    expect(baseElement.querySelector('iframe')).toBeNull();
  });

  it('sends the session cookie along when it reads a text file', async () => {
    const fetchMock = vi.fn(async () => new Response('hello'));
    vi.stubGlobal('fetch', fetchMock);
    render(<FileGallery source="lesson" files={[{ id: 'f12', name: 'a.txt', url: '/files/download/f12/file.txt?token=t', extension: 'txt' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /a.txt/ }));
    await screen.findByText('hello');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/files/download/f12'), { credentials: 'include' });
    vi.unstubAllGlobals();
  });

  it('lists the previewable types when a file has no preview', async () => {
    render(<FileGallery source="lesson" files={[{ id: 'f2', name: 'code.zip', url: '/files/download/f2?token=t', extension: 'zip' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /code.zip/ }));
    expect(screen.getByText(/תצוגה מקדימה באתר:/)).toBeInTheDocument();
  });

  it('offers buttons instead of a frame when the browser downloads pdfs', async () => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false, configurable: true });
    try {
      const { baseElement } = render(<FileGallery source="lesson" files={[PDF]} />);
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
    const { baseElement } = render(<FileGallery source="lesson" files={[big]} />);
    await userEvent.click(screen.getByRole('button', { name: /מצגת/ }));
    expect(baseElement.querySelector('iframe')).toBeNull();
    expect(screen.getByText(/עד 10MB/, { selector: 'p.text-sm' })).toBeInTheDocument();
  });

  it('keeps the teacher and student controls on the tiles', async () => {
    const onDelete = vi.fn();
    const onToggleRequired = vi.fn();
    render(<FileGallery source="lesson" files={[PDF]} onDelete={onDelete} onToggleRequired={onToggleRequired} />);
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

describe('FileGallery rename', () => {
  it('renames through a styled dialog, not the browser prompt, without submitting a surrounding form', async () => {
    const nativePrompt = vi.spyOn(window, 'prompt');
    const onRename = vi.fn();
    const outerSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={outerSubmit}><FileGallery source="course" files={[PDF]} onRename={onRename} /></form>);

    await userEvent.click(screen.getByRole('button', { name: 'שינוי שם קובץ' }));
    const input = screen.getByLabelText('שם חדש לקובץ');
    expect(input).toHaveValue('חוזה');
    await userEvent.clear(input);
    await userEvent.type(input, 'חוזה חתום{Enter}');

    expect(onRename).toHaveBeenCalledWith('f1', 'חוזה חתום');
    expect(outerSubmit).not.toHaveBeenCalled();
    expect(nativePrompt).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText('שם חדש לקובץ')).not.toBeInTheDocument());
  });

  it('does not rename when cancelled or left unchanged', async () => {
    const onRename = vi.fn();
    render(<FileGallery source="course" files={[PDF]} onRename={onRename} />);
    await userEvent.click(screen.getByRole('button', { name: 'שינוי שם קובץ' }));
    await userEvent.click(screen.getByRole('button', { name: 'שמירה' }));
    await userEvent.click(screen.getByRole('button', { name: 'שינוי שם קובץ' }));
    await userEvent.type(screen.getByLabelText('שם חדש לקובץ'), 'xyz');
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(onRename).not.toHaveBeenCalled();
  });
});
