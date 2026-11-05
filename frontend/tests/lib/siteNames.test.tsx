import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('@/api/site.api', () => ({ siteApi: { get: vi.fn(), update: vi.fn() } }));
import { siteApi } from '@/api/site.api';
import { DEFAULT_SITE_NAMES, getSiteNames, loadSiteNames, setSiteNames, useSiteNames } from '@/lib/siteNames';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Brand } from '@/components/decor/Brand';

const get = siteApi.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setSiteNames(DEFAULT_SITE_NAMES);
});

function Title() {
  usePageTitle('שיעור 3');
  return null;
}

describe('site names', () => {
  it('loads the names from the server', async () => {
    get.mockResolvedValue({ data: { data: { brandName: 'My Site', teacherName: 'המורה עדי כהן' } } });
    await loadSiteNames();
    expect(getSiteNames()).toEqual({ brandName: 'My Site', teacherName: 'המורה עדי כהן' });
  });

  it('keeps the current names when the server cannot be reached', async () => {
    get.mockRejectedValue(new Error('offline'));
    await loadSiteNames();
    expect(getSiteNames()).toEqual(DEFAULT_SITE_NAMES);
  });

  it('remembers the names for the next visit', () => {
    setSiteNames({ brandName: 'Cached', teacherName: 'T' });
    expect(JSON.parse(localStorage.getItem('site-names')!)).toEqual({ brandName: 'Cached', teacherName: 'T' });
  });

  it('updates the brand and the page title in place when the names change', () => {
    render(<><Title /><Brand teacher /></>);
    expect(screen.getByText('Teacher Feature')).toBeInTheDocument();
    expect(document.title).toBe('שיעור 3 · המורה עדי שלום');
    act(() => setSiteNames({ brandName: 'My Site', teacherName: 'המורה עדי כהן' }));
    expect(screen.getByText('My Site')).toBeInTheDocument();
    expect(screen.getByText('המורה עדי כהן')).toBeInTheDocument();
    expect(document.title).toBe('שיעור 3 · המורה עדי כהן');
  });

  it('exposes the names through the hook', () => {
    function Show() { return <span>{useSiteNames().brandName}</span>; }
    render(<Show />);
    expect(screen.getByText('Teacher Feature')).toBeInTheDocument();
  });
});
