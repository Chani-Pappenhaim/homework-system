import { Bot, ChevronRight, ClipboardCheck, Edit, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { SubmissionsWorkstation } from '@/components/lesson/SubmissionsWorkstation';
import { cn, formatDate } from '@/lib/utils';
import type { AssignmentDTO } from '@/types';

export const ASSIGNMENT_SECTIONS = ['submissions', 'details', 'ai'] as const;
export type AssignmentSection = typeof ASSIGNMENT_SECTIONS[number];

const SECTION_LABELS: Record<AssignmentSection, { label: string; icon: typeof FileText }> = {
  submissions: { label: 'הגשות', icon: ClipboardCheck },
  details: { label: 'פרטי המטלה', icon: FileText },
  ai: { label: 'הנחיות AI', icon: Bot },
};

/**
 * One assignment on the teacher's lesson page. Grading is what she comes for,
 * so the submissions open first; the brief and the AI instructions sit in
 * their own tabs instead of stacking above the students.
 */
export function AssignmentView({
  assignment, section, onSectionChange, selectedSubmissionId, onSelectSubmission, onBack, onEdit, onDelete,
}: {
  assignment: AssignmentDTO;
  section: AssignmentSection;
  onSectionChange: (section: AssignmentSection) => void;
  selectedSubmissionId: string | undefined;
  onSelectSubmission: (submissionId: string) => void;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <div className="space-y-3 border-b border-rule/20 px-5 pt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          <ChevronRight size={15} /> חזרה לרשימת המטלות
        </button>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">{assignment.title}</h2>
            {assignment.deadline && (
              <p className="text-xs text-ink/55">מועד אחרון: {formatDate(assignment.deadline)}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Edit size={12} /> עריכה
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>
              <Trash2 size={12} /> מחיקה
            </Button>
          </div>
        </div>

        <div role="tablist" aria-label="חלקי המטלה" className="-mb-px flex gap-1">
          {ASSIGNMENT_SECTIONS.map((key) => {
            const { label, icon: Icon } = SECTION_LABELS[key];
            const active = key === section;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => onSectionChange(key)}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
                  active ? 'border-clay text-ink' : 'border-transparent text-ink/55 hover:text-ink',
                )}
              >
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel">
        {section === 'submissions' && (
          <SubmissionsWorkstation
            assignment={assignment}
            selectedId={selectedSubmissionId}
            onSelect={onSelectSubmission}
          />
        )}
        {section === 'details' && <AssignmentDetails assignment={assignment} />}
        {section === 'ai' && <AiInstructions assignment={assignment} onEdit={onEdit} />}
      </div>
    </Card>
  );
}

function AssignmentDetails({ assignment }: { assignment: AssignmentDTO }) {
  const methods = [assignment.allowFile && 'העלאת קובץ', assignment.allowGithub && 'קישור GitHub'].filter(Boolean);
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 px-5 py-4 text-sm sm:grid-cols-[8rem_1fr]">
      <dt className="text-xs font-medium text-ink/50">תיאור</dt>
      <dd className="text-ink/85">
        {assignment.description
          ? <MarkdownRenderer content={assignment.description} />
          : <span className="text-ink/50">אין תיאור</span>}
      </dd>

      <dt className="text-xs font-medium text-ink/50">מועד אחרון</dt>
      <dd className="text-ink">{assignment.deadline ? formatDate(assignment.deadline) : 'ללא'}</dd>

      <dt className="text-xs font-medium text-ink/50">אופן ההגשה</dt>
      <dd className="text-ink">
        {methods.length > 0 ? methods.join(' או ') : '—'}
        {assignment.allowFile && assignment.allowedTypes.length > 0 && (
          <span className="text-xs text-ink/55"> ({assignment.allowedTypes.join(', ')})</span>
        )}
      </dd>

      {assignment.requirements && assignment.requirements.length > 0 && (
        <>
          <dt className="text-xs font-medium text-ink/50">דרישות</dt>
          <dd>
            <ul className="list-disc space-y-1 pr-4 text-ink/85">
              {assignment.requirements.map((r) => <li key={r.id}>{r.text}</li>)}
            </ul>
          </dd>
        </>
      )}
    </dl>
  );
}

function AiInstructions({ assignment, onEdit }: { assignment: AssignmentDTO; onEdit: () => void }) {
  if (assignment.aiInstructions?.trim()) {
    return (
      <div className="px-5 py-4 text-sm text-ink/85">
        <MarkdownRenderer content={assignment.aiInstructions} />
      </div>
    );
  }
  return (
    <div className="space-y-2 px-5 py-4 text-sm">
      <p className="text-ink/60">לא הוגדרו הנחיות מיוחדות. ה-AI בודק את ההגשה לפי כותרת המטלה ותיאורה.</p>
      <Button size="sm" variant="outline" onClick={onEdit}>
        <Edit size={12} /> הוספת הנחיות
      </Button>
    </div>
  );
}
