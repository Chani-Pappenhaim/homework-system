import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/*
        The panel is capped and the body scrolls inside it. Without this, tall
        modals (grading, lesson edit) ran past the bottom of the viewport with
        the page behind already scroll-locked, leaving the save button
        unreachable on a laptop screen.
      */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative bg-white rounded-card shadow-xl z-10 w-full mx-4 max-h-[90vh] flex flex-col',
          size === 'sm' && 'max-w-sm',
          size === 'md' && 'max-w-lg',
          size === 'lg' && 'max-w-2xl'
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEBF5] flex-shrink-0">
            <h2 className="text-base font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="סגירה" className="p-1 rounded hover:bg-[#F3F4F6] text-[#6B7280]">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
