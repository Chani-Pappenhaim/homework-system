import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, BookOpen, Users, BarChart2, Sparkles, MessageSquare,
  Bell, LogOut, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import useAuthStore from '@/store/authStore';
import useUiStore from '@/store/uiStore';
import { authApi } from '@/api/auth.api';
import { messagesApi } from '@/api/messages.api';
import { Brand } from '@/components/decor';

const nav = [
  { to: '/teacher', label: 'לוח בקרה', icon: LayoutDashboard, end: true },
  { to: '/teacher/courses', label: 'קורסים', icon: BookOpen },
  { to: '/teacher/groups', label: 'קבוצות', icon: Users },
  { to: '/teacher/reports', label: 'ציונים', icon: BarChart2 },
  { to: '/teacher/ai-usage', label: 'שימוש AI', icon: Sparkles },
  { to: '/teacher/messages', label: 'הודעות', icon: MessageSquare },
];

export default function TeacherLayout() {
  const { user, clearAuth } = useAuthStore();
  const { search, setSearch } = useUiStore();
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: unreadData } = useQuery({
    queryKey: ['unread-messages'],
    queryFn: () => messagesApi.getUnreadCount(),
    refetchInterval: 60_000,
  });
  const unreadCount: number = (unreadData?.data as any)?.data?.count ?? 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onSearchChange(value: string) {
    setSearch(value);
    if (value && window.location.pathname !== '/teacher') navigate('/teacher');
  }

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    clearAuth();
    navigate('/login');
  }

  const initials = (user?.name ?? 'עדי שלום').split(' ').map((w) => w[0]).slice(0, 2).join('');

  return (
    <div className="flex min-h-screen flex-col bg-graph" dir="rtl">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-rule bg-sheet/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-4 px-4">
          <button onClick={() => navigate('/teacher')}>
            <Brand teacher />
          </button>

          <div className="mx-auto hidden w-full max-w-sm items-center gap-2 rounded-input border border-rule bg-sheet px-3 py-1.5 transition-colors focus-within:border-clay md:flex">
            <Search size={15} className="text-ink-soft" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
              placeholder="חיפוש תלמידה או מטלה"
            />
            {search ? (
              <button onClick={() => setSearch('')} className="text-xs text-ink-soft hover:text-coral">✕</button>
            ) : (
              <kbd className="rounded border border-rule px-1.5 text-[10px] text-ink-soft">⌘K</kbd>
            )}
          </div>

          <div className="mr-auto flex items-center gap-3 md:mr-0">
            <button
              onClick={() => navigate('/teacher/messages')}
              title="הודעות"
              className="relative grid size-9 place-items-center rounded-input text-ink-soft transition-colors hover:bg-ground hover:text-ink"
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute -left-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-coral text-[9px] font-bold text-sheet">
                  {unreadCount}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2 border-r border-rule pr-3">
              <span className="grid size-8 place-items-center rounded-full bg-clay text-xs font-semibold text-sheet">
                {initials}
              </span>
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-xs font-semibold text-ink">{user?.name ?? 'עדי שלום'}</div>
                <div className="text-[10px] text-ink-soft">מורה</div>
              </div>
              <button onClick={handleLogout} title="יציאה" className="text-ink-soft hover:text-coral">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Body: icon rail (right) + content */}
      <div className="mx-auto flex w-full max-w-[1240px] flex-1">
        <nav className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-14 shrink-0 flex-col items-center gap-1.5 border-l border-rule bg-sheet/60 py-4 md:flex">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="group relative">
              {({ isActive }) => (
                <span
                  className={cn(
                    'relative grid size-10 place-items-center rounded-md transition-colors',
                    isActive ? 'bg-ink text-sheet' : 'text-ink-soft hover:bg-ground hover:text-ink',
                  )}
                >
                  <Icon size={18} />
                  {to === '/teacher/messages' && unreadCount > 0 && (
                    <span className="absolute -left-1 -top-1 size-2 rounded-full bg-coral" />
                  )}
                  <span className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-sheet opacity-0 transition-opacity group-hover:opacity-100">
                    {label}
                  </span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile nav */}
      <nav className="sticky bottom-0 z-30 flex items-center justify-around border-t border-rule bg-sheet/90 px-2 py-1.5 backdrop-blur-sm md:hidden">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            {({ isActive }) => (
              <span className={cn('flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]', isActive ? 'text-ink' : 'text-ink-soft')}>
                <Icon size={18} />
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <footer className="hidden border-t border-rule bg-sheet/50 md:block">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-3 text-[11px] text-ink-soft">
          <span>קליק כיתה · המורה עדי שלום</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sage" /> מחובר</span>
        </div>
      </footer>
    </div>
  );
}
