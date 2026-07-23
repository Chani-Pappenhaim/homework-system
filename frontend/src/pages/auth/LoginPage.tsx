import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';
import { API_URL } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrandMark, Tape } from '@/components/decor';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const user = useAuthStore((s) => s.user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // A restored session landing here (e.g. the old bootstrap race, or a manual
  // /login visit) should go straight in rather than ask for a password again.
  useEffect(() => {
    if (!user) return;
    if (user.mustChangePassword) navigate('/change-password', { replace: true });
    else navigate(user.role === 'ADMIN' ? '/teacher' : '/student', { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      const { user, accessToken } = res.data.data;
      setAuth(user, accessToken);
      if (user.mustChangePassword) {
        navigate('/change-password');
      } else {
        navigate(user.role === 'ADMIN' ? '/teacher' : '/student');
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'שגיאה בכניסה למערכת');
    } finally {
      setLoading(false);
    }
  }

  function handleOAuth(provider: 'github' | 'google') {
    // Full-page navigation straight to the backend (not the SPA host) so the OAuth
    // redirect chain and the refresh cookie all live on the backend's origin.
    window.location.href = `${API_URL}/auth/${provider}`;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-grid-paper p-4" dir="rtl">
      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center">
          <BrandMark className="size-14" />
          <h1 className="mt-4 font-display text-3xl font-black text-ink">ברוכה הבאה</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink/60">מסד · Homework OS</p>
        </div>

        {/* Card */}
        <div className="relative border-2 border-ink bg-paper p-6 shadow-brutal-lg">
          <Tape color="mustard" rotate={-5} className="-top-3.5 right-10 h-6 w-24" />
          <Tape color="lilac" rotate={4} className="-top-3.5 left-10 h-6 w-20" />
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="כתובת אימייל"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <Input
              label="סיסמא"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <p className="border-2 border-tomato bg-tomato/10 px-3 py-2 font-mono text-sm text-tomato">
                {error}
              </p>
            )}

            <Button type="submit" variant="mustard" loading={loading} className="mt-1 w-full" size="lg">
              כניסה למערכת
            </Button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-0.5 flex-1 border-t-2 border-dashed border-ink/30" />
            <span className="font-mono text-[11px] uppercase text-ink/50">או המשיכי עם</span>
            <div className="h-0.5 flex-1 border-t-2 border-dashed border-ink/30" />
          </div>

          {/* OAuth */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="flex w-full items-center justify-center gap-2 border-2 border-ink bg-paper py-2 text-sm font-bold text-ink shadow-brutal-sm hover-lift"
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.5 30.3 0 24 0 14.8 0 6.9 5.4 3 13.3l7.9 6.1C12.9 13.2 17.9 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z"/>
                <path fill="#FBBC05" d="M10.9 28.6A14.5 14.5 0 019.5 24c0-1.6.3-3.2.8-4.6L2.4 13.3A23.9 23.9 0 000 24c0 3.8.9 7.4 2.5 10.6l8.4-6z"/>
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.2 1.5-5 2.3-8.4 2.3-6.1 0-11.2-4.1-13-9.7l-8.4 6C6.9 42.6 14.8 48 24 48z"/>
              </svg>
              המשיכי עם Google
            </button>

            <button
              type="button"
              onClick={() => handleOAuth('github')}
              className="flex w-full items-center justify-center gap-2 border-2 border-ink bg-paper py-2 text-sm font-bold text-ink shadow-brutal-sm hover-lift"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.4.6.1.82-.26.82-.57v-2c-3.34.73-4.04-1.6-4.04-1.6-.54-1.4-1.33-1.77-1.33-1.77-1.08-.74.08-.72.08-.72 1.2.08 1.83 1.23 1.83 1.23 1.06 1.82 2.78 1.3 3.46.99.1-.77.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 016 0c2.28-1.55 3.29-1.23 3.29-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.68.83.57C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              המשיכי עם GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
