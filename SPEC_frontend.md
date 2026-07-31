# Frontend Spec — Homework Submission System

## Tech Stack
React 18 + TypeScript + Vite + TailwindCSS 3 + shadcn/ui + Zustand + React Query v5 + Axios

## Design System
- **Sidebar:** `#1A1830` (כהה) + תוכן `#F8F7FC` (בהיר)
- **Accent:** `#C2185B` (magenta) → `#7C3AED` (violet) gradient
- **RTL:** `dir="rtl" lang="he"` על `<html>`
- **Font:** Inter

### צבעים חשובים
```
Sidebar bg: #1A1830 | Sidebar text: #A89BC2 | Active: rgba(194,24,91,0.12)
Page bg: #F8F7FC | Cards: #FFFFFF | Border: #EEEBF5
Primary: #C2185B | Secondary: #7C3AED
```

### כפתורים
- Primary: `bg-gradient-to-br from-[#C2185B] to-[#7C3AED] text-white rounded-lg`
- Ghost: `border border-[#E5E7EB] bg-white text-[#6B7280] rounded-lg`

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
- **תוצאות חידון:** כרטיס נפרד (מוצג רק אם קיים חידון לשיעור) — טבלת תלמידה/ציון/תאריך, מ-`GET /lessons/:id/quiz/results`
- Modal בדיקה: קישור לקובץ/GitHub | checklist | שני שדות ציון (submissionScore + contentScore) | feedback Markdown | כפתור "אשר AI" | **כפתור "החזר לציון AI"** (contentScore=aiScore ללא בקשה חדשה) | **כפתור "אפשרי בדיקת AI נוספת"** (`aiExtraAllowed=true`) | **טוגל "הצגי הערות קוד"** (aiCodeReview, מוסתר כברירת מחדל)

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
