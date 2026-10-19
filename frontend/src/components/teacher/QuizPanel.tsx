import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Eye, EyeOff, Save, RotateCcw, AlertTriangle, RefreshCw, Plus, Trash2, X, PencilLine } from 'lucide-react';
import { quizzesApi } from '@/api/quizzes.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { AutoTextarea } from '@/components/ui/auto-textarea';
import { MarkdownField } from '@/components/ui/markdown-field';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { AI_AVAILABILITY_QUERY_KEY, useAiAvailability } from '@/hooks/useAiAvailability';
import type { QuizQuestionDTO, QuizStateDTO } from '@/types';
import { GenerationProgress, IncludeFilesOption, SourceFilesLine } from './QuizGenerationInfo';

/**
 * Teacher-facing quiz editor: generate questions with AI - or write them by
 * hand - review and correct them, then publish to the class. Students never
 * trigger generation and never see a draft.
 */

const MAX_OPTIONS = 6;

/** A blank question to fill in; its id only has to be unique among the quiz's questions. */
function blankQuestion(): QuizQuestionDTO {
  return { id: `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`, question: '', options: ['', '', '', ''], correctIndex: -1 };
}
export default function QuizPanel({
  lessonId, hasContent, hasFiles,
}: { lessonId: string; hasContent: boolean; hasFiles: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const ai = useAiAvailability();

  const [draft, setDraft] = useState<QuizQuestionDTO[] | null>(null);
  const [error, setError] = useState('');
  const [includeFiles, setIncludeFiles] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  // Writing a new quiz by hand: the editor shows before any quiz exists.
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['quiz', lessonId],
    queryFn: () => quizzesApi.get(lessonId),
    // Only poll while the AI is actually working — on a first quiz or a replacement.
    refetchInterval: (query) => {
      const s = (query.state.data?.data as any)?.data as QuizStateDTO | undefined;
      return s?.status === 'generating' || s?.regeneration?.status === 'generating' ? 5000 : false;
    },
  });

  const state = (data?.data as any)?.data as QuizStateDTO | undefined;
  const quiz = state?.quiz;
  const regeneration = state?.regeneration;
  const regenerating = regeneration?.status === 'generating';

  // Load the server's questions into the editor, without overwriting local edits in progress.
  useEffect(() => {
    if (quiz && draft === null) setDraft(quiz.questions);
  }, [quiz, draft]);

  // A finished regeneration replaced the questions under the editor: load the
  // new ones. Editing was locked meanwhile, so no local change is lost.
  const wasRegenerating = useRef(false);
  useEffect(() => {
    if (wasRegenerating.current && !regenerating) {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['quiz-results', lessonId] });
    }
    wasRegenerating.current = regenerating;
  }, [regenerating, qc, lessonId]);

  // The server reports a failed regeneration once and then forgets it; keep the
  // message on screen until her next action.
  useEffect(() => {
    if (regeneration?.status === 'failed') setError(regeneration.message);
  }, [regeneration]);

  const generateMutation = useMutation({
    mutationFn: (replace: boolean) => quizzesApi.generate(lessonId, includeFiles, replace),
    onSuccess: () => {
      setError('');
      setRegenerateOpen(false);
      qc.invalidateQueries({ queryKey: ['quiz', lessonId] });
    },
    onError: (e: any) => {
      setRegenerateOpen(false);
      if (e?.response?.status === 503) qc.invalidateQueries({ queryKey: AI_AVAILABILITY_QUERY_KEY });
      setError(getApiErrorMessage(e, 'לא הצלחנו להתחיל את יצירת הבוחן'));
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => quizzesApi.updateQuestions(lessonId, draft ?? []),
    onSuccess: () => {
      setError('');
      toast.success('השאלות נשמרו');
      qc.invalidateQueries({ queryKey: ['quiz', lessonId] });
      qc.invalidateQueries({ queryKey: ['quiz-results', lessonId] });
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שמירת השאלות נכשלה')),
  });

  const createMutation = useMutation({
    mutationFn: () => quizzesApi.createManual(lessonId, draft ?? []),
    onSuccess: () => {
      setError('');
      setCreating(false);
      setDraft(null); // reloaded from the saved quiz
      toast.success('הבוחן נשמר כטיוטה - אפשר לפרסם אותו לתלמידות');
      qc.invalidateQueries({ queryKey: ['quiz', lessonId] });
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שמירת הבוחן נכשלה')),
  });

  function startManual() {
    setError('');
    setDraft([blankQuestion()]);
    setCreating(true);
  }

  function cancelManual() {
    setError('');
    setDraft(null);
    setCreating(false);
  }

  const publishMutation = useMutation({
    mutationFn: (published: boolean) => quizzesApi.setPublished(lessonId, published),
    onSuccess: (_res, published) => {
      setError('');
      toast.success(published ? 'הבוחן פורסם לתלמידות' : 'הבוחן הוחזר לטיוטה');
      qc.invalidateQueries({ queryKey: ['quiz', lessonId] });
      qc.invalidateQueries({ queryKey: ['lesson', lessonId] });
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שינוי הפרסום נכשל')),
  });

  function editQuestion(i: number, patch: Partial<QuizQuestionDTO>) {
    setDraft((prev) => prev && prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  function editOption(qi: number, oi: number, value: string) {
    setDraft((prev) =>
      prev && prev.map((q, idx) =>
        idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q,
      ),
    );
  }

  function addQuestion() {
    setDraft((prev) => prev && [...prev, blankQuestion()]);
  }

  function removeQuestion(i: number) {
    setDraft((prev) => prev && prev.filter((_, idx) => idx !== i));
  }

  function addOption(qi: number) {
    setDraft((prev) => prev && prev.map((q, idx) => (idx === qi ? { ...q, options: [...q.options, ''] } : q)));
  }

  function removeOption(qi: number, oi: number) {
    setDraft((prev) => prev && prev.map((q, idx) => {
      if (idx !== qi) return q;
      const correct = q.correctIndex ?? -1;
      // The marked answer keeps pointing at the same text; removing it leaves none marked.
      const correctIndex = correct === oi ? -1 : correct > oi ? correct - 1 : correct;
      return { ...q, options: q.options.filter((_, j) => j !== oi), correctIndex };
    }));
  }

  const dirty = creating || Boolean(draft && quiz && JSON.stringify(draft) !== JSON.stringify(quiz.questions));

  const header = (
    <CardHeader className="flex flex-row items-center justify-between gap-2">
      <h2 className="font-display text-base font-bold flex items-center gap-1.5">
        <Sparkles size={15} className="text-indigo" /> חידון השיעור
      </h2>
      {quiz && (
        <Badge variant={quiz.published ? 'success' : 'secondary'}>
          {quiz.published ? 'פורסם לתלמידות' : 'טיוטה - התלמידות לא רואות'}
        </Badge>
      )}
    </CardHeader>
  );

  const errorLine = error && (
    <p className="flex items-start gap-1.5 text-xs text-coral">
      <AlertTriangle size={13} className="mt-px shrink-0" /> {error}
    </p>
  );

  // Why the generate buttons are disabled. A refused request already says it in errorLine.
  const aiNote = !ai.available && !error && (
    <p className="text-xs text-ink/60">{ai.message}</p>
  );

  if (isLoading) {
    return <Card accent="indigo">{header}<CardContent><p className="text-sm text-ink/50">טוען…</p></CardContent></Card>;
  }

  const manualButton = (
    <Button variant="outline" onClick={startManual}>
      <PencilLine size={14} /> בניית בוחן ידנית
    </Button>
  );

  // No content to generate from, or the server refused for another reason.
  if (!creating && state?.status === 'unavailable') {
    return (
      <Card accent="indigo">
        {header}
        <CardContent className="space-y-3">
          <p className="text-sm text-ink/60">{state.message}</p>
          <p className="text-sm text-ink/60">אפשר גם לכתוב את השאלות בעצמך, בלי AI:</p>
          {manualButton}
        </CardContent>
      </Card>
    );
  }

  if (state?.status === 'generating') {
    return (
      <Card accent="indigo">
        {header}
        <CardContent>
          {state.progress ? (
            <GenerationProgress progress={state.progress} />
          ) : (
            <div className="flex items-center gap-3">
              <div className="size-5 animate-spin rounded-full border-2 border-rule border-t-clay" />
              <p className="text-sm text-ink/70">ה-AI כותב שאלות על תוכן השיעור…</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Nothing generated yet (or the last attempt failed) — offer to create one.
  if (!creating && (state?.status === 'none' || state?.status === 'failed')) {
    return (
      <Card accent="indigo">
        {header}
        <CardContent className="space-y-3">
          {state.status === 'failed'
            ? <p className="text-sm text-coral">{state.message}</p>
            : <p className="text-sm text-ink/60">
                ה-AI יכתוב 10 שאלות אמריקאיות על תוכן השיעור. תוכלי לערוך אותן לפני שהתלמידות רואות אותן.
              </p>}
          {hasFiles && (
            <IncludeFilesOption
              checked={includeFiles}
              onChange={setIncludeFiles}
              excludedFiles={state.excludedFiles ?? []}
            />
          )}
          {errorLine}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="clay"
              loading={generateMutation.isPending}
              disabled={!hasContent || !ai.available}
              onClick={() => generateMutation.mutate(false)}
            >
              <Sparkles size={14} /> {state.status === 'failed' ? 'נסי שוב' : 'צרי בוחן בעזרת AI'}
            </Button>
            {manualButton}
          </div>
          {hasContent && aiNote}
          {!hasContent && (
            <p className="text-xs text-ink/50">יש להוסיף תוכן שיעור לפני יצירת בוחן.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!draft || (!quiz && !creating)) return null;

  return (
    <Card accent="indigo">
      {header}
      <CardContent className="space-y-4">
        <p className="text-xs text-ink/50">
          {!quiz
            ? 'כתבי שאלות אמריקאיות וסמני לכל אחת את התשובה הנכונה. אחרי השמירה הבוחן נשאר טיוטה עד שתפרסמי אותו.'
            : quiz.published
              ? 'הבוחן גלוי לתלמידות. עריכה תמחק את כל התשובות שכבר נענו.'
              : 'עברי על השאלות, תקני מה שצריך, ואז פרסמי. עד לפרסום התלמידות לא רואות דבר.'}
        </p>
        {quiz && <SourceFilesLine sourceFiles={quiz.sourceFiles} />}
        <p className="text-xs text-ink/50">
          שאלות ותשובות תומכות ב-Markdown: `קוד` בשורה, ``` לבלוק קוד, **הדגשה** וקישורים. את טקסט השאלה אפשר גם לטעון מקובץ Markdown, HTML או Word.
        </p>

        {regeneration?.status === 'generating' && (
          <div className="space-y-2 rounded-card border border-clay/30 bg-clay/5 p-3">
            <GenerationProgress progress={regeneration.progress} replacing />
            <p className="text-xs text-ink/50">
              השאלות הנוכחיות נשארות עד שהחדשות יהיו מוכנות. בינתיים אי אפשר לערוך או לפרסם אותן.
            </p>
          </div>
        )}

        {errorLine}

        {/* A disabled fieldset disables every input and button inside it at once. */}
        <fieldset disabled={regenerating} className={cn('space-y-4', regenerating && 'opacity-60')}>
          {draft.map((q, qi) => (
            <div key={q.id} className="rounded-card border border-rule/60 bg-ground/30 p-3">
              <div className="mb-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <MarkdownField
                    id={`quiz-question-${q.id}`}
                    label={`שאלה ${qi + 1}`}
                    value={q.question}
                    onChange={(question) => editQuestion(qi, { question })}
                    rows={2}
                    showHint={false}
                    inline
                  />
                </div>
                {draft.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(qi)}
                    className="mt-6 shrink-0 rounded p-1 text-ink/40 hover:bg-coral/10 hover:text-coral"
                    aria-label={`מחיקת שאלה ${qi + 1}`}
                    title="מחיקת השאלה"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="space-y-1.5 pr-6">
                {q.options.map((opt, oi) => (
                  // Align to items-start so a multi-line option doesn't push its radio button off-center.
                  <label
                    key={oi}
                    className={cn(
                      'flex items-start gap-2 rounded-input border px-2 py-1.5 transition-colors',
                      q.correctIndex === oi ? 'border-sage bg-sage/10' : 'border-rule/60 bg-sheet',
                    )}
                  >
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correctIndex === oi}
                      onChange={() => editQuestion(qi, { correctIndex: oi })}
                      className="mt-2 shrink-0 accent-sage"
                      aria-label={`סמני כתשובה נכונה לשאלה ${qi + 1}, אפשרות ${oi + 1}`}
                    />
                    <AutoTextarea
                      value={opt}
                      onChange={(e) => editOption(qi, oi, e.target.value)}
                      className="min-w-0 flex-1 border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0"
                      aria-label={`אפשרות ${oi + 1} לשאלה ${qi + 1}`}
                    />
                    {q.options.length > 2 && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); removeOption(qi, oi); }}
                        className="mt-1.5 shrink-0 rounded p-0.5 text-ink/30 hover:text-coral"
                        aria-label={`מחיקת אפשרות ${oi + 1} בשאלה ${qi + 1}`}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </label>
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between pr-6">
                <p className="text-[11px] text-ink/40">סמני בעיגול את התשובה הנכונה</p>
                {q.options.length < MAX_OPTIONS && (
                  <button type="button" onClick={() => addOption(qi)} className="text-[11px] font-semibold text-clay hover:underline">
                    + אפשרות
                  </button>
                )}
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addQuestion}>
            <Plus size={14} /> הוספת שאלה
          </Button>

        {/* Inside the fieldset too: no saving or publishing while new questions are on their way. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-rule/40 pt-3">
          {creating ? (
            <>
              <Button variant="clay" loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
                <Save size={14} /> שמרי את הבוחן
              </Button>
              <Button variant="ghost" onClick={cancelManual}>ביטול</Button>
            </>
          ) : (
          <Button
            variant="default"
            loading={saveMutation.isPending}
            disabled={!dirty}
            onClick={() => saveMutation.mutate()}
          >
            <Save size={14} /> שמרי שינויים
          </Button>
          )}

          {quiz && dirty && (
            <Button variant="ghost" onClick={() => { setDraft(quiz.questions); setError(''); }}>
              <RotateCcw size={14} /> בטלי שינויים
            </Button>
          )}

          <div className="flex-1" />

          {/* Only a draft: students may already be sitting a published quiz. */}
          {quiz && !quiz.published && hasContent && (
            <Button
              variant="ghost"
              disabled={!ai.available}
              title={ai.message ?? undefined}
              onClick={() => setRegenerateOpen(true)}
            >
              <RefreshCw size={14} /> צרי מחדש
            </Button>
          )}

          {quiz && (
          <Button
            variant={quiz.published ? 'outline' : 'clay'}
            loading={publishMutation.isPending}
            // Require saving unsaved edits first, so publishing always reflects the saved version.
            disabled={dirty}
            onClick={() => publishMutation.mutate(!quiz.published)}
            title={dirty ? 'יש לשמור את השינויים לפני פרסום' : undefined}
          >
            {quiz.published ? <><EyeOff size={14} /> החזירי לטיוטה</> : <><Eye size={14} /> פרסמי לתלמידות</>}
          </Button>
          )}
        </div>
        </fieldset>

        {quiz && dirty && (
          <p className="text-xs text-ink/50">יש שינויים שלא נשמרו. שמרי אותם כדי לאפשר פרסום.</p>
        )}
        {quiz && !quiz.published && hasContent && aiNote}
      </CardContent>

      <Dialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>ליצור את הבוחן מחדש?</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-ink/70">
              ה-AI יכתוב שאלות חדשות במקום השאלות הנוכחיות - כולל העריכות שלך
              {dirty && ' ושינויים שעוד לא נשמרו'}. תשובות שכבר הוגשו לבוחן יימחקו.
              עד שהשאלות החדשות יהיו מוכנות, הנוכחיות נשארות.
            </p>
            {hasFiles && (
              <IncludeFilesOption
                checked={includeFiles}
                onChange={setIncludeFiles}
                excludedFiles={state?.excludedFiles ?? []}
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="clay" loading={generateMutation.isPending} disabled={!ai.available} onClick={() => generateMutation.mutate(true)}>
              <Sparkles size={14} /> צרי מחדש
            </Button>
            <Button variant="outline" onClick={() => setRegenerateOpen(false)}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
