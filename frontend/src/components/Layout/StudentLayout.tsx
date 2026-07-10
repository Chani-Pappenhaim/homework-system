import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, BookOpen, ClipboardList, MessageSquare, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import useAuthStore from '@/store/authStore';
import { authApi } from '@/api/auth.api';

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

  return (
    <div className="flex h-screen overflow-hidden" dir="rtl">
      {/* Slim sidebar */}
      <aside className="w-[180px] flex-shrink-0 bg-[#1A1830] flex flex-col border-l border-[rgba(255,255,255,0.06)]">
        <div className="px-4 py-5 border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/student')}>
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center text-white font-bold text-lg">✦</div>
            <div>
              <p className="text-[#F0EAF8] text-xs font-semibold leading-tight">שיעורי בית</p>
              <p className="text-[#A89BC2] text-[10px]">תלמידה</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-4 py-2 text-sm transition-all',
                isActive ? 'sidebar-active' : 'text-[#A89BC2] hover:text-[#F0EAF8] hover:bg-white/5'
              )}
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[rgba(255,255,255,0.06)] px-4 py-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.name?.[0] ?? 'ת'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#F0EAF8] text-xs font-medium truncate">{user?.name}</p>
          </div>
          <button onClick={handleLogout} className="text-[#A89BC2] hover:text-[#F0EAF8]">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-[52px] bg-white border-b border-[#EEEBF5] flex items-center px-5">
          <BookOpen size={16} className="text-primary ml-2" />
          <p className="text-sm font-medium text-[#1A1830]">מערכת הגשת שיעורי בית</p>
        </header>
        <main className="flex-1 overflow-y-auto bg-[#F8F7FC] p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
