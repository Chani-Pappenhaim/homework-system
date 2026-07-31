import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

/** A modal confirmation, replacing the browser's native `confirm()` — unstyled, blocks the whole tab, and can't show details like a student's name/email together. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'אישור', cancelLabel = 'ביטול',
  destructive = true, loading, onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && <DialogBody><p className="text-sm text-ink/70">{description}</p></DialogBody>}
        <DialogFooter>
          <Button variant={destructive ? 'destructive' : 'default'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
