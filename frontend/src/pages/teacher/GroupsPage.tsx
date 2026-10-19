import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Eye, Edit, Trash2 } from 'lucide-react';
import { groupsApi } from '@/api/groups.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { CourseSkeleton } from '@/components/ui/skeleton';
import { Tape } from '@/components/decor';
import { cn, groupDisplayName } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import type { GroupDTO } from '@/types';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useDeleteGroup } from '@/hooks/useDeleteGroup';

const ACCENTS = ['indigo', 'sage', 'clay', 'butter', 'coral'] as const;
const ICON_TINT: Record<(typeof ACCENTS)[number], string> = {
  indigo: 'bg-indigo/15 text-indigo',
  sage: 'bg-sage/15 text-sage',
  clay: 'bg-clay/15 text-clay',
  butter: 'bg-butter/30 text-clay',
  coral: 'bg-coral/15 text-coral',
};

export default function GroupsPage() {
  usePageTitle('קבוצות');
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { confirmDialog, deleteGroup, deletingId } = useDeleteGroup();

  const { data, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const groups: GroupDTO[] = unwrap(data)?.groups ?? [];
  // Free text over the whole name the teacher sees - seminar, name and year.
  const q = search.trim().toLowerCase();
  const shown = q ? groups.filter((g) => groupDisplayName(g).toLowerCase().includes(q)) : groups;

  if (isLoading)
    return (
      <div className="space-y-5" dir="rtl">
        <PageHeader title="קבוצות" meta="ניהול · קבוצות" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <CourseSkeleton key={i} />)}
        </div>
      </div>
    );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="קבוצות"
        meta="ניהול · קבוצות"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {groups.length > 0 && (
              <SearchField value={search} onChange={setSearch} placeholder="חיפוש קבוצה" className="bg-ground/60 sm:w-56" />
            )}
            <Button variant="clay" onClick={() => navigate('/teacher/groups/new')}>
              <Plus size={15} /> קבוצה חדשה
            </Button>
          </div>
        }
      />

      {groups.length === 0 ? (
        <EmptyState icon={<Users size={22} />}>אין קבוצות עדיין</EmptyState>
      ) : shown.length === 0 ? (
        <div className="sheet p-8 text-center text-sm text-ink-soft">{`אין קבוצות שמתאימות ל"${search.trim()}"`}</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((g, i) => {
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
                      <p className="font-display text-base font-bold text-ink">{groupDisplayName(g)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-rule/25 pt-2">
                  <p className="font-sans text-[11px] text-ink/70">{g.studentCount} תלמידות</p>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/groups/${g.id}`)}>
                      <Eye size={12} /> צפייה
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/groups/${g.id}/edit`)}>
                      <Edit size={12} /> עריכה
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      loading={deletingId === g.id}
                      onClick={() => deleteGroup(g)}
                      aria-label={`מחיקת הקבוצה ${groupDisplayName(g)}`}
                      title="מחיקת הקבוצה"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
