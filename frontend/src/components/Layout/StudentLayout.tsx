import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, ClipboardList, MessageSquare, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import useAuthStore from '@/store/authStore';
import { authApi } from '@/api/auth.api';
import { BrandMark } from '@/components/decor';

const nav = [
  { to: '/student', label: 'בית', icon: Home, tag: '01', end: true },
  { to: '/student/assignments', label: 'מטלות', icon: ClipboardList, tag: '02' },
  { to: '/student/messages', label: 'הודעה למורה', icon: MessageSquare, tag: '03' },
];

export default function StudentLayout() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    clearAuth();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-grid-paper" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b-4 border-ink bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-4 px-4">
          <button className="flex items-center gap-3" onClick={() => navigate('/student')}>
            <BrandMark className="size-10" />
            <div className="text-right leading-none">
              <div className="font-display text-xl font-black text-ink">המחברת שלי</div>
              <div className="mt-1 font-mono text-[10px] text-ink/60">Student · OS</div>
            </div>
          </button>

          {/* Nav (center) */}
          <nav className="mx-auto hidden items-center gap-2 md:flex">
            {nav.map(({ to, label, icon: Icon, tag, end }) => (
              <NavLink key={to} to={to} end={end}>
                {({ isActive }) => (
                  <span
                    className={cn(
                      'flex items-center gap-2 border-2 border-ink px-3 py-1.5 text-sm font-bold transition-all duration-150 ease-linear',
                      isActive
                        ? 'bg-ink text-paper shadow-brutal-mustard'
                        : 'bg-paper text-ink shadow-brutal-sm hover:-translate-x-0.5 hover:-translate-y-0.5',
                    )}
                  >
                    <Icon size={15} className={isActive ? 'text-mustard' : 'text-ink/70'} />
                    {label}
                    <span className={cn('font-mono text-[10px]', isActive ? 'text-mustard' : 'text-ink/40')}>{tag}</span>
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Avatar (left) */}
          <div
            className="mr-auto flex items-center gap-2 border-2 border-ink bg-lilac px-2 py-1 shadow-brutal-sm md:mr-0"
            style={{ transform: 'rotate(-2deg)' }}
          >
            <span className="grid size-7 place-items-center border-2 border-ink bg-paper font-display font-black">
              {user?.name?.[0] ?? 'ת'}
            </span>
            <span className="hidden text-xs font-bold text-ink sm:block">{user?.name ?? 'תלמידה'}</span>
            <button onClick={handleLogout} title="יציאה" className="text-ink/70 hover:text-tomato">
              <LogOut size={14} />
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="flex items-center justify-center gap-2 border-t-2 border-ink/20 px-4 py-2 md:hidden">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              {({ isActive }) => (
                <span
                  className={cn(
                    'flex items-center gap-1.5 border-2 border-ink px-2.5 py-1 text-xs font-bold',
                    isActive ? 'bg-ink text-paper' : 'bg-paper text-ink',
                  )}
                >
                  <Icon size={13} /> {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t-4 border-double border-ink bg-paper/70">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-4 py-3 font-mono text-[11px] text-ink/60">
          <span className="border-2 border-ink bg-mustard px-1.5 py-0.5 font-bold text-ink">מסד</span>
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-forest blink" /> ONLINE
          </span>
        </div>
      </footer>
    </div>
  );
}
