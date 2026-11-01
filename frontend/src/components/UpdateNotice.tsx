import { RefreshCw } from 'lucide-react';

/** A bar telling the user a newer version of the site is out, with a button that reloads into it. */
export function UpdateNotice() {
  return (
    <div role="status" className="fixed inset-x-0 bottom-16 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-input border border-rule bg-sheet px-4 py-2 text-sm shadow-soft md:bottom-4" dir="rtl">
      <span>יצאה גרסה חדשה של האתר.</span>
      <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1 font-semibold text-clay underline">
        <RefreshCw size={13} /> רענון
      </button>
    </div>
  );
}
