import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Eye } from 'lucide-react';
import { groupsApi } from '@/api/groups.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Tape } from '@/components/decor';
import { cn } from '@/lib/utils';
import type { GroupDTO } from '@/types';

const ACCENTS = ['indigo', 'sage', 'clay', 'butter', 'coral'] as const;
const ICON_TINT: Record<(typeof ACCENTS)[number], string> = {
  indigo: 'bg-indigo/15 text-indigo',
  sage: 'bg-sage/15 text-sage',
  clay: 'bg-clay/15 text-clay',
  butter: 'bg-butter/30 text-clay',
  coral: 'bg-coral/15 text-coral',
};

export default function GroupsPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const groups: GroupDTO[] = (data?.data as any)?.data?.groups ?? [];

  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5" dir="rtl">
      <PageHeader
        title="קבוצות"
        meta="ניהול · קבוצות"
        actions={
          <Button variant="clay" onClick={() => navigate('/teacher/groups/new')}>
            <Plus size={15} /> קבוצה חדשה
          </Button>
        }
      />

      {groups.length === 0 ? (
        <EmptyState icon={<Users size={22} />}>אין קבוצות עדיין</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g, i) => {
            const accent = ACCENTS[i % ACCENTS.length];
            return (
            <Card key={g.id} accent={accent} className="lift relative">
              <Tape color={accent} rotate={i % 2 ? 4 : -4} className="-top-2 left-6 w-14" />
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('grid size-10 shrink-0 place-items-center rounded-lg', ICON_TINT[accent])}>
                      <Users size={18} />
                    </div>
                    <div>
                      <p className="font-display text-base font-bold text-ink">{g.name}</p>
                      {g.seminar && <p className="font-sans text-[11px] text-ink/55">{g.seminar}</p>}
                    </div>
                  </div>
                  <span className="font-sans text-[11px] text-ink/50">{g.year}</span>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-rule/25 pt-2">
                  <p className="font-sans text-[11px] text-ink/70">{g.studentCount} תלמידות</p>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/groups/${g.id}`)}>
                    <Eye size={12} /> צפייה
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
