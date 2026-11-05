import { useEffect, useState } from 'react';
import { useSyncedForm } from '@/hooks/useSyncedForm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Camera, Clock, KeyRound, LogOut, Mail, Moon, Pencil, Save } from 'lucide-react';
import { AvatarEditor } from '@/components/profile/AvatarEditor';
import { messagesApi } from '@/api/messages.api';
import { gradesApi } from '@/api/grades.api';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';
import { useConfirm } from '@/components/ui/use-confirm';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
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
      <ProfilePictureCard />
      <EmailSenderCard />
      <LatePenaltyCard />
      <QuietHoursCard />
      <PasswordCard />
      <SessionsCard />
    </div>
  );
}

/**
 * A settings card that shows a one-line summary until "עריכה" is pressed, so
 * nothing looks changeable by accident. The form (`children`) appears only
 * while editing.
 */
function SettingCard({ icon, title, summary, editing, onEdit, children }: {
  icon: ReactNode;
  title: string;
  summary: ReactNode;
  editing: boolean;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <Card accent="indigo">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-display text-base font-bold">{icon} {title}</h2>
          {!editing && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil size={14} /> עריכה
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? children : <p className="text-sm text-ink">{summary}</p>}
      </CardContent>
    </Card>
  );
}

function ProfilePictureCard() {
  return (
    <Card accent="indigo">
      <CardHeader>
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold"><Camera size={15} /> תמונת פרופיל</h2>
      </CardHeader>
      <CardContent>
        <AvatarEditor />
      </CardContent>
    </Card>
  );
}

function EmailSenderCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['email-settings'], queryFn: () => messagesApi.getEmailSettings() });
  const settings = data?.data.data;
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);

  useSyncedForm(settings, (s) => ({ name: s.senderName ?? '' }), { name }, (v) => setName(v.name));

  const save = useMutation({
    mutationFn: () => messagesApi.updateEmailSettings(name),
    onSuccess: (res) => {
      qc.setQueryData(['email-settings'], res);
      toast.success('שם השולח נשמר');
      setEditing(false);
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'השמירה נכשלה')),
  });

  const saved = settings?.senderName ?? '';
  const shown = name.trim() || settings?.defaultSenderName || '';

  return (
    <SettingCard
      icon={<Mail size={15} />}
      title="שם השולח במיילים לתלמידות"
      summary={<>התלמידות רואות: <span className="font-semibold">{saved || settings?.defaultSenderName || '-'}</span></>}
      editing={editing}
      onEdit={() => setEditing(true)}
    >
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
        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={isLoading || name.trim() === saved}>
            <Save size={14} /> שמירה
          </Button>
          <Button variant="outline" onClick={() => { setName(saved); setEditing(false); }}>ביטול</Button>
        </div>
    </SettingCard>
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
  const [editing, setEditing] = useState(false);

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
      setEditing(false);
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'השמירה נכשלה')),
  });

  const valid = perDayN !== null && maxN !== null;
  const unchanged = policy?.perDay === perDayN && policy?.max === maxN;
  const example = (days: number) => (valid ? 100 - Math.min(maxN!, days * perDayN!) : null);

  return (
    <SettingCard
      icon={<Clock size={15} />}
      title="הורדת נקודות על איחור"
      summary={policy
        ? <><span className="font-semibold">{policy.perDay}</span> נקודות לכל יום איחור, עד הורדה של <span className="font-semibold">{policy.max}</span></>
        : '...'}
      editing={editing}
      onEdit={() => setEditing(true)}
    >
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
        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={isLoading || !valid || unchanged}>
            <Save size={14} /> שמירה
          </Button>
          <Button
            variant="outline"
            onClick={() => { setPerDay(String(policy?.perDay ?? '')); setMax(String(policy?.max ?? '')); setEditing(false); }}
          >
            ביטול
          </Button>
        </div>
    </SettingCard>
  );
}

