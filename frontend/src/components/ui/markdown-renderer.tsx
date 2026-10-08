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

// Short text keeps its emphasis, code and links; headings and lists are
// flattened to their text so a stray "#" can't blow a line up into a title.
const INLINE_ELEMENTS = ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'a'];

/**
 * Markdown for a short line of text that sits inside a sentence-sized slot (a
 * quiz question, an answer next to its radio button). Everything renders as
 * inline elements, so it is valid inside a <p> or a <label>, and it inherits
 * the surrounding font size and colour instead of the article styling of
 * MarkdownRenderer.
 */
function MarkdownText({ content, className }: { content: string; className?: string }) {
  return (
    <span className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={INLINE_ELEMENTS}
        unwrapDisallowed
        components={{
          // The first paragraph stays inline so a leading "3. " sits on the same line.
          p: ({ children }) => <span className="[&:not(:first-child)]:mt-1 [&:not(:first-child)]:block">{children}</span>,
          pre: ({ children }) => (
            <span dir="ltr" className="my-1 block overflow-x-auto whitespace-pre rounded bg-cream p-2 text-left font-mono text-xs [&>code]:bg-transparent [&>code]:p-0">
              {children}
            </span>
          ),
          code: ({ children }) => <code dir="ltr" className="rounded bg-cream px-1 font-mono text-[0.9em]">{children}</code>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>{children}</a>
          ),
        }}
      >
        {withHardBreaks(content)}
      </ReactMarkdown>
    </span>
  );
}

export { MarkdownRenderer, MarkdownText };
