import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

// The site's messages that send a student to her teacher ("פני למורה").
const ASKS_FOR_TEACHER = /(פני|לפנות|פנו)\s+למורה/;

/** Where a student writes to her teacher, with the message already started when `draft` is given. */
export function messageTeacherPath(draft?: string): string {
  const params = new URLSearchParams({ compose: '1' });
  if (draft) params.set('draft', draft);
  return `/student/messages?${params}`;
}

/**
 * A message shown to a student. When it tells her to contact the teacher, a
 * link right after it opens a new message to the teacher, starting with
 * `about` so the teacher knows what it is about.
 */
export function ContactTeacherText({ text, about, className }: { text: string; about?: string; className?: string }) {
  return (
    <p className={className}>
      {text}
      {ASKS_FOR_TEACHER.test(text) && (
        <>
          {' '}
          <Link to={messageTeacherPath(about)} className={cn('inline-flex items-center gap-1 font-semibold text-clay underline')}>
            <MessageSquare size={12} /> שליחת הודעה למורה
          </Link>
        </>
      )}
    </p>
  );
}
