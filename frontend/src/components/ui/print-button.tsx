import type { RefObject } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { printElement } from '@/lib/print';

interface PrintButtonProps {
  /** The part of the page to print. */
  target: RefObject<HTMLElement | null>;
  /** The heading of the printed page. */
  title: string;
  className?: string;
}

/** Prints the given part of the page on its own, under a heading. */
export function PrintButton({ target, title, className }: PrintButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => { if (target.current) printElement(target.current, title); }}
    >
      <Printer size={13} /> הדפסה
    </Button>
  );
}
