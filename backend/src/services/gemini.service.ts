import type { AiTier } from '@prisma/client';
import { prisma } from '../config/prisma';
import type { InlineAttachment } from '../utils/code-extraction';
import { markFreeTierAvailable, markFreeTierExhausted, routeFreeTier } from './gemini-quota';
import { getAiSettings } from './settings.service';

// Billing belongs to a Google Cloud project, and a key inherits it, so each tier
// needs its own key: GEMINI_API_KEY from a project without billing (free),
// GEMINI_API_KEY_PAID from a billed one. With both set, the paid key serves
// calls as the teacher's paidFallback setting allows (see callGemini).
// Read lazily (not at module load) so a missing key produces a clear error at
// call time instead of an `undefined` sneaking into the request URL.
const freeApiKey = () => process.env.GEMINI_API_KEY || undefined;
const paidApiKey = () => process.env.GEMINI_API_KEY_PAID || undefined;

// Google periodically retires model ids, which makes calls 404. Keep this
// pinned to a model that currently exists; check the available models at
// https://generativelanguage.googleapis.com/v1beta/models?key=... if it 404s.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// Paid-tier list prices of the default model per 1M tokens, newest first.
// Output includes the model's thinking tokens.
const DEFAULT_MODEL_PRICES = [
  { from: Date.UTC(2027, 0, 1), input: 1.5, output: 7.5 },
  { from: 0, input: 0.75, output: 3.75 },
];

// GEMINI_PRICE_*_PER_1M override the list above; a different GEMINI_MODEL needs
// them, or the reported cost will be wrong.
function envPrice(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** USD billed for one paid-tier call. The free tier bills nothing. */
export function paidCallCostUsd(tokensInput: number, tokensOutput: number, at = new Date()): number {
  const listed = DEFAULT_MODEL_PRICES.find((p) => at.getTime() >= p.from)!;
  const input = envPrice('GEMINI_PRICE_INPUT_PER_1M') ?? listed.input;
  const output = envPrice('GEMINI_PRICE_OUTPUT_PER_1M') ?? listed.output;
  return (tokensInput * input + tokensOutput * output) / 1_000_000;
}

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
  | 'config'      // missing/invalid key, retired model - retrying cannot help
  | 'timeout'     // no answer within REQUEST_TIMEOUT_MS
  | 'rate-limit'  // 429 - a per-minute limit; clears within a minute
  | 'daily-quota' // 429 - the daily request quota is spent; resets at midnight Pacific
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

/** A 429 for the daily request quota, with the limit Google named, if it did. */
class DailyQuotaError extends GeminiError {
  constructor(message: string, readonly dailyLimit?: number) {
    super(message, 'daily-quota', false, 429);
  }
}

/**
 * Whether a 429 body is about the daily quota. Google names the spent quota in
 * error.details[].violations[].quotaId ("GenerateRequestsPerDayPerProjectPerModel-FreeTier"
 * vs "...PerMinute...") and its size in quotaValue.
 */
function readDailyQuotaError(body: string): { dailyLimit?: number } | null {
  if (!/PerDay/i.test(body)) return null;
  try {
    const details = JSON.parse(body)?.error?.details;
    for (const detail of Array.isArray(details) ? details : []) {
      for (const violation of Array.isArray(detail?.violations) ? detail.violations : []) {
        const limit = Number(violation?.quotaValue);
        if (/PerDay/i.test(String(violation?.quotaId ?? '')) && limit > 0) return { dailyLimit: limit };
      }
    }
  } catch {
    /* not JSON — the quota id alone settles it */
  }
  return {};
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

/** One generateContent request with one key; every failure becomes a GeminiError. */
async function requestGemini(
  apiKey: string,
  tier: AiTier,
  body: string,
  usageType: string,
  elapsed: () => string
): Promise<any> {
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new GeminiError(
        `Gemini API timed out after ${REQUEST_TIMEOUT_MS}ms (${usageType}, model ${GEMINI_MODEL}, ${tier} key)`,
        'timeout',
        true
      );
    }
    // Network-level failure: no DNS, no route, or a TLS chain this process does
    // not trust (an SSL-inspecting network whose root CA is not installed).
    throw new GeminiError(`Cannot reach the Gemini API after ${elapsed()}: ${describeError(err)}`, 'unavailable', true);
  }

  if (!response.ok) {
    const text = await response.text();
    let detail = text.slice(0, 300);
    try {
      detail = JSON.parse(text)?.error?.message ?? detail;
    } catch {
      /* not JSON — keep the raw excerpt */
    }
    if (response.status === 404) {
      throw new GeminiError(
        `Gemini API error: 404 - the model "${GEMINI_MODEL}" is not available. ` +
          `Set GEMINI_MODEL to a current model. (${detail})`,
        'config',
        false
      );
    }
    const message = `Gemini API error (${tier} key): ${response.status} ${detail}`;
    if (response.status === 429) {
      const daily = readDailyQuotaError(text);
      // Retrying in seconds cannot help a quota that resets at midnight Pacific.
      if (daily) throw new DailyQuotaError(message, daily.dailyLimit);
      throw new GeminiError(message, 'rate-limit', true, 429);
    }
    if (response.status === 402) {
      throw new GeminiError(
        `${message} - the paid project has no prepaid credit left; top it up in AI Studio`,
        'config',
        false,
        402
      );
    }
    if (response.status >= 500) throw new GeminiError(message, 'unavailable', true, response.status);
    // 400 (Google answers an invalid key with 400 INVALID_ARGUMENT), 401, 403:
    // the request itself is wrong, so the same request will fail again.
    throw new GeminiError(message, 'config', false, response.status);
  }

  return response.json();
}

