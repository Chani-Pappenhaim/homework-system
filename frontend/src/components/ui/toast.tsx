import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

// A working no-op default so `useToast()` never throws when a component is
// rendered without the provider (e.g. in unit tests).
const noop: ToastContextValue = { show: () => {}, success: () => {}, error: () => {} };
const ToastContext = createContext<ToastContextValue>(noop);

export function useToast() {
  return useContext(ToastContext);
}

const DURATION = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => remove(id), DURATION);
  }, [remove]);

  const value = useMemo<ToastContextValue>(() => ({
    show,
    success: (m: string) => show(m, 'success'),
    error: (m: string) => show(m, 'error'),
  }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        dir="rtl"
        className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex min-w-[240px] max-w-[90vw] items-center gap-2.5 rounded-card border bg-card px-4 py-3 shadow-lg',
              'animate-in fade-in-0 slide-in-from-bottom-3',
              t.variant === 'success' ? 'border-green-200' : 'border-red-200'
            )}
          >
            {t.variant === 'success'
              ? <CheckCircle size={18} className="flex-shrink-0 text-green-600" />
              : <AlertCircle size={18} className="flex-shrink-0 text-red-600" />}
            <p className="flex-1 text-sm font-medium text-foreground">{t.message}</p>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="flex-shrink-0 text-[#9CA3AF] transition hover:text-foreground"
              aria-label="סגירה"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
