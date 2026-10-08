import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  className?: string;
  /** Show every line break as written (chat-style text), not only blank-line paragraphs. */
  keepLineBreaks?: boolean;
}

/** Turns single line breaks into Markdown hard breaks, leaving code blocks untouched. */
function withHardBreaks(content: string): string {
  return content
    .split(/(```[\s\S]*?```)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/([^\n])\n(?!\n)/g, '$1  \n')))
    .join('');
}

/**
 * No DOMPurify here on purpose: rehype-raw is not enabled, so react-markdown
 * already escapes raw HTML instead of rendering it, making source-level
 * sanitization redundant and liable to mangle legitimate content (e.g. ```html
 * code examples). If raw HTML support is ever added, sanitize at the rehype
 * stage via rehype-raw, not by scrubbing the source string.
 */
function MarkdownRenderer({ content, className, keepLineBreaks }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        className="prose prose-sm max-w-none text-ink prose-headings:text-ink prose-code:bg-cream prose-code:px-1 prose-code:rounded"
      >
        {keepLineBreaks ? withHardBreaks(content) : content}
      </ReactMarkdown>
    </div>
  );
}

export { MarkdownRenderer };
