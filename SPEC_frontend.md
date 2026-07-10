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
- פאנל עליון: תוכן שיעור + Markdown + קבצים
- פאנל תחתון: טאבים לפי מטלה → טבלת הגשות
- כל שורה: שם תלמידה | סוג הגשה (📎/🔗/לא הוגש) | תאריך | איחור | ציון | כפתור "בדוק"
- Modal בדיקה: קישור לקובץ/GitHub | checklist | שני שדות ציון (submissionScore + contentScore) | feedback Markdown | כפתור "אשר AI" | **כפתור "החזר לציון AI"** (contentScore=aiScore ללא בקשה חדשה)

### Student — LessonDetailPage `/student/lessons/:id`
- תוכן שיעור + assignments
- כל assignment: checklist לסימון | textarea הערות | הגשה (קובץ/repoName)
- אחרי הגשה: **ציון הגשה** מיידי (submissionScore)
- בלוק AI (רק אם יש githubUrl):
  - "בקשי בדיקת AI" → "בודק..." → "נבדק ✓"
  - aiCodeReview: מוצג מיד כשסיים
  - aiScore + aiVerbalReview: מוצגים **רק אחרי aiApproved=true**
- כפתור "בקשי אישור הגשה מאוחרת" → שולח TeacherMessage עם assignmentId

### Teacher — MessagesPage `/teacher/messages`
- רשימה newest first: שם תלמידה | תוכן | תאריך | "סמני כנקראה"
- אם יש assignmentId → קישור למטלה הרלוונטית
- Badge ספירה ב-sidebar (polling כל דקה)

### Student — MessagesPage `/student/messages`
- textarea + "שלחי" — הודעה כללית למורה

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
- `TeacherLayout` — sidebar עם nav + badge הודעות
- `StudentLayout` — header + nav עם "הודעה למורה"
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
