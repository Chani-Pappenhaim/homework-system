import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, UserPlus, Download, Pencil } from 'lucide-react';
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
import { FileUpload } from '@/components/ui/file-upload';
import { BackLink } from '@/components/ui/back-link';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadBlob } from '@/lib/utils';

export default function GroupFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [seminar, setSeminar] = useState('');
  const [year, setYear] = useState('');
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
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; email: string; githubUsername?: string } | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGithub, setEditGithub] = useState('');
  const [editError, setEditError] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data } = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.get(id!),
    enabled: isEdit,
  });

  const group = data?.data.data.group;

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
    }
  }, [group]);

  const saveMutation = useMutation({
    mutationFn: () => isEdit
      ? groupsApi.update(id!, { name, seminar: seminar || undefined, year })
      : groupsApi.create({ name, seminar: seminar || undefined, year }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      toast.success(isEdit ? 'הקבוצה נשמרה בהצלחה' : 'הקבוצה נוצרה בהצלחה');
      const gid = isEdit ? id! : (res.data as any).data.group.id;
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

  const resetPasswordMutation = useMutation({
    mutationFn: (studentId: string) => groupsApi.resetPassword(id!, studentId),
    onSuccess: () => { setResetTarget(null); toast.success('הסיסמא אופסה ל-12345678'); },
  });

  const editStudentMutation = useMutation({
    mutationFn: () => groupsApi.updateStudent(id!, editTarget!.id, {
      name: editName, email: editEmail, githubUsername: editGithub || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', id] });
      setEditTarget(null);
      toast.success('פרטי התלמידה עודכנו');
    },
    onError: (e: any) => setEditError(getApiErrorMessage(e, 'שגיאה בעדכון')),
  });

  function toggleSelected(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  }

  function openEdit(s: { id: string; name: string; email: string; githubUsername?: string }) {
    setEditTarget(s);
    setEditName(s.name);
    setEditEmail(s.email);
    setEditGithub(s.githubUsername ?? '');
    setEditError('');
  }

  const downloadTemplateMutation = useMutation({
    mutationFn: () => groupsApi.downloadImportTemplate(),
    onSuccess: (res) => downloadBlob(res.data as Blob, 'students-import-template.xlsx'),
  });

  async function handleImport(file: File) {
    await groupsApi.importStudents(id!, file);
    qc.invalidateQueries({ queryKey: ['group', id] });
    setAddModal(false);
    toast.success('התלמידות יובאו בהצלחה');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5" dir="rtl">
      <div className="border-b border-rule pb-3">
        <BackLink className="mb-2" />
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">{isEdit ? 'עריכת קבוצה' : 'קבוצה חדשה'}</h1>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="space-y-4">
          <Input label="שם סמינר (אופציונלי)" value={seminar} onChange={(e) => setSeminar(e.target.value)} placeholder='בית יעקב' />
          <Input label="שם קבוצה *" value={name} onChange={(e) => setName(e.target.value)} placeholder='קבוצה א' required />
          <Input label='שנה"ל *' value={year} onChange={(e) => setYear(e.target.value)} placeholder='תשפ"ו' required />
          {error && <p className="text-coral text-sm">{error}</p>}
          <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()} disabled={!name || !year}>
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
                <Button size="sm" variant="secondary" onClick={() => setAddModal(true)}>
                  <UserPlus size={13} /> הוספת תלמידה
                </Button>
              </div>
            </div>
          </CardHeader>
          {(group?.students.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 px-5 py-3 border-b border-rule/20">
              <Input
                placeholder="חיפוש לפי שם או מייל..."
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                className="flex-1"
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
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-ink/50">{s.email}</p>
                    {s.githubUsername && <p className="text-xs text-ink/50">GitHub: {s.githubUsername}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)} title="עריכת פרטים">
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

      <ConfirmDialog
        open={!!removeOneTarget}
        onOpenChange={(open) => !open && setRemoveOneTarget(null)}
        title="הסרת תלמידה מהקבוצה"
        description={removeOneTarget ? `להסיר את ${removeOneTarget.name} מהקבוצה? חשבון התלמידה עצמו לא יימחק.` : ''}
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

      {/* Edit student modal */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת פרטי תלמידה</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <Input label="שם מלא" value={editName} onChange={(e) => setEditName(e.target.value)} />
              <Input label="אימייל" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              <Input label="שם משתמש GitHub (אופציונלי)" value={editGithub} onChange={(e) => setEditGithub(e.target.value)} />
              {editError && <p className="text-coral text-sm">{editError}</p>}
              <Button
                loading={editStudentMutation.isPending}
                onClick={() => editStudentMutation.mutate()}
                disabled={!editName.trim() || !editEmail.trim()}
                className="w-full"
              >
                שמור שינויים
              </Button>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

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
          <div className="space-y-3">
            <p className="text-xs text-ink/70">קובץ Excel עם עמודות: name | email | github (אופציונלי)</p>
            <button
              type="button"
              onClick={() => downloadTemplateMutation.mutate()}
              className="flex items-center gap-1.5 text-xs font-semibold text-clay hover:underline"
            >
              <Download size={13} /> הורדת קובץ לדוגמא
            </button>
            <FileUpload accept=".xlsx" onFile={handleImport} label="גרור קובץ Excel לכאן" />
          </div>
        )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
