import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, UserPlus, Upload } from 'lucide-react';
import { groupsApi } from '@/api/groups.api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import FileUpload from '@/components/ui/FileUpload';

export default function GroupFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [seminar, setSeminar] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [tab, setTab] = useState<'manual' | 'excel'>('manual');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState('');

  const { data } = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.get(id!),
    enabled: isEdit,
  });

  const group = data?.data.data.group;

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
      const gid = isEdit ? id! : (res.data as any).data.group.id;
      navigate(`/teacher/groups/${gid}/edit`);
    },
    onError: (e: any) => setError(e.response?.data?.error ?? 'שגיאה בשמירה'),
  });

  const addStudentMutation = useMutation({
    mutationFn: () => groupsApi.addStudent(id!, { name: newName, email: newEmail }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', id] });
      setNewName(''); setNewEmail(''); setAddError(''); setAddModal(false);
    },
    onError: (e: any) => setAddError(e.response?.data?.error ?? 'שגיאה בהוספה'),
  });

  const removeStudentMutation = useMutation({
    mutationFn: (studentId: string) => groupsApi.removeStudent(id!, studentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', id] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (studentId: string) => groupsApi.resetPassword(id!, studentId),
  });

  async function handleImport(file: File) {
    await groupsApi.importStudents(id!, file);
    qc.invalidateQueries({ queryKey: ['group', id] });
    setAddModal(false);
  }

  return (
    <div className="max-w-2xl space-y-5" dir="rtl">
      <h1 className="text-xl font-bold">{isEdit ? 'עריכת קבוצה' : 'קבוצה חדשה'}</h1>

      {/* Form */}
      <Card>
        <CardBody className="space-y-4">
          <Input label="שם סמינר (אופציונלי)" value={seminar} onChange={(e) => setSeminar(e.target.value)} placeholder='בית יעקב' />
          <Input label="שם קבוצה *" value={name} onChange={(e) => setName(e.target.value)} placeholder='קבוצה א' required />
          <Input label='שנה"ל *' value={year} onChange={(e) => setYear(e.target.value)} placeholder='תשפ"ו' required />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()} disabled={!name || !year}>
            {isEdit ? 'שמור שינויים' : 'צור קבוצה'}
          </Button>
        </CardBody>
      </Card>

      {/* Students table — only in edit mode */}
      {isEdit && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">תלמידות ({group?.students.length ?? 0})</h2>
              <Button size="sm" variant="violet" onClick={() => setAddModal(true)}>
                <UserPlus size={13} /> הוספת תלמידה
              </Button>
            </div>
          </CardHeader>
          <div className="divide-y divide-[#EEEBF5]">
            {group?.students.length === 0 && (
              <p className="px-5 py-4 text-sm text-[#9CA3AF]">אין תלמידות עדיין</p>
            )}
            {group?.students.map((s) => (
              <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-[#9CA3AF]">{s.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => { if (confirm(`לאפס סיסמא ל-${s.name}?`)) resetPasswordMutation.mutate(s.id); }}
                    title="איפוס סיסמא"
                  >
                    <RotateCcw size={13} />
                  </Button>
                  <Button
                    size="sm" variant="danger"
                    onClick={() => { if (confirm(`להסיר את ${s.name} מהקבוצה?`)) removeStudentMutation.mutate(s.id); }}
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

      {/* Add student modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="הוספת תלמידה">
        <div className="flex gap-2 mb-4">
          {(['manual', 'excel'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm rounded-input transition ${tab === t ? 'gradient-primary text-white' : 'border border-[#EEEBF5] text-[#6B7280]'}`}>
              {t === 'manual' ? 'הוספה ידנית' : 'ייבוא מ-Excel'}
            </button>
          ))}
        </div>

        {tab === 'manual' ? (
          <div className="space-y-3">
            <Input label="שם מלא" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ישראלה ישראלי" />
            <Input label="אימייל" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="student@example.com" />
            {addError && <p className="text-red-500 text-sm">{addError}</p>}
            <Button loading={addStudentMutation.isPending} onClick={() => addStudentMutation.mutate()} disabled={!newName || !newEmail} className="w-full">
              הוסף תלמידה
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[#6B7280]">קובץ Excel עם עמודות: name | email</p>
            <FileUpload accept=".xlsx" onFile={handleImport} label="גרור קובץ Excel לכאן" />
          </div>
        )}
      </Modal>
    </div>
  );
}
