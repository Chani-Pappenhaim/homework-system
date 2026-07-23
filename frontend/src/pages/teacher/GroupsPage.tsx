import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Eye } from 'lucide-react';
import { groupsApi } from '@/api/groups.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { GroupDTO } from '@/types';

export default function GroupsPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const groups: GroupDTO[] = (data?.data as any)?.data?.groups ?? [];

  if (isLoading) return <div className="p-6 text-ink/50">טוען...</div>;

  return (
    <div className="max-w-4xl space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">קבוצות</h1>
        <Button variant="secondary" onClick={() => navigate('/teacher/groups/new')}>
          <Plus size={15} /> קבוצה חדשה
        </Button>
      </div>

      {groups.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-ink/50">אין קבוצות עדיין</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        {groups.map((g) => (
          <Card key={g.id}>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[rgba(124,58,237,0.08)] flex items-center justify-center flex-shrink-0">
                    <Users size={20} className="text-cobalt" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-ink">{g.name}</p>
                    {g.seminar && <p className="text-xs text-ink/50">{g.seminar}</p>}
                  </div>
                </div>
                <span className="text-xs text-ink/50">{g.year}</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink/70">{g.studentCount} תלמידות</p>
                <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/groups/${g.id}`)}>
                  <Eye size={12} /> צפייה
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
