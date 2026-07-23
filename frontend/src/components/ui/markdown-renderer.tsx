import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  className?: string;
}

/**
 * No DOMPurify here on purpose.
 *
 * It used to sanitize the *Markdown source* before react-markdown parsed it,
 * which protected nothing — rehype-raw is not enabled, so react-markdown
 * already escapes raw HTML rather than rendering it. What it did do was mangle
 * legitimate content: a lesson teaching HTML had its ```html examples stripped
 * before they ever reached a code block.
 *
 * If raw HTML is ever wanted here, add rehype-raw AND sanitize at the rehype
 * stage — sanitizing the source string is the wrong layer either way.
 */
function MarkdownRenderer({ content, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        className="prose prose-sm max-w-none text-ink prose-headings:text-ink prose-code:bg-cream prose-code:px-1 prose-code:rounded"
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export { MarkdownRenderer };
