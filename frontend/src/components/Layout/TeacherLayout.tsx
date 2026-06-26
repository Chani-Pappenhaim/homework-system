import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, BookOpen, BarChart2, FileSpreadsheet, Bell, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import useAuthStore from '@/store/authStore';
import { authApi } from '@/api/auth.api';

const nav = [
  { section: 'ניהול', items: [
    { to: '/teacher', label: 'לוח בקרה', icon: LayoutDashboard, end: true },
    { to: '/teacher/groups', label: 'קבוצות', icon: Users },
    { to: '/teacher/courses', label: 'קורסים', icon: BookOpen },
  ]},
  { section: 'דוחות', items: [
    { to: '/teacher/reports', label: 'ציונים', icon: BarChart2 },
    { to: '/teacher/reports?export=1', label: 'ייצוא Excel', icon: FileSpreadsheet },
  ]},
];

export default function TeacherLayout() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    clearAuth();
    navigate('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <aside className="w-[200px] flex-shrink-0 bg-[#1A1830] flex flex-col border-l border-[rgba(255,255,255,0.06)]">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center text-white font-bold text-lg">✦</div>
            <div>
              <p className="text-[#F0EAF8] text-sm font-semibold leading-tight">מערכת שיעורי בית</p>
              <p className="text-[#A89BC2] text-xs">מורה</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {nav.map(({ section, items }) => (
            <div key={section} className="mb-4">
              <p className="px-4 text-[10px] font-semibold uppercase tracking-widest text-[#A89BC2]/60 mb-1">{section}</p>
              {items.map(({ to, label, icon: Icon, end }) => (
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
            </div>
          ))}

          <div className="px-4 mt-2">
            <NavLink
              to="/teacher/alerts"
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-0 py-2 text-sm transition-all',
                isActive ? 'text-[#F0EAF8]' : 'text-[#A89BC2] hover:text-[#F0EAF8]'
              )}
            >
              <Bell size={15} />
              התרעות
            </NavLink>
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-[rgba(255,255,255,0.06)] px-4 py-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.name?.[0] ?? 'מ'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#F0EAF8] text-xs font-medium truncate">{user?.name}</p>
            <p className="text-[#A89BC2] text-[10px]">מנהל</p>
          </div>
          <button onClick={handleLogout} className="text-[#A89BC2] hover:text-[#F0EAF8] transition">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-[52px] bg-white border-b border-[#EEEBF5] flex items-center px-5 flex-shrink-0">
          <p className="text-sm text-[#6B7280]">
            {new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
          </p>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-[#F8F7FC] p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
