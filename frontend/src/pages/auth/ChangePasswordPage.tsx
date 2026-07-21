import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    <div className="min-h-screen bg-[#F8F7FC] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center text-white text-xl font-bold mb-4">✦</div>
          <h1 className="text-[#1A1830] text-xl font-bold">שינוי סיסמא</h1>
          <p className="text-[#6B7280] text-sm mt-1 text-center">
            ברוכה הבאה, {user?.name}!<br />
            נא להגדיר סיסמא אישית לפני הכניסה למערכת.
          </p>
        </div>

        <div className="bg-white rounded-card p-6 border border-[#EEEBF5] shadow-sm">
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
              <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-input px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full mt-1">
              שמור סיסמא חדשה
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
