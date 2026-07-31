import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Home, ClipboardList, MessageSquare, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import useAuthStore from '@/store/authStore';
import { authApi } from '@/api/auth.api';
import { messagesApi } from '@/api/messages.api';
import { Brand } from '@/components/decor';

const nav = [
  { to: '/student', label: 'בית', icon: Home, end: true },
  { to: '/student/assignments', label: 'מטלות', icon: ClipboardList },
  { to: '/student/messages', label: 'הודעה למורה', icon: MessageSquare },
];

export default function StudentLayout() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const { data: unreadReplyData } = useQuery({
    queryKey: ['unread-reply-count'],
    queryFn: () => messagesApi.getUnreadReplyCount(),
    refetchInterval: 60_000,
  });
  const unreadReplyCount: number = (unreadReplyData?.data as any)?.data?.count ?? 0;

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    clearAuth();
    navigate('/login');
  }

  const initials = (user?.name ?? 'תלמידה').split(' ').map((w) => w[0]).slice(0, 2).join('');

  return (
    <div className="flex min-h-screen flex-col bg-graph" dir="rtl">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-rule bg-sheet/80 backdrop-blur-sm">
        <div className="flex h-16 items-center gap-4 px-5 md:px-6">
          <button onClick={() => navigate('/student')}>
            <Brand />
          </button>

          <div className="mr-auto flex items-center gap-3">
            <div className="flex items-center gap-2 border-r border-rule pr-3">
              <span className="grid size-8 place-items-center rounded-full bg-clay text-xs font-semibold text-sheet">
                {initials}
              </span>
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-xs font-semibold text-ink">{user?.name ?? 'תלמידה'}</div>
                <div className="text-[10px] text-ink-soft">תלמידה</div>
              </div>
              <button onClick={handleLogout} title="יציאה" className="text-ink-soft hover:text-coral">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Body: icon rail (right, flush to the edge) + content */}
      <div className="flex w-full flex-1">
        <nav className="sticky top-16 z-40 hidden h-fit w-16 shrink-0 flex-col items-center gap-2 py-5 md:flex">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="group relative">
              {({ isActive }) => (
                <span
                  className={cn(
                    'relative grid size-11 place-items-center rounded-lg transition-colors',
                    isActive ? 'bg-ink text-sheet shadow-soft' : 'text-ink-soft hover:bg-ground hover:text-ink',
                  )}
                >
                  <Icon size={20} />
                  {to === '/student/messages' && unreadReplyCount > 0 && (
                    <span className="absolute -left-1 -top-1 size-2 rounded-full bg-coral" />
                  )}
                  <span className="pointer-events-none absolute right-12 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-sheet opacity-0 shadow-lift transition-opacity group-hover:opacity-100">
                    {label}
                  </span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <main className="min-w-0 flex-1 px-4 py-8 md:px-10">
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
        <div className="flex items-center justify-between px-6 py-3 text-[11px] text-ink-soft">
          <span>קליק כיתה · המורה עדי שלום</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sage" /> מחובר</span>
        </div>
      </footer>
    </div>
  );
}
