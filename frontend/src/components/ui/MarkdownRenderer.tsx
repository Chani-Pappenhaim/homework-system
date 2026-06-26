import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className }: Props) {
  const safe = DOMPurify.sanitize(content);

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        className="prose prose-sm max-w-none text-[#1A1830] prose-headings:text-[#1A1830] prose-code:bg-[#F3F4F6] prose-code:px-1 prose-code:rounded"
      >
        {safe}
      </ReactMarkdown>
    </div>
  );
}
