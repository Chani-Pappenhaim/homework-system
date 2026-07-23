import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit, Users, BookOpen, Plus, Github } from 'lucide-react';
import { groupsApi } from '@/api/groups.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.get(id!),
  });

  const group = data?.data.data.group;

  if (isLoading) return <div className="p-6 text-[#9CA3AF]">טוען...</div>;
  if (!group) return <div className="p-6 text-red-500">קבוצה לא נמצאה</div>;

  return (
    <div className="max-w-3xl space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[rgba(124,58,237,0.08)] flex items-center justify-center flex-shrink-0">
            <Users size={22} className="text-[#7C3AED]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#1A1830]">{group.name}</h1>
            <p className="text-[#6B7280] text-sm mt-0.5">
              {group.seminar && <span>{group.seminar} · </span>}
              שנה"ל {group.year} · {group.students.length} תלמידות
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/groups/${id}/edit`)}>
          <Edit size={13} /> ערוך קבוצה
        </Button>
      </div>

      {/* Courses of this group */}
      <Card accent="cobalt">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <BookOpen size={15} className="text-primary" /> קורסים ({group.courses.length})
            </h2>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/teacher/courses/new?groupId=${id}`)}>
              <Plus size={13} /> קורס לקבוצה
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {group.courses.length === 0 ? (
            <p className="text-sm text-[#9CA3AF]">אין קורסים בקבוצה זו עדיין</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {group.courses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/teacher/courses/${c.id}`)}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[#EEEBF5] text-right hover:border-primary/40 hover:bg-[rgba(194,24,91,0.03)] transition"
                >
                  <BookOpen size={16} className="text-primary flex-shrink-0" />
                  <span className="text-sm font-medium text-[#1A1830]">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Students (read-only) */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-sm">תלמידות ({group.students.length})</h2>
        </CardHeader>
        <div className="divide-y divide-[#EEEBF5]">
          {group.students.length === 0 && (
            <p className="px-5 py-4 text-sm text-[#9CA3AF]">אין תלמידות עדיין</p>
          )}
          {group.students.map((s) => (
            <div key={s.id} className="px-5 py-3">
              <p className="text-sm font-medium text-[#1A1830]">{s.name}</p>
              <p className="text-xs text-[#9CA3AF]">{s.email}</p>
              {s.githubUsername && (
                <p className="text-xs text-[#9CA3AF] flex items-center gap-1 mt-0.5">
                  <Github size={11} /> {s.githubUsername}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
