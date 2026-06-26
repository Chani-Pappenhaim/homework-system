import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Github, Paperclip, CheckSquare, Edit, ExternalLink } from 'lucide-react';
import { lessonsApi } from '@/api/lessons.api';
import { assignmentsApi } from '@/api/assignments.api';
import { gradesApi } from '@/api/grades.api';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import Input from '@/components/ui/Input';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { ChecklistResult, SubmissionDTO } from '@/types';

export default function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [selectedAssignment, setSelectedAssignment] = useState(0);
  const [gradeModal, setGradeModal] = useState<SubmissionDTO | null>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [checklist, setChecklist] = useState<ChecklistResult[]>([]);

  const { data: lessonData, isLoading } = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => lessonsApi.get(id!),
  });

  const lesson = lessonData?.data.data.lesson;
  const assignment = lesson?.assignments[selectedAssignment];

  const { data: submissionsData } = useQuery({
    queryKey: ['submissions', assignment?.id],
    queryFn: () => assignmentsApi.getSubmissions(assignment!.id),
    enabled: Boolean(assignment?.id),
  });

  const gradeMutation = useMutation({
    mutationFn: () => gradesApi.grade(gradeModal!.id, {
      score: score ? Number(score) : undefined,
      feedback: feedback || undefined,
      checklist,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions', assignment?.id] });
      setGradeModal(null);
    },
  });

  function openGradeModal(sub: SubmissionDTO) {
    setGradeModal(sub);
    setScore(sub.grade?.score?.toString() ?? '');
    setFeedback(sub.grade?.feedback ?? '');
    setChecklist(
      assignment?.requirements?.map((r) => ({
        id: r.id, text: r.text,
        checked: sub.grade?.checklist?.find((c) => c.id === r.id)?.checked ?? false,
      })) ?? []
    );
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
            {lesson.hidden && <Badge variant="amber">מוסתר</Badge>}
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {lesson.contentMd && <MarkdownRenderer content={lesson.contentMd} />}
          {lesson.githubUrl && (
            <a href={lesson.githubUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#1A1830] border border-[#EEEBF5] rounded-input px-3 py-1.5 hover:bg-[#F8F7FC] transition">
              <Github size={14} /> קוד השיעור ב-GitHub
            </a>
          )}
          {lesson.files.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-[#9CA3AF] font-medium">קבצים מצורפים</p>
              {lesson.files.map((f) => (
                <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                  <Paperclip size={12} /> {f.name}
                </a>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Assignments + submissions */}
      {lesson.assignments.length > 0 && (
        <Card>
          <CardHeader>
            {/* Assignment tabs */}
            <div className="flex gap-2 flex-wrap">
              {lesson.assignments.map((a, i) => (
                <button key={a.id} onClick={() => setSelectedAssignment(i)}
                  className={`px-3 py-1.5 text-sm rounded-input transition ${i === selectedAssignment ? 'gradient-primary text-white' : 'border border-[#EEEBF5] text-[#6B7280] hover:bg-[#F8F7FC]'}`}>
                  {a.title}
                </button>
              ))}
            </div>
          </CardHeader>

          {assignment && (
            <div>
              {/* Assignment info */}
              <div className="px-5 py-3 bg-[#F8F7FC] border-b border-[#EEEBF5] text-sm text-[#6B7280]">
                {assignment.description && <p className="mb-1">{assignment.description}</p>}
                {assignment.deadline && <p>מועד אחרון: <span className="font-medium text-[#1A1830]">{formatDate(assignment.deadline)}</span></p>}
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
                          {s.isLate && <Badge variant="amber" className="mr-1">איחור</Badge>}
                        </td>
                        <td className="px-3 py-3">
                          {s.grade?.score != null
                            ? <span className="font-semibold text-[#1A1830]">{s.grade.score}</span>
                            : <span className="text-[#9CA3AF]">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <Button size="sm" variant={s.grade ? 'ghost' : 'primary'} onClick={() => openGradeModal(s)}>
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
      )}

      {/* Grade modal */}
      <Modal open={Boolean(gradeModal)} onClose={() => setGradeModal(null)} title={`ציון — ${gradeModal?.studentName}`} size="lg">
        {gradeModal && (
          <div className="space-y-4">
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

            <Input label="ציון (0–100)" type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} placeholder="85" />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">משוב (Markdown)</label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-[#EEEBF5] rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                placeholder="כתבי משוב מפורט..."
              />
            </div>

            <Button loading={gradeMutation.isPending} onClick={() => gradeMutation.mutate()} className="w-full">
              שמור ציון
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
