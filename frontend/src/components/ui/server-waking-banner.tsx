import useServerStatus from '@/store/serverStatus';

/**
 * Top banner shown while the backend is cold-starting after a period of
 * inactivity. Visibility is driven by the serverStatus store, which the
 * axios interceptors update whenever a request stalls.
 */
export function ServerWakingBanner() {
  const waking = useServerStatus((s) => s.waking);
  if (!waking) return null;

  return (
    <div
      dir="rtl"
      role="status"
      className="fixed inset-x-0 top-0 z-[200] flex items-center justify-center gap-2 bg-[#1A1830] px-4 py-2 text-sm text-[#F0EAF8] shadow-md"
    >
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#F0EAF8]/30 border-t-[#F0EAF8]" />
      השרת מתעורר לאחר תקופת חוסר פעילות — הפעולה תושלם בעוד רגע...
    </div>
  );
}
