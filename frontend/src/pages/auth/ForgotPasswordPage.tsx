import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '@/api/auth.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrandMark, Tape } from '@/components/decor';
import { getApiErrorMessage } from '@/lib/errors';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'שגיאה בשליחת הבקשה'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-graph p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <BrandMark className="size-14" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">שחזור סיסמא</h1>
        </div>

        <div className="relative rounded-xl border border-rule bg-sheet p-6 shadow-lift">
          <Tape color="butter" rotate={-5} className="-top-3.5 right-10 h-6 w-24" />
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-ink/70">
                אם כתובת המייל הזו רשומה במערכת, נשלח אליה קישור לאיפוס סיסמא. בדקי גם בתיקיית הספאם.
              </p>
              <Link to="/login" className="text-sm font-semibold text-clay hover:underline">
                חזרה לכניסה
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-ink/70">
                הזיני את כתובת המייל שלך ונשלח אליך קישור לאיפוס הסיסמא.
              </p>
              <Input
                label="כתובת אימייל"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              {error && (
                <p className="border border-coral bg-coral/10 px-3 py-2 font-sans text-sm text-coral">
                  {error}
                </p>
              )}
              <Button type="submit" variant="clay" loading={loading} className="mt-1 w-full" size="lg">
                שליחת קישור לאיפוס
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