/**
 * Shared entry point for calling Gemini. Normalizes every failure mode
 * (timeout, network error, HTTP error, empty/blocked response, malformed
 * JSON) into an error message that names the actual cause.
 *
 * Calls go to the free key. Once it spends its daily quota they go to the paid
 * key until the quota resets, with one call every half hour trying the free
 * key again. The teacher's paidFallback setting decides the rest:
 * - DAILY_QUOTA — short-term limits and outages never move a call to the paid key;
 * - ANY_LIMIT   — a per-minute limit or an outage of the free key moves that one
 *                 call to the paid key, without marking the free tier spent;
 * - NEVER       — the paid key is never used, so a spent free quota stops the
 *                 calls until it resets, without asking Google again.
 */
async function callGemini(
  systemPrompt: string,
  userMessage: string,
  usageType: string,
  attachments: InlineAttachment[] = []
): Promise<any> {
  const { paidFallback } = await getAiSettings();
  const freeKey = freeApiKey();
  const paidKey = paidFallback === 'NEVER' ? undefined : paidApiKey();
  if (!freeKey && !paidKey) {
    throw new GeminiError(
      paidApiKey()
        ? 'Only GEMINI_API_KEY_PAID is configured, and the AI settings forbid the paid key - AI features are disabled'
        : 'GEMINI_API_KEY is not configured - AI features are disabled',
      'config',
      false
    );
  }

  const startedAt = Date.now();
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  const body = JSON.stringify({
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
  });

  const route = !freeKey ? 'paid' : await routeFreeTier();
  if (route === 'paid' && !paidKey) {
    // The free tier is marked spent and no paid key may take over: asking
    // Google again would only return the same 429.
    throw new DailyQuotaError(`Gemini free daily quota is spent and the paid key ${paidApiKey() ? 'is not allowed' : 'is not configured'}`);
  }
  let tier: AiTier = 'PAID';
  let data: any;
  if (route !== 'paid') {
    try {
      data = await requestGemini(freeKey!, 'FREE', body, usageType, elapsed);
      tier = 'FREE';
      if (route === 'recheck') {
        await markFreeTierAvailable();
        console.log('[gemini] the free tier answers again - back to the free key');
      }
    } catch (err) {
      if (err instanceof DailyQuotaError) {
        const until = await markFreeTierExhausted(err.dailyLimit);
        if (!paidKey) throw err;
        console.warn(`[gemini] free daily quota spent - using the paid key until ${until.toISOString()}`);
      } else if (
        paidKey &&
        paidFallback === 'ANY_LIMIT' &&
        err instanceof GeminiError &&
        (err.kind === 'rate-limit' || err.kind === 'unavailable')
      ) {
        console.warn(`[gemini] free key failed (${err.kind}) - this call goes to the paid key: ${err.message}`);
      } else {
        throw err;
      }
    }
  }
  if (data === undefined) data = await requestGemini(paidKey!, 'PAID', body, usageType, elapsed);

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  const tokensInput = data.usageMetadata?.promptTokenCount || 0;
  // Thinking tokens are billed as output, like the answer itself.
  const tokensOutput = (data.usageMetadata?.candidatesTokenCount || 0) + (data.usageMetadata?.thoughtsTokenCount || 0);

  await prisma.aiUsageLog.create({
    data: {
      type: usageType,
      tier,
      tokensInput,
      tokensOutput,
      costUsd: tier === 'PAID' ? paidCallCostUsd(tokensInput, tokensOutput) : 0,
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

  console.log(`[gemini] ${usageType} answered in ${elapsed()} by the ${tier} key (tokens in ${tokensInput}, out ${tokensOutput})`);

  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError(`Gemini returned malformed JSON: ${text.slice(0, 200)}`, 'bad-output', true);
  }
}

// The teacher asked for plain hyphens in everything the site shows. The prompts
// ask for them too, but the model slips, so its text is cleaned up as well.
const NO_LONG_DASHES = 'אל תשתמשי במקף ארוך (\u2014 או \u2013), רק במקף רגיל (-).';
export const plainDashes = (text: string) => text.replace(/[\u2014\u2013]/g, '-');

/** Lesson material the teacher picked for a review to rely on: text read from the files, and files Gemini reads itself. */
export interface ReviewReferences {
  text: string;
  attachments: InlineAttachment[];
}

export async function reviewCode(
  code: string,
  assignmentTitle: string,
  aiInstructions?: string | null,
  assignmentDescription?: string | null,
  references?: ReviewReferences
): Promise<AiReviewResult> {
  const hasReferences = Boolean(references?.text.trim() || references?.attachments.length);
  const systemPrompt = `אתה מורה מקצועית שבודקת עבודות של תלמידות בקורס תכנות.
עבודה יכולה להיות קוד, או עבודה כתובה (למשל פסאודו-קוד, ניתוח אלגוריתם ותשובות לשאלות פתוחות). זהי מה הוגש ובדקי לפי הסוג:
- בקוד: נכונות, מבנה וקריאות.
- בעבודה כתובה: נכונות האלגוריתם או התשובה, שלמות ודיוק הנימוק. פסאודו-קוד אינו קוד להרצה - אל תעירי על תחביר של שפת תכנות כלשהי.
תתני:
1. code_review: הערות ספציפיות על העבודה, לפי סעיף או לפי קטע (כל הערה בשורה חדשה, התחילי כל הערה ב"•")
2. verbal_review: הערכה מילולית כללית על העבודה (2-3 משפטים)
3. score: ציון מספרי מ-0 עד 100

אם בסוף העבודה מופיע קטע "השינויים מתגית...", זה מה שהתלמידה הוסיפה או שינתה בחלק הנוכחי של התרגיל. בדקי את החלק הזה לפי ההנחיות, וקראי את שאר הקוד כרקע.
אם בסוף העבודה מופיעה הערה על קבצי קוד שלא נכללו בבדיקה, אל תורידי נקודות על תוכן שלא ראית, וציני בהערות שהקבצים האלה לא נבדקו.

ההערות (code_review ו-verbal_review) מוצגות לתלמידה לפני שהמורה מאשרת את הציון, ולכן אסור שיופיע בהן ציון, מספר נקודות או ניחוש של הציון - הציון רק בשדה score.
${NO_LONG_DASHES}

${aiInstructions ? `הנחיות ספציפיות למטלה זו (התלמידה לא רואה אותן; כשהן מפורטות יותר מתיאור המטלה, למשל תרגיל שלם שמוגש בחלקים, בדקי לפיהן):\n${aiInstructions}` : ''}
${hasReferences ? 'המורה צירפה קבצים מהשיעור שעליהם הבדיקה צריכה להתבסס - בדקי את העבודה לאורם.' : ''}

החזירי JSON בלבד בפורמט:
{"code_review": "...", "verbal_review": "...", "score": 85}`;

  // The description is what the student was asked to do, and holds the
  // teacher's grading criteria.
  const descriptionBlock = assignmentDescription?.trim() ? `\n\nתיאור המטלה:\n${assignmentDescription.trim()}` : '';
  const referencesBlock = references?.text.trim()
    ? `\n\n--- קבצי השיעור שהמורה בחרה לבדיקה ---\n${references.text.trim()}`
    : '';
  const userMessage = `מטלה: ${assignmentTitle}${descriptionBlock}${referencesBlock}\n\nהעבודה שהוגשה:\n\`\`\`\n${code}\n\`\`\``;

  const parsed = await callGemini(systemPrompt, userMessage, 'homework_review', references?.attachments ?? []);
  return {
    codeReview: plainDashes(String(parsed.code_review || '')),
    verbalReview: plainDashes(String(parsed.verbal_review || '')),
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
${NO_LONG_DASHES}
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
    question: plainDashes(q.question),
    options: q.options.map((o: unknown) => plainDashes(String(o))),
    correctIndex: q.correctIndex,
  }));
}
