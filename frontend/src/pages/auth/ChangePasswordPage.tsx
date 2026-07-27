import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrandMark, Tape } from '@/components/decor';
import { getApiErrorMessage } from '@/lib/errors';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, setAuth, accessToken } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 6) { setError('הסיסמא החדשה חייבת להכיל לפחות 6 תווים'); return; }
    if (next !== confirm) { setError('הסיסמאות אינן תואמות'); return; }

    setLoading(true);
    try {
      await authApi.changePassword(current, next);
      if (user && accessToken) {
        setAuth({ ...user, mustChangePassword: false }, accessToken);
      }
      navigate(user?.role === 'ADMIN' ? '/teacher' : '/student');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'שגיאה בשינוי סיסמא'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-graph p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <BrandMark className="size-14" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">שינוי סיסמא</h1>
          <p className="mt-1 text-center text-sm text-ink/70">
            ברוכה הבאה, {user?.name}!<br />
            נא להגדיר סיסמא אישית לפני הכניסה למערכת.
          </p>
        </div>

        <div className="relative rounded-xl border border-rule bg-sheet p-6 shadow-lift">
          <Tape color="butter" rotate={-5} className="-top-3.5 right-10 h-6 w-24" />
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="סיסמא נוכחית"
              type="password"
              placeholder="••••••••"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoFocus
            />
            <Input
              label="סיסמא חדשה"
              type="password"
              placeholder="לפחות 6 תווים"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <Input
              label="אימות סיסמא חדשה"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />

            {error && (
              <p className="border border-coral bg-coral/10 px-3 py-2 font-sans text-sm text-coral">
                {error}
              </p>
            )}

            <Button type="submit" variant="clay" loading={loading} className="mt-1 w-full">
              שמור סיסמא חדשה
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
