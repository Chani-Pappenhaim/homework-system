import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

afterEach(cleanup);

function Basic({
  open = true,
  onOpenChange = () => {},
  title = 'My Title',
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>body content</DialogBody>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(<Basic open={false} />);
    expect(screen.queryByText('body content')).not.toBeInTheDocument();
  });

  it('renders children and title when open', () => {
    render(<Basic />);
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('exposes itself as a dialog named by its title', () => {
    // The custom Modal set aria-modal but never pointed at the heading, so the
    // dialog was announced unnamed. Radix wires aria-labelledby for us.
    render(<Basic />);
    expect(screen.getByRole('dialog', { name: 'My Title' })).toBeInTheDocument();
  });

  it('closes when the X button is clicked', async () => {
    const onOpenChange = vi.fn();
    render(<Basic onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'סגירה' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn();
    render(<Basic onOpenChange={onOpenChange} />);
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('moves focus into the dialog when it opens', async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>T</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <button>inside</button>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('keeps the page behind it inert while open', () => {
    render(<Basic />);
    // Radix marks the rest of the document aria-hidden so a screen reader
    // cannot wander out of the dialog — the custom Modal did not do this.
    expect(document.body).toHaveAttribute('data-scroll-locked');
  });

  it('caps its height so a tall body scrolls inside the panel', () => {
    // Regression: without this the save button on the grading and lesson-edit
    // dialogs sat below the fold with the page behind already scroll-locked.
    render(<Basic />);
    expect(screen.getByRole('dialog')).toHaveClass('max-h-[90vh]');
    expect(screen.getByText('body content')).toHaveClass('overflow-y-auto');
  });
});
