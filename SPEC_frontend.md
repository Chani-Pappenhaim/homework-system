# Frontend Spec — Homework Submission System

## Tech Stack
React 18 + TypeScript + Vite + TailwindCSS 3 + shadcn/ui + Zustand + React Query v5 + Axios

## Design System

**"קליק כיתה"** — עיצוב "מחברת/דף" (notebook/paper), לא dashboard כהה עם גרדיאנט. הטוקנים מוגדרים כ-CSS vars ב-`globals.css` (RGB channels) וחשופים ב-`tailwind.config.ts` דרך `rgb(var(--x) / <alpha-value>)`, כך שמודיפייר שקיפות (`bg-clay/20`) עובד.

- **RTL:** `dir="rtl" lang="he"` על `<html>`
- **Font:** Heebo (לא Inter) — משמש גם ל-`sans`, גם ל-`serif`, גם ל-`display`

### טוקנים (Tailwind class names)
| טוקן | תפקיד |
|---|---|
| `ground` | רקע העמוד |
| `sheet` | רקע כרטיסים/דפים |
| `ink` / `ink-soft` | טקסט עיקרי / משני |
| `rule` | קווי גבול (border) |
| `clay` | accent ראשי (primary/secondary, ring) |
| `coral` | destructive / אזהרה |
| `sage` | הצלחה/חיובי |
| `indigo` | accent משני |
| `butter` | הדגשה חמה (streaks, badges) |

צבעי הפלטה נמוכי-רוויה במכוון — **sage↔coral נכשלים בבדיקת עיוורון-צבעים** (ΔE 14.4 מול רף 15), אז אסור לקודד משמעות רק בצבע (ראה QuizDashboard כדוגמה: תמיד גם ✓/מספר/טקסט).

מחלקות דינמיות מהצורה `` `bg-${accent}` `` מסוכנות ל-purge של Tailwind בפרודקשן — יש `safelist` ב-`tailwind.config.ts` שמכסה את הצירופים הקבועים (`bg/text/border` × כל טוקן, כולל `before:bg-*` לספיינים של כרטיסים), אבל העדיפות היא עדיין מפה סטטית (`Record<Accent, string>`) בקוד עצמו במקום להסתמך על ה-safelist.

### רדיוסים וצללים
- `rounded-card` (3px) לכרטיסים, `rounded-input` (7px) לשדות קלט, `rounded-badge`/`rounded-full` לתגיות
- `shadow-soft` / `shadow-sheet` / `shadow-lift` — מוגדרים כ-CSS vars, לא ערכי Tailwind רגילים

---

## Routes

