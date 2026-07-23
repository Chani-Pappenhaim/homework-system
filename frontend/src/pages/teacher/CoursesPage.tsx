import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Lock } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import type { CourseDTO } from '@/types';

export default function CoursesPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => coursesApi.list(),
  });

  const courses: CourseDTO[] = (data?.data as any)?.data?.courses ?? [];

  if (isLoading) return <div className="p-6 font-mono text-ink/50">טוען…</div>;

  return (
    <div className="max-w-4xl space-y-5" dir="rtl">
      <PageHeader
        title="קורסים"
        meta="ניהול · קורסים"
        actions={
          <Button variant="mustard" onClick={() => navigate('/teacher/courses/new')}>
            <Plus size={15} /> קורס חדש
          </Button>
        }
      />

      {courses.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />}>אין קורסים עדיין</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {courses.map((c, i) => (
            <Card key={c.id} accent={i % 2 ? 'cobalt' : 'tomato'} className="hover-lift">
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center border-2 border-ink bg-mustard">
                      <BookOpen size={18} className="text-ink" />
                    </div>
                    <div>
                      <p className="font-display text-base font-bold text-ink">{c.name}</p>
                      {c.groupName && <p className="font-mono text-[11px] text-ink/55">{c.groupName}</p>}
                    </div>
                  </div>
                  {c.hidden && <Badge variant="warning"><Lock size={10} className="ml-1" /> מוסתר</Badge>}
                </div>
                <div className="flex items-center justify-between border-t-2 border-dashed border-ink/25 pt-2">
                  <p className="font-mono text-[11px] text-ink/70">{c.lessonCount} שיעורים</p>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/courses/${c.id}`)}>
                    פתח קורס →
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
