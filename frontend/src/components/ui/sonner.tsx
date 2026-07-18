import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Mounted once near the app root. Pages raise notifications with
 * `import { toast } from 'sonner'` — no context or provider wiring needed.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      dir="rtl"
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            'group flex items-center gap-3 rounded-card border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground rounded-input px-2 py-1 text-xs',
          cancelButton: 'bg-muted text-muted-foreground rounded-input px-2 py-1 text-xs',
          error: 'border-destructive/40 text-destructive',
          success: 'border-emerald-300 text-emerald-700',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
