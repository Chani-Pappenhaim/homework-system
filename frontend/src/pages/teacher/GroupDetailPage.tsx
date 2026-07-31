import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit, Users, BookOpen, Plus, Github, Trash2 } from 'lucide-react';
import { groupsApi } from '@/api/groups.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/ui/back-link';
import { useToast } from '@/components/ui/toast';

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.get(id!),
  });

  const group = data?.data.data.group;

  const deleteGroupMutation = useMutation({
    mutationFn: () => groupsApi.delete(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast.success('הקבוצה נמחקה');
      navigate('/teacher/groups');
    },
  });

  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;
  if (!group) return <div className="p-6 font-sans text-coral">קבוצה לא נמצאה</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5" dir="rtl">
      {/* Header */}
      <div className="border-b border-rule pb-3">
        <BackLink className="mb-2" />
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-rule bg-indigo/15">
              <Users size={20} className="text-ink" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">{group.name}</h1>
            <p className="text-ink/70 text-sm mt-0.5">
              {group.seminar && <span>{group.seminar} · </span>}
              שנה"ל {group.year} · {group.students.length} תלמידות
            </p>
          </div>
        </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/groups/${id}/edit`)}>
              <Edit size={13} /> ערוך קבוצה
            </Button>
            <Button
              variant="destructive"
              size="sm"
              loading={deleteGroupMutation.isPending}
              onClick={() => {
                const coursesNote = group.courses.length > 0
                  ? ` כל ${group.courses.length} הקורסים של הקבוצה (כולל שיעורים, מטלות והגשות) יימחקו גם הם לצמיתות.`
                  : '';
                if (confirm(`למחוק את הקבוצה "${group.name}"?${coursesNote} התלמידות לא יימחקו מהמערכת, רק ישויכו החוצה מהקבוצה.`)) {
                  deleteGroupMutation.mutate();
                }
              }}
            >
              <Trash2 size={13} /> מחק קבוצה
            </Button>
          </div>
        </div>
      </div>

      {/* Courses of this group */}
      <Card accent="indigo">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold flex items-center gap-1.5">
              <BookOpen size={15} className="text-clay" /> קורסים ({group.courses.length})
            </h2>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/teacher/courses/new?groupId=${id}`)}>
              <Plus size={13} /> קורס לקבוצה
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {group.courses.length === 0 ? (
            <p className="text-sm text-ink/50">אין קורסים בקבוצה זו עדיין</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {group.courses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/teacher/courses/${c.id}`)}
                  className="lift flex items-center gap-2 rounded-lg border border-rule bg-sheet px-4 py-3 text-right shadow-soft"
                >
                  <BookOpen size={16} className="shrink-0 text-ink" />
                  <span className="text-sm font-medium text-ink">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Students (read-only) */}
      <Card>
        <CardHeader>
          <h2 className="font-display text-base font-bold">תלמידות ({group.students.length})</h2>
        </CardHeader>
        <div className="divide-y divide-rule/20">
          {group.students.length === 0 && (
            <p className="px-5 py-4 text-sm text-ink/50">אין תלמידות עדיין</p>
          )}
          {[...group.students].sort((a, b) => a.name.localeCompare(b.name, 'he')).map((s) => (
            <div key={s.id} className="px-5 py-3">
              <p className="text-sm font-medium text-ink">{s.name}</p>
              <p className="text-xs text-ink/50">{s.email}</p>
              {s.githubUsername && (
                <p className="text-xs text-ink/50 flex items-center gap-1 mt-0.5">
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
