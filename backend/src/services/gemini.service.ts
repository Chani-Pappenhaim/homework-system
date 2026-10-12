import { prisma } from '../config/prisma';
import type { InlineAttachment } from '../utils/code-extraction';

// Read lazily (not at module load) so a missing key produces a clear error at
// call time instead of an `undefined` sneaking into the request URL.
const geminiApiKey = () => process.env.GEMINI_API_KEY;

// Google periodically retires model ids, which makes calls 404. Keep this
// pinned to a model that currently exists; check the available models at
// https://generativelanguage.googleapis.com/v1beta/models?key=... if it 404s.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// Per-1M-token prices for GEMINI_MODEL, used only for the AI-usage cost report.
// Env-tunable, but must be kept in sync with GEMINI_MODEL or the reported cost
// will be wrong.
const PRICE_INPUT_PER_1M = Number(process.env.GEMINI_PRICE_INPUT_PER_1M ?? 0.10);
const PRICE_OUTPUT_PER_1M = Number(process.env.GEMINI_PRICE_OUTPUT_PER_1M ?? 0.40);

interface AiReviewResult {
  codeReview: string;
  verbalReview: string;
  score: number;
}

// How long a single Gemini call may take before we give up. Without this a
// hung connection leaves the job waiting indefinitely.
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 60_000);

/**
 * Why a Gemini call failed, in terms a caller can act on. The raw provider text
 * stays in `message` for the logs; callers map `kind` to a user-facing message.
 */
export type GeminiFailureKind =
  | 'config'      // missing/invalid key, retired model — retrying cannot help
  | 'timeout'     // no answer within REQUEST_TIMEOUT_MS
  | 'rate-limit'  // 429 — quota or per-minute limit
  | 'unavailable' // network fault or a 5xx from Google
  | 'blocked'     // safety filter refused the prompt or the answer
  | 'bad-output'; // empty, truncated, or not the JSON we asked for

/**
 * A classified Gemini failure. `retryable` tells a queue whether another
 * attempt has any chance of succeeding.
 */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: GeminiFailureKind,
    readonly retryable: boolean,
    /** Google's HTTP status, when it answered at all. */
    readonly status?: number
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

// finishReason values meaning a safety filter, not a glitch, produced the empty
// answer — the same content will be refused again.
const BLOCKED_FINISH_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

/**
 * Flattens an error and its `cause` chain into one line.
 *
 * Node's fetch reports every network fault as a bare `TypeError: fetch failed`
 * and puts the real reason (bad certificate, DNS failure, refused connection)
 * in `cause`. Reporting only the top-level message tells the reader nothing.
 */
function describeError(err: any): string {
  const parts: string[] = [];
  let current = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = current.code ? ` [${current.code}]` : '';
    const message = current.message ?? String(current);
    const piece = `${message}${code}`;
    if (!parts.includes(piece)) parts.push(piece);
    current = current.cause;
  }
  return parts.join(' ← ');
}

/**
 * Shared entry point for calling Gemini. Normalizes every failure mode
 * (timeout, network error, HTTP error, empty/blocked response, malformed
 * JSON) into an error message that names the actual cause.
 */
async function callGemini(
  systemPrompt: string,
  userMessage: string,
  usageType: string,
  attachments: InlineAttachment[] = []
): Promise<any> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new GeminiError('GEMINI_API_KEY is not configured — AI features are disabled', 'config', false);
  }

  const startedAt = Date.now();
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            role: 'user',
            parts: [
              { text: userMessage },
              // Each file is preceded by its name so the model can tell them apart.
              ...attachments.flatMap((a) => [
                { text: `קובץ מצורף: ${a.name}` },
                { inline_data: { mime_type: a.mimeType, data: a.data } },
              ]),
            ],
          }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new GeminiError(
        `Gemini API timed out after ${REQUEST_TIMEOUT_MS}ms (${usageType}, model ${GEMINI_MODEL})`,
        'timeout',
        true
      );
    }
    // Network-level failure: no DNS, no route, or a TLS chain this process does
    // not trust (an SSL-inspecting network whose root CA is not installed).
    throw new GeminiError(`Cannot reach the Gemini API after ${elapsed()}: ${describeError(err)}`, 'unavailable', true);
  }

  if (!response.ok) {
    const body = await response.text();
    let detail = body.slice(0, 300);
    try {
      detail = JSON.parse(body)?.error?.message ?? detail;
    } catch {
      /* not JSON — keep the raw excerpt */
    }
    if (response.status === 404) {
      throw new GeminiError(
        `Gemini API error: 404 — the model "${GEMINI_MODEL}" is not available. ` +
          `Set GEMINI_MODEL to a current model. (${detail})`,
        'config',
        false
      );
    }
    const message = `Gemini API error: ${response.status} ${detail}`;
    if (response.status === 429) throw new GeminiError(message, 'rate-limit', true, 429);
    if (response.status >= 500) throw new GeminiError(message, 'unavailable', true, response.status);
    // 400 (Google answers an invalid key with 400 INVALID_ARGUMENT), 401, 403:
    // the request itself is wrong, so the same request will fail again.
    throw new GeminiError(message, 'config', false, response.status);
  }

  const data = (await response.json()) as any;
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  const tokensInput = data.usageMetadata?.promptTokenCount || 0;
  const tokensOutput = data.usageMetadata?.candidatesTokenCount || 0;

  await prisma.aiUsageLog.create({
    data: {
      type: usageType,
      tokensInput,
      tokensOutput,
      costUsd:
        (tokensInput / 1_000_000) * PRICE_INPUT_PER_1M +
        (tokensOutput / 1_000_000) * PRICE_OUTPUT_PER_1M,
    },
  });

  if (typeof text !== 'string' || !text.trim()) {
    // A blocked prompt or a response truncated at the token limit both arrive
    // as a 200 with no usable text; finishReason says which.
    const blockReason = data.promptFeedback?.blockReason;
    const reason = candidate?.finishReason ?? blockReason ?? 'unknown';
    const message = `Gemini returned no content (finishReason: ${reason})`;
    if (blockReason || BLOCKED_FINISH_REASONS.has(reason)) {
      throw new GeminiError(message, 'blocked', false);
    }
    throw new GeminiError(message, 'bad-output', true);
  }

  console.log(`[gemini] ${usageType} answered in ${elapsed()} (tokens in ${tokensInput}, out ${tokensOutput})`);

  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError(`Gemini returned malformed JSON: ${text.slice(0, 200)}`, 'bad-output', true);
  }
}