/** "HH:MM" for minutes past midnight. */
function toClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Minutes past midnight for "HH:MM", or null while the field is empty. */
function fromClock(text: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function QuietHoursCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['quiet-hours'], queryFn: () => messagesApi.getQuietHours() });
  const hours = data?.data.data;
  const [start, setStart] = useState('');
  const [release, setRelease] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (hours) {
      setStart(toClock(hours.startMinute));
      setRelease(toClock(hours.releaseMinute));
    }
  }, [hours]);

  const startMinute = fromClock(start);
  const releaseMinute = fromClock(release);
  const valid = startMinute !== null && releaseMinute !== null;
  const off = valid && startMinute === releaseMinute;

  const save = useMutation({
    mutationFn: () => messagesApi.updateQuietHours({ startMinute: startMinute!, releaseMinute: releaseMinute! }),
    onSuccess: (res) => {
      qc.setQueryData(['quiet-hours'], res);
      toast.success('שעות השקט נשמרו');
      setEditing(false);
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'השמירה נכשלה')),
  });

  const savedSummary = !hours
    ? '...'
    : hours.startMinute === hours.releaseMinute
      ? 'אין שעות שקט, המיילים נשלחים מיד'
      : <>מיילים שנוצרים בין <span className="font-semibold">{toClock(hours.startMinute)}</span> ל-<span className="font-semibold">{toClock(hours.releaseMinute)}</span> יישלחו ב-<span className="font-semibold">{toClock(hours.releaseMinute)}</span></>;

  return (
    <SettingCard
      icon={<Moon size={15} />}
      title="שעות שקט למיילים לתלמידות"
      summary={savedSummary}
      editing={editing}
      onEdit={() => setEditing(true)}
    >
        <p className="text-sm text-ink-soft">
          מייל לתלמידה (תשובה להודעה, הודעה ממך, פרסום ציון) שנוצר בשעות השקט לא נשלח מיד אלא בשעת השחרור.
          ההודעות והציונים עצמם מופיעים באתר מיד. השעות לפי שעון ישראל, והן חלות על כל התלמידות.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="תחילת שעות השקט" type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={isLoading} />
          <Input label="שעת שחרור המיילים" type="time" value={release} onChange={(e) => setRelease(e.target.value)} disabled={isLoading} />
        </div>
        <p className="text-xs text-ink-soft">
          {!valid
            ? 'יש לבחור שעות'
            : off
              ? 'שתי השעות זהות, ולכן אין שעות שקט והמיילים נשלחים מיד'
              : <>מיילים שנוצרים בין <span className="font-semibold text-ink">{start}</span> ל-<span className="font-semibold text-ink">{release}</span> יישלחו ב-<span className="font-semibold text-ink">{release}</span></>}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={isLoading || !valid || (hours?.startMinute === startMinute && hours?.releaseMinute === releaseMinute)}
          >
            <Save size={14} /> שמירה
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (hours) { setStart(toClock(hours.startMinute)); setRelease(toClock(hours.releaseMinute)); }
              setEditing(false);
            }}
          >
            ביטול
          </Button>
        </div>
    </SettingCard>
  );
}

const MIN_PASSWORD_LENGTH = 6;

/** The teacher changes her own password; the server revokes other sessions and returns a fresh token for this one. */
function PasswordCard() {
  const toast = useToast();
  const setAccessToken = useAuthStore((st) => st.setAccessToken);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const change = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: (res) => {
      const token: string | undefined = res.data?.data?.accessToken;
      if (token) setAccessToken(token);
      setCurrent(''); setNext(''); setConfirm(''); setError('');
      toast.success('הסיסמה עודכנה');
    },
    onError: (e) => setError(getApiErrorMessage(e, 'שינוי הסיסמה נכשל')),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < MIN_PASSWORD_LENGTH) { setError(`הסיסמה החדשה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים`); return; }
    if (next !== confirm) { setError('הסיסמאות אינן תואמות'); return; }
    setError('');
    change.mutate();
  }

  return (
    <Card accent="indigo">
      <CardHeader>
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold"><KeyRound size={15} /> שינוי סיסמה</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="max-w-sm space-y-3">
          <PasswordInput label="סיסמה נוכחית" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <PasswordInput label="סיסמה חדשה" value={next} onChange={(e) => setNext(e.target.value)} required />
          <PasswordInput label="אימות סיסמה חדשה" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          {error && <p role="alert" className="text-sm text-coral">{error}</p>}
          <Button type="submit" variant="clay" loading={change.isPending}>
            <KeyRound size={14} /> עדכון סיסמה
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const toast = useToast();
  const setAccessToken = useAuthStore((st) => st.setAccessToken);
  const [confirmDialog, ask] = useConfirm();

  const logoutOthers = useMutation({
    mutationFn: () => authApi.logoutOthers(),
    onSuccess: (res) => {
      setAccessToken(res.data.data.accessToken);
      toast.success('נותקת מכל המכשירים האחרים');
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'הניתוק נכשל')),
  });

  const confirmAndLogout = async () => {
    const ok = await ask({
      title: 'להתנתק מכל המכשירים האחרים?',
      description: 'כל מחשב או טלפון אחר שמחובר לחשבון שלך יידרש להתחבר מחדש. במכשיר הזה נשארים מחוברים.',
      confirmLabel: 'ניתוק',
    });
    if (ok) logoutOthers.mutate();
  };

  return (
    <Card accent="indigo">
      <CardHeader>
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold"><LogOut size={15} /> מכשירים מחוברים</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-ink-soft">
          אם התחברת ממחשב משותף או ממכשיר שאבד, אפשר לנתק את כל החיבורים האחרים לחשבון. החיבור במכשיר הזה נשמר.
        </p>
        <Button variant="outline" onClick={confirmAndLogout} loading={logoutOthers.isPending}>
          <LogOut size={14} /> התנתקות מכל המכשירים האחרים
        </Button>
        {confirmDialog}
      </CardContent>
    </Card>
  );
}
