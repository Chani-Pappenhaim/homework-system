import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import { prisma } from '../config/prisma';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const PRICE_INPUT_PER_1M = 0.10;
const PRICE_OUTPUT_PER_1M = 0.40;

// Same caps as fetchGithubCode: max 20 files, max 5KB per file
const CODE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.html', '.css', '.java', '.cs', '.cpp', '.c'];
const MAX_FILES = 20;
const MAX_FILE_CHARS = 5000;

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

  await prisma.aiUsageLog.create({
    data: {
      type: 'homework_review',
      tokensInput,
      tokensOutput,
      costUsd: (tokensInput / 1_000_000) * PRICE_INPUT_PER_1M + (tokensOutput / 1_000_000) * PRICE_OUTPUT_PER_1M,
    },
  });

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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: `תוכן השיעור:\n${lessonContent}` }] }],
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

  await prisma.aiUsageLog.create({
    data: {
      type: 'quiz_generation',
      tokensInput,
      tokensOutput,
      costUsd: (tokensInput / 1_000_000) * PRICE_INPUT_PER_1M + (tokensOutput / 1_000_000) * PRICE_OUTPUT_PER_1M,
    },
  });

  const parsed = JSON.parse(text);
  // Gemini may wrap the array in an object; accept both shapes.
  const questions = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(questions)) throw new Error('Quiz generation returned no questions');
  return questions as QuizQuestion[];
}

export async function fetchGithubCode(githubUrl: string): Promise<string> {
  // githubUrl = https://github.com/username/reponame
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error('Invalid GitHub URL');
  const [, owner, repo] = match;

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  const treeRes = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'homework-app' },
  });
  if (!treeRes.ok) throw new Error(`GitHub API error: ${treeRes.status}`);
  const tree = await treeRes.json() as any;

  const files = (tree.tree || []).filter((f: any) =>
    f.type === 'blob' && CODE_EXTENSIONS.some((ext) => f.path.endsWith(ext)) &&
    !f.path.includes('node_modules') && !f.path.includes('.min.')
  ).slice(0, MAX_FILES);

  const contents: string[] = [];
  for (const file of files) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file.path}`;
    const res = await fetch(rawUrl, { headers: { 'User-Agent': 'homework-app' } });
    if (!res.ok) continue;
    const text = await res.text();
    if (text.length > MAX_FILE_CHARS) continue; // skip huge files
    contents.push(`--- ${file.path} ---\n${text}`);
  }

  return contents.join('\n\n');
}

export function extractZipCode(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const entries = zip
    .getEntries()
    .filter((entry) => {
      const name = entry.entryName;
      return (
        !entry.isDirectory &&
        CODE_EXTENSIONS.some((ext) => name.endsWith(ext)) &&
        !name.includes('node_modules/') &&
        !name.includes('dist/') &&
        !name.includes('.min.')
      );
    })
    .slice(0, MAX_FILES);

  const contents: string[] = [];
  for (const entry of entries) {
    const text = entry.getData().toString('utf8');
    if (text.length > MAX_FILE_CHARS) continue; // skip huge files
    contents.push(`--- ${entry.entryName} ---\n${text}`);
  }

  return contents.join('\n\n');
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