### Auth
- `/login` — כניסה + OAuth
- `/change-password` — שינוי סיסמא (מוגן ע"י ChangePasswordGuard)
- `/auth/callback` — OAuth callback (קורא token מ-URL)

### Teacher (כל תחת AdminGuard)
- `/teacher` — דף בית
- `/teacher/groups/new` + `/teacher/groups/:id/edit` — טופס קבוצה
- `/teacher/courses/new` + `/teacher/courses/:id/edit` — טופס קורס
- `/teacher/courses/:id` — פרטי קורס
- `/teacher/lessons/:id` — פרטי שיעור + בדיקת הגשות
- `/teacher/quiz/:lessonId` — ניהול החידון: יצירה ב-AI, עריכה, פרסום + דשבורד פילוח לפי שאלה (מקביל לדף התלמידה)
- `/teacher/reports` — דוחות + ייצוא Excel
- `/teacher/messages` — הודעות תלמידות + badge לא נקראות

### Student
- `/student` — דף בית + קורסים
- `/student/courses/:id` — פרטי קורס
- `/student/lessons/:id` — שיעור + הגשה + AI review
- `/student/assignments` — כל המטלות
- `/student/quiz/:lessonId` — חידון
- `/student/messages` — שליחת הודעה למורה

---

## דפים חשובים — פרטים

### Teacher — LessonDetailPage `/teacher/lessons/:id`
- Layout: grid רב-עמודות ברוחב `max-w-6xl` — עמודה ראשית (תוכן שיעור + מטלות/הגשות + תוצאות חידון) לצד עמודת גישה חריגה
- פאנל עליון: תוכן שיעור + Markdown + קבצים
- פאנל אמצעי: טאבים לפי מטלה → טבלת הגשות
- כל שורה: שם תלמידה | סוג הגשה (📎/🔗/לא הוגש) | תאריך | איחור | ציון | כפתור "בדוק"
- **חידון:** כרטיס סיכום בלבד (טיוטה/פורסם, מספר שאלות, כמה ענו) + כפתור לדף `/teacher/quiz/:lessonId`. העורך והדשבורד **לא** יושבים כאן

### Teacher — QuizPage `/teacher/quiz/:lessonId`
- **QuizPanel** — "צרי בוחן בעזרת AI" (רק כשאין בוחן ויש `contentMd`), עם checkbox אופציונלי "כללי גם את הקבצים המצורפים" (מוצג רק כשיש קבצים בשיעור, כברירת מחדל כבוי), עריכת שאלה/אפשרויות/תשובה נכונה, `פרסמי לתלמידות` / `החזירי לטיוטה`. פרסום חסום כל עוד יש שינויים לא שמורים
- **QuizDashboard** — אריחי סיכום (כמה ענו, ממוצע, השאלה הקשה ביותר) + שורה לכל שאלה מסודרת מהחלשה, עם פילוח כמה בחרו בכל אפשרות + טבלת ציונים
- **צבע:** אין קידוד בצבע. הפלטה של הפרויקט נמוכת-רוויה ו-sage↔coral נכשלים בבדיקת עיוורון-צבעים (ΔE 14.4 מול רף 15). כל העמודות בגוון אחד, האורך נושא את הגודל, והנכונות מסומנת ב-✓, במילים ובמספר מודפס
- Modal בדיקה: קישור לקובץ/GitHub | checklist | שני שדות ציון (submissionScore + contentScore) | feedback Markdown | כפתור "אשר AI" | **כפתור "החזר לציון AI"** (contentScore=aiScore ללא בקשה חדשה) | **כפתור "אפשרי בדיקת AI נוספת"** (`aiExtraAllowed=true`) | **טוגל "הצגי הערות קוד"** (aiCodeReview, מוסתר כברירת מחדל) | **כפתורי שמירה**: "שמור ציון" (בלבד) מול "שמרי ואשרי לתלמידה" (שומר + מאשר `contentApproved` + שולח מייל) | תגית מצב אישור ליד שדה contentScore
- **AssignmentSubmissionsTable** — checkbox לכל שורה שיש לה `contentScore` וטרם `contentApproved`, checkbox "בחר הכל", וכפתור פעולה מרוכזת "אשרי ושלחי ציונים נבחרים" (קורא ל-`bulk-approve-content`)

### Student — LessonDetailPage `/student/lessons/:id`
- Layout: `max-w-5xl`, grid — עמודת קריאה (תוכן/GitHub/קבצים/חידון) לצד עמודת מטלות כשיש מטלות; שיעור בלי מטלות נשאר טור יחיד
- תוכן שיעור + assignments
- כל assignment: checklist לסימון | textarea הערות | הגשה (קובץ/repoName)
- אחרי הגשה: **ציון הגשה** מיידי (submissionScore)
- בלוק AI (רק אם יש githubUrl):
  - "בקשי בדיקת AI" → "בודק..." → "נבדק ✓"
  - aiCodeReview: מוצג מיד כשסיים
  - aiScore + aiVerbalReview: מוצגים **רק אחרי aiApproved=true**
  - **הגיעה למגבלת בדיקות** (השרת מחזיר `'AI review limit reached'`) → UI מציע לשלוח הודעה למורה לבקש בדיקה נוספת (זהה בעיצוב לבקשת הגשה מאוחרת)
- כפתור "בקשי אישור הגשה מאוחרת" → שולח TeacherMessage עם assignmentId

### Teacher — MessagesPage `/teacher/messages`
- רשימה newest first: שם תלמידה | תוכן | תאריך | "סמני כנקראה" | כפתור מחיקה (מוחק שיחה שלמה, עם confirm)
- אם יש assignmentId → Badge "בקשת הגשה"
- לחיצה על שורה פותחת **Dialog overlay** (צף מעל הכל) עם ההודעה המלאה + תגובה קיימת + טופס תגובה; בתוך ה-Dialog: כפתור מחיקת תגובה בלבד, וכפתור מחיקת השיחה כולה
- Badge ספירה ב-sidebar (polling כל דקה, `GET /messages/unread-count`)

### Student — MessagesPage `/student/messages`
- textarea + "שלחי" — הודעה כללית למורה
- רשימת ההודעות שהיא שלחה: לחיצה על שורה פותחת אותו **Dialog overlay** כמו אצל המורה (עקביות UX) — ההודעה + תגובת המורה (אם יש) + Badge "בקשת הגשה" אם רלוונטי + כפתור מחיקה (רק הודעה שלה)
- נקודה אדומה על שורה עם תגובה שלא נפתחה עדיין (`replySeen=false`); נפתחת → `PATCH /messages/:id/reply-seen`
- חיפוש מקומי בדפי Home/Assignments (state מקומי בעמוד, לא global store)

### Teacher — ReportsPage `/teacher/reports`
- פילטרים: קבוצה + קורס
- טבלה: student | group | course | lesson | assignment | deadline | submitted | late | **submissionScore** | **contentScore** | feedback
- כפתור ייצוא Excel
- **פאנל AI Usage:** totalReviews | totalQuizzes | totalCostUsd | גרף 30 יום

---

## Components חשובים
- `AuthGuard` — redirect לlogin אם לא מחובר
- `AdminGuard` — redirect אם לא ADMIN
- `ChangePasswordGuard` — חסום כל routes אם mustChangePassword=true
- `TeacherLayout` — אותה מבנה בדיוק כמו `StudentLayout` (icon rail בצד ימין, אותו header גובה 16, mobile nav, footer): sidebar עם nav + badge הודעות לא-נקראות
- `StudentLayout` — header + nav עם "הודעה למורה" + badge תגובות לא-נקראות (נקודה אדומה על האייקון, `GET /messages/unread-replies-count`)
- `MarkdownRenderer` — react-markdown + DOMPurify
- `FileUpload` — dropzone
- `FileGallery` — רשת קבצים + **תצוגה מקדימה על כל המסך** (`DialogContent size="full"`).
  - סוג הקובץ נקבע מ-`file.extension` שה-API שולח, **לא** משם התצוגה (שנשמר בלי סיומת).
  - `file.url` הוא נתיב יחסי ל-`/files/download/:id?token=…`; `resolveFileUrl` מוסיף
    את `API_URL`, ו-`dl=1` הופך את זה להורדה.
  - תמונה/וידאו/אודיו/PDF מוצגים ישירות; Office דרך `docs.google.com/gview`;
    `txt`/`md` נקראים ב-`fetch` ומוצגים כטקסט. archive ו-other → הצעת הורדה.

## Sidebar Nav — מורה
```
לוח בקרה | ציונים | ייצוא Excel | הודעות (badge)
```

## Axios Interceptor — חשוב!
```typescript
// כשרענון token נכשל:
if (window.location.pathname !== '/login') {
  window.location.href = '/login';
}
// חסר את הבדיקה הזו → לולאת רענון אינסופית!
```

## React Query Config
```typescript
retry: (failureCount, error) => {
  if (error?.response?.status === 429 || error?.response?.status === 401) return false;
  return failureCount < 1;
},
staleTime: 1000 * 60 * 5,
refetchOnWindowFocus: false,
```
