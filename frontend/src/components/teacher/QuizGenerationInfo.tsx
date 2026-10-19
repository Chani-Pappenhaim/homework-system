import { useEffect, useState } from 'react';
import { Check, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  QuizFailureKind, QuizGenerationProgressDTO, QuizGenerationStage, QuizSkipReason, QuizSourceFilesDTO,
} from '@/types';

/**
 * The pieces of the quiz panel that explain an AI generation: where a running
 * one stands, which lesson files it will leave out, and what a finished quiz
 * was built from.
 */

type Step = Exclude<QuizGenerationStage, 'retrying'>;

const STEP_LABELS: Record<Step, string> = {
  queued: 'בתור',
  'reading-files': 'קריאת הקבצים',
  generating: 'כתיבת השאלות',
  saving: 'שמירה',
};

const HEADLINES: Record<QuizGenerationStage, string> = {
  queued: 'הבקשה ממתינה לתורה…',
  'reading-files': 'קורא את הקבצים המצורפים לשיעור…',
  generating: 'ה-AI כותב שאלות על תוכן השיעור…',
  saving: 'שומר את השאלות…',
  retrying: 'הניסיון הקודם לא הצליח - מנסה שוב בעוד רגע…',
};

/** Why the previous attempt failed, phrased to follow "בניסיון הקודם". */
const PREVIOUS_FAILURE: Partial<Record<QuizFailureKind, string>> = {
  timeout: 'ה-AI לא ענה בזמן',
  'rate-limit': 'היה עומס על שירות ה-AI',
  unavailable: 'שירות ה-AI לא היה זמין',
  'bad-output': 'ה-AI החזיר תשובה לא תקינה',
};

const SKIP_REASONS: Record<QuizSkipReason, string> = {
  unsupported: 'סוג קובץ שלא נקרא',
  'too-large': 'גדול מדי',
  unreadable: 'לא נפתח',
  empty: 'ריק',
  timeout: 'ההורדה ארכה מדי',
  'too-many': 'מעבר ל-10 קבצים',
};

/** A short list for one line; the full one goes in the tooltip. */
function shortList(items: string[], max = 3): string {
  return items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} ועוד ${items.length - max}`;
}

const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** The server's elapsed time, kept ticking between polls so the clock does not jump in 5-second steps. */
function useTickingSeconds(serverSeconds: number): number {
  const [base, setBase] = useState({ seconds: serverSeconds, at: Date.now() });
  const [, tick] = useState(0);
  useEffect(() => setBase({ seconds: serverSeconds, at: Date.now() }), [serverSeconds]);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return base.seconds + Math.floor((Date.now() - base.at) / 1000);
}

export function GenerationProgress({ progress, replacing = false }: {
  progress: QuizGenerationProgressDTO;
  /** Regenerating an existing draft rather than creating the first one. */
  replacing?: boolean;
}) {
  const elapsed = useTickingSeconds(progress.elapsedSeconds);
  const steps: Step[] = ['queued', ...(progress.withFiles ? ['reading-files' as const] : []), 'generating', 'saving'];
  // Between attempts the job waits in the queue for its retry.
  const current = steps.indexOf(progress.stage === 'retrying' ? 'queued' : progress.stage);
  const previousFailure = progress.lastFailure && PREVIOUS_FAILURE[progress.lastFailure];
  const headline = replacing && progress.stage === 'generating'
    ? 'ה-AI כותב שאלות חדשות על תוכן השיעור…'
    : HEADLINES[progress.stage];

  return (
    <div className="space-y-2.5" role="status" aria-live="polite">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" aria-label="שלבי היצירה">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step} className="flex items-center gap-1.5" aria-current={active ? 'step' : undefined}>
              {i > 0 && <span className={cn('h-px w-4', done || active ? 'bg-clay/60' : 'bg-rule')} aria-hidden />}
              {done ? (
                <Check size={12} className="text-sage" aria-hidden />
              ) : active ? (
                <span className="size-3 animate-spin rounded-full border-2 border-rule border-t-clay" aria-hidden />
              ) : (
                <span className="size-1.5 rounded-full bg-rule" aria-hidden />
              )}
              <span className={cn(active ? 'font-semibold text-ink' : done ? 'text-ink/60' : 'text-ink/40')}>
                {STEP_LABELS[step]}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-sm text-ink/70">{headline}</p>

      {progress.attempt > 1 && (
        <p className="text-xs text-clay">
          ניסיון {progress.attempt} מתוך {progress.maxAttempts}
          {previousFailure && ` - בניסיון הקודם ${previousFailure}`}
        </p>
      )}

      <p className="text-xs text-ink/45">
        עברו {formatElapsed(elapsed)} · לרוב זה לוקח 1-3 דקות. אפשר לצאת מהעמוד - היצירה ממשיכה ברקע.
      </p>
    </div>
  );
}

/** The "include files" checkbox, with the files that would be left out right under it. */
export function IncludeFilesOption({ checked, onChange, excludedFiles }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  excludedFiles: string[];
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm text-ink/70">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-clay"
        />
        כללי גם את הקבצים המצורפים לשיעור (עשוי להעלות את עלות היצירה)
      </label>
      {checked && excludedFiles.length > 0 && (
        <p className="pr-6 text-xs text-ink/50" title={excludedFiles.join('\n')}>
          לא ייכללו: {shortList(excludedFiles)}
        </p>
      )}
    </div>
  );
}

/** What a generated quiz was built from. Nothing when it was the lesson text alone. */
export function SourceFilesLine({ sourceFiles }: { sourceFiles?: QuizSourceFilesDTO | null }) {
  if (!sourceFiles) return null;
  const { included, skipped } = sourceFiles;
  const skippedLabels = skipped.map((s) => `${s.name} (${SKIP_REASONS[s.reason] ?? 'לא נקרא'})`);

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink/50">
      <FileText size={12} className="shrink-0" aria-hidden />
      <span title={included.join('\n') || undefined}>
        נוצר מתוך תוכן השיעור
        {included.length === 1 ? ' וקובץ אחד' : included.length > 1 ? ` ו-${included.length} קבצים` : ''}
      </span>
      {skipped.length > 0 && (
        <span className="text-clay" title={skippedLabels.join('\n')}>
          · לא נכללו: {shortList(skippedLabels, 2)}
        </span>
      )}
    </p>
  );
}
