import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchServerVersion, useNewVersionAvailable } from '@/lib/appVersion';

function serve(version: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => ({ version }) }));
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchServerVersion', () => {
  it('returns the version the server reports', async () => {
    serve('abc');
    expect(await fetchServerVersion()).toBe('abc');
  });

  it('returns null when the file is missing or the request fails', async () => {
    serve('abc', false);
    expect(await fetchServerVersion()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchServerVersion()).toBeNull();
  });
});

describe('useNewVersionAvailable', () => {
  it('is false while the server runs the same build', async () => {
    serve(__APP_VERSION__);
    const { result } = renderHook(() => useNewVersionAvailable());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('turns true when the server runs a different build', async () => {
    serve('newer-build');
    const { result } = renderHook(() => useNewVersionAvailable());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
