import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, BookOpen, ClipboardList, Sparkles, Plus } from 'lucide-react';
import useAuthStore from '@/store/authStore';
import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';
import { gradesApi } from '@/api/grades.api';
import { aiUsageApi } from '@/api/aiUsage.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

export default function TeacherHomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: groupsData } = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list() });
  const { data: coursesData } = useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });
  const { data: pendingData } = useQuery({ queryKey: ['pending'], queryFn: () => gradesApi.pending() });
  const { data: aiUsageData } = useQuery({ queryKey: ['ai-usage-summary'], queryFn: () => aiUsageApi.summary() });

  const groups = groupsData?.data.data.groups ?? [];
  const courses = coursesData?.data.data.courses ?? [];
  const pending = (pendingData?.data as any)?.data?.count ?? 0;
  const aiCost = (aiUsageData?.data as any)?.data?.totalCostUsd;

  const today = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1830]">שלום, {user?.name} ✦</h1>
          <p className="text-[#6B7280] text-sm mt-0.5">{today}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/teacher/groups/new')}>
            <Plus size={15} /> קבוצה חדשה
          </Button>
          <Button onClick={() => navigate('/teacher/courses/new')}>
            <Plus size={15} /> קורס חדש
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={<Users size={20} className="text-[#7C3AED]" />} label="קבוצות" value={groups.length} bg="bg-[rgba(124,58,237,0.08)]" />
        <StatCard icon={<BookOpen size={20} className="text-[#C2185B]" />} label="קורסים" value={courses.length} bg="bg-[rgba(194,24,91,0.08)]" />
        <StatCard icon={<ClipboardList size={20} className="text-[#059669]" />} label="ממתינות לציון" value={pending} bg="bg-[rgba(5,150,105,0.08)]" urgent={pending > 0} />
        <StatCard
          icon={<Sparkles size={20} className="text-[#D97706]" />}
          label="AI ועלויות"
          value={aiCost != null ? `$${Number(aiCost).toFixed(2)}` : '—'}
          bg="bg-[rgba(217,119,6,0.08)]"
          onClick={() => navigate('/teacher/ai-usage')}
        />
      </div>

      {/* Lists */}
      <div className="grid grid-cols-2 gap-5">
        {/* Groups */}
        <Card>
          <div className="px-5 py-3 border-b border-[#EEEBF5] flex items-center justify-between">
            <h2 className="font-semibold text-sm">קבוצות</h2>
            <span className="text-xs text-[#9CA3AF]">{groups.length} סה"כ</span>
          </div>
          <div className="divide-y divide-[#EEEBF5]">
            {groups.length === 0 && (
              <p className="px-5 py-4 text-sm text-[#9CA3AF]">אין קבוצות עדיין</p>
            )}
            {groups.map((g) => (
              <div
                key={g.id}
                className="px-5 py-3 hover:bg-[#F8F7FC] cursor-pointer transition"
                onClick={() => navigate(`/teacher/groups/${g.id}/edit`)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1A1830]">{g.name}</p>
                    {g.seminar && <p className="text-xs text-[#9CA3AF]">{g.seminar}</p>}
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-[#6B7280]">{g.studentCount} תלמידות</p>
                    <p className="text-xs text-[#9CA3AF]">{g.year}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Courses */}
        <Card>
          <div className="px-5 py-3 border-b border-[#EEEBF5] flex items-center justify-between">
            <h2 className="font-semibold text-sm">קורסים</h2>
            <span className="text-xs text-[#9CA3AF]">{courses.length} סה"כ</span>
          </div>
          <div className="divide-y divide-[#EEEBF5]">
            {courses.length === 0 && (
              <p className="px-5 py-4 text-sm text-[#9CA3AF]">אין קורסים עדיין</p>
            )}
            {courses.map((c) => (
              <div
                key={c.id}
                className="px-5 py-3 hover:bg-[#F8F7FC] cursor-pointer transition"
                onClick={() => navigate(`/teacher/courses/${c.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1A1830]">{c.name}</p>
                    <p className="text-xs text-[#9CA3AF]">{c.groupName}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-[#6B7280]">{c.lessonCount} שיעורים</p>
                    <p className="text-xs text-[#9CA3AF]">{formatDate(c.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, bg, urgent, onClick }: {
  icon: React.ReactNode; label: string; value: number | string; bg: string; urgent?: boolean; onClick?: () => void;
}) {
  return (
    <Card onClick={onClick} className={onClick ? 'cursor-pointer hover:bg-[#F8F7FC] transition' : undefined}>
      <CardContent className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <p className={`text-xl font-bold ${urgent ? 'text-red-500' : 'text-[#1A1830]'}`}>{value}</p>
          <p className="text-xs text-[#6B7280]">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
