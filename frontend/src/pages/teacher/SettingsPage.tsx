import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Mail, Save } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { gradesApi } from '@/api/grades.api';
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
      <LatePenaltyCard />
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

/** A whole number 0-100, or null while the field holds anything else. */
function points(text: string): number | null {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

function LatePenaltyCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['late-penalty'], queryFn: () => gradesApi.latePolicy() });
  const policy = data?.data.data;
  const [perDay, setPerDay] = useState('');
  const [max, setMax] = useState('');

  useEffect(() => {
    if (policy) {
      setPerDay(String(policy.perDay));
      setMax(String(policy.max));
    }
  }, [policy]);

  const perDayN = points(perDay);
  const maxN = points(max);

  const save = useMutation({
    mutationFn: () => gradesApi.updateLatePolicy({ perDay: perDayN!, max: maxN! }),
    onSuccess: (res) => {
      qc.setQueryData(['late-penalty'], res);
      toast.success('הקנס על איחור נשמר');
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'השמירה נכשלה')),
  });

  const valid = perDayN !== null && maxN !== null;
  const unchanged = policy?.perDay === perDayN && policy?.max === maxN;
  const example = (days: number) => (valid ? 100 - Math.min(maxN!, days * perDayN!) : null);

  return (
    <Card accent="indigo">
      <CardHeader>
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold"><Clock size={15} /> הורדת נקודות על איחור</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-ink-soft">
          הגשה אחרי המועד מאבדת מציון ההגשה את מספר הנקודות שנקבע לכל יום איחור (יום שהתחיל נחשב יום שלם), עד ההורדה המקסימלית.
          השינוי חל על הגשות מעכשיו ועל ציונים שמחושבים מחדש כשמזיזים מועד הגשה. ציון שקבעת ידנית לא משתנה.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="נקודות לכל יום איחור"
            type="number" min={0} max={100}
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            disabled={isLoading}
          />
          <Input
            label="הורדה מקסימלית"
            type="number" min={0} max={100}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <p className="text-xs text-ink-soft">
          {valid
            ? <>לדוגמה, ציון הגשה מלא: יום איחור אחד - <span className="font-semibold text-ink">{example(1)}</span>, שלושה ימים - <span className="font-semibold text-ink">{example(3)}</span>, עשרה ימים - <span className="font-semibold text-ink">{example(10)}</span></>
            : 'יש לכתוב מספרים שלמים בין 0 ל-100'}
        </p>
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={isLoading || !valid || unchanged}>
          <Save size={14} /> שמירה
        </Button>
      </CardContent>
    </Card>
  );
}
