import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Lock } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Tape } from '@/components/decor';
import { cn } from '@/lib/utils';
import type { CourseDTO } from '@/types';

// Each card gets its own accent so the grid reads like colourful tabbed sheets.
const ACCENTS = ['clay', 'indigo', 'sage', 'butter', 'coral'] as const;
const ICON_TINT: Record<(typeof ACCENTS)[number], string> = {
  clay: 'bg-clay/15 text-clay',
  indigo: 'bg-indigo/15 text-indigo',
  sage: 'bg-sage/15 text-sage',
  butter: 'bg-butter/30 text-clay',
  coral: 'bg-coral/15 text-coral',
};

export default function CoursesPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => coursesApi.list(),
  });

  const courses: CourseDTO[] = (data?.data as any)?.data?.courses ?? [];

  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="קורסים"
        meta="ניהול · קורסים"
        actions={
          <Button variant="clay" onClick={() => navigate('/teacher/courses/new')}>
            <Plus size={15} /> קורס חדש
          </Button>
        }
      />

      {courses.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />}>אין קורסים עדיין</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {courses.map((c, i) => {
            const accent = ACCENTS[i % ACCENTS.length];
            return (
            <Card key={c.id} accent={accent} className="lift relative">
              <Tape color={accent} rotate={i % 2 ? 4 : -4} className="-top-2 left-6 w-14" />
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('grid size-10 shrink-0 place-items-center rounded-lg', ICON_TINT[accent])}>
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <p className="font-display text-base font-bold text-ink">{c.name}</p>
                      {c.groupName && <p className="font-sans text-[11px] text-ink/55">{c.groupName}</p>}
                    </div>
                  </div>
                  {c.hidden && <Badge variant="warning"><Lock size={10} className="ml-1" /> מוסתר</Badge>}
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-rule/25 pt-2">
                  <p className="font-sans text-[11px] text-ink/70">{c.lessonCount} שיעורים</p>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/courses/${c.id}`)}>
                    פתח קורס ←
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
