import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';
import { BrandMark, Tape } from '@/components/decor';
import { getApiErrorMessage } from '@/lib/errors';
import { usePageTitle } from '@/hooks/usePageTitle';

/** The page the verification email links to. Works signed in or out. */
export default function VerifyEmailPage() {
  usePageTitle('אימות כתובת מייל');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { user, accessToken, setAuth } = useAuthStore();
  const [state, setState] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  const [error, setError] = useState('קישור לא תקין');
  // The token is single-use: StrictMode's second effect run must not spend it again.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    authApi.verifyEmail(token)
      .then(() => setState('done'))
      .catch((err) => { setError(getApiErrorMessage(err, 'הקישור אינו תקין או שכבר נעשה בו שימוש')); setState('error'); });
  }, [token]);

  useEffect(() => {
    if (state === 'done' && user && accessToken && !user.emailVerified) {
      setAuth({ ...user, emailVerified: true }, accessToken);
    }
  }, [state, user, accessToken, setAuth]);

  const home = user ? (user.role === 'ADMIN' ? '/teacher' : '/student') : '/login';

  return (
    <div className="flex min-h-screen items-center justify-center bg-graph p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <BrandMark className="size-14" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">אימות כתובת מייל</h1>
        </div>
        <div className="relative rounded-xl border border-rule bg-sheet p-6 text-center shadow-lift">
          <Tape color="butter" rotate={-5} className="-top-3.5 right-10 h-6 w-24" />
          {state === 'working' && <p className="text-sm text-ink/60">מאמתים...</p>}
          {state === 'done' && <p className="text-sm text-sage">הכתובת אומתה! מעכשיו עדכונים יגיעו אלייך למייל.</p>}
          {state === 'error' && <p className="text-sm text-coral">{error}</p>}
          {state !== 'working' && (
            <Link to={home} className="mt-4 inline-block text-sm font-semibold text-clay underline">
              {user ? 'להמשך לאתר' : 'לכניסה'}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
