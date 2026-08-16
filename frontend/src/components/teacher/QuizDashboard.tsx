import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn, formatDateTime } from '@/lib/utils';
import type { QuizQuestionStatsDTO, QuizResultsDTO } from '@/types';

/**
 * How the class did — per question, not just per student.
 *
 * A column of scores tells the teacher who is struggling. It cannot tell her
 * *what* they misunderstood, which is the thing she would reteach. So the
 * primary view here is one row per question ordered by how many got it right,
 * with the wrong answers they actually chose underneath: a distractor that
 * catches half the class is a specific misconception, not noise.
 *
 * On colour: the brand palette is deliberately low-chroma, and its accents fail
 * a colourblind-separation check against each other (sage vs coral ΔE 14.4,
 * below the 15 floor). Nothing here is encoded by hue. Every bar is the same
 * single hue and carries magnitude by length only; correctness is carried by a
 * ✓ mark, a word, and a printed count — so the charts stay readable in
 * greyscale, in dark mode, and for a colourblind reader.
 */

/** Proportion bar: one hue, length = magnitude, value always printed alongside. */
function Bar({ value, max, emphasis = false }: { value: number; max: number; emphasis?: boolean }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-rule" aria-hidden>
      <div
        className={cn('h-full rounded-full bg-sage transition-[width]', !emphasis && 'opacity-40')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-rule bg-sheet p-4">
      <p className="font-sans text-xs text-ink/50">{label}</p>
      {/* Hero number in ink, never in a series colour. */}
      <p className="mt-1 font-display text-3xl font-bold tabular text-ink">{value}</p>
      {hint && <p className="mt-0.5 font-sans text-xs text-ink/50">{hint}</p>}
    </div>
  );
}

function QuestionRow({ q, index, attemptCount }: {
  q: QuizQuestionStatsDTO; index: number; attemptCount: number;
}) {
  return (
    <li className="rounded-card border border-rule/60 bg-ground/25 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 font-display text-sm font-bold tabular text-ink/40">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">{q.question}</p>

          <div className="mt-2 flex items-center gap-3">
            <div className="min-w-0 flex-1"><Bar value={q.correctCount} max={attemptCount} emphasis /></div>
            <span className="shrink-0 font-sans text-xs tabular text-ink">
              {q.correctCount} מתוך {attemptCount}
              {q.correctRate !== null && <span className="text-ink/50"> · {Math.round(q.correctRate)}%</span>}
            </span>
          </div>

          {/* What the wrong answers actually were. */}
          <ul className="mt-3 space-y-1">
            {q.options.map((opt, j) => {
              const isCorrect = j === q.correctIndex;
              const count = q.optionCounts[j] ?? 0;
              return (
                <li key={j} className="flex items-start gap-2">
                  <span
                    className={cn(
                      'mt-0.5 w-4 shrink-0 text-center font-sans text-xs',
                      isCorrect ? 'text-sage' : 'text-ink/30',
                    )}
                    aria-hidden
                  >
                    {isCorrect ? '✓' : '·'}
                  </span>
                  <span className={cn('min-w-0 flex-1 text-xs', isCorrect ? 'font-semibold text-ink' : 'text-ink/60')}>
                    {opt}
                    {isCorrect && <span className="mr-1.5 font-normal text-ink/45">(התשובה הנכונה)</span>}
                  </span>
                  <span className="w-24 shrink-0"><Bar value={count} max={attemptCount} emphasis={isCorrect} /></span>
                  <span className="w-8 shrink-0 text-left font-sans text-xs tabular text-ink/70">{count}</span>
                </li>
              );
            })}
            {q.unanswered > 0 && (
              <li className="pr-6 font-sans text-xs text-ink/45">{q.unanswered} לא ענו על שאלה זו</li>
            )}
          </ul>
        </div>
      </div>
    </li>
  );
}

export default function QuizDashboard({ data }: { data: QuizResultsDTO }) {
  const { summary, questions, results } = data;

  if (summary.attemptCount === 0) {
    return (
      <Card>
        <CardHeader><h2 className="font-display text-base font-bold">תוצאות הכיתה</h2></CardHeader>
        <CardContent>
          <p className="text-sm text-ink/55">
            אף תלמידה עוד לא ענתה על החידון. כשיתחילו לענות, כאן יופיע פילוח לפי שאלה — על מה ענו נכון ואיזו תשובה שגויה בחרו.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Weakest first: the questions she might reteach are the reason to open this page.
  const byDifficulty = [...questions].sort((a, b) => (a.correctRate ?? 0) - (b.correctRate ?? 0));
  const hardest = byDifficulty[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="ענו על החידון" value={String(summary.attemptCount)} hint="תלמידות" />
        <StatTile
          label="ממוצע כיתתי"
          value={summary.averageScore !== null ? `${Math.round(summary.averageScore)}%` : '—'}
        />
        <StatTile
          label="השאלה הקשה ביותר"
          value={hardest?.correctRate !== null && hardest ? `${Math.round(hardest.correctRate!)}%` : '—'}
          hint={hardest ? `שאלה ${questions.indexOf(hardest) + 1}` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-display text-base font-bold">פילוח לפי שאלה</h2>
          <p className="mt-0.5 font-sans text-xs text-ink/50">מסודר מהשאלה שהכי התקשו בה</p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {byDifficulty.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                index={questions.indexOf(q)}
                attemptCount={summary.attemptCount}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* The same data per student — a plain table, and the text equivalent of the charts above. */}
      <Card>
        <CardHeader>
          <h2 className="font-display text-base font-bold">ציוני התלמידות ({results.length})</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule/20 text-xs text-ink/50">
                <th className="px-5 py-2.5 text-right font-medium">תלמידה</th>
                <th className="px-3 py-2.5 text-right font-medium">ציון</th>
                <th className="px-3 py-2.5 text-right font-medium">תאריך</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/20">
              {results.map((r, i) => (
                <tr key={i}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{r.studentName}</p>
                    <p className="text-xs text-ink/50">{r.studentEmail}</p>
                  </td>
                  <td className="px-3 py-3 font-semibold tabular text-ink">{Math.round(r.score)}%</td>
                  <td className="px-3 py-3 text-xs text-ink/70">{formatDateTime(r.takenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
