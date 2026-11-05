import { useSyncExternalStore } from 'react';
import { siteApi, type SiteNames } from '@/api/site.api';

export const MAX_SITE_NAME = 60;
export const DEFAULT_SITE_NAMES: SiteNames = { brandName: 'Teacher Feature', teacherName: 'המורה עדי שלום' };

const STORAGE_KEY = 'site-names';

function readCached(): SiteNames {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (raw && typeof raw.brandName === 'string' && typeof raw.teacherName === 'string') return raw;
  } catch { /* storage unavailable or corrupt: use the defaults */ }
  return DEFAULT_SITE_NAMES;
}

let current: SiteNames = readCached();
const listeners = new Set<() => void>();

/** Replaces the site's names for every component showing them, and remembers them for the next visit. */
export function setSiteNames(next: SiteNames) {
  if (next.brandName === current.brandName && next.teacherName === current.teacherName) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
  listeners.forEach((l) => l());
}

/** Loads the names from the server; a failure keeps the cached ones. */
export async function loadSiteNames() {
  try {
    setSiteNames((await siteApi.get()).data.data);
  } catch { /* offline or server waking: the cached names stay */ }
}

export function getSiteNames(): SiteNames {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSiteNames(): SiteNames {
  return useSyncExternalStore(subscribe, getSiteNames, getSiteNames);
}
