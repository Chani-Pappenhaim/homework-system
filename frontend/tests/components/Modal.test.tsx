import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '@/components/ui/Modal';

afterEach(cleanup);

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={() => {}}>hidden</Modal>);
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
  });

  it('renders children and title when open', () => {
    render(<Modal open onClose={() => {}} title="My Title">body content</Modal>);
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('calls onClose when the close (X) button is clicked', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T">c</Modal>);
    const buttons = screen.getAllByRole('button');
    await userEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    const { container } = render(<Modal open onClose={onClose}>c</Modal>);
    const backdrop = container.querySelector('.absolute.inset-0');
    expect(backdrop).toBeTruthy();
    await userEvent.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render a header when no title is provided', () => {
    render(<Modal open onClose={() => {}}>only body</Modal>);
    // No close button without a title
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('locks body scroll while open and restores it when closed', () => {
    const { rerender } = render(<Modal open onClose={() => {}}>x</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Modal open={false} onClose={() => {}}>x</Modal>);
    expect(document.body.style.overflow).toBe('');
  });
});
