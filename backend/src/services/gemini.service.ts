import { prisma } from '../config/prisma';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const PRICE_INPUT_PER_1M = 0.10;
const PRICE_OUTPUT_PER_1M = 0.40;

async function logAiUsage(type: string, tokensInput: number, tokensOutput: number) {
  await prisma.aiUsageLog.create({
    data: {
      type,
      tokensInput,
      tokensOutput,
      costUsd: (tokensInput / 1_000_000) * PRICE_INPUT_PER_1M + (tokensOutput / 1_000_000) * PRICE_OUTPUT_PER_1M,
    },
  });
}

/** Single call point for the Gemini API — sends a system+user prompt, logs usage, returns the raw text. */
async function callGemini(systemPrompt: string, userMessage: string, usageType: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${err}`);
  }

  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const tokensInput = data.usageMetadata?.promptTokenCount || 0;
  const tokensOutput = data.usageMetadata?.candidatesTokenCount || 0;

  await logAiUsage(usageType, tokensInput, tokensOutput);

  return text;
}

interface AiReviewResult {
  codeReview: string;
  verbalReview: string;
  score: number;
}

export async function reviewCode(
  code: string,
  assignmentTitle: string,
  aiInstructions?: string | null
): Promise<AiReviewResult> {
  const systemPrompt = `אתה מורה מקצועית שבודקת עבודות קוד של תלמידות.
תתני:
1. code_review: הערות ספציפיות על הקוד (כל הערה בשורה חדשה, התחילי כל הערה ב"•")
2. verbal_review: הערכה מילולית כללית על העבודה (2-3 משפטים)
3. score: ציון מספרי מ-0 עד 100

${aiInstructions ? `הנחיות ספציפיות למטלה זו:\n${aiInstructions}` : ''}

החזירי JSON בלבד בפורמט:
{"code_review": "...", "verbal_review": "...", "score": 85}`;

  const userMessage = `מטלה: ${assignmentTitle}\n\nקוד:\n\`\`\`\n${code}\n\`\`\``;

  const text = await callGemini(systemPrompt, userMessage, 'homework_review');
  const parsed = JSON.parse(text);
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
 * Generates a Hebrew multiple-choice quiz from lesson content using the same
 * Gemini model as the homework review — one AI provider across the product, and
 * the model that actually connects in this environment. Usage is logged as
 * 'quiz_generation' so it counts under quizzes in the AI-usage report.
 */
export async function generateQuiz(lessonContent: string): Promise<QuizQuestion[]> {
  const systemPrompt = `את מחוללת חידונים לקורס תכנות.
בהתבסס על תוכן השיעור, צרי בדיוק 10 שאלות רב-ברירה בעברית.
לכל שאלה בדיוק 4 אפשרויות, ורק אחת נכונה.
החזירי JSON בלבד (מערך), ללא טקסט נוסף, במבנה המדויק:
[{"id":"1","question":"...","options":["...","...","...","..."],"correctIndex":0}]`;

  const text = await callGemini(systemPrompt, `תוכן השיעור:\n${lessonContent}`, 'quiz_generation');
  const parsed = JSON.parse(text);
  // Gemini may wrap the array in an object; accept both shapes.
  const questions = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(questions)) throw new Error('Quiz generation returned no questions');
  return questions as QuizQuestion[];
}
