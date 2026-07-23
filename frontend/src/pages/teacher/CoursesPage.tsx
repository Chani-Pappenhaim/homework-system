import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Lock } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CourseDTO } from '@/types';

export default function CoursesPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => coursesApi.list(),
  });

  const courses: CourseDTO[] = (data?.data as any)?.data?.courses ?? [];

  if (isLoading) return <div className="p-6 text-ink/50">טוען...</div>;

  return (
    <div className="max-w-4xl space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">קורסים</h1>
        <Button variant="secondary" onClick={() => navigate('/teacher/courses/new')}>
          <Plus size={15} /> קורס חדש
        </Button>
      </div>

      {courses.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-ink/50">אין קורסים עדיין</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        {courses.map((c) => (
          <Card key={c.id}>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[rgba(194,24,91,0.08)] flex items-center justify-center flex-shrink-0">
                    <BookOpen size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-ink">{c.name}</p>
                    {c.groupName && <p className="text-xs text-ink/50">{c.groupName}</p>}
                  </div>
                </div>
                {c.hidden && <Badge variant="warning"><Lock size={10} className="ml-1" /> מוסתר</Badge>}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink/70">{c.lessonCount} שיעורים</p>
                <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/courses/${c.id}`)}>
                  פתח קורס
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
