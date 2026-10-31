import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Avatar } from '@/components/ui/avatar';

describe('Avatar', () => {
  it('shows her initials when she has no picture', () => {
    render(<Avatar name="דינה כהן" src={null} />);
    expect(screen.getByRole('img', { name: 'דינה כהן' })).toHaveTextContent('דכ');
  });

  it('shows the picture, from the API, when she has one', () => {
    render(<Avatar name="דינה כהן" src="/files/download/u1/file.jpg?token=t" />);
    const img = screen.getByRole('img', { name: 'דינה כהן' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/api/files/download/u1/file.jpg?token=t');
  });

  it('falls back to the initials when the picture fails to load', () => {
    render(<Avatar name="דינה כהן" src="/files/download/u1/file.jpg?token=t" />);
    fireEvent.error(screen.getByRole('img', { name: 'דינה כהן' }));
    expect(screen.getByRole('img', { name: 'דינה כהן' })).toHaveTextContent('דכ');
  });

  it('tries again when given a new picture after a failure', () => {
    const { rerender } = render(<Avatar name="דינה כהן" src="/files/download/u1/file.jpg?token=1" />);
    fireEvent.error(screen.getByRole('img'));
    rerender(<Avatar name="דינה כהן" src="/files/download/u1/file.jpg?token=2" />);
    expect(screen.getByRole('img').tagName).toBe('IMG');
  });

  it('gives the same color to the same name, and sizes by prop', () => {
    const { container } = render(<><Avatar name="דינה" size="xl" /><Avatar name="דינה" size="sm" /></>);
    const [big, small] = Array.from(container.children);
    expect(big.className).toContain('size-24');
    expect(small.className).toContain('size-6');
    const color = (el: Element) => el.className.match(/bg-(clay|indigo|sage|coral)/)![0];
    expect(color(big)).toBe(color(small));
  });
});
