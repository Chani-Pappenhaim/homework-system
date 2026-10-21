import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownRenderer, MarkdownText } from '@/components/ui/markdown-renderer';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('MarkdownRenderer - pictures inlined in the text', () => {
  it('shows a picture converted from a Word file', () => {
    render(<MarkdownRenderer content={`![מסך](${PNG})`} />);
    expect(screen.getByRole('img', { name: 'מסך' })).toHaveAttribute('src', PNG);
  });

  it('still shows a picture stored as a file', () => {
    render(<MarkdownRenderer content={'![x](https://res.cloudinary.com/demo/image/upload/a.png)'} />);
    expect(screen.getByRole('img', { name: 'x' })).toHaveAttribute('src', 'https://res.cloudinary.com/demo/image/upload/a.png');
  });

  it('never lets a data URL through as a link', () => {
    render(<MarkdownRenderer content={'[לחצי](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'} />);
    expect(screen.getByText('לחצי').closest('a')?.getAttribute('href') ?? '').not.toContain('data:');
  });

  it('does not take a document disguised as a picture', () => {
    render(<MarkdownRenderer content={'![x](data:text/html;base64,PHNjcmlwdD4=)'} />);
    expect(screen.getByRole('img', { name: 'x' }).getAttribute('src') ?? '').not.toContain('data:');
  });
});

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

  it('never executes raw html (react-markdown escapes it without rehype-raw)', () => {
    const { container } = render(
      <MarkdownRenderer content={'<script>window.__pwn = 1</script>ok'} />
    );
    expect(container.querySelector('script')).toBeNull();
    expect((window as any).__pwn).toBeUndefined();
  });

  it('keeps html inside a code block intact - lessons teach html', () => {
    // Regression: DOMPurify ran on the markdown source, so a lesson's ```html
    // example was stripped before it ever became a code block.
    const md = '```html\n<script>alert(1)</script>\n```';
    const { container } = render(<MarkdownRenderer content={md} />);
    const code = container.querySelector('code');
    expect(code?.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull(); // shown, not executed
  });

  it('renders inline html as literal text rather than dropping it', () => {
    const { container } = render(<MarkdownRenderer content={'use `<div>` for layout'} />);
    expect(container.textContent).toContain('<div>');
  });

  it('applies a custom wrapper className', () => {
    const { container } = render(<MarkdownRenderer content={'x'} className="wrap-me" />);
    expect(container.querySelector('.wrap-me')).toBeInTheDocument();
  });

  it('keeps single line breaks when asked to (chat-style text)', () => {
    const { container } = render(<MarkdownRenderer content={'line one\nline two'} keepLineBreaks />);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('joins single line breaks by default', () => {
    const { container } = render(<MarkdownRenderer content={'line one\nline two'} />);
    expect(container.querySelectorAll('br')).toHaveLength(0);
  });
});

describe('MarkdownText', () => {
  it('renders inline code and bold', () => {
    const { container } = render(<MarkdownText content={'מה מחזיר `arr.length` עבור **מערך ריק**?'} />);
    expect(container.querySelector('code')?.textContent).toBe('arr.length');
    expect(container.querySelector('strong')?.textContent).toBe('מערך ריק');
  });

  it('keeps a code block left-to-right', () => {
    const { container } = render(<MarkdownText content={'מה יודפס?\n\n```\nconsole.log(1)\n```'} />);
    const code = container.querySelector('code');
    expect(code?.textContent).toContain('console.log(1)');
    expect(code?.closest('[dir="ltr"]')).not.toBeNull();
  });

  it('flattens a heading to plain text', () => {
    render(<MarkdownText content={'# כותרת'} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('כותרת')).toBeInTheDocument();
  });

  it('renders only inline elements, so it fits inside a paragraph', () => {
    const { container } = render(<MarkdownText content={'שורה ראשונה\n\nשורה שנייה'} />);
    expect(container.querySelector('p, div, h1, ul, pre')).toBeNull();
  });

  it('keeps single line breaks', () => {
    const { container } = render(<MarkdownText content={'שורה אחת\nשורה שתיים'} />);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('opens links in a new tab', () => {
    render(<MarkdownText content={'[תיעוד](https://react.dev)'} />);
    expect(screen.getByRole('link', { name: 'תיעוד' })).toHaveAttribute('target', '_blank');
  });
});

describe('MarkdownRenderer - code blocks', () => {
  it('colours a block by its language', () => {
    const { container } = render(<MarkdownRenderer content={'```js\nconst x = 1;\n```'} />);
    expect(container.querySelector('pre code.hljs .hljs-keyword')).toHaveTextContent('const');
  });

  it('guesses the language of a block that names none', () => {
    const { container } = render(<MarkdownRenderer content={'```\nfunction add(a, b) {\n  return a + b;\n}\n```'} />);
    expect(container.querySelector('pre code')).toHaveClass('language-javascript');
    expect(container.querySelector('pre code .hljs-keyword')).toHaveTextContent('function');
  });

  it('still colours a block marked as CSS', () => {
    const { container } = render(<MarkdownRenderer content={['```css', '.card { color: red; }', '```'].join('\n')} />);
    expect(container.querySelector('pre code')).toHaveClass('language-css');
  });

  it('sits in the block that the left-to-right code styles apply to', () => {
    const { container } = render(<MarkdownRenderer content={'```\nx\n```'} />);
    expect(container.querySelector('.markdown-body pre')).not.toBeNull();
  });
});

describe('MarkdownRenderer - content converted from Word', () => {
  it('draws a formula written between double dollar signs', () => {
    const { container } = render(<MarkdownRenderer content={String.raw`נוסחה: $$x=\frac{a+b}{2}$$ בתוך משפט`} />);
    expect(container.querySelector('.katex .mfrac')).not.toBeNull();
    expect(screen.getByText(/נוסחה:/)).toBeInTheDocument();
  });

  it('draws a formula block on its own lines', () => {
    const { container } = render(<MarkdownRenderer content={'$$\nE=mc^2\n$$'} />);
    expect(container.querySelector('.katex-display')).not.toBeNull();
  });

  it('leaves a single dollar sign as text', () => {
    const { container } = render(<MarkdownRenderer content={'עולה $5 או $6'} />);
    expect(container.querySelector('.katex')).toBeNull();
    expect(screen.getByText('עולה $5 או $6')).toBeInTheDocument();
  });

  it('shows a table, which scrolls on its own when wide', () => {
    const { container } = render(<MarkdownRenderer content={'| שם | ציון |\n| --- | --- |\n| א | 90 |'} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '90' })).toBeInTheDocument();
    expect(container.querySelector('.overflow-x-auto > table')).not.toBeNull();
  });
});
