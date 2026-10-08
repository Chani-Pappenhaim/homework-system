import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileGallery } from '@/components/ui/file-gallery';

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

  it('renders an html file inside an empty sandbox', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<h1>שלום</h1><script>alert(1)</script>')));
    const { baseElement } = render(<FileGallery files={[{ id: 'f5', name: 'page.html', url: '/files/download/f5/file.html?token=t', extension: 'html' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /page.html/ }));
    const frame = await waitFor(() => {
      const f = baseElement.querySelector('iframe[title="page.html"]');
      if (!f) throw new Error('no frame yet');
      return f as HTMLIFrameElement;
    });
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<h1>שלום</h1>');
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

  it('keeps the teacher and student controls on the tiles', async () => {
    const onDelete = vi.fn();
    const onToggleRequired = vi.fn();
    render(<FileGallery files={[PDF]} onDelete={onDelete} onToggleRequired={onToggleRequired} />);
    expect(screen.getByLabelText('מחיקת קובץ')).toBeInTheDocument();
    expect(screen.getByLabelText('סימון כקובץ חובה')).toBeInTheDocument();
  });
});
