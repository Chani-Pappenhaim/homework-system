import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Eye } from 'lucide-react';
import { groupsApi } from '@/api/groups.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import type { GroupDTO } from '@/types';

export default function GroupsPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const groups: GroupDTO[] = (data?.data as any)?.data?.groups ?? [];

  if (isLoading) return <div className="p-6 font-mono text-ink/50">טוען…</div>;

  return (
    <div className="max-w-4xl space-y-5" dir="rtl">
      <PageHeader
        title="קבוצות"
        meta="ניהול · קבוצות"
        actions={
          <Button variant="mustard" onClick={() => navigate('/teacher/groups/new')}>
            <Plus size={15} /> קבוצה חדשה
          </Button>
        }
      />

      {groups.length === 0 ? (
        <EmptyState icon={<Users size={22} />}>אין קבוצות עדיין</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {groups.map((g, i) => (
            <Card key={g.id} accent={i % 2 ? 'plum' : 'lilac'} className="hover-lift">
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center border-2 border-ink bg-lilac">
                      <Users size={18} className="text-ink" />
                    </div>
                    <div>
                      <p className="font-display text-base font-bold text-ink">{g.name}</p>
                      {g.seminar && <p className="font-mono text-[11px] text-ink/55">{g.seminar}</p>}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-ink/50">{g.year}</span>
                </div>
                <div className="flex items-center justify-between border-t-2 border-dashed border-ink/25 pt-2">
                  <p className="font-mono text-[11px] text-ink/70">{g.studentCount} תלמידות</p>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/groups/${g.id}`)}>
                    <Eye size={12} /> צפייה
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
