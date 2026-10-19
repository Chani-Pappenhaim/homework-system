import { useId, useState, type ReactNode } from 'react';
import { Bot, ChevronDown, ChevronRight, ClipboardCheck, Edit, FileSpreadsheet, FileText, Link2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { SubmissionsWorkstation } from '@/components/lesson/SubmissionsWorkstation';
import { AssignmentSubmissionsImportDialog } from '@/components/lesson/AssignmentSubmissionsImportDialog';
import { cn, formatDateFull } from '@/lib/utils';
import type { AssignmentDTO } from '@/types';

export const ASSIGNMENT_SECTIONS = ['details', 'ai', 'submissions'] as const;
export type AssignmentSection = typeof ASSIGNMENT_SECTIONS[number];
/** The tab an assignment opens on when the address names none. */
export const DEFAULT_ASSIGNMENT_SECTION: AssignmentSection = 'details';

const SECTION_LABELS: Record<AssignmentSection, { label: string; icon: typeof FileText }> = {
  submissions: { label: 'הגשות', icon: ClipboardCheck },
  details: { label: 'פרטי המטלה', icon: FileText },
  ai: { label: 'הנחיות AI', icon: Bot },
};

/**
 * One assignment on the teacher's lesson page. It opens on the brief, with the
 * submissions as the last tab; the brief, the AI instructions and the grading
 * each sit in their own tab instead of stacking above the students.
 */
export function AssignmentView({
  assignment, section, onSectionChange, selectedSubmissionId, onSelectSubmission, onDirtyChange, onBack, onEdit, onDelete,
}: {
  assignment: AssignmentDTO;
  section: AssignmentSection;
  onSectionChange: (section: AssignmentSection) => void;
  selectedSubmissionId: string | undefined;
  onSelectSubmission: (submissionId: string) => void;
  /** Unsaved grade edits — the page asks before leaving the assignment with them. */
  onDirtyChange?: (dirty: boolean) => void;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
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
              <p className="text-xs text-ink/55">מועד אחרון: {formatDateFull(assignment.deadline)}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <CopyStudentLink assignmentId={assignment.id} />
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} title="הגשות שהתלמידות שלחו בדרך אחרת, למשל לשיעור שנוסף לאתר מאוחר">
              <FileSpreadsheet size={12} /> ייבוא הגשות מקובץ
            </Button>
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

      {/* Hidden rather than unmounted, so a grade she is typing survives a look at the brief. */}
      <div role="tabpanel" hidden={section !== 'submissions'}>
        <SubmissionsWorkstation
          assignment={assignment}
          selectedId={selectedSubmissionId}
          onSelect={onSelectSubmission}
          onDirtyChange={onDirtyChange}
        />
      </div>
      {section === 'details' && <div role="tabpanel"><AssignmentDetails assignment={assignment} /></div>}
      {section === 'ai' && <div role="tabpanel"><AiInstructions assignment={assignment} onEdit={onEdit} /></div>}
      <AssignmentSubmissionsImportDialog assignmentId={assignment.id} open={importOpen} onOpenChange={setImportOpen} />
    </Card>
  );
}

function AssignmentDetails({ assignment }: { assignment: AssignmentDTO }) {
  const methods = [assignment.allowFile && 'העלאת קובץ', assignment.allowGithub && 'קישור GitHub'].filter(Boolean);
  const methodsText = methods.length > 0 ? methods.join(' או ') : '-';
  const deadlineText = assignment.deadline ? formatDateFull(assignment.deadline) : 'ללא';
  const requirements = assignment.requirements ?? [];
  return (
    <div className="divide-y divide-rule/20 px-5 py-1">
      <DetailSection title="תיאור">
        {assignment.description
          ? <MarkdownRenderer content={assignment.description} />
          : <span className="text-ink/50">אין תיאור</span>}
      </DetailSection>

      <DetailSection title="מועד אחרון" summary={deadlineText}>
        <span className="text-ink">{deadlineText}</span>
      </DetailSection>

      <DetailSection title="אופן ההגשה" summary={methodsText}>
        <span className="text-ink">{methodsText}</span>
        {assignment.allowFile && assignment.allowedTypes.length > 0 && (
          <span className="text-xs text-ink/55"> ({assignment.allowedTypes.join(', ')})</span>
        )}
      </DetailSection>

      {requirements.length > 0 && (
        <DetailSection
          title="דרישות"
          summary={requirements.length === 1 ? 'דרישה אחת' : `${requirements.length} דרישות`}
        >
          <ul className="list-disc space-y-1 pr-4 text-ink/85">
            {requirements.map((r) => <li key={r.id}>{r.text}</li>)}
          </ul>
        </DetailSection>
      )}
    </div>
  );
}

/** A part of the assignment's details that the teacher can fold away; folded, it keeps a short summary. */
function DetailSection({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-2.5 text-right text-xs font-semibold text-ink/60 hover:text-ink"
      >
        <ChevronDown size={15} className={cn('shrink-0 transition-transform', !open && 'rotate-90')} />
        {title}
        {!open && summary && <span className="truncate font-normal text-ink/50">· {summary}</span>}
      </button>
      {open && <div id={bodyId} className="pb-3 pr-6 text-sm text-ink/85">{children}</div>}
    </section>
  );
}

function AiInstructions({ assignment, onEdit }: { assignment: AssignmentDTO; onEdit: () => void }) {
  if (assignment.aiReviewEnabled === false) {
    return (
      <div className="space-y-2 px-5 py-4 text-sm">
        <p className="font-semibold text-ink">בדיקת AI כבויה למטלה זו</p>
        <p className="text-ink/60">
          התלמידות לא יכולות לבקש בדיקת AI, והעבודות נבדקות רק על ידך.
          {assignment.aiInstructions?.trim() && ' ההנחיות שכתבת נשמרו, ויחזרו לפעול אם תפעילי את הבדיקה מחדש.'}
        </p>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Edit size={12} /> הפעלת בדיקת AI
        </Button>
      </div>
    );
  }
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

/** The address a student opens the assignment at - the teacher's own page address is not one she can open. */
export function studentAssignmentUrl(assignmentId: string): string {
  return `${window.location.origin}/student/assignments?assignment=${assignmentId}`;
}

/** Copies the link to send the students, so they land on this assignment's submission. */
function CopyStudentLink({ assignmentId }: { assignmentId: string }) {
  const toast = useToast();
  const url = studentAssignmentUrl(assignmentId);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('הקישור הועתק - אפשר להדביק ולשלוח לתלמידות');
    } catch {
      // Clipboard access can be refused (an old browser, a blocked permission): show the link to copy by hand.
      toast.show(`לא הצלחנו להעתיק. זה הקישור: ${url}`, 'error', 15000);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={copy} title="קישור שהתלמידות יכולות לפתוח כדי להגיש את המטלה">
      <Link2 size={12} /> העתקת קישור לתלמידות
    </Button>
  );
}
