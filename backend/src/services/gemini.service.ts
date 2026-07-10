import { prisma } from '../config/prisma';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const PRICE_INPUT_PER_1M = 0.10;
const PRICE_OUTPUT_PER_1M = 0.40;

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

  const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.html', '.css', '.java', '.cs', '.cpp', '.c'];
  const files = (tree.tree || []).filter((f: any) =>
    f.type === 'blob' && codeExtensions.some((ext) => f.path.endsWith(ext)) &&
    !f.path.includes('node_modules') && !f.path.includes('.min.')
  ).slice(0, 20);

  const contents: string[] = [];
  for (const file of files) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file.path}`;
    const res = await fetch(rawUrl, { headers: { 'User-Agent': 'homework-app' } });
    if (!res.ok) continue;
    const text = await res.text();
    if (text.length > 5000) continue; // skip huge files
    contents.push(`--- ${file.path} ---\n${text}`);
  }

  return contents.join('\n\n');
}
