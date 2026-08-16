import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A textarea that grows to fit its content instead of scrolling.
 *
 * Quiz answers are often a full sentence. In a single-line input the text runs
 * past the edge of the box and the teacher can only read the first few words of
 * the option she is trying to check — so the fields that hold authored text
 * wrap and expand rather than clip.
 */
const AutoTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, value, onChange, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      // Collapse first so the height can shrink again when text is deleted.
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, []);

    // Re-measure on every value change, including ones that come from outside
    // (loading the server's questions, discarding edits).
    React.useLayoutEffect(resize, [value, resize]);

    return (
      <textarea
        ref={innerRef}
        rows={1}
        value={value}
        onChange={(e) => { onChange?.(e); resize(); }}
        className={cn(
          'block w-full resize-none overflow-hidden rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink',
          'placeholder:text-ink-soft/70 transition-colors duration-150 ease-out',
          'focus-visible:outline-none focus-visible:border-clay focus-visible:ring-2 focus-visible:ring-clay/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
AutoTextarea.displayName = 'AutoTextarea';

export { AutoTextarea };
