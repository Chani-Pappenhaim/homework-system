import { useQuery } from '@tanstack/react-query';
import { Bot, HelpCircle, Cpu, DollarSign } from 'lucide-react';
import { aiUsageApi } from '@/api/aiUsage.api';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';

function formatMonth(month: string) {
  const [year, m] = month.split('-');
  if (!year || !m) return month;
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' })
    .format(new Date(Number(year), Number(m) - 1, 1));
}

export default function AiUsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['ai-usage-summary'],
    queryFn: () => aiUsageApi.summary(),
  });

  const summary = (data?.data as any)?.data;

  if (isLoading) return <div className="p-6 text-[#9CA3AF]">טוען...</div>;

  const totalTokens = (summary?.totalTokensInput ?? 0) + (summary?.totalTokensOutput ?? 0);
  const byMonth: any[] = summary?.byMonth ?? [];

  return (
    <div className="max-w-4xl space-y-5" dir="rtl">
      <h1 className="text-xl font-bold">שימוש AI</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={<Bot size={20} className="text-[#7C3AED]" />}
          label='סה"כ בדיקות AI'
          value={summary?.totalReviews ?? 0}
          bg="bg-[rgba(124,58,237,0.08)]"
        />
        <StatCard
          icon={<HelpCircle size={20} className="text-[#C2185B]" />}
          label='סה"כ חידונים'
          value={summary?.totalQuizzes ?? 0}
          bg="bg-[rgba(194,24,91,0.08)]"
        />
        <StatCard
          icon={<Cpu size={20} className="text-[#059669]" />}
          label='סה"כ טוקנים'
          value={totalTokens.toLocaleString()}
          bg="bg-[rgba(5,150,105,0.08)]"
        />
        <StatCard
          icon={<DollarSign size={20} className="text-[#D97706]" />}
          label="עלות מצטברת $"
          value={`$${(summary?.totalCostUsd ?? 0).toFixed(2)}`}
          bg="bg-[rgba(217,119,6,0.08)]"
        />
      </div>

      {/* Monthly breakdown */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-sm">פירוט חודשי</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EEEBF5] text-xs text-[#9CA3AF]">
                <th className="px-5 py-2.5 text-right font-medium">חודש</th>
                <th className="px-3 py-2.5 text-right font-medium">בדיקות</th>
                <th className="px-3 py-2.5 text-right font-medium">חידונים</th>
                <th className="px-3 py-2.5 text-right font-medium">עלות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEBF5]">
              {byMonth.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-4 text-center text-[#9CA3AF]">אין נתוני שימוש עדיין</td></tr>
              )}
              {byMonth.map((m) => (
                <tr key={m.month} className="hover:bg-[#F8F7FC] transition">
                  <td className="px-5 py-3 font-medium text-[#1A1830]">{formatMonth(m.month)}</td>
                  <td className="px-3 py-3 text-[#6B7280]">{m.reviews}</td>
                  <td className="px-3 py-3 text-[#6B7280]">{m.quizzes}</td>
                  <td className="px-3 py-3 text-[#6B7280]">${(m.costUsd ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, bg }: {
  icon: React.ReactNode; label: string; value: number | string; bg: string;
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <p className="text-xl font-bold text-[#1A1830]">{value}</p>
          <p className="text-xs text-[#6B7280]">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}
