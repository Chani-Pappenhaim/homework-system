# Business Rules & Technical Notes — Homework Submission System

## חוקי עסק מרכזיים

### ציונים — חשוב מאוד, אל תבלבל
**שני ציונים נפרדים לכל הגשה:**

| ציון | שדה | מקור | נראה לתלמידה? |
|---|---|---|---|
| ציון הגשה | `Grade.submissionScore` | אוטומטי (100 − איחור − checklist) | **מיד** |
| ציון תוכן | `Grade.contentScore` | מה-AI, עריכה ידנית | **רק אחרי aiApproved=true** |

- מורה יכולה לשנות שניהם
- **כפתור "החזר לציון AI"**: `contentScore = aiScore` ללא בקשה חדשה (aiScore נשמר תמיד)

### AI Review
- **Opt-in בלבד** — תלמידה לוחצת "בקשי בדיקת AI", לא אוטומטי
- **מגבלה:** פעם אחת למטלה. מורה יכולה לאשר עוד אחת חד-פעמית (`aiExtraAllowed=true`)
- **aiCodeReview** — נראה לתלמידה מיד (לא דורש אישור)
- **aiScore + aiVerbalReview** — נסתר עד `aiApproved=true`
- **GitHub בלבד** לגרסה זו (repos ציבוריים). ZIP + Word — נתמך ע"י Worker

### Submissions
- תלמידה יכולה להגיש מחדש (מחליף הגשה קודמת)
- `isLate` מחושב מחדש בכל הגשה
- `githubUrl` נבנה מ: `https://github.com/{githubUsername}/{repoName}`
- אם `githubUsername` לא מוגדר → 400 "GitHub username not set"

### Access Control
- קורס שייך לקבוצה אחת בלבד
- תלמידה רואה קורסים של הקבוצה שלה בלבד
- `hidden=true` על שיעור → בלתי נראה לחלוטין לתלמידות
- גישה חריגה לשיעור: `LessonAccess` (לא `CourseAccess`)

### כללים נוספים
- סיסמא ברירת מחדל: `"12345678"`, `mustChangePassword=true` חוסם כל routes
- חידון נוצר פעם אחת לשיעור; ניתן לחזור ולגשת (מחליף ניסיון קודם)
- התראת אחסון: 80%, פעם אחת ב-24 שעות (Redis dedup)
- **Teacher is the only ADMIN** — אין multi-teacher support
- `app.set('trust proxy', 1)` חובה ב-app.ts (בגלל nginx → rate limiter)

---

## AI Worker — זרימה מלאה

**Queue:** "ai-review" (BullMQ + Redis)

**Trigger:** `POST /api/submissions/:id/request-ai-review`

**סוגי הגשות נתמכים:**
- **GitHub URL** → GitHub API (ציבורי בלבד, עד 20 קבצים, max 5KB per file, ללא node_modules)
- **ZIP** → adm-zip in-memory extraction → קוד
- **Word/other** → mammoth לtext extraction

**Flow:**
1. Validate (student owns it, has GitHub/file, count < limit, not pending)
2. `aiStatus = "pending"` → queue job
3. Worker fetches code
4. Gemini API (`gemini-2.0-flash`) עם system prompt → JSON: `{ code_review, verbal_review, score }`
5. Save: `aiCodeReview`, `aiVerbalReview`, `aiScore`, `aiStatus="done"`, `aiReviewCount += 1`
6. Log to `AiUsageLog`
7. Error → `aiStatus = "error"`

**aiInstructions**: הנחיות המורה לAI, per-assignment, נשלחות כחלק מה-prompt

---

## Email — Resend

שירות email לאפליקציות (לא Gmail). Env var: `RESEND_API_KEY`.

**מקרים:**
- איפוס סיסמא → מייל לתלמידה
- תלמידה שולחת הודעה → מייל למורה
- מורה עונה להודעה → מייל לתלמידה

---

## Quiz Worker

**Queue:** "quiz"  
**AI:** Claude API (`claude-sonnet-4-6`) — שונה מהomework review שמשתמש ב-Gemini  
**Output:** JSON array של 10 שאלות אמריקאיות בעברית  
**Format:** `[{ id, question, options: string[4], correctIndex: 0|1|2|3 }]`

---

## Auth Flow

**JWT:**
- Access token: 15 דקות, בזיכרון (Zustand), לא localStorage
- Refresh token: 7 ימים, HttpOnly cookie, מתחלף בכל שימוש

**OAuth:** GitHub + Google → callback → `FRONTEND_URL/auth/callback?token=<accessToken>`

---

## Deploy — Oracle Cloud

**החלטה:** Oracle Cloud Always Free (IaaS) — VM עם Docker Compose  
הכל על שרת אחד: nginx + frontend + api + worker + PostgreSQL + Redis  
**Email:** Resend (לא Gmail)

---

## Environment Variables חשובים

```env
DATABASE_URL=postgresql://user:pass@postgres:5432/homework_db
REDIS_URL=redis://redis:6379
JWT_SECRET=<64 chars>
JWT_REFRESH_SECRET=<64 chars>
CLOUDINARY_CLOUD_NAME= | CLOUDINARY_API_KEY= | CLOUDINARY_API_SECRET=
GITHUB_CLIENT_ID= | GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID= | GOOGLE_CLIENT_SECRET=
GEMINI_API_KEY= | GEMINI_MODEL=gemini-2.0-flash
RESEND_API_KEY=
SMTP_HOST= | SMTP_PORT=587 | SMTP_USER= | SMTP_PASS=
FROM_EMAIL=noreply@yourdomain.com
FRONTEND_URL= | ADMIN_EMAIL=
```

---

## הערות טכניות קריטיות

- **Prisma import:** `../config/prisma` (לא `../lib/prisma`)
- **req.params.id:** צריך `as string` כשמעבירים ל-Prisma (`req.params.id as string`)
- **lessonDate:** חייב `new Date(lessonDate)` לפני Prisma (לא string בלבד)
- **trust proxy:** `app.set('trust proxy', 1)` ב-app.ts — חובה לrate-limit מאחורי nginx
- **Axios infinite loop:** `if (window.location.pathname !== '/login')` לפני redirect
- **Docker rebuild:** `--no-cache` כששינויים לא נטענים; `--force-recreate` אחרי build
- **Docker disk:** `docker builder prune -f` אם "read-only file system"
- **Migration:** `npx prisma migrate dev --config prisma.config.ts` (לא `--schema`)
- **PowerShell only:** `$env:DATABASE_URL=...` עובד רק ב-PowerShell, לא CMD
