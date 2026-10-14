import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

/**
 * A promise-based drop-in for the browser's native `confirm()`, shown as the
 * app's styled dialog. Render the returned element once in the component:
 *
 *   const [confirmDialog, ask] = useConfirm();
 *   if (await ask({ title: 'למחוק?' })) ...
 */
export function useConfirm(): [React.ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  const ask = useCallback((next: ConfirmOptions) => {
    // A dialog that is replaced before it was answered counts as cancelled
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const dialog = (
    <ConfirmDialog
      open={!!options}
      onOpenChange={(open) => { if (!open) settle(false); }}
      title={options?.title ?? ''}
      description={options?.description}
      confirmLabel={options?.confirmLabel ?? 'מחיקה'}
      destructive={options?.destructive ?? true}
      onConfirm={() => settle(true)}
    />
  );

  return [dialog, ask];
}
