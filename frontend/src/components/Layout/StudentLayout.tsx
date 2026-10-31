import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import PageOutlet from '@/components/Layout/PageOutlet';
import { BottomBars, BOTTOM_BARS_SPACE, type NavItem } from '@/components/Layout/BottomBars';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Home, BookOpen, ClipboardList, MessageSquare, LogOut, UserRound, MailWarning, X, CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import useAuthStore from '@/store/authStore';
import { authApi } from '@/api/auth.api';
import { messagesApi } from '@/api/messages.api';
import { unwrap } from '@/lib/api-utils';
<<<<<<< HEAD
import { Brand } from '@/components/decor';
=======
import { Brand, DevSignature } from '@/components/decor';
import { Avatar } from '@/components/ui/avatar';
>>>>>>> worktree-agent-a4af289557b20bd3e

const nav: NavItem[] = [
  { to: '/student', label: 'בית', icon: Home, end: true },
  { to: '/student/courses', label: 'קורסים', icon: BookOpen },
  { to: '/student/assignments', label: 'מטלות', icon: ClipboardList },
  { to: '/student/attendance', label: 'נוכחות', icon: CalendarCheck },
  { to: '/student/messages', label: 'הודעה למורה', icon: MessageSquare },
  { to: '/student/profile', label: 'הפרופיל שלי', icon: UserRound },
];

export default function StudentLayout() {
  const { user, clearAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: unreadReplyData } = useQuery({
    queryKey: ['unread-reply-count'],
    queryFn: () => messagesApi.getUnreadReplyCount(),
    refetchInterval: 60_000,
  });
  const unreadReplyCount: number = unwrap(unreadReplyData)?.count ?? 0;

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    clearAuth();
    navigate('/login');
    // Drop everything fetched for this user so the next login on this
    // browser never sees her data, even briefly.
    queryClient.clear();
  }

  const [bannerClosed, setBannerClosed] = useState(false);
  const showVerifyBanner = Boolean(user && user.emailVerified === false && !bannerClosed);

  const name = user?.name ?? 'תלמידה';

  return (
    <div className={cn('flex min-h-screen flex-col bg-graph', BOTTOM_BARS_SPACE)} dir="rtl">
      <header className="sticky top-0 z-30 border-b border-rule bg-sheet/80 backdrop-blur-sm">
        <div className="flex h-16 items-center gap-4 px-5 md:px-6">
          <button onClick={() => navigate('/student')}>
            <Brand />
          </button>

          <div className="mr-auto flex items-center gap-3">
            <div className="flex items-center gap-2 border-r border-rule pr-3">
              <button onClick={() => navigate('/student/profile')} title="הפרופיל שלי" className="flex items-center gap-2">
              <Avatar name={name} src={user?.avatarUrl} />
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-xs font-semibold text-ink">{name}</div>
                <div className="text-[10px] text-ink-soft">תלמידה</div>
              </div>
              </button>
              <button onClick={handleLogout} title="יציאה" className="text-ink-soft hover:text-coral">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>

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
          {/* Every page shares this exact width, so the canvas lines up consistently across the app. */}
          <div className="mx-auto max-w-6xl">
            {showVerifyBanner && (
              <div className="mb-6 flex items-center gap-3 rounded-input border border-coral/30 bg-coral/10 px-4 py-2.5 text-sm text-ink">
                <MailWarning size={16} className="shrink-0 text-coral" />
                <span className="flex-1">
                  כתובת המייל שלך עדיין לא אומתה, ולכן עדכונים מהמורה לא יגיעו אלייך במייל.{' '}
                  <NavLink to="/student/profile" className="font-semibold underline">לאימות הכתובת</NavLink>
                </span>
                <button onClick={() => setBannerClosed(true)} aria-label="סגירה" className="text-ink/50 hover:text-ink">
                  <X size={15} />
                </button>
              </div>
            )}
            <PageOutlet />
          </div>
        </main>
      </div>

      <BottomBars nav={nav} />
    </div>
  );
}
