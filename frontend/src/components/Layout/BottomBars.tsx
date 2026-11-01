import { NavLink } from 'react-router-dom';
import { preloadPage } from '@/lib/pages';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DevSignature } from '@/components/decor';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/**
 * The room a layout leaves under its content for the phone nav, so the end of
 * a page is never hidden behind it. Matches the nav's height (14).
 */
export const BOTTOM_BARS_SPACE = 'pb-14 md:pb-0';

/**
 * The page nav pinned to the bottom of a phone screen, and the credits footer
 * at the very end of the page on a wider screen. The nav is fixed to the screen
 * rather than sticky inside the layout, so a dropdown or popover that reaches
 * past the end of a short page never carries it up. The footer is a normal
 * block that sits last in the layout's column, so it is always at the bottom.
 */
export function BottomBars({ nav }: { nav: NavItem[] }) {
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex min-h-14 items-center justify-around border-t border-rule bg-sheet/90 px-2 backdrop-blur-sm md:hidden">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onFocus={() => preloadPage(to)} onTouchStart={() => preloadPage(to)}>
            {({ isActive }) => (
              <span className={cn('flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]', isActive ? 'text-ink' : 'text-ink-soft')}>
                <Icon size={18} />
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <footer className="hidden h-12 shrink-0 border-t border-rule bg-sheet/90 md:block">
        <div className="flex h-full items-center justify-between gap-4 px-6 text-[11px] text-ink-soft">
          <span>Teacher Feature · המורה עדי שלום</span>
          <DevSignature />
        </div>
      </footer>
    </>
  );
}
