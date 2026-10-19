import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Save } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { usePageTitle } from '@/hooks/usePageTitle';

const MAX_SENDER_NAME = 70;

/** The teacher's site-wide settings that are not about the AI (those live on the AI usage page). */
export default function SettingsPage() {
  usePageTitle('הגדרות');
  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader title="הגדרות" meta="לוח בקרה · הגדרות" />
      <EmailSenderCard />
    </div>
  );
}

function EmailSenderCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['email-settings'], queryFn: () => messagesApi.getEmailSettings() });
  const settings = data?.data.data;
  const [name, setName] = useState('');

  useEffect(() => {
    if (settings) setName(settings.senderName ?? '');
  }, [settings]);

  const save = useMutation({
    mutationFn: () => messagesApi.updateEmailSettings(name),
    onSuccess: (res) => {
      qc.setQueryData(['email-settings'], res);
      toast.success('שם השולח נשמר');
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'השמירה נכשלה')),
  });

  const saved = settings?.senderName ?? '';
  const shown = name.trim() || settings?.defaultSenderName || '';

  return (
    <Card accent="indigo">
      <CardHeader>
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold"><Mail size={15} /> שם השולח במיילים לתלמידות</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-ink-soft">
          כך יופיע השולח בתיבת הדואר של התלמידות (תשובות להודעות, ציונים, תזכורות). כתובת השליחה עצמה לא משתנה.
        </p>
        <Input
          label="שם השולח"
          value={name}
          maxLength={MAX_SENDER_NAME}
          onChange={(e) => setName(e.target.value)}
          placeholder={settings?.defaultSenderName || 'TeacherFeature - המורה עדי שלום'}
          disabled={isLoading}
        />
        <p className="text-xs text-ink-soft">
          {name.trim() ? 'התלמידות יראו: ' : 'ריק = שם ברירת המחדל של האתר: '}
          <span className="font-semibold text-ink">{shown || '-'}</span>
        </p>
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={isLoading || name.trim() === saved}>
          <Save size={14} /> שמירה
        </Button>
      </CardContent>
    </Card>
  );
}
