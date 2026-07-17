import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders a heading from markdown', () => {
    render(<MarkdownRenderer content={'# Title here'} />);
    expect(screen.getByRole('heading', { name: 'Title here' })).toBeInTheDocument();
  });

  it('renders bold text', () => {
    const { container } = render(<MarkdownRenderer content={'**bold**'} />);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
  });

  it('renders a link', () => {
    render(<MarkdownRenderer content={'[click](https://example.com)'} />);
    const link = screen.getByRole('link', { name: 'click' });
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('renders GFM tables (remark-gfm)', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const { container } = render(<MarkdownRenderer content={md} />);
    expect(container.querySelector('table')).toBeInTheDocument();
  });

  it('sanitizes dangerous script content (dompurify strips it)', () => {
    const { container } = render(
      <MarkdownRenderer content={'<script>window.__pwn = 1</script>ok'} />
    );
    expect(container.querySelector('script')).toBeNull();
    expect((window as any).__pwn).toBeUndefined();
  });

  it('applies a custom wrapper className', () => {
    const { container } = render(<MarkdownRenderer content={'x'} className="wrap-me" />);
    expect(container.querySelector('.wrap-me')).toBeInTheDocument();
  });
});
