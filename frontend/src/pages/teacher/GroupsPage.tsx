import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Edit } from 'lucide-react';
import { groupsApi } from '@/api/groups.api';
import Card, { CardBody } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type { GroupDTO } from '@/types';

export default function GroupsPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const groups: GroupDTO[] = (data?.data as any)?.data?.groups ?? [];

  if (isLoading) return <div className="p-6 text-[#9CA3AF]">טוען...</div>;

  return (
    <div className="max-w-4xl space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">קבוצות</h1>
        <Button variant="violet" onClick={() => navigate('/teacher/groups/new')}>
          <Plus size={15} /> קבוצה חדשה
        </Button>
      </div>

      {groups.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-sm text-[#9CA3AF]">אין קבוצות עדיין</p>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        {groups.map((g) => (
          <Card key={g.id}>
            <CardBody className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[rgba(124,58,237,0.08)] flex items-center justify-center flex-shrink-0">
                    <Users size={20} className="text-[#7C3AED]" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-[#1A1830]">{g.name}</p>
                    {g.seminar && <p className="text-xs text-[#9CA3AF]">{g.seminar}</p>}
                  </div>
                </div>
                <span className="text-xs text-[#9CA3AF]">{g.year}</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#6B7280]">{g.studentCount} תלמידות</p>
                <Button size="sm" variant="ghost" onClick={() => navigate(`/teacher/groups/${g.id}/edit`)}>
                  <Edit size={12} /> צפייה/עריכה
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
