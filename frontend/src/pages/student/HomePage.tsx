import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import useAuthStore from '@/store/authStore';
import { coursesApi } from '@/api/courses.api';
import { submissionsApi } from '@/api/submissions.api';
import Card, { CardBody } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatDate, isOverdue } from '@/lib/utils';

const COURSE_EMOJIS = ['📚', '💻', '🎯', '🔧', '⚡', '🌟', '🧩', '🚀'];

export default function StudentHomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: coursesData } = useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });
  const { data: mineData } = useQuery({ queryKey: ['mine'], queryFn: () => submissionsApi.mine() });

  const courses = coursesData?.data.data.courses ?? [];
  const mine = (mineData?.data as any)?.data;
  const pending: any[] = mine?.pending ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">הקורסים שלי ✦</h1>
          <p className="text-[#6B7280] text-sm mt-0.5">{user?.name}</p>
        </div>
        {pending.length > 0 && (
          <Badge variant="pink">{pending.length} מטלות ממתינות</Badge>
        )}
      </div>

      {/* Course grid */}
      {courses.length === 0 ? (
        <Card><CardBody><p className="text-[#9CA3AF] text-sm text-center py-6">לא שויכת לאף קורס עדיין</p></CardBody></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {courses.map((c, i) => {
            const done = c.completedLessons ?? 0;
            const total = c.lessonCount || 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <Card
                key={c.id}
                accent="primary"
                className="cursor-pointer hover:shadow-md transition"
                onClick={() => navigate(`/student/courses/${c.id}`)}
              >
                <CardBody>
                  <div className="text-3xl mb-2">{COURSE_EMOJIS[i % COURSE_EMOJIS.length]}</div>
                  <h2 className="font-semibold text-[#1A1830] text-sm leading-snug mb-1">{c.name}</h2>
                  <p className="text-xs text-[#9CA3AF] mb-3">{c.lessonCount} שיעורים</p>
                  {/* Progress bar */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-[#6B7280]">
                      {done}/{total} הושלמו {pct === 100 && total > 0 && '🎉'}
                    </span>
                    <span className="text-[11px] font-bold text-primary">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-[#EEEBF5] rounded-full overflow-hidden">
                    <div className="h-full gradient-progress rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pending assignments */}
      {pending.length > 0 && (
        <Card>
          <div className="px-5 py-3 border-b border-[#EEEBF5]">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Clock size={14} className="text-[#C2185B]" /> מטלות ממתינות
            </h2>
          </div>
          <div className="divide-y divide-[#EEEBF5]">
            {pending.map((p) => (
              <div key={p.assignmentId} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{p.assignmentTitle}</p>
                  <p className="text-xs text-[#9CA3AF]">{p.courseName} · {p.lessonTopic}</p>
                </div>
                {p.deadline && (
                  <Badge variant={isOverdue(p.deadline) ? 'pink' : 'amber'}>
                    {isOverdue(p.deadline) ? 'פג תוקף' : formatDate(p.deadline)}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
