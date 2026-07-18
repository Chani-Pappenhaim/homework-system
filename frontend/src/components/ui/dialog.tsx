import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: keyof typeof sizes;
  /** Hides the built-in corner close button for dialogs that supply their own. */
  hideClose?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, size = 'md', hideClose, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/*
      The panel is capped and its body scrolls inside it. Without max-h/flex,
      tall dialogs (grading, lesson edit) ran past the bottom of the viewport
      while the page behind was scroll-locked, leaving the save button
      unreachable on a laptop screen.
    */}
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2',
        'mx-4 flex max-h-[90vh] flex-col rounded-card border border-border bg-card shadow-xl',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        // `end-4` follows the writing direction, so it sits top-left in this
        // RTL app and top-right if a subtree is ever flipped to LTR.
        <DialogPrimitive.Close
          className={cn(
            'absolute end-4 top-4 rounded-sm p-1 text-muted-foreground opacity-70 transition',
            'hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/40',
            'disabled:pointer-events-none'
          )}
        >
          <X size={16} />
          <span className="sr-only">סגירה</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex-shrink-0 border-b border-border px-5 py-4 pe-12', className)}
      {...props}
    />
  );
}
DialogHeader.displayName = 'DialogHeader';

function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('overflow-y-auto px-5 py-4', className)} {...props} />;
}
DialogBody.displayName = 'DialogBody';

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-shrink-0 flex-row-reverse gap-2 border-t border-border px-5 py-4',
        className
      )}
      {...props}
    />
  );
}
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-base font-semibold text-foreground', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
