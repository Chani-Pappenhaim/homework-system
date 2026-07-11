import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical, EyeOff, Copy } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { groupsApi } from '@/api/groups.api';
import { lessonsApi } from '@/api/lessons.api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import FileUpload from '@/components/ui/FileUpload';

export default function CourseFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [error, setError] = useState('');
  const [copyModal, setCopyModal] = useState(false);
  const [copyGroupId, setCopyGroupId] = useState('');
  const [newLink, setNewLink] = useState({ label: '', url: '' });

  const { data: courseData } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.get(id!),
    enabled: isEdit,
  });

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const course = courseData?.data.data.course;
  const groups = groupsData?.data.data.groups ?? [];

  useEffect(() => {
    if (course) {
      setName(course.name);
      setYear(course.year ?? '');
      setDescription(course.description ?? '');
      setGroupId(course.groupId);
    }
  }, [course]);

  const saveMutation = useMutation({
    mutationFn: () => isEdit
      ? coursesApi.update(id!, { name, year, description, groupId })
      : coursesApi.create({ name, year, description, groupId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      const cid = isEdit ? id! : (res.data as any).data.course.id;
      navigate(`/teacher/courses/${cid}`);
    },
    onError: (e: any) => setError(e.response?.data?.error ?? 'שגיאה בשמירה'),
  });

  const addLinkMutation = useMutation({
    mutationFn: () => coursesApi.addLink(id!, newLink),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course', id] }); setNewLink({ label: '', url: '' }); },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (linkId: string) => coursesApi.deleteLink(id!, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', id] }),
  });

  const uploadFileMutation = useMutation({
    mutationFn: (file: File) => coursesApi.uploadFile(id!, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', id] }),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => coursesApi.deleteFile(id!, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', id] }),
  });

  const copyMutation = useMutation({
    mutationFn: () => coursesApi.copy(id!, copyGroupId),
    onSuccess: () => { setCopyModal(false); qc.invalidateQueries({ queryKey: ['courses'] }); },
  });

  const toggleHiddenMutation = useMutation({
    mutationFn: (lesson: { id: string; hidden: boolean }) =>
      lessonsApi.update(lesson.id, { hidden: !lesson.hidden }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', id] }),
  });

  return (
    <div className="max-w-3xl space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{isEdit ? 'עריכת קורס' : 'קורס חדש'}</h1>
        {isEdit && (
          <Button variant="ghost" size="sm" onClick={() => setCopyModal(true)}>
            <Copy size={13} /> העתק לקבוצה אחרת
          </Button>
        )}
      </div>

      {/* Basic info */}
      <Card>
        <CardBody className="space-y-4">
          <Input label="שם הקורס *" value={name} onChange={(e) => setName(e.target.value)} placeholder="React מתקדם" />
          <Input label='שנה"ל' value={year} onChange={(e) => setYear(e.target.value)} placeholder='תשפ"ו' />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">קבוצה *</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full px-3 py-2 border border-[#EEEBF5] rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">בחרי קבוצה...</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name} — {g.year}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">תיאור</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-[#EEEBF5] rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              placeholder="תיאור קצר של הקורס..."
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()} disabled={!name || !groupId}>
            {isEdit ? 'שמור שינויים' : 'צור קורס'}
          </Button>
        </CardBody>
      </Card>

      {/* Lessons table — edit only */}
      {isEdit && course && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm">שיעורים ({course.lessons.length})</h2>
          </CardHeader>
          <div className="divide-y divide-[#EEEBF5]">
            {course.lessons.map((l, i) => (
              <div key={l.id} className="px-5 py-3 flex items-center gap-3">
                <GripVertical size={14} className="text-[#9CA3AF] cursor-grab flex-shrink-0" />
                <span className="text-xs text-[#9CA3AF] w-5 flex-shrink-0">{i + 1}</span>
                <span
                  className="flex-1 text-sm cursor-pointer hover:text-primary transition"
                  onClick={() => navigate(`/teacher/lessons/${l.id}`)}
                >
                  {l.topic}
                </span>
                {l.hidden && <EyeOff size={13} className="text-[#9CA3AF]" />}
                <Button size="sm" variant="ghost" onClick={() => toggleHiddenMutation.mutate(l)}>
                  {l.hidden ? 'הצג' : 'הסתר'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Links — edit only */}
      {isEdit && course && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">קישורים שימושיים</h2></CardHeader>
          <CardBody className="space-y-3">
            {course.links.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 text-sm text-primary hover:underline truncate">{l.label}</a>
                <Button size="sm" variant="danger" onClick={() => deleteLinkMutation.mutate(l.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Input placeholder="תווית" value={newLink.label} onChange={(e) => setNewLink((p) => ({ ...p, label: e.target.value }))} className="flex-1" />
              <Input placeholder="https://..." value={newLink.url} onChange={(e) => setNewLink((p) => ({ ...p, url: e.target.value }))} className="flex-1" />
              <Button size="sm" onClick={() => addLinkMutation.mutate()} disabled={!newLink.label || !newLink.url}>
                <Plus size={13} />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Files — edit only */}
      {isEdit && course && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">קבצים</h2></CardHeader>
          <CardBody className="space-y-3">
            {course.files.map((f) => (
              <div key={f.id} className="flex items-center gap-2">
                <a href={f.url} target="_blank" rel="noreferrer" className="flex-1 text-sm text-[#1A1830] hover:text-primary truncate">{f.name}</a>
                <Button size="sm" variant="danger" onClick={() => deleteFileMutation.mutate(f.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
            <FileUpload onFile={(file) => uploadFileMutation.mutate(file)} label="העלה קובץ לקורס" />
          </CardBody>
        </Card>
      )}

      {/* Copy modal */}
      <Modal open={copyModal} onClose={() => setCopyModal(false)} title="העתקת קורס לקבוצה אחרת">
        <div className="space-y-3">
          <select
            value={copyGroupId}
            onChange={(e) => setCopyGroupId(e.target.value)}
            className="w-full px-3 py-2 border border-[#EEEBF5] rounded-input text-sm"
          >
            <option value="">בחרי קבוצה יעד...</option>
            {groups.filter((g) => g.id !== groupId).map((g) => (
              <option key={g.id} value={g.id}>{g.name} — {g.year}</option>
            ))}
          </select>
          <Button loading={copyMutation.isPending} onClick={() => copyMutation.mutate()} disabled={!copyGroupId} className="w-full">
            העתק קורס
          </Button>
        </div>
      </Modal>
    </div>
  );
}
