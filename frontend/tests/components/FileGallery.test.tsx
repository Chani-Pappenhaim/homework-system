import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    // One in the tile thumbnail, one filling the dialog.
    expect(frames.length).toBeGreaterThan(1);
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

  it('keeps the teacher and student controls on the tiles', async () => {
    const onDelete = vi.fn();
    const onToggleRequired = vi.fn();
    render(<FileGallery files={[PDF]} onDelete={onDelete} onToggleRequired={onToggleRequired} />);
    expect(screen.getByLabelText('מחיקת קובץ')).toBeInTheDocument();
    expect(screen.getByLabelText('סימון כקובץ חובה')).toBeInTheDocument();
  });
});
