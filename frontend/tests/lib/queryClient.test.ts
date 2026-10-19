import { describe, it, expect, vi } from 'vitest';
import { MutationObserver, QueryObserver } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/queryClient';

vi.mock('@/components/ui/toast', () => ({ showErrorToast: vi.fn() }));

describe('createQueryClient', () => {
  it('marks every cached query stale after a successful change, without fetching it', async () => {
    const client = createQueryClient();
    const courseFn = vi.fn().mockResolvedValue('fresh');
    client.setQueryData(['course', 'c1'], 'cached');

    await new MutationObserver(client, { mutationFn: async () => 'ok' }).mutate();

    expect(client.getQueryState(['course', 'c1'])?.isInvalidated).toBe(true);
    expect(courseFn).not.toHaveBeenCalled();

    // The page that shows it next fetches fresh data instead of the cached copy.
    const observer = new QueryObserver(client, { queryKey: ['course', 'c1'], queryFn: courseFn });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(courseFn).toHaveBeenCalledTimes(1));
    unsubscribe();
  });

  it('leaves the cache alone when the change failed', async () => {
    const client = createQueryClient();
    client.setQueryData(['course', 'c1'], 'cached');

    await new MutationObserver(client, {
      mutationFn: async () => { throw new Error('nope'); },
      onError: () => {},
    }).mutate().catch(() => {});

    expect(client.getQueryState(['course', 'c1'])?.isInvalidated).toBe(false);
  });
});
