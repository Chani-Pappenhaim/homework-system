import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MailCheck, MailWarning } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function ProfilePage() {
  usePageTitle('הפרופיל שלי');
  const { user, accessToken, setAuth } = useAuthStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [githubUsername, setGithubUsername] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setGithubUsername(user.githubUsername ?? '');
    setEmailNotifications(user.emailNotifications);
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: () => authApi.updateMe({ name, email, githubUsername, emailNotifications }),
    onSuccess: (res) => {
      const { user: updated, emailChanged } = res.data.data;
      if (accessToken) setAuth(updated, accessToken);
      toast.success(emailChanged ? 'נשמר — שלחנו קישור אימות לכתובת החדשה' : 'הפרטים נשמרו');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'שגיאה בשמירת הפרטים')),
  });

  const resendMutation = useMutation({
    mutationFn: () => authApi.resendVerification(),
    onSuccess: () => toast.success('שלחנו שוב את קישור האימות — בדקי את תיבת המייל'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'שגיאה בשליחת המייל')),
  });

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הפרופיל שלי" meta="פרטים אישיים" />

      <Card>
        <CardContent className="pt-6">
          <form
            className="flex max-w-md flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
          >
            <Input label="שם מלא" value={name} onChange={(e) => setName(e.target.value)} required />

            <div className="flex flex-col gap-1.5">
              <Input label="אימייל" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {user.emailVerified ? (
                <p className="flex items-center gap-1.5 text-xs text-sage"><MailCheck size={14} /> הכתובת אומתה</p>
              ) : (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-coral">
                  <MailWarning size={14} /> הכתובת עדיין לא אומתה — לא יישלחו אלייך עדכונים במייל.
                  <button
                    type="button"
                    className="font-semibold underline disabled:opacity-50"
                    disabled={resendMutation.isPending}
                    onClick={() => resendMutation.mutate()}
                  >
                    שליחת קישור אימות
                  </button>
                </p>
              )}
            </div>

            <Input
              label="שם משתמש ב-GitHub"
              dir="ltr"
              placeholder="username"
              value={githubUsername}
              onChange={(e) => setGithubUsername(e.target.value)}
            />

            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-1"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
              />
              <span>
                לקבל עדכונים במייל
                <span className="block text-xs text-ink/55">תשובות מהמורה, הודעות וציונים חדשים</span>
              </span>
            </label>

            <Button type="submit" disabled={saveMutation.isPending} className="self-start">
              {saveMutation.isPending ? 'שומרת...' : 'שמירה'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
