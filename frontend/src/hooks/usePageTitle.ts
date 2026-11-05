import { useEffect } from 'react';
import { useSiteNames } from '@/lib/siteNames';

/**
 * Sets the browser tab's title for the current page ("שיעור 3 · React · המורה
 * עדי שלום"). Empty parts are skipped, so a page can call it before its data
 * has loaded and the title fills in when it arrives.
 */
export function usePageTitle(...parts: (string | null | undefined | false)[]) {
  const APP_NAME = useSiteNames().teacherName;
  const title = [...parts.filter(Boolean), APP_NAME].join(' · ');
  useEffect(() => {
    document.title = title;
    // Pages without a title of their own (the home pages) show just the app's name.
    return () => { document.title = APP_NAME; };
  }, [title, APP_NAME]);
}
