import { useQuery } from '@tanstack/react-query';
import { Bot, HelpCircle, Cpu, DollarSign } from 'lucide-react';
import { aiUsageApi } from '@/api/aiUsage.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

function formatMonth(month: string) {
  const [year, m] = month.split('-');
  if (!year || !m) return month;
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' })
    .format(new Date(Number(year), Number(m) - 1, 1));
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}

export default function AiUsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['ai-usage-summary'],
    queryFn: () => aiUsageApi.summary(),
  });
  const { data: storageData } = useQuery({
    queryKey: ['storage-usage'],
    queryFn: () => aiUsageApi.storage(),
  });

  const summary = (data?.data as any)?.data;
  const storage = (storageData?.data as any)?.data as
    | { usedBytes: number; limitBytes: number; percent: number }
    | undefined;

  if (isLoading) return <div className="p-6 font-mono text-ink/50">טוען…</div>;

  const totalTokens = (summary?.totalTokensInput ?? 0) + (summary?.totalTokensOutput ?? 0);
  const byMonth: any[] = summary?.byMonth ?? [];

  return (
    <div className="max-w-4xl space-y-5" dir="rtl">
      <PageHeader title="שימוש AI" meta="דוחות · צריכת AI" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Bot size={18} />} tile="cobalt" label='סה"כ בדיקות AI' value={summary?.totalReviews ?? 0} />
        <StatCard icon={<HelpCircle size={18} />} tile="tomato" label='סה"כ חידונים' value={summary?.totalQuizzes ?? 0} />
        <StatCard icon={<Cpu size={18} />} tile="forest" label='סה"כ טוקנים' value={totalTokens.toLocaleString()} />
        <StatCard icon={<DollarSign size={18} />} tile="mustard" label="עלות מצטברת $" value={`$${(summary?.totalCostUsd ?? 0).toFixed(2)}`} />
      </div>

      {/* Cloudinary storage */}
      {storage && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold">אחסון קבצים · Cloudinary</h2>
              <span
                className={cn(
                  'font-mono text-sm font-bold tabular',
                  storage.percent >= 80 ? 'text-tomato' : storage.percent >= 60 ? 'text-mustard' : 'text-forest',
                )}
              >
                {Math.round(storage.percent)}%
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-4 w-full border-2 border-ink bg-paper">
              <div
                className={cn(
                  'h-full',
                  storage.percent >= 80 ? 'bg-tomato' : storage.percent >= 60 ? 'bg-mustard' : 'bg-forest',
                )}
                style={{ width: `${Math.max(2, Math.min(100, storage.percent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between font-mono text-[11px] text-ink/60">
              <span>{formatBytes(storage.usedBytes)} בשימוש</span>
              <span>מתוך {formatBytes(storage.limitBytes)}</span>
            </div>
            {storage.percent >= 80 && (
              <p className="border-2 border-tomato bg-tomato/10 px-3 py-2 text-sm text-tomato">
                האחסון עבר 80% — כדאי למחוק קבצים ישנים כדי שהגשות חדשות לא ייכשלו.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monthly breakdown */}
      <Card>
        <CardHeader>
          <h2 className="font-display text-base font-bold">פירוט חודשי</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink bg-cream/70 font-mono text-[11px] uppercase text-ink/60">
                <th className="px-5 py-2.5 text-right font-bold">חודש</th>
                <th className="px-3 py-2.5 text-right font-bold">בדיקות</th>
                <th className="px-3 py-2.5 text-right font-bold">חידונים</th>
                <th className="px-3 py-2.5 text-right font-bold">עלות</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-dashed divide-ink/20">
              {byMonth.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-4 text-center text-ink/50">אין נתוני שימוש עדיין</td></tr>
              )}
              {byMonth.map((m) => (
                <tr key={m.month} className="transition-colors hover:bg-mustard/15">
                  <td className="px-5 py-3 font-bold text-ink">{formatMonth(m.month)}</td>
                  <td className="px-3 py-3 font-mono text-ink/70 tabular">{m.reviews}</td>
                  <td className="px-3 py-3 font-mono text-ink/70 tabular">{m.quizzes}</td>
                  <td className="px-3 py-3 font-mono text-ink/70 tabular">${(m.costUsd ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const tiles: Record<string, string> = {
  cobalt: 'bg-cobalt text-paper',
  tomato: 'bg-tomato text-paper',
  forest: 'bg-forest text-paper',
  mustard: 'bg-mustard text-ink',
};

function StatCard({ icon, label, value, tile }: {
  icon: React.ReactNode; label: string; value: number | string; tile: keyof typeof tiles | string;
}) {
  return (
    <Card className="hover-lift">
      <CardContent className="flex items-center gap-3">
        <div className={cn('grid size-10 shrink-0 place-items-center border-2 border-ink', tiles[tile])}>
          {icon}
        </div>
        <div>
          <p className="font-display text-2xl font-black tabular text-ink">{value}</p>
          <p className="font-mono text-[11px] text-ink/60">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
