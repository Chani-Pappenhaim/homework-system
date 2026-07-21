import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Github, Paperclip, Edit, ExternalLink, Trash2, UserPlus, Plus, Bot, RotateCcw, CheckCircle } from 'lucide-react';
import { lessonsApi } from '@/api/lessons.api';
import { assignmentsApi } from '@/api/assignments.api';
import { submissionsApi } from '@/api/submissions.api';
import { gradesApi } from '@/api/grades.api';
import { groupsApi } from '@/api/groups.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileUpload } from '@/components/ui/file-upload';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDateTime, toExternalUrl } from '@/lib/utils';
import type { AssignmentDTO, ChecklistResult, SubmissionDTO } from '@/types';

export default function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [selectedAssignment, setSelectedAssignment] = useState(0);
  const [gradeModal, setGradeModal] = useState<SubmissionDTO | null>(null);
  const [submissionScore, setSubmissionScore] = useState('');
  const [contentScore, setContentScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [checklist, setChecklist] = useState<ChecklistResult[]>([]);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessError, setAccessError] = useState('');
  const [assignmentModal, setAssignmentModal] = useState<AssignmentDTO | null | 'new'>(null);
  const [lessonEditOpen, setLessonEditOpen] = useState(false);
  const [lTopic, setLTopic] = useState('');
  const [lDate, setLDate] = useState('');
  const [lContentMd, setLContentMd] = useState('');
  const [lGithubUrl, setLGithubUrl] = useState('');
  const [lHidden, setLHidden] = useState(false);
  const [aTitle, setATitle] = useState('');
  const [aDescription, setADescription] = useState('');
  const [aDeadline, setADeadline] = useState('');
  const [aAiInstructions, setAAiInstructions] = useState('');

  const { data: lessonData, isLoading } = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => lessonsApi.get(id!),
  });

  const lesson = lessonData?.data.data.lesson;
  const assignment = lesson?.assignments[selectedAssignment];

  const { data: accessData } = useQuery({
    queryKey: ['lesson-access', id],
    queryFn: () => lessonsApi.getAccess(id!),
    enabled: Boolean(id),
  });

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const accessStudents: any[] = (accessData?.data as any)?.data?.students ?? [];
  const allGroups: any[] = (groupsData?.data as any)?.data?.groups ?? [];

  const grantAccessMutation = useMutation({
    mutationFn: async (email: string) => {
      // Find student across groups
      for (const g of allGroups) {
        const res = await groupsApi.get(g.id);
        const found = res.data.data.group.students.find((s: any) => s.email === email);
        if (found) return lessonsApi.grantAccess(id!, found.id);
      }
      throw new Error('תלמידה לא נמצאה');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson-access', id] }); setAccessEmail(''); setAccessError(''); },
    onError: (e: any) => setAccessError(e.response?.data?.error ?? e.message ?? 'שגיאה'),
  });

  const revokeAccessMutation = useMutation({
    mutationFn: (studentId: string) => lessonsApi.revokeAccess(id!, studentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lesson-access', id] }),
  });

  const { data: submissionsData } = useQuery({
    queryKey: ['submissions', assignment?.id],
    queryFn: () => assignmentsApi.getSubmissions(assignment!.id),
    enabled: Boolean(assignment?.id),
  });

  function openLessonEdit() {
    if (!lesson) return;
    setLTopic(lesson.topic);
    setLDate(lesson.lessonDate ? lesson.lessonDate.slice(0, 10) : '');
    setLContentMd(lesson.contentMd ?? '');
    setLGithubUrl(lesson.githubUrl ?? '');
    setLHidden(lesson.hidden);
    setLessonEditOpen(true);
  }

  const saveLessonMutation = useMutation({
    mutationFn: () => lessonsApi.update(id!, {
      topic: lTopic,
      lessonDate: lDate || undefined,
      contentMd: lContentMd,
      githubUrl: lGithubUrl,
      hidden: lHidden,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson', id] });
      setLessonEditOpen(false);
      toast.success('השיעור נשמר בהצלחה');
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: (vars: { file: File; name?: string }) => lessonsApi.uploadFile(id!, vars.file, vars.name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson', id] }); toast.success('הקובץ הועלה'); },
  });

  const deleteLessonMutation = useMutation({
    mutationFn: () => lessonsApi.delete(id!),
    onSuccess: () => {
      const courseId = lesson?.courseId;
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast.success('השיעור נמחק');
      navigate(courseId ? `/teacher/courses/${courseId}` : '/teacher/courses');
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => lessonsApi.deleteFile(id!, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lesson', id] }),
  });

  function openAssignmentModal(a: AssignmentDTO | 'new') {
    setAssignmentModal(a);
    if (a === 'new') {
      setATitle(''); setADescription(''); setADeadline(''); setAAiInstructions('');
    } else {
      setATitle(a.title); setADescription(a.description ?? '');
      setADeadline(a.deadline ? a.deadline.slice(0, 16) : '');
      setAAiInstructions(a.aiInstructions ?? '');
    }
  }

  const saveAssignmentMutation = useMutation({
    mutationFn: () => {
      const data = {
        title: aTitle,
        description: aDescription || undefined,
        deadline: aDeadline || undefined,
        aiInstructions: aAiInstructions || undefined,
      };
      if (assignmentModal === 'new') return assignmentsApi.create(lesson!.id, data);
      return assignmentsApi.update((assignmentModal as AssignmentDTO).id, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson', id] });
      const wasNew = assignmentModal === 'new';
      setAssignmentModal(null);
      toast.success(wasNew ? 'המטלה נוצרה בהצלחה' : 'המטלה נשמרה בהצלחה');
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (aId: string) => assignmentsApi.delete(aId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson', id] }); toast.success('המטלה נמחקה'); },
  });

  const gradeMutation = useMutation({
    mutationFn: () => gradesApi.grade(gradeModal!.id, {
      submissionScore: submissionScore ? Number(submissionScore) : undefined,
      contentScore: contentScore ? Number(contentScore) : undefined,
      feedback: feedback || undefined,
      checklist,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions', assignment?.id] });
      setGradeModal(null);
      toast.success('הציון נשמר בהצלחה');
    },
  });

  const restoreAiScoreMutation = useMutation({
    mutationFn: () => submissionsApi.restoreAiScore(gradeModal!.id),
    onSuccess: () => {
      setContentScore(gradeModal?.aiScore?.toString() ?? '');
      qc.invalidateQueries({ queryKey: ['submissions', assignment?.id] });
    },
  });

  const approveAiMutation = useMutation({
    mutationFn: () => submissionsApi.approveAi(gradeModal!.id),
    onSuccess: () => {
      setGradeModal((prev) => prev ? { ...prev, aiApproved: true } : prev);
      qc.invalidateQueries({ queryKey: ['submissions', assignment?.id] });
    },
  });

  function openGradeModal(sub: SubmissionDTO) {
    setGradeModal(sub);
    const nextChecklist = assignment?.requirements?.map((r) => ({
      id: r.id, text: r.text,
      checked: sub.grade?.checklist?.find((c) => c.id === r.id)?.checked ?? false,
    })) ?? [];
    setChecklist(nextChecklist);
    if (sub.grade?.submissionScore != null) {
      // Existing grade — never overwrite the teacher's submission score
      setSubmissionScore(sub.grade.submissionScore.toString());
    } else {
      // Suggested prefill: 100, minus 10 for late, minus 5 per unchecked requirement
      const unchecked = nextChecklist.filter((c) => !c.checked).length;
      const suggested = Math.max(0, 100 - (sub.isLate ? 10 : 0) - unchecked * 5);
      setSubmissionScore(String(suggested));
    }
    // Content score is prefilled only from an existing grade; the "restore AI"
    // button is what fills it from the AI score.
    setContentScore(sub.grade?.contentScore != null ? sub.grade.contentScore.toString() : '');
    setFeedback(sub.grade?.feedback ?? '');
  }

  if (isLoading) return <div className="p-6 text-[#9CA3AF]">טוען...</div>;
  if (!lesson) return <div className="p-6 text-red-500">שיעור לא נמצא</div>;

  const submissions: SubmissionDTO[] = (submissionsData?.data as any)?.data?.submissions ?? [];

  return (
    <div className="max-w-4xl space-y-5" dir="rtl">
      {/* Lesson content */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold">{lesson.topic}</h1>
              {lesson.lessonDate && <p className="text-sm text-[#6B7280] mt-0.5">{formatDate(lesson.lessonDate)}</p>}
            </div>
            <div className="flex items-center gap-2">
              {lesson.hidden && <Badge variant="warning">מוסתר</Badge>}
              <Button size="sm" variant="outline" onClick={openLessonEdit}>
                <Edit size={12} /> ערוך שיעור
              </Button>
              <Button
                size="sm"
                variant="destructive"
                loading={deleteLessonMutation.isPending}
                onClick={() => {
                  if (confirm(`למחוק את השיעור "${lesson.topic}"? כל המטלות, ההגשות והקבצים של השיעור יימחקו לצמיתות.`)) {
                    deleteLessonMutation.mutate();
                  }
                }}
              >
                <Trash2 size={12} /> מחק שיעור
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {lesson.contentMd
            ? <MarkdownRenderer content={lesson.contentMd} />
            : <p className="text-sm text-[#9CA3AF]">אין תוכן לשיעור עדיין — לחצי על "ערוך שיעור" כדי להוסיף חומר לימוד.</p>}
          {lesson.githubUrl && (
            <a href={toExternalUrl(lesson.githubUrl)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#1A1830] border border-[#EEEBF5] rounded-input px-3 py-1.5 hover:bg-[#F8F7FC] transition">
              <Github size={14} /> קוד השיעור ב-GitHub
            </a>
          )}

          {/* Files management */}
          <div className="space-y-2 pt-2 border-t border-[#EEEBF5]">
            <p className="text-xs text-[#9CA3AF] font-medium">קבצים מצורפים</p>
            {lesson.files.map((f) => (
              <div key={f.id} className="flex items-center justify-between">
                <a href={f.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                  <Paperclip size={12} /> {f.name}
                </a>
                <Button size="sm" variant="destructive"
                  onClick={() => { if (confirm(`למחוק את הקובץ ${f.name}?`)) deleteFileMutation.mutate(f.id); }}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
            {lesson.files.length === 0 && (
              <p className="text-xs text-[#9CA3AF]">אין קבצים מצורפים</p>
            )}
            <FileUpload
              withName
              onFile={(file, name) => uploadFileMutation.mutate({ file, name })}
              label={uploadFileMutation.isPending ? 'מעלה...' : 'גרור קובץ להעלאה או לחצי לבחירה'}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Assignments + submissions */}
      <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {lesson.assignments.map((a, i) => (
                  <button key={a.id} onClick={() => setSelectedAssignment(i)}
                    className={`px-3 py-1.5 text-sm rounded-input transition ${i === selectedAssignment ? 'gradient-primary text-white' : 'border border-[#EEEBF5] text-[#6B7280] hover:bg-[#F8F7FC]'}`}>
                    {a.title}
                  </button>
                ))}
                {lesson.assignments.length === 0 && (
                  <span className="text-sm text-[#9CA3AF]">אין מטלות עדיין</span>
                )}
              </div>
              <Button size="sm" variant="secondary" onClick={() => openAssignmentModal('new')}>
                <Plus size={13} /> מטלה חדשה
              </Button>
            </div>
          </CardHeader>

          {assignment && (
            <div>
              {/* Assignment info */}
              <div className="px-5 py-3 bg-[#F8F7FC] border-b border-[#EEEBF5] text-sm text-[#6B7280]">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    {assignment.description && <p className="mb-1">{assignment.description}</p>}
                    {assignment.deadline && <p>מועד אחרון: <span className="font-medium text-[#1A1830]">{formatDate(assignment.deadline)}</span></p>}
                    {assignment.aiInstructions && (
                      <p className="text-xs text-[#9CA3AF] mt-1">
                        <span className="font-medium">הנחיות AI:</span> {assignment.aiInstructions}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openAssignmentModal(assignment)}>
                      <Edit size={12} />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => {
                      if (confirm('למחוק מטלה זו?')) deleteAssignmentMutation.mutate(assignment.id);
                    }}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Submissions table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#EEEBF5] text-xs text-[#9CA3AF]">
                      <th className="px-5 py-2.5 text-right font-medium">תלמידה</th>
                      <th className="px-3 py-2.5 text-right font-medium">הגשה</th>
                      <th className="px-3 py-2.5 text-right font-medium">תאריך</th>
                      <th className="px-3 py-2.5 text-right font-medium">ציון</th>
                      <th className="px-3 py-2.5 text-right font-medium">פעולה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEEBF5]">
                    {submissions.length === 0 && (
                      <tr><td colSpan={5} className="px-5 py-4 text-center text-[#9CA3AF]">אין הגשות עדיין</td></tr>
                    )}
                    {submissions.map((s) => (
                      <tr key={s.id} className="hover:bg-[#F8F7FC] transition">
                        <td className="px-5 py-3">
                          <p className="font-medium text-[#1A1830]">{s.studentName}</p>
                          <p className="text-xs text-[#9CA3AF]">{s.studentEmail}</p>
                        </td>
                        <td className="px-3 py-3">
                          {s.fileUrl ? (
                            <a href={s.fileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                              <Paperclip size={12} /> {s.fileName ?? 'קובץ'}
                            </a>
                          ) : s.githubUrl ? (
                            <a href={s.githubUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                              <Github size={12} /> GitHub
                            </a>
                          ) : <span className="text-[#9CA3AF]">לא הוגש</span>}
                        </td>
                        <td className="px-3 py-3 text-[#6B7280] text-xs">
                          {formatDateTime(s.submittedAt)}
                          {s.isLate && <Badge variant="warning" className="mr-1">איחור</Badge>}
                        </td>
                        <td className="px-3 py-3">
                          {s.grade?.submissionScore != null
                            ? <span className="font-semibold text-[#1A1830]">{s.grade.submissionScore}</span>
                            : <span className="text-[#9CA3AF]">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <Button size="sm" variant={s.grade ? 'outline' : 'default'} onClick={() => openGradeModal(s)}>
                            {s.grade ? <><Edit size={12} /> ערוך</> : 'בדוק עכשיו'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>

      {/* Lesson Access */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-sm">הרשאת גישה חריגה לשיעור זה</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-[#9CA3AF]">מתן גישה לתלמידה שאינה בקבוצה הרגילה של הקורס</p>
          <div className="flex gap-2">
            <Input
              placeholder="אימייל תלמידה"
              type="email"
              value={accessEmail}
              onChange={(e) => setAccessEmail(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              variant="secondary"
              loading={grantAccessMutation.isPending}
              onClick={() => grantAccessMutation.mutate(accessEmail)}
              disabled={!accessEmail}
            >
              <UserPlus size={13} /> הענק גישה
            </Button>
          </div>
          {accessError && <p className="text-red-500 text-xs">{accessError}</p>}
          {accessStudents.length > 0 && (
            <div className="divide-y divide-[#EEEBF5] border border-[#EEEBF5] rounded-card">
              {accessStudents.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-[#9CA3AF]">{s.email}</p>
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => revokeAccessMutation.mutate(s.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lesson edit modal */}
      <Dialog open={lessonEditOpen} onOpenChange={setLessonEditOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>עריכת שיעור</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Input label="נושא השיעור *" value={lTopic} onChange={(e) => setLTopic(e.target.value)} placeholder="React Hooks" />
            <Input label="תאריך (אופציונלי)" type="date" value={lDate} onChange={(e) => setLDate(e.target.value)} />
            <div className="flex flex-col gap-1">
              <Label htmlFor="lesson-content">חומר הלימוד (Markdown)</Label>
              <Textarea
                id="lesson-content"
                value={lContentMd}
                onChange={(e) => setLContentMd(e.target.value)}
                rows={8}
                className="resize-y font-mono"
                placeholder="# כותרת&#10;&#10;תוכן השיעור, הסברים, דוגמאות קוד..."
              />
              <p className="text-xs text-muted-foreground">אפשר לעצב עם Markdown: כותרות (#), רשימות, קוד (```), קישורים ועוד</p>
            </div>
            <Input label="קישור לקוד ב-GitHub (אופציונלי)" value={lGithubUrl} onChange={(e) => setLGithubUrl(e.target.value)} placeholder="https://github.com/..." />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={lHidden} onChange={(e) => setLHidden(e.target.checked)} className="accent-primary" />
              הסתר שיעור מהתלמידות
            </label>
            <p className="text-xs text-muted-foreground">קבצים מצורפים מנהלים ישירות בכרטיס השיעור (לא כאן).</p>
            <Button
              className="w-full"
              loading={saveLessonMutation.isPending}
              onClick={() => saveLessonMutation.mutate()}
              disabled={!lTopic.trim()}
            >
              שמרי שינויים
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Assignment create/edit modal */}
      <Dialog
        open={Boolean(assignmentModal)}
        onOpenChange={(open) => { if (!open) setAssignmentModal(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{assignmentModal === 'new' ? 'מטלה חדשה' : 'עריכת מטלה'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Input
              label="כותרת המטלה"
              value={aTitle}
              onChange={(e) => setATitle(e.target.value)}
              placeholder="למשל: פרויקט גיטהב"
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="assignment-description">תיאור (אופציונלי)</Label>
              <Textarea
                id="assignment-description"
                value={aDescription}
                onChange={(e) => setADescription(e.target.value)}
                rows={2}
                className="resize-none"
                placeholder="הוראות לתלמידה..."
              />
            </div>
            <Input
              label="מועד אחרון (אופציונלי)"
              type="datetime-local"
              value={aDeadline}
              onChange={(e) => setADeadline(e.target.value)}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="assignment-ai-instructions">הנחיות לבדיקת AI (אופציונלי)</Label>
              <Textarea
                id="assignment-ai-instructions"
                value={aAiInstructions}
                onChange={(e) => setAAiInstructions(e.target.value)}
                rows={3}
                className="resize-none"
                placeholder="למשל: בדקי שיש שימוש ב-async/await, שהקוד מחולק לפונקציות, ושיש טיפול בשגיאות..."
              />
              <p className="text-xs text-muted-foreground">הנחיות אלו יישלחו ל-AI בעת בדיקת עבודות התלמידות</p>
            </div>
            <Button
              className="w-full"
              loading={saveAssignmentMutation.isPending}
              onClick={() => saveAssignmentMutation.mutate()}
              disabled={!aTitle.trim()}
            >
              {assignmentModal === 'new' ? 'צרי מטלה' : 'שמרי שינויים'}
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Grade modal */}
      <Dialog
        open={Boolean(gradeModal)}
        onOpenChange={(open) => { if (!open) setGradeModal(null); }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{`ציון — ${gradeModal?.studentName}`}</DialogTitle>
          </DialogHeader>
          {gradeModal && (
            <DialogBody className="space-y-4">
            {/* Submission link */}
            {gradeModal.fileUrl && (
              <a href={gradeModal.fileUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-primary border border-[#EEEBF5] rounded-input px-3 py-2 hover:bg-[#F8F7FC]">
                <ExternalLink size={13} /> פתח קובץ שהוגש
              </a>
            )}
            {gradeModal.githubUrl && (
              <a href={gradeModal.githubUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-primary border border-[#EEEBF5] rounded-input px-3 py-2 hover:bg-[#F8F7FC]">
                <Github size={13} /> פתח GitHub
              </a>
            )}
            {gradeModal.notes && (
              <div className="bg-[#F8F7FC] border border-[#EEEBF5] rounded-input px-3 py-2 text-sm">
                <span className="font-medium text-xs text-[#9CA3AF]">הערת תלמידה: </span>
                {gradeModal.notes}
              </div>
            )}

            {/* AI review info for the teacher */}
            {gradeModal.aiStatus === 'done' && (
              <div className="bg-[#EDE9FE]/40 border border-[#EEEBF5] rounded-input px-3 py-2 text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 font-medium text-[#5B21B6]">
                    <Bot size={14} /> בדיקת AI — ציון: {gradeModal.aiScore ?? '—'}
                  </p>
                  <div className="flex items-center gap-2">
                    {gradeModal.aiApproved ? (
                      <Badge variant="success"><CheckCircle size={10} className="ml-1" /> אושר לתלמידה</Badge>
                    ) : (
                      <Button
                        size="sm" variant="secondary"
                        loading={approveAiMutation.isPending}
                        onClick={() => approveAiMutation.mutate()}
                      >
                        <CheckCircle size={12} /> אשרי ציון AI לתלמידה
                      </Button>
                    )}
                    <Button
                      size="sm" variant="outline"
                      loading={restoreAiScoreMutation.isPending}
                      onClick={() => restoreAiScoreMutation.mutate()}
                      disabled={gradeModal.aiScore == null}
                    >
                      <RotateCcw size={12} /> החזירי לציון AI
                    </Button>
                  </div>
                </div>
                {gradeModal.aiVerbalReview && (
                  <p className="text-xs text-[#6B7280] whitespace-pre-wrap">{gradeModal.aiVerbalReview}</p>
                )}
              </div>
            )}

            {/* Checklist */}
            {checklist.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">רשימת בדיקה</p>
                {checklist.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => setChecklist((prev) =>
                        prev.map((c) => c.id === item.id ? { ...c, checked: e.target.checked } : c)
                      )}
                      className="accent-primary"
                    />
                    {item.text}
                  </label>
                ))}
              </div>
            )}

            <div>
              <Input label="ציון הגשה (0–100)" type="number" min={0} max={100} value={submissionScore} onChange={(e) => setSubmissionScore(e.target.value)} placeholder="85" />
              {gradeModal.grade?.submissionScore == null && (
                <p className="text-xs text-[#9CA3AF] mt-1">הצעה אוטומטית: 100 − איחור (10) − דרישות חסרות (5 כ״א)</p>
              )}
            </div>

            <div>
              <Input label="ציון תוכן (0–100)" type="number" min={0} max={100} value={contentScore} onChange={(e) => setContentScore(e.target.value)} placeholder="90" />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="grade-feedback">משוב (Markdown)</Label>
              <Textarea
                id="grade-feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                className="resize-none"
                placeholder="כתבי משוב מפורט..."
              />
            </div>

            <Button loading={gradeMutation.isPending} onClick={() => gradeMutation.mutate()} className="w-full">
              שמור ציון
            </Button>
            </DialogBody>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
