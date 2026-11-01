import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { showErrorToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';

// A page that fails to load several queries at once should show one message, not a stack of them.
const TOAST_DEDUPE_MS = 5000;
let lastToast = { message: '', at: 0 };

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      // Pages that render their own error state still do; this makes sure a page that
      // doesn't never shows a silently empty screen. A 401 is the sign-in flow's to handle.
      onError: (error: any) => {
        if (error?.response?.status === 401) return;
        const message = getApiErrorMessage(error);
        const now = Date.now();
        if (message === lastToast.message && now - lastToast.at < TOAST_DEDUPE_MS) return;
        lastToast = { message, at: now };
        showErrorToast(message);
      },
    }),
    mutationCache: new MutationCache({
      // A change may show up on pages other than the one that made it (a lesson's
      // date also appears in its course's list). Each mutation refetches what is on
      // screen itself; everything else is marked stale here, so a page opened next
      // fetches fresh data instead of showing its cached copy for up to staleTime.
      // `refetchType: 'none'` only marks - nothing is requested until a page needs it.
      onSuccess: () => client.invalidateQueries({ refetchType: 'none' }),
      // Fallback for actions that don't handle their own failure: show the server's
      // message instead of failing silently. Mutations with their own onError keep full control.
      onError: (error, _variables, _context, mutation) => {
        if (mutation.options.onError) return;
        showErrorToast(getApiErrorMessage(error));
      },
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error: any) => {
          if (error?.response?.status === 429 || error?.response?.status === 401) return false;
          return failureCount < 1;
        },
        staleTime: 1000 * 30,
        refetchOnWindowFocus: true,
      },
    },
  });
  return client;
}
