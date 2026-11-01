import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type LazyPage = LazyExoticComponent<ComponentType> & { preload: () => void };

/**
 * A page component whose code is downloaded only when the page is first shown.
 * `preload` starts that download early (e.g. while the pointer is over a link
 * to the page), so the page is usually ready by the time it is opened.
 */
export function lazyPage(load: () => Promise<{ default: ComponentType }>): LazyPage {
  const page = lazy(load) as LazyPage;
  page.preload = () => {
    void load().catch(() => {});
  };
  return page;
}
