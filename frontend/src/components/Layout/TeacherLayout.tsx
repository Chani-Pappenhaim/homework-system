import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, BookOpen, Users, BarChart2, Sparkles, MessageSquare,
  Bell, Plus, LogOut, Search, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import useAuthStore from '@/store/authStore';
import useUiStore from '@/store/uiStore';
import { authApi } from '@/api/auth.api';
import { messagesApi } from '@/api/messages.api';
import { BrandMark, Tape, Paperclip, Stamp } from '@/components/decor';

/** Notebook table-of-contents. `tag` is the mono 01–06 index-card number. */
const nav = [
  { to: '/teacher', label: 'לוח בקרה', icon: LayoutDashboard, tag: '01', end: true },
  { to: '/teacher/courses', label: 'קורסים', icon: BookOpen, tag: '02' },
  { to: '/teacher/groups', label: 'קבוצות', icon: Users, tag: '03' },
  { to: '/teacher/reports', label: 'ציונים', icon: BarChart2, tag: '04' },
  { to: '/teacher/ai-usage', label: 'שימוש AI', icon: Sparkles, tag: '05' },
  { to: '/teacher/messages', label: 'הודעות', icon: MessageSquare, tag: '06' },
];

const shortcuts = [
  { label: 'חיפוש', keys: '⌘K' },
  { label: 'מטלה חדשה', keys: '⌘N' },
  { label: 'הבא בתור', keys: 'J' },
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

  // ⌘K / Ctrl+K focuses the search box from anywhere.
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

  // Typing in the header search jumps to the dashboard, where the queue filters.
  function onSearchChange(value: string) {
    setSearch(value);
    if (value && window.location.pathname !== '/teacher') navigate('/teacher');
  }

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    clearAuth();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-grid-paper" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b-4 border-ink bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4">
          {/* Brand (right in RTL) */}
          <button className="flex items-center gap-3" onClick={() => navigate('/teacher')}>
            <BrandMark />
            <div className="text-right leading-none">
              <div className="font-display text-2xl font-black text-ink">מסד</div>
              <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-ink/60">
                <span className="size-1.5 rounded-full bg-forest blink" />
                Homework · OS
              </div>
            </div>
          </button>

          {/* Search (center) */}
          <div className="mx-auto hidden w-full max-w-md items-center gap-2 border-2 border-ink bg-paper px-3 py-2 shadow-brutal-sm transition-all focus-within:shadow-brutal md:flex">
            <Search size={16} className="text-ink/50" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
              placeholder="חיפוש תלמידה, מטלה, קורס…"
            />
            {search ? (
              <button onClick={() => setSearch('')} className="font-mono text-xs text-ink/50 hover:text-tomato">✕</button>
            ) : (
              <kbd className="border-2 border-ink bg-mustard px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink">⌘K</kbd>
            )}
          </div>

          {/* Actions (left) */}
          <div className="mr-auto flex items-center gap-2 md:mr-0">
            <button
              onClick={() => navigate('/teacher/messages')}
              title="הודעות"
              className="relative grid size-9 place-items-center border-2 border-ink bg-paper shadow-brutal-sm hover-lift"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -left-2 -top-2 grid size-5 place-items-center rounded-full border-2 border-ink bg-tomato font-mono text-[10px] font-bold text-paper">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate('/teacher/courses/new')}
              className="hidden items-center gap-2 border-2 border-ink bg-paper px-3 py-2 text-sm font-bold shadow-brutal-sm hover-lift sm:flex"
            >
              <span className="grid size-4 place-items-center bg-mustard"><Plus size={12} /></span>
              מטלה חדשה
            </button>
            <div
              className="flex items-center gap-2 border-2 border-ink bg-lilac px-2 py-1 shadow-brutal-sm"
              style={{ transform: 'rotate(-2deg)' }}
            >
              <span className="grid size-7 place-items-center border-2 border-ink bg-paper font-display font-black">
                {user?.name?.[0] ?? 'מ'}
              </span>
              <div className="hidden text-right leading-tight lg:block">
                <div className="text-xs font-bold text-ink">{user?.name ?? 'מורה'}</div>
                <div className="font-mono text-[10px] text-ink/70">מנהלת</div>
              </div>
              <button onClick={handleLogout} title="יציאה" className="text-ink/70 hover:text-tomato">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Body: sidebar (right) + main */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-6 px-4 py-6">
        <aside className="hidden w-[240px] shrink-0 flex-col gap-5 lg:flex">
          {/* Table of contents */}
          <nav>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-display text-sm font-bold text-ink">תוכן עניינים</span>
              <span className="font-mono text-[11px] text-ink/45">A/06</span>
            </div>
            <div className="flex flex-col gap-2">
              {nav.map(({ to, label, icon: Icon, tag, end }) => (
                <NavLink key={to} to={to} end={end}>
                  {({ isActive }) => (
                    <div
                      className={cn(
                        'flex items-center gap-2.5 border-2 border-ink px-3 py-2.5 text-sm font-bold transition-all duration-150 ease-linear',
                        isActive
                          ? 'bg-ink text-paper shadow-brutal-mustard'
                          : 'bg-paper text-ink shadow-brutal-sm hover:-translate-x-0.5 hover:-translate-y-0.5',
                      )}
                    >
                      <Icon size={16} className={isActive ? 'text-mustard' : 'text-ink/70'} />
                      <span className="flex-1">{label}</span>
                      {to === '/teacher/messages' && unreadCount > 0 && (
                        <span className="grid size-4 place-items-center rounded-full bg-tomato font-mono text-[10px] text-paper">
                          {unreadCount}
                        </span>
                      )}
                      {isActive ? (
                        <span className="text-mustard">←</span>
                      ) : (
                        <span className="font-mono text-[11px] text-ink/40">{tag}</span>
                      )}
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>

          {/* Sticky-note hot alert */}
          <div
            className="relative border-2 border-ink bg-mustard p-3 shadow-brutal"
            style={{ transform: 'rotate(-2deg)' }}
          >
            <Tape color="lilac" rotate={4} className="-top-3 right-6 h-5 w-16" />
            <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink">
              <Zap size={13} /> התראה חמה
            </div>
            <p className="text-sm leading-snug text-ink">
              <span className="scribble-underline font-bold">נעמה</span> הגישה מטלה באיחור — ממתינה לבדיקה.
            </p>
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={() => navigate('/teacher/messages')}
                className="border-2 border-ink bg-paper px-2 py-1 text-xs font-bold shadow-brutal-sm hover-lift"
              >
                פתחי לבדיקה →
              </button>
              <Stamp>URGENT</Stamp>
            </div>
          </div>

          {/* Shortcuts */}
          <div className="relative border-2 border-ink bg-ruled p-3 shadow-brutal-sm">
            <Paperclip rotate={-10} className="-top-4 left-6" />
            <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink/70">קיצורים</div>
            <div className="flex flex-col gap-1.5">
              {shortcuts.map((s) => (
                <div key={s.label} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{s.label}</span>
                  <kbd className="border-2 border-ink bg-mustard px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t-4 border-double border-ink bg-paper/70">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-3 font-mono text-[11px] text-ink/60">
          <div className="flex items-center gap-2">
            <span className="border-2 border-ink bg-mustard px-1.5 py-0.5 font-bold text-ink">מסד</span>
            <span>Homework OS · v3</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-forest blink" />
            <span>ONLINE · build 2026.07</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
