import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, UserPlus, Pencil, MailCheck, MailWarning, BellOff, Download } from 'lucide-react';
import { groupsApi } from '@/api/groups.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StudentsImportPanel } from '@/components/teacher/StudentsImportPanel';
import { StudentEditDialog, type EditableStudent } from '@/components/teacher/StudentEditDialog';
import { BackLink } from '@/components/ui/back-link';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadBlob, groupDisplayName } from '@/lib/utils';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function GroupFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [seminar, setSeminar] = useState('');
  const [year, setYear] = useState('');
  const [notifyDefault, setNotifyDefault] = useState(true);
  const [error, setError] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [tab, setTab] = useState<'manual' | 'excel'>('manual');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGithub, setNewGithub] = useState('');
  const [addError, setAddError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removeOneTarget, setRemoveOneTarget] = useState<{ id: string; name: string } | null>(null);
  const [removeBulkOpen, setRemoveBulkOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<EditableStudent | null>(null);
  const [studentQuery, setStudentQuery] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data } = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.get(id!),
    enabled: isEdit,
  });

  const group = data?.data.data.group;
  usePageTitle(isEdit ? 'עריכת קבוצה' : 'קבוצה חדשה');

  const visibleStudents = (() => {
    const q = studentQuery.trim().toLowerCase();
    const filtered = !group ? [] : q
      ? group.students.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
      : group.students;
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'he'));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  })();

  useEffect(() => {
    if (group) {
      setName(group.name);
      setSeminar(group.seminar ?? '');
      setYear(group.year);
      setNotifyDefault(group.emailNotificationsDefault ?? true);
    }
  }, [group]);

  const saveMutation = useMutation({
    mutationFn: () => isEdit
      ? groupsApi.update(id!, { name: name.trim(), seminar: seminar.trim(), year: year.trim(), emailNotificationsDefault: notifyDefault })
      : groupsApi.create({ name: name.trim(), seminar: seminar.trim(), year: year.trim(), emailNotificationsDefault: notifyDefault }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      toast.success(isEdit ? 'הקבוצה נשמרה בהצלחה' : 'הקבוצה נוצרה בהצלחה');
      const gid = isEdit ? id! : res.data.data.group.id;
      navigate(`/teacher/groups/${gid}/edit`);
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שגיאה בשמירה')),
  });

  const addStudentMutation = useMutation({
    mutationFn: () => groupsApi.addStudent(id!, { name: newName, email: newEmail, githubUsername: newGithub || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', id] });
      setNewName(''); setNewEmail(''); setNewGithub(''); setAddError(''); setAddModal(false);
      toast.success('התלמידה נוספה בהצלחה');
    },
    onError: (e: any) => setAddError(getApiErrorMessage(e, 'שגיאה בהוספה')),
  });

  const removeStudentMutation = useMutation({
    mutationFn: (studentId: string) => groupsApi.removeStudent(id!, studentId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['group', id] }); setRemoveOneTarget(null); },
  });

  const removeStudentsMutation = useMutation({
    mutationFn: (studentIds: string[]) => groupsApi.removeStudents(id!, studentIds),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['group', id] });
      setSelected(new Set());
      setRemoveBulkOpen(false);
      toast.success(`הוסרו ${res.data.data.removed} תלמידות מהקבוצה`);
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => groupsApi.exportStudents(id!),
    onSuccess: (res) => downloadBlob(res.data as Blob, group ? `תלמידות ${groupDisplayName(group)}.xlsx` : 'group-students.xlsx'),
    onError: (e) => toast.error(getApiErrorMessage(e, 'ההורדה נכשלה')),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (studentId: string) => groupsApi.resetPassword(id!, studentId),
    onSuccess: () => { setResetTarget(null); toast.success('הסיסמא אופסה ל-12345678'); },
  });

  function toggleSelected(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  }

  // "Select all" takes the students on screen - all of them, or those the search found.
  const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every((s) => selected.has(s.id));
  const someVisibleSelected = visibleStudents.some((s) => selected.has(s.id));

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of visibleStudents) {
        if (allVisibleSelected) next.delete(s.id); else next.add(s.id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="border-b border-rule pb-3">
        <BackLink className="mb-2" />
        <h1 className="font-display text-2xl font-black text-ink md:text-3xl">{isEdit ? 'עריכת קבוצה' : 'קבוצה חדשה'}</h1>
      </div>

      {/* Form + Students — independent, equal-weight sections side by side on wide edit screens; a plain narrow form when creating */}
      <div className={isEdit ? 'grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start' : 'mx-auto max-w-2xl'}>
        <Card>
          <CardContent className="space-y-4">
            <Input label="שם סמינר *" value={seminar} onChange={(e) => setSeminar(e.target.value)} placeholder='סמינר מאיר' required />
            <Input label="שם קבוצה / כיתה *" value={name} onChange={(e) => setName(e.target.value)} placeholder='יד' required />
            <Input label='שנה"ל *' value={year} onChange={(e) => setYear(e.target.value)} placeholder='תשפ"ו' required />
            {(seminar.trim() || name.trim() || year.trim()) && (
              <p className="text-xs text-ink/60">שם הקבוצה יוצג כך: <span className="font-semibold text-ink">{groupDisplayName({ name, seminar, year })}</span></p>
            )}
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" className="mt-1" checked={notifyDefault} onChange={(e) => setNotifyDefault(e.target.checked)} />
              <span>
                עדכונים במייל לתלמידות חדשות בקבוצה
                <span className="block text-xs text-ink/55">ברירת מחדל לתלמידות שיתווספו מעכשיו - כל תלמידה יכולה לשנות בפרופיל שלה</span>
              </span>
            </label>
            {error && <p className="text-coral text-sm">{error}</p>}
            <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()} disabled={!seminar.trim() || !name.trim() || !year.trim()}>
              {isEdit ? 'שמור שינויים' : 'צור קבוצה'}
            </Button>
          </CardContent>
        </Card>

        {/* Students table — only in edit mode */}
        {isEdit && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold">תלמידות ({group?.students.length ?? 0})</h2>
                <div className="flex gap-2">
                  {selected.size > 0 && (
                    <Button size="sm" variant="destructive" onClick={() => setRemoveBulkOpen(true)}>
                      <Trash2 size={13} /> הסר נבחרות ({selected.size})
                    </Button>
                  )}
                  {(group?.students.length ?? 0) > 0 && (
                    <Button
                      size="sm" variant="outline" loading={exportMutation.isPending} onClick={() => exportMutation.mutate()}
                      title="קובץ באותו מבנה של ייבוא התלמידות - אפשר להעלות אותו כמו שהוא לקבוצה אחרת"
                    >
                      <Download size={13} /> הורדה לאקסל
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setAddModal(true)}>
                    <UserPlus size={13} /> הוספת תלמידה
                  </Button>
                </div>
              </div>
            </CardHeader>
            {(group?.students.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 px-5 py-3 border-b border-rule/20">
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/70">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                    onChange={toggleAllVisible}
                    disabled={visibleStudents.length === 0}
                    className="size-4 accent-ink"
                  />
                  בחירת כולן
                </label>
                <Input
                  placeholder="חיפוש לפי שם או מייל..."
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  wrapperClassName="min-w-0 flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                >
                  מיון לפי שם {sortDir === 'asc' ? '↓' : '↑'}
                </Button>
              </div>
            )}
            <div className="divide-y divide-rule/20">
              {group?.students.length === 0 && (
                <p className="px-5 py-4 text-sm text-ink/50">אין תלמידות עדיין</p>
              )}
              {(group?.students.length ?? 0) > 0 && visibleStudents.length === 0 && (
                <p className="px-5 py-4 text-sm text-ink/50">לא נמצאו תלמידות התואמות לחיפוש</p>
              )}
              {visibleStudents.map((s) => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleSelected(s.id)}
                      className="size-4 accent-ink"
                      aria-label={`בחר את ${s.name}`}
                    />
                    <div>
                      <Link to={`/teacher/students/${s.id}`} className="text-sm font-medium text-ink hover:underline" title="לדף התלמידה - עריכה ומחיקת החשבון">{s.name}</Link>
                      <p className="flex items-center gap-1 text-xs text-ink/50">
                        {s.email}
                        {s.emailVerified
                          ? <span title="המייל אומת"><MailCheck size={12} className="text-sage" /></span>
                          : <span title="המייל עדיין לא אומת"><MailWarning size={12} className="text-coral" /></span>}
                        {s.emailNotifications === false && <span title="ביטלה עדכונים במייל"><BellOff size={12} /></span>}
                      </p>
                      <p className="text-xs text-ink/50">GitHub: {s.githubUsername || 'לא הוזן'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditTarget(s)} title="עריכת פרטים">
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setResetTarget(s)}
                      title="איפוס סיסמא"
                    >
                      <RotateCcw size={13} />
                    </Button>
                    <Button
                      size="sm" variant="destructive"
                      onClick={() => setRemoveOneTarget(s)}
                      title="הסרה מהקבוצה"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!removeOneTarget}
        onOpenChange={(open) => !open && setRemoveOneTarget(null)}
        title="הסרת תלמידה מהקבוצה"
        description={removeOneTarget ? `להסיר את ${removeOneTarget.name} מהקבוצה? חשבון התלמידה עצמו לא יימחק - כדי למחוק אותו, לחצי על שמה ובדף שלה על "מחיקת חשבון".` : ''}
        confirmLabel="הסר"
        loading={removeStudentMutation.isPending}
        onConfirm={() => removeStudentMutation.mutate(removeOneTarget!.id)}
      />

      <ConfirmDialog
        open={removeBulkOpen}
        onOpenChange={setRemoveBulkOpen}
        title="הסרת תלמידות מהקבוצה"
        description={`להסיר ${selected.size} תלמידות נבחרות מהקבוצה? חשבונות התלמידות עצמם לא יימחקו.`}
        confirmLabel="הסר את כולן"
        loading={removeStudentsMutation.isPending}
        onConfirm={() => removeStudentsMutation.mutate([...selected])}
      />

      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title="איפוס סיסמא"
        description={resetTarget ? `לאפס את הסיסמא של ${resetTarget.name} ל-12345678?` : ''}
        confirmLabel="איפוס"
        destructive={false}
        loading={resetPasswordMutation.isPending}
        onConfirm={() => resetPasswordMutation.mutate(resetTarget!.id)}
      />

      <StudentEditDialog
        student={editTarget}
        onClose={() => setEditTarget(null)}
        save={(studentId, data) => groupsApi.updateStudent(id!, studentId, data)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['group', id] });
          qc.invalidateQueries({ queryKey: ['students'] });
        }}
      />

      {/* Add student modal */}
      <Dialog open={addModal} onOpenChange={setAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספת תלמידה</DialogTitle>
          </DialogHeader>
          <DialogBody>
        <div className="flex gap-2 mb-4">
          {(['manual', 'excel'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-input border px-3 py-1.5 text-sm font-bold transition-colors ${tab === t ? 'border-rule bg-ink text-sheet' : 'border-rule/30 text-ink/70 hover:border-rule'}`}>
              {t === 'manual' ? 'הוספה ידנית' : 'ייבוא מ-Excel'}
            </button>
          ))}
        </div>

        {tab === 'manual' ? (
          <div className="space-y-3">
            <Input label="שם מלא" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ישראלה ישראלי" />
            <Input label="אימייל" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="student@example.com" />
            <Input label="שם משתמש GitHub (אופציונלי)" value={newGithub} onChange={(e) => setNewGithub(e.target.value)} placeholder="username" />
            {addError && <p className="text-coral text-sm">{addError}</p>}
            <Button loading={addStudentMutation.isPending} onClick={() => addStudentMutation.mutate()} disabled={!newName || !newEmail} className="w-full">
              הוסף תלמידה
            </Button>
          </div>
        ) : (
          <StudentsImportPanel groupId={id!} onDone={() => setAddModal(false)} />
        )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
