import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';

export default function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    const token = params.get('token');
    if (!token) { navigate('/login'); return; }

    authApi.me()
      .then((res) => {
        setAuth(res.data.data.user, token);
        const user = res.data.data.user;
        if (user.mustChangePassword) navigate('/change-password');
        else navigate(user.role === 'ADMIN' ? '/teacher' : '/student');
      })
      .catch(() => navigate('/login'));
  }, []);

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center" dir="rtl">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border border-coral border-t-transparent rounded-full animate-spin" />
        <p className="text-ink/50 text-sm">מתחברת...</p>
      </div>
    </div>
  );
}
