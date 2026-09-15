import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit, Users, BookOpen, Plus, Github, Trash2 } from 'lucide-react';
import { groupsApi } from '@/api/groups.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/ui/back-link';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'courses' | 'students'>('courses');

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
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="border-b border-rule pb-3">
        <BackLink className="mb-2" />
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-rule bg-indigo/15">
              <Users size={20} className="text-ink" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-black text-ink md:text-3xl">{group.name}</h1>
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

      {/* Courses / Students — a single toggle instead of a permanent split,
          so the section on screen is always the full width and never looks
          lopsided regardless of how much content either side has. */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab('courses')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
            tab === 'courses' ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
          )}
        >
          <BookOpen size={15} /> קורסים ({group.courses.length})
        </button>
        <button
          onClick={() => setTab('students')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
            tab === 'students' ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
          )}
        >
          <Users size={15} /> תלמידות ({group.students.length})
        </button>
      </div>

      {tab === 'courses' ? (
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.courses.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/teacher/courses/${c.id}`)}
                    className="lift flex items-center gap-2 rounded-lg border border-rule bg-sheet px-4 py-3 text-right shadow-soft transition-colors hover:bg-ground/60"
                  >
                    <BookOpen size={16} className="shrink-0 text-ink" />
                    <span className="text-sm font-medium text-ink truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
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
                <p className="text-xs text-ink/50 flex items-center gap-1 mt-0.5">
                  <Github size={11} /> {s.githubUsername || 'לא הוזן שם משתמש GitHub'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
