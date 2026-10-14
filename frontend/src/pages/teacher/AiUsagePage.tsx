import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, HelpCircle, Cpu, DollarSign } from 'lucide-react';
import { aiUsageApi, type AiPaidFallback, type AiTierUsage, type GeminiQuotaStatus } from '@/api/aiUsage.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatUsd } from '@/lib/currency';
import { unwrap } from '@/lib/api-utils';
import { getApiErrorMessage } from '@/lib/errors';
import { usePageTitle } from '@/hooks/usePageTitle';
import { AI_AVAILABILITY_QUERY_KEY } from '@/hooks/useAiAvailability';

function formatMonth(month: string) {
  const [year, m] = month.split('-');
  if (!year || !m) return month;
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' })
    .format(new Date(Number(year), Number(m) - 1, 1));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function Usd({ value }: { value: number | null | undefined }) {
  return <span dir="ltr">{formatUsd(value)}</span>;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}

export default function AiUsagePage() {
  usePageTitle('שימוש ב-AI');
  const { data, isLoading } = useQuery({
    queryKey: ['ai-usage-summary'],
    queryFn: () => aiUsageApi.summary(),
  });
  const {
    data: storageData,
    isLoading: storageLoading,
    isError: storageError,
  } = useQuery({
    queryKey: ['storage-usage'],
    queryFn: () => aiUsageApi.storage(),
    retry: 1,
  });

  const summary = unwrap(data);
  const storage = unwrap(storageData);

  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;

  const totalTokens = (summary?.totalTokensInput ?? 0) + (summary?.totalTokensOutput ?? 0);
  const byMonth = summary?.byMonth ?? [];

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader title="שימוש AI" meta="דוחות · צריכת AI" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Bot size={18} />} tile="cobalt" label='סה"כ בדיקות AI' value={summary?.totalReviews ?? 0} />
        <StatCard icon={<HelpCircle size={18} />} tile="tomato" label='סה"כ חידונים' value={summary?.totalQuizzes ?? 0} />
        <StatCard icon={<Cpu size={18} />} tile="forest" label='סה"כ טוקנים' value={totalTokens.toLocaleString()} />
        <StatCard icon={<DollarSign size={18} />} tile="mustard" label="עלות בפועל (מסלול בתשלום)" value={<Usd value={summary?.totalCostUsd} />} />
      </div>

      {summary?.quota && <GeminiQuotaCard quota={summary.quota} free={summary.free} paid={summary.paid} />}
      {summary?.quota && (
        <AiSettingsCard value={summary.quota.paidFallback ?? 'DAILY_QUOTA'} paidKeyConfigured={summary.quota.paidKeyConfigured} />
      )}

      {/* Cloudinary storage, then monthly breakdown below it — both full width, stacked */}
      <div className="space-y-5">
        <Card accent="indigo">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold">אחסון קבצים · Cloudinary</h2>
              {storage && (
                <span
                  className={cn(
                    'font-sans text-sm font-bold tabular',
                    storage.percent >= 80 ? 'text-coral' : storage.percent >= 60 ? 'text-clay' : 'text-sage',
                  )}
                >
                  {Math.round(storage.percent)}%
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {storageLoading ? (
              <div className="h-3 w-full animate-pulse rounded-full bg-ground" />
            ) : storageError || !storage ? (
              <p className="rounded-input bg-ground px-3 py-2 text-sm text-ink-soft">
                לא ניתן לטעון כרגע את נתוני האחסון מ-Cloudinary. ודאי שמפתחות ה-API מוגדרים בשרת.
              </p>
            ) : (
              <>
                <div className="h-3 w-full overflow-hidden rounded-full bg-ground">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      storage.percent >= 80 ? 'bg-coral' : storage.percent >= 60 ? 'bg-butter' : 'bg-sage',
                    )}
                    style={{ width: `${Math.max(2, Math.min(100, storage.percent))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between font-sans text-[11px] text-ink-soft">
                  <span>{formatBytes(storage.usedBytes)} בשימוש</span>
                  <span>מתוך {formatBytes(storage.limitBytes)}</span>
                </div>
                {storage.percent >= 80 && (
                  <p className="rounded-input border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
                    האחסון עבר 80% — כדאי למחוק קבצים ישנים כדי שהגשות חדשות לא ייכשלו.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Monthly breakdown */}
        <Card>
          <CardHeader>
            <h2 className="font-display text-base font-bold">פירוט חודשי</h2>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule bg-ground/70 font-sans text-[11px] uppercase text-ink/60">
                  <th className="px-5 py-2.5 text-right font-bold">חודש</th>
                  <th className="px-3 py-2.5 text-right font-bold">בדיקות</th>
                  <th className="px-3 py-2.5 text-right font-bold">חידונים</th>
                  <th className="px-3 py-2.5 text-right font-bold">מתוכן בתשלום</th>
                  <th className="px-3 py-2.5 text-right font-bold">עלות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-rule/20">
                {byMonth.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-4 text-center text-ink/50">אין נתוני שימוש עדיין</td></tr>
                )}
                {byMonth.map((m) => (
                  <tr key={m.month} className="transition-colors hover:bg-butter/15">
                    <td className="px-5 py-3 font-bold text-ink">{formatMonth(m.month)}</td>
                    <td className="px-3 py-3 font-sans text-ink/70 tabular">{m.reviews}</td>
                    <td className="px-3 py-3 font-sans text-ink/70 tabular">{m.quizzes}</td>
                    <td className="px-3 py-3 font-sans text-ink/70 tabular">{m.paidCalls ?? 0}</td>
                    <td className="px-3 py-3 font-sans text-ink/70 tabular"><Usd value={m.costUsd} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Today's free-tier requests against the daily quota, which tier serves calls
 * now, and calls, tokens and cost per tier.
 */
function GeminiQuotaCard({ quota, free, paid }: {
  quota: GeminiQuotaStatus; free: AiTierUsage; paid: AiTierUsage;
}) {
  const spent = quota.freeExhaustedUntil != null;
  const paidAllowed = quota.paidFallback !== 'NEVER';
  const paidUsable = quota.paidKeyConfigured && paidAllowed;
  const mode = !quota.freeKeyConfigured && !quota.paidKeyConfigured
    ? { label: 'AI לא מוגדר', tone: 'bg-coral/15 text-coral' }
    : !quota.freeKeyConfigured
      ? paidAllowed
        ? { label: 'מסלול בתשלום', tone: 'bg-butter/30 text-clay' }
        : { label: 'AI חסום', tone: 'bg-coral/15 text-coral' }
      : spent && paidUsable
        ? { label: `בתשלום עד ${formatTime(quota.freeExhaustedUntil!)}`, tone: 'bg-butter/30 text-clay' }
        : spent
          ? { label: 'המכסה היומית נגמרה', tone: 'bg-coral/15 text-coral' }
          : { label: 'מסלול חינמי', tone: 'bg-sage/15 text-sage' };

  const limit = quota.freeDailyLimit;
  const percent = spent ? 100 : limit ? Math.min(100, (quota.freeRequestsToday / limit) * 100) : 0;

  return (
    <Card accent="sage">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold">מכסת Gemini · היום</h2>
          <span className={cn('rounded-md px-2 py-0.5 font-sans text-xs font-bold', mode.tone)}>{mode.label}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {quota.freeKeyConfigured && (
          <div className="space-y-2">
            {limit ? (
              <>
                <div className="h-3 w-full overflow-hidden rounded-full bg-ground">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      percent >= 80 ? 'bg-coral' : percent >= 60 ? 'bg-butter' : 'bg-sage',
                    )}
                    style={{ width: `${Math.max(2, percent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between font-sans text-[11px] text-ink-soft">
                  <span>{quota.freeRequestsToday.toLocaleString()} בקשות חינמיות היום</span>
                  <span>מתוך {limit.toLocaleString()}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-soft">
                {quota.freeRequestsToday.toLocaleString()} בקשות חינמיות היום. המגבלה היומית תופיע כאן אחרי הפעם
                הראשונה שהמכסה נגמרת; עד אז אפשר לראות אותה ב-
                <a
                  href="https://aistudio.google.com/rate-limit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-indigo underline"
                >
                  AI Studio
                </a>
                .
              </p>
            )}
            <p className="text-xs text-ink-soft">
              המכסה מתאפסת ב-{formatTime(quota.resetsAt)} (חצות בשעון קליפורניה). במסלול החינמי אין הגבלה על סך
              הטוקנים — רק על מספר הבקשות ביום ובדקה.
            </p>
          </div>
        )}
        {quota.freeKeyConfigured && !quota.paidKeyConfigured && (
          <p className="rounded-input bg-ground px-3 py-2 text-sm text-ink-soft">
            לא מוגדר מפתח בתשלום, ולכן כשהמכסה היומית נגמרת ה-AI מפסיק לעבוד עד האיפוס.
          </p>
        )}
        {quota.freeKeyConfigured && quota.paidKeyConfigured && !paidAllowed && spent && (
          <p className="rounded-input border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
            כפתורי ה-AI מושבתים עד {formatTime(quota.freeExhaustedUntil!)}, כי המעבר למסלול בתשלום כבוי בהגדרות.
          </p>
        )}
        {!quota.freeKeyConfigured && quota.paidKeyConfigured && !paidAllowed && (
          <p className="rounded-input border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
            מוגדר רק מפתח בתשלום, והשימוש בו כבוי בהגדרות — ולכן כפתורי ה-AI מושבתים.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule bg-ground/70 font-sans text-[11px] uppercase text-ink/60">
                <th className="px-3 py-2 text-right font-bold">מסלול</th>
                <th className="px-3 py-2 text-right font-bold">קריאות</th>
                <th className="px-3 py-2 text-right font-bold">טוקני קלט</th>
                <th className="px-3 py-2 text-right font-bold">טוקני פלט</th>
                <th className="px-3 py-2 text-right font-bold">עלות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dashed divide-rule/20">
              {([['חינמי', free], ['בתשלום', paid]] as const).map(([label, tier]) => (
                <tr key={label}>
                  <td className="px-3 py-2.5 font-bold text-ink">{label}</td>
                  <td className="px-3 py-2.5 font-sans text-ink/70 tabular">{tier.calls.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-sans text-ink/70 tabular">{tier.tokensInput.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-sans text-ink/70 tabular">{tier.tokensOutput.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-sans text-ink/70 tabular"><Usd value={tier.costUsd} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const PAID_FALLBACK_OPTIONS: { value: AiPaidFallback; label: string; description: string }[] = [
  {
    value: 'DAILY_QUOTA',
    label: 'רק כשהמכסה היומית נגמרת (מומלץ)',
    description: 'ה-AI עובד במסלול החינמי, ועובר למסלול בתשלום רק אחרי שמכסת הבקשות היומית נגמרה — עד האיפוס.',
  },
  {
    value: 'ANY_LIMIT',
    label: 'גם בעומס רגעי או בתקלה',
    description: 'בנוסף, כשהמסלול החינמי עמוס לרגע או לא זמין, הבקשה עוברת למסלול בתשלום במקום לחכות ולנסות שוב. מהיר יותר, אבל עולה יותר.',
  },
  {
    value: 'NEVER',
    label: 'אף פעם — לחסום את ה-AI',
    description: 'לא משתמשים במסלול בתשלום בכלל. כשהמכסה היומית נגמרת, כפתורי ה-AI מושבתים עד האיפוס.',
  },
];

/** The teacher's choice of when, if ever, AI calls move to the paid key. Saved as soon as she picks. */
function AiSettingsCard({ value, paidKeyConfigured }: { value: AiPaidFallback; paidKeyConfigured: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  // Shown at once, before the summary refetch brings the saved value back.
  const [selected, setSelected] = useState(value);
  useEffect(() => setSelected(value), [value]);

  const saveMutation = useMutation({
    mutationFn: (paidFallback: AiPaidFallback) => aiUsageApi.updateSettings({ paidFallback }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-usage-summary'] });
      qc.invalidateQueries({ queryKey: AI_AVAILABILITY_QUERY_KEY });
      toast.success('ההגדרה נשמרה');
    },
    onError: (err) => {
      setSelected(value);
      toast.error(getApiErrorMessage(err, 'שמירת ההגדרה נכשלה'));
    },
  });

  const choose = (next: AiPaidFallback) => {
    setSelected(next);
    saveMutation.mutate(next);
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-display text-base font-bold">מתי עוברים למסלול בתשלום</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <fieldset disabled={saveMutation.isPending} className="space-y-2">
          <legend className="sr-only">מתי עוברים למסלול בתשלום</legend>
          {PAID_FALLBACK_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-input border px-3 py-2 text-sm transition-colors',
                selected === option.value ? 'border-ink/40 bg-ground/60' : 'border-rule/40 hover:border-ink/30',
              )}
            >
              <input
                type="radio"
                name="ai-paid-fallback"
                value={option.value}
                checked={selected === option.value}
                onChange={() => choose(option.value)}
                className="mt-1 accent-ink"
              />
              <span>
                <span className="font-semibold text-ink">{option.label}</span>
                <span className="block text-xs text-ink-soft">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {!paidKeyConfigured && (
          <p className="text-xs text-ink-soft">
            כרגע לא מוגדר מפתח בתשלום בשרת, ולכן בכל אחת מהאפשרויות ה-AI נעצר כשהמכסה היומית נגמרת. ההגדרה תחול
            ברגע שיוגדר מפתח.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const tiles: Record<string, string> = {
  cobalt: 'bg-indigo text-sheet',
  tomato: 'bg-coral text-sheet',
  forest: 'bg-sage text-sheet',
  mustard: 'bg-butter text-ink',
};

function StatCard({ icon, label, value, tile }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; tile: keyof typeof tiles | string;
}) {
  return (
    <Card className="lift">
      <CardContent className="flex items-center gap-3">
        <div className={cn('grid size-10 shrink-0 place-items-center rounded-lg', tiles[tile])}>
          {icon}
        </div>
        <div>
          <p className="font-display text-2xl font-bold tabular text-ink">{value}</p>
          <p className="font-sans text-[11px] text-ink/60">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
