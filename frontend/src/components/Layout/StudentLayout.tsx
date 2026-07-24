import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, ClipboardList, MessageSquare, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import useAuthStore from '@/store/authStore';
import { authApi } from '@/api/auth.api';
import { Brand } from '@/components/decor';

const nav = [
  { to: '/student', label: 'בית', icon: Home, end: true },
  { to: '/student/assignments', label: 'מטלות', icon: ClipboardList },
  { to: '/student/messages', label: 'הודעה למורה', icon: MessageSquare },
];

export default function StudentLayout() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    clearAuth();
    navigate('/login');
  }

  const initials = (user?.name ?? 'תלמידה').split(' ').map((w) => w[0]).slice(0, 2).join('');

  const NavItems = ({ compact }: { compact?: boolean }) =>
    nav.map(({ to, label, icon: Icon, end }) => (
      <NavLink key={to} to={to} end={end}>
        {({ isActive }) => (
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-input px-3 py-1.5 text-sm font-medium transition-colors',
              compact && 'flex-col gap-0.5 px-2 text-[10px]',
              isActive ? 'bg-ink text-sheet' : 'text-ink-soft hover:bg-ground hover:text-ink',
            )}
          >
            <Icon size={compact ? 18 : 15} />
            {label}
          </span>
        )}
      </NavLink>
    ));

  return (
    <div className="flex min-h-screen flex-col bg-graph" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-rule bg-sheet/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center gap-4 px-4">
          <button onClick={() => navigate('/student')}>
            <Brand />
          </button>

          <nav className="mx-auto hidden items-center gap-1 md:flex">
            <NavItems />
          </nav>

          <div className="mr-auto flex items-center gap-2 border-r border-rule pr-3 md:mr-0">
            <span className="grid size-8 place-items-center rounded-full bg-clay text-xs font-semibold text-sheet">
              {initials}
            </span>
            <span className="hidden text-xs font-semibold text-ink sm:block">{user?.name ?? 'תלמידה'}</span>
            <button onClick={handleLogout} title="יציאה" className="text-ink-soft hover:text-coral">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6">
        <Outlet />
      </main>

      <nav className="sticky bottom-0 z-30 flex items-center justify-around border-t border-rule bg-sheet/90 px-2 py-1.5 backdrop-blur-sm md:hidden">
        <NavItems compact />
      </nav>
    </div>
  );
}
