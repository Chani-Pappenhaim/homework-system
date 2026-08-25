import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api/auth.api';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { BrandMark, Tape } from '@/components/decor';
import { getApiErrorMessage } from '@/lib/errors';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 6) { setError('הסיסמא חייבת להכיל לפחות 6 תווים'); return; }
    if (next !== confirm) { setError('הסיסמאות אינן תואמות'); return; }

    setLoading(true);
    try {
      await authApi.resetPassword(token, next);
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'הקישור אינו תקין או שפג תוקפו'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-graph p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <BrandMark className="size-14" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">בחירת סיסמא חדשה</h1>
        </div>

        <div className="relative rounded-xl border border-rule bg-sheet p-6 shadow-lift">
          <Tape color="butter" rotate={-5} className="-top-3.5 right-10 h-6 w-24" />
          {!token ? (
            <p className="text-center text-sm text-coral">קישור לא תקין. בקשי קישור חדש דרך "שכחתי סיסמא".</p>
          ) : done ? (
            <p className="text-center text-sm text-sage">הסיסמא עודכנה בהצלחה! מעבירים אותך לכניסה...</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <PasswordInput
                label="סיסמא חדשה"
                placeholder="לפחות 6 תווים"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                autoFocus
              />
              <PasswordInput
                label="אימות סיסמא חדשה"
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
              <Button type="submit" variant="clay" loading={loading} className="mt-1 w-full" size="lg">
                עדכון סיסמא
              </Button>
              <Link to="/login" className="text-center text-sm text-ink/60 hover:underline">
                חזרה לכניסה
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