export async function reviewCode(
  code: string,
  assignmentTitle: string,
  aiInstructions?: string | null,
  assignmentDescription?: string | null
): Promise<AiReviewResult> {
  const systemPrompt = `אתה מורה מקצועית שבודקת עבודות קוד של תלמידות.
תתני:
1. code_review: הערות ספציפיות על הקוד (כל הערה בשורה חדשה, התחילי כל הערה ב"•")
2. verbal_review: הערכה מילולית כללית על העבודה (2-3 משפטים)
3. score: ציון מספרי מ-0 עד 100

${aiInstructions ? `הנחיות ספציפיות למטלה זו:\n${aiInstructions}` : ''}

החזירי JSON בלבד בפורמט:
{"code_review": "...", "verbal_review": "...", "score": 85}`;

  // The description is what the student was asked to do, and holds the
  // teacher's grading criteria.
  const descriptionBlock = assignmentDescription?.trim() ? `\n\nתיאור המטלה:\n${assignmentDescription.trim()}` : '';
  const userMessage = `מטלה: ${assignmentTitle}${descriptionBlock}\n\nקוד:\n\`\`\`\n${code}\n\`\`\``;

  const parsed = await callGemini(systemPrompt, userMessage, 'homework_review');
  return {
    codeReview: parsed.code_review || '',
    verbalReview: parsed.verbal_review || '',
    score: Number(parsed.score) || 0,
  };
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

/**
 * Generates a Hebrew multiple-choice quiz from lesson content, plus any lesson
 * files Gemini reads itself (PDFs, images). Usage is logged as
 * 'quiz_generation' so it counts under quizzes in the AI-usage report.
 */
export async function generateQuiz(lessonContent: string, attachments: InlineAttachment[] = []): Promise<QuizQuestion[]> {
  const systemPrompt = `את מחוללת חידונים לקורס תכנות.
בהתבסס על תוכן השיעור, צרי בדיוק 10 שאלות רב-ברירה בעברית.
לכל שאלה בדיוק 4 אפשרויות, ורק אחת נכונה.
השאלות והתשובות מוצגות כ-Markdown: סמני קוד בתוך שורה ב-\`backticks\`, וקטע קוד של כמה שורות בבלוק \`\`\`. אל תשתמשי בכותרות או ברשימות.
החזירי JSON בלבד (מערך), ללא טקסט נוסף, במבנה המדויק:
[{"id":"1","question":"...","options":["...","...","...","..."],"correctIndex":0}]`;

  const parsed = await callGemini(
    systemPrompt,
    `תוכן השיעור:\n${lessonContent}`,
    'quiz_generation',
    attachments
  );

  // Gemini may wrap the array in an object; accept both shapes.
  const questions = Array.isArray(parsed) ? parsed : parsed?.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new GeminiError('Quiz generation returned no questions', 'bad-output', true);
  }

  // Scoring assumes every question has options and a valid correctIndex. A
  // malformed question would otherwise be stored and only fail later, while a
  // student is taking the quiz.
  const valid = questions.filter(
    (q: any) =>
      typeof q?.question === 'string' &&
      q.question.trim() &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      Number.isInteger(q.correctIndex) &&
      q.correctIndex >= 0 &&
      q.correctIndex < q.options.length
  );
  if (valid.length === 0) {
    throw new GeminiError('Quiz generation returned no usable questions', 'bad-output', true);
  }

  // ids are used as React keys and must be unique whatever the model returned.
  return valid.map((q: any, i: number) => ({
    id: String(q.id ?? i + 1),
    question: q.question,
    options: q.options.map((o: unknown) => String(o)),
    correctIndex: q.correctIndex,
  }));
}
