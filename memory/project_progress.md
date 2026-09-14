# התקדמות הפרויקט

> קובץ זה עוקב אחרי מה שהושלם ומה שנשאר. יש לעדכן אותו בסוף כל שיחה שבה נעשתה עבודה.

## 2026-09-15 — אבטחה + ארכיטקטורה + Tailwind + cold start (branch feature/security-architecture-fixes → מוזג ל-main, קומיט `cb59c85`)

**בקשה מקורית:** לתקן בעיית Tailwind דינמית ב-`HomePage.tsx` של התלמידה, כל בעיות האבטחה והארכיטקטורה שסומנו קודם, ולתקן שתי תופעות cold-start ב-Render (איטיות מדי פעם + כניסה ראשונה אחרי הפסקה נכנסת לדף "מתעורר" של Render במקום ל-OAuth).

### אבטחה (קומיט `532147a`)
- **Multer DoS:** `multer.memoryStorage()` בלי `limits.fileSize` = כל קובץ שמישהו מעלה נטען שלם לזיכרון התהליך. נוסף `backend/src/middleware/upload.ts` עם קונפיג מדורג (`uploadAttachment` 25MB, `uploadImport` 5MB), וכל ה-routes (`courses`, `lessons`, `groups`, `assignments`, `submissions`) עברו להשתמש בו. `app.ts` מטפל ב-`MulterError`/`LIMIT_FILE_SIZE` → 413 לפני ה-500 הגנרי.
- **Zip-bomb:** `extractZipCode` (ב-`code-extraction.ts`) בדק את הגודל המפוענח **אחרי** `.getData()` — מאוחר מדי. תוקן לבדוק `entry.header.size` (מטא-דאטה מה-central directory של הזיפ, לא דורש לפענח) **לפני** קריאת התוכן.
- **JWT_SECRET חלש:** `jwt.ts` הסתמך על `process.env.JWT_SECRET!` — מספק ל-TypeScript אבל לא בודק שום דבר בזמן ריצה. נוסף `requireStrongSecret()` שזורק שגיאה עם עליית השרת אם המשתנה חסר, קצר מ-16 תווים, או ערך placeholder נפוץ (`secret`, `changeme`, `password`, `test`, `123456`). אומת מול `tests/setup.ts` שהערכים שם (17-19 תווים) עוברים את הבדיקה.

### ארכיטקטורה (קומיטים `331ebdd`, `0b97309`)
- **Tailwind דינמי ב-`student/HomePage.tsx`:** `` `bg-${accent}` `` הוחלף במפה סטטית `ACCENT_CLASSES: Record<accent, {...}>`. **הערה חשובה:** `tailwind.config.ts` כבר הכיל `safelist` עם regex שמכסה בדיוק את הצירופים האלה — כלומר זה לא היה באג פרודקשן פעיל, אבל המפה הסטטית עדיין עדיפה (מפורשת יותר, לא תלויה בתחזוקת ה-safelist).
- **`teacher/CourseDetailPage.tsx`:** רשימת השיעורים הייתה ריבועים ממוספרים עם שם רק ב-hover; הוחלפה לשורות ברוחב מלא (עיגול ממוספר + נושא + תאריך + מס' הגשות + חץ), header עטוף ב-`Card`, נוספה שורת סטטיסטיקה (מס' תלמידות/שיעורים/אחוז השלמה, מחושב מצד הלקוח מנתוני `LessonSummary` הקיימים — אין endpoint חדש).
- **`teacher/LessonDetailPage.tsx`:** תיאור מטלה/דדליין/הנחיות AI היו פסקה רצופה אחת; הוחלפו ל-`<dl>` מובנה עם `dt`/`dd`.
- **`TeacherLayout.tsx`:** ה-sidebar הדסקטופי היה אייקונים בלבד (`w-16`) עם tooltip ב-hover; הורחב ל-`w-40` עם תוויות טקסט גלויות ליד כל אייקון.
- **`student/LessonDetailPage.tsx`:** header ידני הוחלף ברכיב המשותף `PageHeader` (כבר קיים ב-`components/ui/page-header.tsx`).
- **`SPEC_frontend.md`:** תוקן section "Design System" שתיאר פלטה ישנה (sidebar כהה + גרדיאנט מגנטה-סגול, פונט Inter) שמעולם לא תאמה למימוש בפועל. עודכן לפלטת "קליק כיתה" האמיתית (ground/sheet/ink/rule/clay/coral/sage/indigo/butter, פונט Heebo) + הערת עיוורון-צבעים (sage↔coral נכשל ΔE) + הערת ה-safelist.

### Cold start / OAuth (קומיט `d3ffb33`)
**שורש הבעיה:** ניווט מלא (`window.location.href`) ישירות לשרת שעלול להיות רדום נקלט על ידי דף ה"מתעורר" של Render עצמו, במקום להמשיך ל-OAuth של גוגל/גיטהאב. זה גם ההסבר לשתי התלונות (איטיות + כניסה ראשונה נכשלת) — אותה סיבת שורש.
**התיקון:** `LoginPage.tsx` — לפני הניווט ל-`/auth/:provider`, מבצע `wakeBackend()`: פולינג על `/api/health` (לא תלוי DB/auth) כל 1.5 שניות עד 20 שניות, עם מצב UI "מעירה את השרת… זה עלול לקחת עד כ-20 שניות" על שני הכפתורים.
**לא שונה:** `.github/workflows/keep-alive.yml` (cron שמפעיל כל 10 דק' רק בחלונות שעות מסוימים, כדי לא לחרוג ממכסת 750 שעות/חודש של Render Free) — נשאר כמו שהיה. **פתוח לדיון עם המשתמשת:** האם להדק את המרווח, תלוי אם הריפו פרטי (משפיע על תקציב דקות Actions) — לא ניתן היה לאמת (`gh` CLI לא מותקן בסביבה).

### בדיקות
- `npx tsc --noEmit` (פרונט) ו-`eslint` על כל הקבצים שנערכו — עברו נקי.
- `npx vitest run` (בק): **9 כשלים קיימים מראש** ב-`courses/email/grades/groups/quizzes/submissions.service.test.ts`, קשורים ל-logic של `contentScore`/`contentApproved` (מקומיט `5990966`). אומת עם `git stash` + הרצה חוזרת — **רשימה זהה** עם/בלי השינויים של השיחה הזו → לא רגרסיה, לא טופל (מחוץ לסקופ).

### תיעוד חסר שהתגלה (מתייחס לשיחה הקודמת, קומיט `cea75cd`)
פיצ'ר checkbox "כללי גם את הקבצים המצורפים" ביצירת בוחן ב-AI (QuizPanel, מוצג רק כשיש קבצים בשיעור, כבוי כברירת מחדל) מעולם לא תועד כאן. מתועד כעת בדיעבד.

## 2026-09-14 (המשך) — תוקן: "נסי שוב" בחידון, ניסיון רשמי מול תרגול + היסטוריה

**דיווח:** "בחידון יש אפשרות של נסי שוב, אבל זה לא עובד. בכלל אמורה להיות אפשרות לנסות שוב אבל רק ללימוד התלמידה ולא לשינוי ציון (שהיא תוכל לראות נסיונות לעצמה)".

**שורש הבעיה (אומת בקוד):** `QuizAttempt` היה `@@unique([quizId, studentId])` ו-`submitQuizAttempt` עשה `upsert` — כל ניסיון חוזר **דרס** את הניסיון הקודם, בלי שום היסטוריה. כפתור "נסי שוב" ב-`QuizPage.tsx` היה קיים רק במסכי שגיאה/unavailable — **לא במסך תוצאה** (שם אין שום כפתור, רק "חזרה לשיעור").

**נבדק מול `SPEC_business_rules.md` (לפי הנחיית המשתמשת לא לסטות מהאפיון בלי לבדוק):** שורה 37 תיעדה את הדריסה **כהתנהגות מכוונת** ("מחליף ניסיון קודם"), לא כבאג. המשתמשת ביקשה לשנות את זה במפורש — זו תוספת/שינוי מבוקש ומאושר, לא סטייה לא-מורשית. עודכן האפיון בהתאם (ראה למטה).

**התיקון:**
- `schema.prisma::QuizAttempt` — הוסר ה-`@@unique`, הוחלף ב-`@@index([quizId, studentId])`; נוסף `isOfficial Boolean @default(true)`.
- `quizzes.service.ts::submitQuizAttempt` — הוחלף ה-`upsert` ב-`findFirst` (יש כבר ניסיון רשמי?) + `create` תמיד (שורה חדשה בכל ניסיון). הניסיון **הראשון** של תלמידה בחידון נעול כרשמי (`isOfficial=true`) ולעולם לא נדרס; כל ניסיון אחרי זה נשמר בנפרד עם `isOfficial=false` (תרגול בלבד). התוצאה המוחזרת כוללת `isOfficial`.
- `quizzes.service.ts::getQuizResults` (תצוגת מורה) — הוסף `where: { isOfficial: true }` ל-`include.attempts`, כך שציוני/סטטיסטיקת הכיתה מבוססים רק על הניסיון הרשמי ולא מושפעים מתרגול.
- `quizzes.service.ts::getMyQuizAttempts` (חדש) — היסטוריית ניסיונות לתלמידה עצמה (`attemptNumber`, `score`, `takenAt`, `isOfficial`), ממוינת כרונולוגית.
- Route חדש: `GET /lessons/:id/quiz/attempts` (STUDENT בלבד) — `quizzes.routes.ts` + `quizzes.controller.ts::getMyAttempts`.
- Frontend (`QuizPage.tsx`): במסך התוצאה נוסף Badge שמבחין "ניסיון רשמי — הציון נשמר" מול "ניסיון תרגול — לא משפיע על הציון" (+ הסבר טקסט קצר כשזה תרגול), כפתור "נסי שוב (תרגול)" אמיתי שמאפס `result`/`answers` וחוזר לטופס השאלות, ורשימת "הניסיונות שלך" (מוצגת רק כשיש יותר מניסיון אחד) עם תג "רשמי" על השורה המתאימה. נוספו `myAttempts` ל-`quizzes.api.ts` ו-`QuizAttemptHistoryDTO`/`QuizAttemptHistoryItem` + `isOfficial` על `QuizAttemptResultDTO` ב-`types/index.ts`.
- `SPEC_business_rules.md` שורה 37 עודכנה לשקף את ההתנהגות החדשה (ניסיון ראשון=רשמי לצמיתות, ניסיון חוזר=תרגול נפרד, תלמידה רואה היסטוריה).

**אימות:** `npx prisma generate` הורץ (חובה אחרי שינוי schema, לפני `tsc`) — `tsc --noEmit` נקי בבאק־אנד ובפרונט. `vitest run quizzes` — עודכנו הטסטים הרלוונטיים ל-`findFirst`/`create` החדשים (כולל 2 טסטים חדשים: נועל ניסיון ראשון כרשמי / ניסיון חוזר לא-רשמי ולא נוגע ברשמי) — **44/45 עוברים**; הכשל היחיד שנותר (`reports a failed generation...`) **לא קשור לשינוי הזה** — פערי טקסט הודעת שגיאה שנוצר ממיזוג קומיט קודם של תהילה (`eda7960`), לא נגעתי בקוד הזה. לא בוצעה בדיקת דפדפן חיה — צריך migration שעדיין לא רץ (ראה למטה) כדי שהשרת המקומי יעבוד מול השינוי.

**⚠️ נדרשת פעולה מהמשתמשת — migration עדיין לא רץ:** יש להריץ, מתיקיית `backend`, ב-PowerShell מהמחשב (לא Docker, לפי ה-workaround המתועד של תעודות נטפרי):
```
$env:DATABASE_URL = "postgresql://user:pass@localhost:5432/homework_db"; npx prisma migrate dev --name quiz_attempt_official
```
(להחליף `user:pass@localhost:5432/homework_db` בפרטי החיבור האמיתיים מ-`.env`).

**נשאר לעשות (מאותה שיחה, טרם טופלו בקוד):**
- "יומן בדיקה" נגיש רק מהדף הראשי, לא מתוך קורס ספציפי — צריך קישור ישיר מ-`CourseDetailPage.tsx`.
- פיצ'ר "אישור ושליחת ציון": כרגע אין מנגנון אישור כללי לציון תוכן על הגשות שאינן AI — `aiApproved` מוגבל לזרימת AI בלבד, ציון תוכן שהוזן ידנית לא יכול להיחשף לתלמידה. המשתמשת אישרה שרק `contentScore` ייחסם מאחורי אישור (לא `submissionScore`, לפי האפיון). צריך: כפתור אישור כללי ב-`GradeModal.tsx` (לא מותנה ב-`aiStatus==='done'`), אישור-מרוכז (בחירת מספר הגשות) ב-`AssignmentSubmissionsTable.tsx` + endpoint bulk, ומייל התראה חדש (BullMQ `emailQueue`, בדומה ל-`teacher-reply`).
- "למה אין טאב קורסים נפרד לתלמידה" — נבדק, **לא באג**: קורסים משולבים בדף הבית של התלמידה בכוונה, לא נעדרים. לא בוצע שינוי.
- "שיעור מוסתר עדיין מציג כפתור" — נבדק בקוד, **לא משוחזר**: הן `lessons.service.ts` והן `courses.service.ts` מסננים שיעורים מוסתרים בצד שרת, ויש גם בדיקת הגנה ב-`access.ts`. סביר שמדובר בקאש ישן בצד לקוח, לא בבאג לוגי — לא בוצע שינוי בקוד תקין.
- keep-alive/GitHub Actions cron לא אמין (מהשיחה הקודמת) — עדיין ממתין להחלטת המשתמשת על שירות ping חיצוני.
- 2 סוכני ארכיטקטורה על עיצוב/פריסה של כל העמודים — טרם הופעלו/הושלמו בשיחה הזו.
- אבטחה (URL חתום ללא `expires_at`, redirect endpoint, multer limits, zip-bomb reorder, JWT_SECRET check) — **עדיין נדחה במפורש** לפי בקשת המשתמשת.

**לא נדחף עדיין** — ממתין ל-migration של המשתמשת ולהחלטה אם להמשיך ישר לפיצ'ר האישור לפני commit, או לדחוף את תיקון החידון בנפרד.

---

## 2026-09-14 — תוקן: קבצים לא-תמונה (docx/xlsx/zip) לא נצפים/מורדים

**דיווח מחברה שבדקה את המערכת:** "הבחנים עובדים מצוין... א"א לראות או להוריד את הקבצים המועלים מלבד קבצי תמונה."

**שורש הבעיה (אומת בקוד, לא בפרודקשן — אין גישה לדשבורד Cloudinary):** `uploadBuffer()` ב-[storage.ts](../backend/src/utils/storage.ts) מעלה עם `resource_type: 'auto'` — Cloudinary מסווג תמונות (וגם PDF) כ-`image`, אבל **docx/xlsx/pptx/zip כ-`raw`**. מאז 2025 Cloudinary **חוסמת כברירת מחדל** גישה ציבורית-לא-חתומה ל-`raw` (ול-PDF לא-מסומן) — כל `secure_url` גולמי מחזיר 401. ה-frontend ([file-gallery.tsx](../frontend/src/components/ui/file-gallery.tsx)) היה תקין לגמרי — הבעיה הייתה רק ב-URL שחוזר מהשרת.

**המשתמשת בחרה (מתוך 3 אופציות שהוצגו):** "מה מומלץ?" — הומלץ ויושם **שינוי קוד** (URL חתום, sign_url) על פני הגדרת דשבורד Cloudinary ("Allow delivery of PDF and ZIP files"), כי היא ביקשה גם שזה יעבוד חלק **וגם** שהקבצים לא יהיו חשופים ברשת ללא הרשאה — הגדרת הדשבורד הייתה חושפת את כל קבצי ה-raw/PDF בציבור.

**התיקון:** פונקציה חדשה `toDeliveryUrl()` ב-storage.ts — משחזרת `public_id`/`resource_type`/`format` מה-URL הגולמי השמור (לא משנה מה שמור ב-DB), ומייצרת URL חתום טרי בכל קריאה דרך `cloudinary.url(..., { sign_url: true })`. יושם בכל נקודות היציאה ל-API: `toFileDTO` (קבצי שיעור/קורס, גם [lessons.service.ts](../backend/src/services/lessons.service.ts) וגם [courses.service.ts](../backend/src/services/courses.service.ts)), `submissions.service.ts` (3 מקומות: `getStudentAssignments`, `getSubmissionById` לשני התפקידים), `assignments.service.ts::getAssignmentSubmissions` (דוח הגשות למורה). **בונוס — נמצאה ותוקנה תקלה קשורה שלא דווחה:** [ai-review.worker.ts](../backend/src/workers/ai-review.worker.ts) הוריד קבצי zip/docx של תלמידות לבדיקת AI ישירות דרך `fetch(submission.fileUrl)` הגולמי — גם זה היה נכשל ב-401 על כל הגשה שאינה תמונה, כלומר **בדיקת AI על הגשות docx/zip הייתה שבורה בשקט** לפני התיקון.

**אימות:** `tsc --noEmit` נקי (backend). `vitest run` — עודכן טסט אחד (`getSubmissionById` ADMIN, `toBe`→`toMatchObject` כי הפונקציה עכשיו תמיד מחזירה עותק חדש עם `fileUrl` חתום ולא את ה-reference המקורי — שינוי התנהגות מכוון). 268/274 עוברים; 6 הכשלים שנותרו **אומתו כקיימים-מראש** (courses/email/grades/groups/quizzes) — נבדק עם `git stash` שהם נכשלים גם על הקוד המקורי, כולל אחד (`courses.service`) שלא היה ברשימת "5 הכשלים" הידועה, ואומת שהוא נכשל בבידוד גם ללא השינוי (mock סדר-תלוי, לא regression).

**⚠️ לא אומת מול Cloudinary אמיתי** (אין credentials/רשת בסביבת הסוכן) — צריך בדיקה ידנית בפרודקשן/staging: להעלות קובץ docx/zip לשיעור או הגשה, לוודא שהצפייה/הורדה עובדת ושה-URL בתגובת ה-API מכיל `s--...--` (חתימה).

**נשאר לעשות:**
- **לבדוק בפועל** (דפדפן, אחרי דיפלוי) שההורדה/צפייה בקבצי docx/xlsx/zip עובדת.
- **לבדוק שבדיקת AI על הגשות zip/docx עובדת** אחרי התיקון (הייתה שבורה בשקט קודם).
- ⚠️ **פרצה שנמצאה ע"י סוכן אבטחה (טרם תוקנה):** ל-`toDeliveryUrl()` אין `expires_at` — ה-URL החתום תקף **לצמיתות**, כלומר מי שתפס אותו יכול לגשת לקובץ תמיד, לא רק לזמן קצר. צריך להוסיף `expires_at` קצר (60-120 שניות) כתיקון מיידי, ובנוסף לבנות endpoint משלנו (`GET /api/files/:type/:id`) שעושה 302 redirect אחרי בדיקת הרשאה אמיתית (authn+authz דרך `verifyAccessTokenMiddleware`+`getSubmissionById`/`assertLessonAccess`/`assertCourseAccess` הקיימים) — כרגע כל מי שמחזיק את ה-URL הגולמי נכנס בלי שום בדיקה מול המערכת שלנו. **המשתמשת ביקשה לדחות את זה לשיחה הבאה** ("תזכיר בהמשך").

**דווח בשיחה זו (המשך אותה שיחה, 2026-09-14) — עוד 3 נושאים:**

1. **תוקן:** דוח ציונים (`/teacher/reports`, `ReportsPage.tsx`) היה **טבלה read-only בלבד** — אין שום דרך ללחוץ ולפתוח הגשה ספציפית לבדיקה/ציון/AI review, למרות שזה בדיוק המסך שנקרא "ציונים" בתפריט וזה איפה שמורה מצפה לבדוק הגשה. ה-UI האמיתי לבדיקה (`GradeModal`) קיים רק בתוך `teacher/LessonDetailPage.tsx` דרך שיעור→מטלה→`AssignmentSubmissionsTable`. **תוקן:** נוסף כפתור "בדיקה" לכל שורה בדוח שמנווט ל-`/teacher/lessons/:lessonId?assignmentId=...&submissionId=...`; `LessonDetailPage` קורא את הפרמטרים, בוחר את המטלה הנכונה, ומעביר `autoOpenSubmissionId` ל-`AssignmentSubmissionsTable` שפותח את `GradeModal` אוטומטית ברגע שההגשה נטענת (ref שמונע פתיחה חוזרת). דרש הוספת `submissionId`/`lessonId`/`assignmentId` ל-`ReportRow` וללולאת המיפוי ב-`grades.service.ts::getReport` (השדות כבר נטענו דרך `include`, רק לא הוחזרו). `tsc --noEmit` נקי בשני הצדדים.

2. **תוקן:** `DevSignature.tsx` — שתי המפתחות הוצגו עם roles שונים ("Backend Engineer"/"Frontend Engineer"); שונה לשתיהן ל-"Developer" אחיד. אנימציית ה-typewriter (`globals.css`, `.dev-signature-text`) הייתה `forwards` (רצה פעם אחת, נעצרת בסוף, דורשת רענון דף כדי לרוץ שוב) — שונתה ל-`infinite` עם keyframes שמקלידות, עוצרות (קריא), מוחקות, עוצרות ריק, וחוזרות בלולאה.

3. **אובחן (טרם תוקן — מחכה להחלטת המשתמשת):** תלונה "כל פעם שאני מתחברת כתוב שהשרת מתעורר, למרות שהוא אמור להיות ער". **נבדק בפועל מול GitHub API:** ל-`.github/workflows/keep-alive.yml` יש cron של כל 10 דקות בחלון שעות פעיל (04:00-20:59 UTC רוב הימים) — אבל **בפועל הוא לא רץ כל 10 דקות**: נבדקו 30 הרצות אחרונות (`GET /repos/.../actions/workflows/keep-alive.yml/runs`) והפער בין הרצות הוא **2-12 שעות**, לא 10 דקות. זה תואם תיעוד ידוע של GitHub Actions: cron מתוזמן הוא "best-effort" ומתעכב/נזרק משמעותית ב-repos בפעילות נמוכה — **גם ב-repo ציבורי**, לא רק בגלל מכסת דקות של repo פרטי. **המסקנה: ה-keep-alive הנוכחי לא אמין**, ולכן Render כן נרדם בפועל גם בתוך "שעות הפעילות" המוגדרות, וכל התחברות אחרי פער כזה נתקלת ב-cold start אמיתי (לא false positive של הבאנר — הבאנר עובד נכון, השרת באמת ישן).
   - **המלצה שהוצגה למשתמשת:** להחליף (או להוסיף כגיבוי) שירות ping חיצוני ייעודי (UptimeRobot / cron-job.org) שפונה ל-`https://homework-system-3haq.onrender.com/api/health` כל 5-10 דקות — שירותים כאלה בנויים ספציפית למרווחים אמינים, בניגוד ל-cron של GitHub Actions. **לא בוצע** — דורש יצירת חשבון בשירות חיצוני, וזו פעולה שהמשתמשת צריכה לעשות בעצמה (לא פעולה שסוכן AI יכול/צריך לבצע). **המשתמשת ביקשה לדחות גם את זה** ("תדחוף... וחכה עם האבטחה" התייחס לפרצת ה-URL, אבל נושא ה-keep-alive עדיין פתוח ולא סוכם מפורשות).
   - **הופעלו 2 סוכני ארכיטקטורה ברקע** (טרם חזרו בזמן כתיבת שורות אלה) לבדוק פריסה/עיצוב של **כל** העמודים (מורה+תלמידה) מול פרקטיקות מקובלות — ראה תוצאות בהמשך הקובץ כשיעודכנו.

**קומיט:** התיקון המקורי (toDeliveryUrl) + 3 התיקונים החדשים למעלה **נדחפו יחד** בקומיט נפרד (ראה `git log`) — לא כולל את שאר הקבצים שהיו כבר ב-working tree לפני השיחה הזו (controllers/services/frontend pages אחרים, `.env.example`, `SPEC_business_rules.md`) — אלה עדיין ממתינים, לא נגעתי בהם.

---

## 2026-09-08 — Supabase השתעה (עצמאית מ-Render), פיצ'ר AI שבור בפרודקשן + 3 באגים נוספים תוקנו

**רקע:** האתר חזר לעבוד אחרי איפוס מכסת ה-bandwidth של Render (חודש חדש), אבל התגלה **גורם השעיה שני, עצמאי לגמרי**: **פרויקט Supabase (Postgres) בתוכנית החינמית נכנס למצב Paused** מחוסר פעילות (מכסה נפרדת לגמרי מ-Render). זה גרם ל-loop אינסופי של נסיונות migration ב-Render עם `FATAL: (ENOTFOUND) tenant/user ... not found`. **המשתמשת שחזרה את הפרויקט ידנית** בדשבורד של Supabase — אחרי זה ה-deploy הבא הצליח מיד. **לקח:** כשה-DB הוא Supabase free-tier, יש **שתי** מכסות עצמאיות שיכולות להשעות את האתר (Render bandwidth/hours + Supabase project pause) — כדאי לבדוק את שתיהן באבחון עתידי, לא רק את Render.

**🐛 באג אמיתי שנמצא בבדיקת "כל הפיצ'רים": פיצ'ר ה-AI כולו שבור בפרודקשן.** ניסיון ליצור בוחן AI (`/teacher/lessons/:id/quiz/new`) נכשל עם `Gemini API error: 404 — the model "gemini-2.0-flash" is not available`. **שורש הבעיה:** משתנה הסביבה `GEMINI_MODEL` ב-Render היה מוגדר ידנית ל-`gemini-2.0-flash` (גוגל הוציאה אותו משימוש), **דורס** את ברירת המחדל בקוד. גוגל עצמה המליצה ב-הודעת השגיאה על `gemini-3.6-flash`. **תוקן בקוד** (ברירת המחדל ב-[gemini.service.ts](../backend/src/services/gemini.service.ts) ובכל קבצי `.env.example`/מפרט) — **אבל עדיין צריך לעדכן ידנית את `GEMINI_MODEL=gemini-3.6-flash` ב-Environment Variables של Render** (המשתמשת טרם אישרה שעשתה זאת). זה משפיע גם על **בדיקת AI של הגשות תלמידות** — שני הפיצ'רים חולקים את אותו `GEMINI_MODEL`/`callGemini`.

**הבהרה על ה-UI:** בדיקת AI על הגשה **מופעלת ע"י התלמידה** (`POST /submissions/:id/request-ai-review`, `requireRole('STUDENT')` בכוונה) — **אין ואסור שיהיה** כפתור "הרץ בדיקת AI" בצד המורה; המורה רק מאשר/מאפשר-נוסף/מחזיר לציון AI קיים (ב-`GradeModal.tsx`). זה עיצוב מכוון, לא באג.

**עוד 2 באגים תוקנו (זוהו לפני התיקון, לפי דרישת המשתמשת "עדכני לפני שינויים"):**
1. **שמות קבצים בעברית → ג'יבריש (`×××.png`).** Multer מפענח `filename` מרובה-חלקים כ-latin1 כברירת מחדל. תוקן: פונקציה חדשה `fixMulterFilename()` ב-[storage.ts](../backend/src/utils/storage.ts) (latin1→utf8), מופעלת ב-3 הקונטרולרים שקוראים `req.file.originalname` (`submissions`, `lessons`, `courses`). אומת (ע"י סוכן) שאין מקום נוסף שקורא originalname, ושראוטים של ייבוא Excel (`groups`/`assignments`/`submissions` import) לא חשופים כי הם קוראים רק buffer, לא originalname.
2. **"0MB מתוך 0MB" ב-`/teacher/ai-usage`.** שורש: Cloudinary Admin API על תוכניות מבוססות-קרדיטים (free tier נוכחי) **לא מחזיר `storage.limit`** בכלל (רק `credits.limit`/`credits.used_percent`), ושם השדה לבייטים הוא `storage.usage`, לא `storage.used_bytes` (אומת מול תיעוד/מאמרי-עומק של Cloudinary דרך WebSearch). תוקן ב-[ai-usage.service.ts](../backend/src/services/ai-usage.service.ts) וב-[storage-check.ts](../backend/src/workers/storage-check.ts) — `usedBytes` מ-`storage.usage`, `limitBytes` נגזר מ-`credits.limit * 1GB` כשאין `storage.limit` ישיר, `percent` מ-`credits.used_percent`.

**אחידות עיצוב מורה/תלמידה — סבב שני (סוכן ארכיטקטורה נפרד):** אחרי שסוכן קודם תיקן גריד 2→3 עמודות ב-`CoursesPage.tsx` (להתאים ל-`GroupsPage`/`student/HomePage`), הופעל סוכן חדש שעבר על **כל** 18 העמודים תחת `teacher/`+`student/` וכל קומפוננטות ה-UI המשותפות. מצא ותיקן: כותרות `font-bold` שהיו צריכות להיות `font-black` (5 קבצים, לא עקביים עם `PageHeader` המשותף), `teacher/LessonDetailPage.tsx` היה היחיד בלי בלוק-כותרת `border-b` נפרד (היה בתוך Card, ראה [git diff](../frontend/src/pages/teacher/LessonDetailPage.tsx) — הועבר לפי התבנית של שאר עמודי הפרטים), badge-ספירה לא-עקבי ב-`ReportsPage` (הוחלף לספירה inline כמו בכל שאר הכרטיסים), `space-y-4` יחיד בשני עמודי הודעות (הוחלף ל-`space-y-5` הסטנדרטי). **לא נגע**: הבדל breakpoint ב-`AiUsagePage` מול `HomePage` (נשקל מכוון, לא drift), `EmptyState` לא-אחיד בכמה עמודי טופס (לא הפרת-דפוס אמיתית). `tsc --noEmit` נקי בשני הצדדים אחרי כל התיקונים.

**נשאר לעשות:**
- **המשתמשת צריכה לעדכן `GEMINI_MODEL=gemini-3.6-flash` ב-Render** (Environment Variables) — עד אז פיצ'ר ה-AI (בוחנים + בדיקת הגשות) עדיין שבור בפרודקשן.
- שום דבר מהתיקונים בשיחה הזו **לא בוצע commit/push** — הכל עדיין ב-working tree בלבד (frontend: 9 קבצים, backend: 6 קבצים, + 3 קבצי `.env.example`/מפרט). לתאם עם המשתמשת מתי לעשות commit ולפרוס.
- לא נבדק אם קיים migration תלוי (`prisma migrate`) — השינויים בשיחה הזו הם קוד בלבד, לא נגעו ב-schema.

---

## 2026-08-25 — השרת מושעה: אבחון (Render, לא רק Redis) + מיזוג ענק + תיקון bandwidth

**התסמין:** האתר לא עבד (`https://homework-system-3haq.onrender.com` מחזיר 503). המשתמשת שאלה גם "למה נגמרה המכסה, זה היה אמור להספיק".

**אבחון בשני שלבים — טעות ראשונה שתוקנה בעזרת המשתמשת:**
1. בהתחלה חשבתי שזו מכסת **750 שעות instance/חודש** (Render Free) שנגמרה בגלל `.github/workflows/keep-alive.yml` (פינג כל 10 דק' 24/7 מאז 24/07 — ראה [[git-workflow]]). זה תיקון אמיתי ונחוץ, **אבל לא היה הגורם בפועל** — המשתמשת בדקה בעצמה בדשבורד: 323.77/750 שעות, פחות ממחצית.
2. המשתמשת הדביקה את הודעת השגיאה האמיתית מ-Render: `"You've used the 5 GB of free bandwidth in your Hobby workspace"`. גיליתי (WebFetch על render.com/docs) ש-Render שינתה תוכניות ב-**23/04/2026** ("New Workspace Plans") — **הורידה את מכסת ה-bandwidth החינמית מ-100GB ל-5GB/חודש**. זו מכסה **נפרדת** מהשעות, וזו שגרמה בפועל להשעיה.
3. **אישור סופי מהדשבורד** (צילום מסך מהמשתמשת): `6.85GB/5GB` נוצל, מתוכו **`HTTP Responses` (תעבורה אמיתית למשתמשות) רק 4MB** — כל השאר (`Service-Initiated`, 6.85GB) זו תעבורה שה**שרת עצמו יוזם** כלפי שירותים חיצוניים.

**שורש ה-bandwidth — אומת בקוד:** `uploadBuffer()` ב-[storage.ts](../backend/src/utils/storage.ts) בונה את הקובץ כ-base64 (גדול ב-33%) ושולחת POST **מ-Render עצמו** ל-Cloudinary — זו בדיוק "Service-Initiated". רק זרימת **וידאו בהגשות** תוקנה ב-31/07 לעקוף את זה (upload ישיר מהדפדפן). קבצי **שיעור/קורס** (`lessons.service.ts`/`courses.service.ts`) עדיין עברו במלואם דרך Render — קובץ גדול אחד (מצגת/וידאו) יכול לבד להסביר את כל ה-6.85GB.

**✅ תוקן (קומיט נפרד `1e3811e`):** `lessons.service.uploadLessonFile`/`courses.service.uploadCourseFile` מקבלים עכשיו גם `{url,bytes,originalName}` (מדלגים על `uploadBuffer`), route חדש `POST /lessons(courses)/:id/upload-signature` (ADMIN, `createUploadSignature` הקיים), ו-`lessonsApi.uploadFile`/`coursesApi.uploadFile` בפרונט עברו ל-upload ישיר לדפדפן→Cloudinary (מראה זהה ל-`submitVideo`). **לא נגעתי** בהגשות לא-וידאו/ייבוא אקסל (groups/assignments/submissions) — קבצים קטנים, לא הגורם.

**✅ תוקן (קומיט נפרד ב-keep-alive.yml):** חלון שעות מוגבל (04:00-20:59 UTC ברוב הימים) **+ שינה מלאה בשבת** (שישי מ-04:00-12:59 UTC, שבת חוזר לפעילות רק ב-17:00 UTC — לפי בקשת המשתמשת) — מוריד משימוש כמעט-מקסימלי (~744 שעות) ל-~400-430 שעות/חודש. זה תיקון למכסת השעות (סיכון משני, לא הגורם להשעיה הפעם) — **לא נבדק עדיין אם 5GB יתאפס בעצמו בתחילת המחזור הבא, או אם צריך כרטיס אשראי/שדרוג ל-Pro (25GB) כדי להחזיר את השירות עכשיו**.

---

## מיזוג `origin/main` (26 קומיטים) ← `main` המקומי (קומיט `f14fb72`, רפקטורינג 16/08) — קומיט `7255f15`

git pull יצר קונפליקט ב-15 קבצים (local היה קומיט אחד מאחורי origin שהתקדם 26 קומיטים: בוחן בבעלות מורה, תיקון Redis idle-commands נוסף, איפוס סיסמה+תעודות נטפרי, טעינה איטית quiz). **עקרון עבודה: לשלב את שני הצדדים, לא לבחור אחד ולזרוק את השני** (המשתמשת ביקשה זאת מפורשות תוך כדי) — פירוט מלא בהיסטוריית הקומיט `7255f15`, תמצית:

- **`students.*`/`quizzes.api.ts`**: שני הצדדים הוסיפו endpoint/פיצ'ר **שונה** על אותו קובץ חדש (חיפוש-לפי-email מול חיפוש-לפי-שם; מודל בוחן ישן מול בוחן-בבעלות-מורה) — שולבו שניהם, לא נבחר צד.
- **⚠️ גילוי חשוב: git מיזג "בלי קונפליקט" לפעמים באופן שגוי** — ב-`gemini.service.ts` ו-`types/index.ts` שני הצדדים הוסיפו פונקציה/טיפוס **באותו שם** (`callGemini`, `QuizResultsDTO`) במיקום קרוב אך לא חופף, וגיט שילב את שניהם **ברצף בלי לסמן קונפליקט** — קוד כפול שלא היה מתקמפל בכלל. זוהה רק ע"י `grep` לזיהוי הצהרות כפולות אחרי כל מיזוג נקי-לכאורה. **לקח לשיחות הבאות: אחרי כל מיזוג, לבדוק גם קבצים שמוזגו "בלי קונפליקט" אם יש בהם שמות כפולים.**
- **`LessonAccessPanel.tsx`/`LessonEditModal.tsx`/`QuizResultsCard.tsx`**: הקומפוננטות שפוצלו ב-16/08 היו מבוססות על מודל **ישן** (גישה לפי email יחיד, `githubUrl` יחיד, בוחן ללא בעלות-מורה) — לא רק "לקחתי צד", **עדכנתי את הקומפוננטות** להכיל את הפיצ'רים החדשים של origin (טאבים תלמידה/קבוצה/קובץ, `MultiUrlInput`+`githubUrls`, כרטיס בוחן שמפנה ל-`/teacher/quiz/:id`) — אחרת היה אובדן פיצ'רים אמיתי בשקט.
- **`messages.service.ts`**: `EmailJobMap` קיבל `messageId`/`studentEmail` חדשים (חובה) מ-origin (פיצ'ר `?highlight=`) — תוקן אחרי `tsc` (לא היה קונפליקט git על זה, רק type error).
- **אימות:** `prisma generate` נדרש אחרי המיזוג (schema השתנה, client היה מיושן — כל שגיאות ה-tsc הראשוניות בבאקנד נעלמו אחרי זה). `tsc` נקי בשני הצדדים. בדיקות: backend 269/274 (5 כשלים קיימים-מראש, לא קשור), frontend — כשל אמיתי אחד נמצא ותוקן (`TeacherLessonDetailPage.test.tsx` — mock עם `githubUrl` ישן במקום `githubUrls`), שאר הכשלים תואמים בדיוק לתיעוד הקיים מ-16/08 (Badge/Button/Card/Layouts/ReportsPage וכו').
- **טרם נדחף** ל-origin — `main` המקומי 2 קומיטים לפני origin (`7255f15` מיזוג + `1e3811e` תיקון bandwidth).

## 20 תיקונים מ"תיקונים ותוספות.txt" (2026-07-31, branch `feature/homework-fixes-batch`, worktree נפרד — טרם מוזג ל-main)
**⚠️ שוב התנגשות בין-סשנים (כמו למטה):** עבודה על branch נמשך נסחפה ל-stash כשעברו branch בתיקייה הראשית. שוחזר במלואו ב-worktree ייעודי (`homework-fixes-batch-worktree`), tsc נקי backend+frontend.
**כל 20 הסעיפים מומשו:** ErrorBoundary גלובלי; `FileGallery` (רשת קבצים+preview בחלון צף, גם בהעלאה); הרשאה חריגה לשיעור לפי קבוצה/קובץ-מיילים + directory `/api/students` עם autocomplete; Google OAuth `prompt=select_account`; **forgot-password מלא** (token+email, `User.resetTokenHash/Expires` **שדה DB חדש**) + הצג-סיסמא בכל שדה; מחיקה מרובה+עריכת תלמידה+ConfirmDialog במקום `confirm()`; תוקן באג חסימת הוספת תלמידה שכבר בקבוצה אחרת; תוקן "[object Object]" בייבוא אקסל (hyperlink cells) + ולידציית מייל; קובץ-דוגמה להורדה בייבוא; קבצי Cloudinary נשמרים עם שם+סיומת אמיתיים; `Lesson.githubUrls String[]` **שדה DB חדש** (כמה קישורים) + גרירה לסידור שיעורים; טולטיפ נושא+רענון מיידי; תאריך דיפולטיבי+תאריך עברי (Intl, בלי ספרייה); מיון/סינון רשימת תלמידות; מיילים עם קישור ישיר להודעה (`?highlight=`) + mailto.
**⚠️ 2 migrations לפני push:** `Lesson.githubUrls`, `User.resetTokenHash/resetTokenExpiresAt`. פירוט מלא + כל הקבצים שהשתנו בזיכרון האישי של הסוכן (`memory project-progress`).
**נשאר:** migration → קומיט → **לתאם מיזוג ל-main** מול branch נוסף לא-מוזג (`design/unify-teacher-student-ui`, ראה למטה — יש לו גם migration משלו ל-`replySeen`!) ומול `fix/redis-bullmq-excessive-requests` (בעבודה פעילה, לא לגעת).

## אחידות עיצוב + חפיפת פיצ'רים מורה/תלמידה (2026-07-31, branch `design/unify-teacher-student-ui` — טרם מוזג)

**חשוב — ריצה מקבילה עם סשן Claude Code אחר באותה תיקייה:** באמצע העבודה התגלה שסשן אחר (worktrees תחת session id שונה, `076715d0-...`) עבד באותה תיקיית repo הראשית בו-זמנית, ועבר branch (`feature/backend-direct-video-upload`) שסחף איתו קומיט אחד שלי. תוקן ע"י cherry-pick לענף הנכון; הענף של הסשן האחר לא נגעתי בו לפי בקשת המשתמשת. **מכאן והלאה כל העבודה בוצעה ב-git worktree ייעודי** (לא בתיקייה הראשית!) תחת `%LOCALAPPDATA%\Temp\claude\...\scratchpad\wt-design`, כדי לא להתנגש שוב. **לתשומת לב שיחות עתידיות:** אם יש שני סשנים על אותו repo — לשקול worktree מההתחלה.

**מה נעשה (הכל ב-branch `design/unify-teacher-student-ui`, 5 קומיטים, טרם מוזג ל-main):**
1. **מחיקת הודעות** — `DELETE /messages/:id` (מורה, כל השיחה), `DELETE /messages/:id/reply` (מורה, רק התגובה), `DELETE /messages/:id/mine` (תלמידה, הודעה עצמית).
2. **דיאלוג צף אצל התלמידה** — `student/MessagesPage.tsx` נבנה מחדש עם Dialog overlay לצפייה בהודעה+תגובה, בדיוק כמו `teacher/MessagesPage.tsx` (זו הייתה התלונה המקורית: "אצל המורה יש צף, אצל התלמידה לא").
3. **פריסת דפים "מפוזרת" במקום עמודה צרה** — כל דפי הפירוט (קורס/קבוצה/שיעור אצל שניהם, טפסי קורס/קבוצה, AI usage, מטלות, תוצאות חידון) הורחבו ל-grid רב-עמודות (`lg:grid-cols-2/3`) כשיש קטעים עצמאיים שוות-משקל, במקום מוערמים בטור אחד. `ReportsPage` נשאר בכוונה (טבלה זקוקה לרוחב מלא).
4. **ביקורת חפיפת פיצ'רים** (Explore agent) מצאה 6 פערים אמיתיים בין המורה לתלמידה — כולם מומשו:
   - תוצאות חידון בדף השיעור של המורה (backend כבר תמך, רק חסר UI).
   - `aiCodeReview` מוצג גם למורה במודל הציון (היה רק לתלמידה).
   - כפתור "אפשרי בדיקת AI נוספת" למורה + זרימת "בקשי בדיקה נוספת מהמורה" לתלמידה כשמגיעה למגבלה (מזהה לפי הודעת שגיאה מדויקת `'AI review limit reached'` מה-backend).
   - מונה "X/Y תלמידות סיימו" על בועות השיעור בדף הקורס של המורה (query חדש, **בלי migration** — `LessonProgress` כבר קיים; `courses.service.ts::getCourseById` מחזיר `completedCount`/`groupStudentCount` ל-ADMIN בלבד).
   - חיפוש מקומי בדפי Assignments/Home של התלמידה (state מקומי, לא ה-store הגלובלי של המורה).
   - תג "בקשת הגשה מאוחרת" מוצג גם אצל התלמידה על ההודעות שלה עצמה.
5. **⚠️ שדה DB חדש — דורש migration:** `TeacherMessage.replySeen Boolean @default(false)` (התראת "תגובה לא נקראה" אצל התלמידה, מקבילה לפעמון ההודעות של המורה). נוספו `GET /messages/unread-replies-count` ו-`PATCH /messages/:id/reply-seen` (STUDENT), ונקודה אדומה על אייקון "הודעה למורה" ב-`StudentLayout`. **לפני build:** להריץ migration (ראה סקיל `run-migration`) — בלעדיו ה-backend ייכשל על `replySeen` לא קיים בעמודה.

**הערה טכנית — tsc מקומי דרך Bash tool:** יש bug סביבתי במחשב הזה — `npx tsc` / `node node_modules/typescript/bin/tsc` דרך ה-Bash tool מחזיר עשרות שגיאות "Cannot find module 'lucide-react'" גם על קבצים שלא נגעו בהם. **דרך PowerShell אותה פקודה בדיוק רצה נקי (exit 0).** אם tsc "נשבר" פתאום על כל הקבצים — לנסות PowerShell לפני שמניחים שיש שגיאה אמיתית.

**נשאר לעשות:**
- להריץ migration ל-`replySeen` (המשתמשת, מהמחשב — לא Docker).
- למזג `design/unify-teacher-student-ui` ל-main (טרם נדחף/מוזג — יש לתאם עם הסשן המקביל שגילינו).
- לבדוק ויזואלית ב-docker (build לא נבדק בפועל בשיחה הזו, רק tsc + סקירת diff).

## סטטוס נוכחי (2026-07-20)

המערכת עולה ורצה במלואה עם Docker Compose (`docker compose -p homework-app up -d --build`):

| שירות | מצב |
|---|---|
| nginx | ✅ (http://localhost → 200) |
| frontend | ✅ |
| api | ✅ (login מחזיר 200) |
| worker | ✅ |
| postgres | ✅ healthy |
| redis | ✅ |

- כל 4 ה-migrations רצו אוטומטית, seed יצר את משתמש המורה `admin@school.com` / `admin123`.
- אין route ל-`/api/health` (404 זה תקין) — בדיקת חיים אמיתית דרך `POST /api/auth/login`.

## סנכרון git גדול (2026-07-20)

- המקומי היה גרסה ישנה עם היסטוריית git **לא-קשורה** לרימוט (`github.com/Chani-Pappenhaim/homework-system`) — hashes שונים, אין commit אב משותף.
- הרימוט היה קדימה ב-130 קבצים (10,504 שורות): חבילת בדיקות מלאה (backend/frontend tests), migrations חדשים, refactor של services, מעבר רכיבי UI ל-shadcn, שינויים ב-HomePage/courses/submissions.
- **פתרון:** גיבוי `CLAUDE.md`+`AGENT_SPEC.md` → `git reset --hard origin/main` → שחזור הקבצים (עכשיו gitignored, מקומיים בלבד). המקומי כעת == origin/main.
- הרימוט הוסיף ל-`.gitignore`: `CLAUDE.md`, `AGENT_SPEC.md` (קבצים מקומיים בלבד).
- **אחרי הסנכרון צריך:** `docker compose -p homework-app up -d --build` (package.json השתנה) + החלת 2 migrations חדשים (`add_lesson_progress`, `add_dual_score`).
- **הבאגים שדווחו (קבוצה במסך בית / קורסים ריקים / חסימת OAuth) — לבדוק מחדש על הקוד החדש**, ייתכן שחלקם כבר תוקנו.

## תיקוני Production readiness (2026-07-21, branch fix/production-readiness → מוזג ל-main)

- **Redis/BullMQ:** חיבור אחד משותף ב-`backend/src/config/redis.ts` ישירות מ-`REDIS_URL` (שומר auth+TLS). ה-API כבר לא מפעיל Workers (הוסר import cycle + עיבוד כפול). ioredis הוצמד ל-5.10.1 כדי להתאים ל-copy של bullmq (dual-package).
- **Cookies:** refresh cookie → prod: SameSite=None+Secure, dev: Lax; clearCookie משתמש באותן אפשרויות.
- **Frontend:** כל הקריאות (axios/refresh/OAuth) דרך `VITE_API_URL` יחיד (`frontend/src/lib/config.ts`). ריק = fallback ל-`/api` (dev/nginx).
- **Rate limit:** `aiRateLimit` משתמש ב-`ipKeyGenerator` (IPv6).
- **אימות:** backend tsc 0 errors, frontend build עבר, 204 בדיקות עוברות.
- **דרוש בפרודקשן (env של המשתמשת):** `VITE_API_URL` (build-time), `NODE_ENV=production`, `FRONTEND_URL`, callback URLs עם https + דומיין.
- **פתוח:** 3 הבאגים המקוריים (קבוצה/קורסים/חסימת OAuth) עוד לא נבדקו על הקוד החדש. OAuth auto-create של משתמש לא רשום — עדיין קיים (business logic, לא נגעתי).

## Refactor מבנה הפעלה — entry points נפרדים (2026-07-24, branch refactor/startup-entrypoints)

- **מבנה חדש `src/entrypoints/`:** `api.ts` (API בלבד; מייצא `startApiServer()`), `worker.ts` (workers בלבד), `combined.ts` (API + כל ה-workers בתהליך אחד — עבור Render Free).
- **נמחקו:** `src/index.ts` ו-`src/workers/index.ts` (הוחלפו ע"י ה-entrypoints).
- **Render Free:** ה-CMD בברירת מחדל = `dist/src/entrypoints/combined.js` → שירות בודד מריץ API + workers יחד. אין יותר צורך ב-`RUN_WORKERS_INLINE` (בחירת ה-entry היא האות). ה-workers עולים פעם אחת דרך `startWorkers()`.
- **docker-compose (split):** שירות api → `entrypoints/api.js`, שירות worker → `entrypoints/worker.js`.
- **הפרדה עתידית לשני שירותי Render:** להצביע web→`entrypoints/api`, worker→`entrypoints/worker` — בלי שינוי קוד.
- **package.json scripts:** `start`(combined), `start:api`, `start:worker`, `dev`(combined), `dev:api`, `dev:worker`. `main`→combined.
- **Graceful shutdown** ללא שינוי לוגי: server.close → stopWorkers → closeQueues → closeSharedConnection → prisma.$disconnect.
- **אימות:** `npx tsc` 0 errors.

## Refactor ארכיטקטוני Redis/BullMQ/Workers (2026-07-21, branch refactor/redis-workers-architecture → מוזג ל-main)

- **מבנה חדש:** `infrastructure/redis/connection.ts` (factory `createRedisConnection()` + `sharedConnection`, זורק אם אין REDIS_URL, listeners, בלי סודות בלוג), `infrastructure/queues/{queues.ts,job-types.ts}` (Queues מטופסים + defaultJobOptions), `infrastructure/shutdown.ts`, `emails/{types,templates,service}.ts` (פוצל מה-worker), `workers/worker-events.ts`, `workers/start-workers.ts`.
- **Workers:** כל worker מייצא `register<X>Worker(connection)` (לא נוצר ב-import → אין workers ב-build/test), כל worker חיבור Redis משלו, listeners completed/failed/error. deadline/storage משתמשים ב-sharedConnection ל-get/setex.
- **הפעלה:** `workers/index.ts` = entry עצמאי (docker-compose worker). `src/index.ts` מפעיל inline רק אם `RUN_WORKERS_INLINE=true` (ל-Render single-service) ולא ב-test. Graceful shutdown ל-SIGTERM/SIGINT (server+workers+queues+redis+prisma).
- **config/redis.ts נמחק.** producers מייבאים מ-infrastructure/queues.
- **env חדש שהמשתמשת צריכה להגדיר:** `RUN_WORKERS_INLINE=true` ב-Render (אם שירות אחד).
- **אימות:** tsc 0 errors, compile OK, 204 בדיקות עוברות.
- **zod קיים אך לא בשימוש** ב-routes — item validation נותר פתוח (לא הוספתי, סיכון/scope).

## מחיקות + שם לקובץ בהעלאה (2026-07-21, branch feat/delete-actions-and-file-naming)

- **מחיקת קורס/קבוצה/שיעור** — נוספו routes `DELETE`:
  - `DELETE /api/courses/:id` (`deleteCourse`) — מסתמך על cascade של Prisma למחיקת שיעורים/מטלות/הגשות/קישורים/קבצים; לפני המחיקה מנקה best-effort את קבצי Cloudinary (קבצי הקורס + קבצי כל השיעורים). נכשל storage לא חוסם מחיקה.
  - `DELETE /api/lessons/:id` (`deleteLesson`) — cascade למטלות/הגשות/קבצים/quiz/access/progress; ניקוי קבצי storage לפני.
  - `DELETE /api/groups/:id` (`deleteGroup`) — **חשוב:** יחס Course→Group הוא Restrict, לכן `deleteGroup` מוחק תחילה את כל הקורסים של הקבוצה (דרך `deleteCourse`, כולל ניקוי storage) ואז את הקבוצה. חברות התלמידות (StudentGroup) נמחקות ב-cascade, **חשבונות התלמידות עצמן לא נמחקים** (עשויות להיות בקבוצות אחרות).
  - מטלות כבר היו ניתנות למחיקה מקודם.
- **UI מחיקה** — כפתור "מחק" (destructive) עם `confirm` בעברית ליד כפתור "ערוך" ב: `teacher/CourseDetailPage`, `teacher/GroupDetailPage`, `teacher/LessonDetailPage`. אחרי מחיקה: invalidate + ניווט חזרה (שיעור→קורס, קורס→רשימת קורסים, קבוצה→רשימת קבוצות).
- **שם לקובץ בהעלאה** — `uploadCourseFile`/`uploadLessonFile` מקבלים `displayName?` אופציונלי (נופל חזרה ל-originalname אם ריק). ה-controllers מעבירים `req.body.name` (multer memoryStorage ממלא שדות טקסט). קומפוננטת `FileUpload` קיבלה prop `withName` — אחרי בחירת קובץ מציגה שדה שם (ברירת מחדל: שם הקובץ בלי סיומת) לפני העלאה. חתימת `onFile` הפכה ל-`(file, name?)` — תואם לאחור, ה-API מוסיף `name` ל-FormData רק אם קיים. מופעל בהעלאת קבצי קורס (CourseFormPage) ושיעור (teacher/LessonDetailPage); הגשות תלמידות + ייבוא Excel נשארו בלי שם.
- **בדיקות:** נוספו טסטים ל-deleteCourse/deleteLesson/deleteGroup ולשם-קובץ. backend 216 טסטים עוברים (היו 204), frontend 216 עוברים, שני ה-tsc נקיים, frontend build עבר.

## Toast הצלחה על יצירה/שמירה/מחיקה (2026-07-21, branch feat/save-toast)

- **קומפוננטה חדשה** `frontend/src/components/ui/toast.tsx` — מערכת toast פנימית בלי ספרייה חיצונית (בגלל בעיות SSL של נטפרי ב-npm install). `ToastProvider` + hook `useToast()` שמחזיר `success/error/show`. ה-toasts מופיעים למטה-מרכז, RTL, נעלמים אוטומטית אחרי 3 שניות, עם כפתור סגירה. אנימציה דרך tailwindcss-animate.
- **חשוב — fallback ל-no-op:** `useToast()` מחזיר no-op כשאין provider (ברירת מחדל ב-createContext), כדי שטסטים שמרנדרים דפים בלי ToastProvider לא ייפלו. לכן לא היה צריך לגעת ב-30 טסטי הדפים הקיימים.
- **חיווט:** `ToastProvider` עוטף את `<Root/>` ב-`main.tsx` (בתוך QueryClientProvider).
- **איפה מוצג "נשמר":** הוספתי `toast.success` ל-onSuccess של כל היצירה/שמירה/מחיקה בצד המורה: קורס (create/edit/copy/link/file), שיעור (create/edit/delete/file), קבוצה (create/edit/delete/הוספת תלמידה/ייבוא Excel), מטלה (create/edit/delete), ציון. כפתורי השמירה עצמם כבר היו קיימים בטפסים — נוסף רק ה-popup.
- **בדיקות:** `tests/components/Toast.test.tsx` (4) + הרחבת `FileUpload.test.tsx` ל-withName (3). frontend עלה מ-216 ל-**223 טסטים עוברים**, tsc נקי, build עבר. הערה: ערבוב fake timers עם userEvent תוקע — בטסט auto-dismiss השתמשתי ב-fireEvent סינכרוני.

## סניטציה של הודעות שגיאה — לא לחשוף פרטים טכניים ללקוח (2026-07-22, branch feat/safe-error-messages)

- **עיקרון:** שגיאות 5xx (תקלת שרת — DB, מפתח API, stack) **לעולם לא** נשלחות ללקוח. הלקוח מקבל הודעה כללית ידידותית והשגיאה האמיתית נרשמת ב-console בלבד. שגיאות 4xx מכוונות (login נכשל / not found / email exists) — נשמרות כי הן משמעותיות ובטוחות.
- **Backend:** קובץ חדש `src/utils/http.ts` — `sendError(res, err, fallbackStatus=500)` + `GENERIC_SERVER_ERROR` (עברית). 4xx מחזיר את `err.message`, 5xx מחזיר גנרי + `console.error`. הוחלפו כל 57 המופעים של `res.status(err.status||X).json({error: err.message})` ב-10 ה-controllers ב-`sendError`. נוסף גם **error-handling middleware גלובלי** ב-`app.ts` (רשת ביטחון ל-throws שבורחים מ-try/catch). מסרי auth/role middleware תורגמו לעברית ידידותית ("אינך מחובר", "אין לך הרשאה").
- **Frontend:** קובץ חדש `src/lib/errors.ts` — `getApiErrorMessage(error, fallback?)`: אין response (שרת נפל/רשת) → "לא הצלחנו להתחבר לשרת..."; יש הודעת שרת → אותה (כבר סניטרית); אחרת → fallback. הוחל בכל מקומות תצוגת השגיאה למשתמש (LoginPage, ChangePasswordPage, CourseFormPage, GroupFormPage, teacher+student LessonDetailPage, student MessagesPage).
- **בדיקות:** עודכן טסט אינטגרציה שקודם *אימת את הדליפה* (500 → 'boom') לאמת עכשיו שהמסר הגנרי מוחזר ו-'boom' לא דולף. נוסף `tests/lib/errors.test.ts` (6). backend 216 עוברים, frontend עלה ל-**229 עוברים**, tsc נקי בשני הצדדים, build עבר.

## טיפול בהרדמות השרת / cold start (2026-07-24, branch feat/handle-server-sleep — ✅ נמצא ב-origin/main, אומת 2026-08-06)

- **הרקע:** backend על Render free tier נרדם אחרי ~15 דק' חוסר פעילות → הבקשה הבאה סובלת מ-cold start של 30–60 שנ'. frontend על Vercel.
- **Backend:** נוסף `GET /api/health` ב-`app.ts` (לפני ה-rate limiter, בלי auth/DB) — מחזיר `{status:'ok', uptime}`. משמש גם ל-keep-alive חיצוני וגם ל-warm-up מהקליינט. (ביטל את ההנחה הישנה ש-/api/health הוא 404.)
- **Frontend:** 
  - `store/serverStatus.ts` (zustand) — דגל `waking`.
  - `api/axios.ts` שוכתב: timeout 60s; ספירת בקשות in-flight (פעם אחת לכל בקשה לוגית דרך `_counted`) → אם משהו תקוע מעל 4s מדליק באנר; **retry אוטומטי** עד 4 פעמים עם backoff (2/4/6/8s) על שגיאות cold-start (timeout / אין response / 502/503/504). זרימת ה-401 refresh הקיימת נשמרה ומשולבת עם ה-bookkeeping.
  - `components/ui/server-waking-banner.tsx` — באנר עליון "השרת מתעורר..." מונע מ-`serverStatus`. הורכב ב-`main.tsx` בתוך `Root` (רץ עם ה-bootstrap שהוא הבקשה הראשונה/הקרה).
- **בדיקות:** health test ב-`app.test.ts`, `ServerWakingBanner.test.tsx` (3). backend 217, frontend 232, tsc+build נקיים.
- **keep-alive בקוד:** נוסף `.github/workflows/keep-alive.yml` — GitHub Actions cron כל 10 דק' שמפינג `https://homework-system-3haq.onrender.com/api/health` (הכתובת הציבורית מ-`.env`; frontend+backend על אותו Render service). **רץ רק אחרי מיזוג ל-main** (scheduled workflows רצים רק מה-default branch). **אזהרת עלות:** אם הריפו פרטי — 10 דק' חורג מ-2000 דקות Actions החינמיות בחודש; אז עדיף UptimeRobot/cron-job.org על אותו URL. הכתובת `homework-system-3haq.onrender.com` מקודדת בworkflow — לעדכן אם השרת עובר כתובת.
- **גיט:** המשתמשת מבצעת בעצמה. השינויים בבראנץ' `feat/handle-server-sleep`, לא מוזגו ולא נדחפו.

## יישור main מקומי מול origin + keep-alive חיצוני (2026-08-06)

- **מצב שהתגלה:** ה-main המקומי היה 24 קומיטים "לפני" ו-88 "אחרי" את `origin/main`. בדיקת `git cherry origin/main main` הראתה שכל 15 הקומיטים האמיתיים כבר קיימים למעלה (patch-equivalent) — 9 הנותרים היו קומיטי מיזוג בלבד. כלומר **origin/main היה על-קבוצה מלאה של המקומי**: כל העבודה (health endpoint, keep-alive.yml, entrypoints, toast, safe errors) כבר נדחפה, ובנוסף היו למעלה 88 קומיטים חדשים.
- **למה לא מיזגו/דחפו:** מיזוג היה מחיה קבצים ש**נמחקו במכוון** למעלה — `deadline.worker.ts`/`storage.worker.ts` הוחלפו ב-`deadline-check.ts`/`storage-check.ts`/`scheduled-tasks.ts` (interval רגיל במקום BullMQ Worker) בקומיט `fix(backend): cut idle Redis command volume from BullMQ workers`, כדי לחסוך פקודות Redis בסרק. דחיפה הייתה מכניסה רגרסיה לריפו המשותף.
- **מה נעשה:** `git branch backup/main-2026-08-06` → `git fetch origin` → `git reset --hard origin/main`. אין קונפליקטים, שום קובץ מקומי לא נדרס. `.env`/`CLAUDE.md`/`AGENT_SPEC.md` gitignored ולכן `reset --hard` לא נגע בהם (אומת). `הוראות-הרצה-ומה-נשאר.md` מנוהל בגיט אבל היה זהה לגרסת origin.
- **גיבוי:** בראנץ' `backup/main-2026-08-06` מצביע ל-`be982d7`. למחוק (`git branch -D`) אחרי שמאמתים שהכל עובד.
- **דרוש אחרי היישור:** `npm install` ב-backend וב-frontend (package.json השתנה), הרצת 3 migrations חדשים (`spec_compliance_fields`, `add_message_reply_seen`, `lesson_github_links_and_password_reset`) **מהמחשב ולא מ-Docker** (SSL נטפרי), ואז build+up של Docker.
- **keep-alive — הוחלט על שירות חיצוני ולא GitHub Actions:** cron של GitHub הוא best-effort ומתעכב, ובריפו פרטי 4,320 ריצות/חודש חורגות מ-2,000 הדקות החינמיות. ההמלצה: cron-job.org (או UptimeRobot, מינימום 5 דק') על `https://homework-system-3haq.onrender.com/api/health` כל 10 דק'.
- **אומת חי:** ה-endpoint מחזיר 200 עם 61 בייט בלבד (`{"success":true,"data":{"status":"ok","uptime":...}}`). מדידה בפועל הראתה **cold start של 62.9 שניות** ו-`uptime: 16` — הוכחה שהשרת אכן נרדם.
- **תקלה ב-cron-job.org:** "Failed (output too large)" בריצת בדיקה — לא יכול לנבוע מ-61 בייט, כלומר ה-URL שהוגדר שם כנראה שגוי (בלי `/api`, או כתובת ה-frontend שמחזירה HTML). פתרונות: לתקן את ה-URL; או לעבור ל-`HEAD` (Express עונה ל-HEAD על כל route של GET, בלי גוף תגובה כלל) ולכבות שמירת תגובות. **טרם נסגר סופית.**
- **מגבלה לזכור:** Render Free = 750 שעות instance בחודש לכל השירותים החינמיים יחד. שירות אחד 24/7 ≈ 730 שעות (בסדר), שניים — חריגה.

## הרצה מקומית אחרי ה-reset — 3 חוסמים שתוקנו (2026-08-06)

הרצה ראשונה של הסטאק אחרי היישור מול origin. **המשתמשת נתנה אישור חד-פעמי להריץ Docker** (בניגוד לכלל הרגיל ב-CLAUDE.md). שלושה חוסמים נפרדים:

1. **`DIRECT_URL` חסר ב-.env** — `prisma.config.ts` קורא `process.env.DIRECT_URL!`, ו-`docker-entrypoint.sh` מריץ `prisma migrate deploy` בכל עלייה של ה-api (`RUN_MIGRATIONS: "true"`). בלי המשתנה ה-api נופל על connection string ריק. נוסף ל-`.env` (זהה ל-`DATABASE_URL` מקומית; בפרודקשן חייב לעקוף את ה-pooler). **חסר גם ב-`backend/.env.example`** — שווה להוסיף שם.
2. **images ישנים מול compose חדש** — הקונטיינרים היו מ-22/07 אבל `docker-compose.yml` (מה-reset) מריץ `node dist/src/entrypoints/worker.js`. תוצאה: `MODULE_NOT_FOUND` ולולאת קריסה ב-worker, ו-frontend שמגיש bundle ישן. **מלכודת:** `restart: unless-stopped` מחייה אוטומטית את הקונטיינרים הישנים כשה-Docker Desktop עולה, והאתר "עובד" — רק עם קוד ישן, בלי שום סימן שגיאה. **הבחנה מכרעת:** `docker compose ps` → עמודת `CREATED` (מתי נוצר) לעומת `STATUS` (מתי הופעל). `Up 29 minutes` לא אומר כלום; `CREATED 2 weeks ago` אומר הכל.
3. **נטפרי — שתי נפילות SSL נפרדות ב-Prisma:**
   - **בזמן build:** `npx prisma generate` נפל על `binaries.prisma.sh` עם `unable to get local issuer certificate`. ה-Dockerfile מתקין את ה-root CA של נטפרי ומגדיר `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE` — **אבל ה-engine downloader של Prisma לא מכבד את המשתנים האלה**. תוקן עם `RUN NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma generate` (ממוקד לשורה אחת, לא ENV קבוע).
   - **בזמן ריצה:** גם אחרי ה-build ה-api נכנס ללולאת קריסה — `migrate deploy` ניסה להוריד את ה-schema-engine בעלייה. הסיבה: `npm ci --omit=dev` בשלב הריצה **לא מוריד את הבינארי** (Prisma 7 מוריד engines בעצלתיים). תוקן בהעתקה מה-builder: `COPY --from=builder /root/.cache/prisma /root/.cache/prisma` + `node_modules/@prisma/engines`. עכשיו העלייה לא דורשת אינטרנט בכלל.

- **שינויי Dockerfile אלה מקומיים בלבד** וסוטים מ-origin. טרם הוחלט אם לקמט/לדחוף (ה-`NODE_TLS_REJECT_UNAUTHORIZED=0` רלוונטי רק לרשת נטפרי; העתקת ה-engines דווקא נכונה לכולם ומזרזת עלייה).
- **nginx צריך restart אחרי *כל* יצירה מחדש של api** — לא רק פעם אחת. קיבלנו 502 בגלל restart שנעשה לפני ה-`up` האחרון. הסדר הנכון: `build` → `up -d` → `restart nginx`.
- **מצב סופי מאומת:** 6 קונטיינרים למעלה, 3 ה-migrations החדשים רצו (`spec_compliance_fields`, `add_message_reply_seen`, `lesson_github_links_and_password_reset`), `GET /api/health` → 200, `POST /api/auth/login` (admin@school.com/admin123) → 200, וכותרת הדף `Teacher Feature · המורה עדי שלום` (הישנה: `מערכת הגשת שיעורי בית` — **בדיקה מהירה לזיהוי bundle ישן**).

## הערות טכניות חשובות

- **קובץ `.env`**: חייב להיות בשורש בשם `.env` בדיוק (עם נקודה). Windows Explorer יוצר לפעמים `env` בלי נקודה — Docker Compose לא ימצא אותו. תוקן ב-2026-07-20.
- ה-`.env` לא נכנס ל-git (מכוסה ב-`.gitignore`).

## נשאר לעשות / מפתחות חסרים ב-.env (פיצ'רים מושבתים עד למילוי)

- ~~`CLAUDE_API_KEY` — חסר לגמרי. יצירת חידונים לא תעבוד.~~ ❌ **לא נכון** — הקוד מעולם לא השתמש ב-Claude. `CLAUDE_API_KEY` הוא שריד תיעודי; החידונים רצים על Gemini כמו בדיקת ההגשות. הוסר מ-`.env.example` ומה-SPEC ב-2026-08-13.
- ~~`GEMINI_API_KEY` — מתחיל ב-`AQ.` במקום `AIza`, ייתכן שייכשל.~~ ✅ **אומת ב-2026-08-13:** המפתח תקין (`ListModels` → 200). הפורמט `AQ.` לגיטימי.
- `CLOUDINARY_*` — ריק. העלאת קבצי הגשה לא תעבוד.
- `SMTP_*` — ריק. מיילים לא יישלחו (המערכת רצה רגיל בלי זה).
- ~~`GITHUB_*` / `GOOGLE_*` — ריק. OAuth לא זמין.~~ ✅ **הושלם (2026-07-20):** שני ה-OAuth מוגדרים ועובדים (Google + GitHub). callback URLs מכוונים ל-`http://localhost/...` — יש לעדכן לדומיין אמיתי בפריסה לשרת.

## הערות OAuth (2026-07-20)

- **חשוב — עדכון `.env` לא נקלט ב-`restart`:** משתני סביבה מוזרקים רק ביצירת קונטיינר. אחרי שינוי `.env` חובה `docker compose -p homework-app up -d api worker` (יוצר מחדש), **לא** `restart`.
- **502 אחרי יצירת api מחדש:** nginx שומר את ה-IP הישן של הקונטיינר. פתרון: `docker compose -p homework-app restart nginx` אחרי כל `up -d` שיוצר מחדש את api.
- **פריסה לשרת:** בעת מעבר מ-localhost לדומיין יש לעדכן ב-3 מקומות — (1) callback URLs ב-Google Console + GitHub OAuth App, (2) `GITHUB_CALLBACK_URL`/`GOOGLE_CALLBACK_URL`/`OAUTH_SUCCESS_REDIRECT`/`FRONTEND_URL` ב-`.env`, (3) `up -d` מחדש. הדומיין יידרש `https`.
- **Google Test users:** כל עוד ה-consent screen ב-mode "Testing", רק אימיילים ברשימת Test users יכולים להתחבר.

לאחר מילוי מפתחות: `docker compose -p homework-app restart api worker`.

## תקלת יצירת חידונים — נפתר (2026-08-13, בראנץ' `fix/ai-quiz-generation`)

**התסמין:** מסך "יצירת החידון נמשכת יותר מדי" בכל ניסיון ליצור בוחן, גם כשה-`contentMd` מלא.

**שורש הבעיה:** `GEMINI_MODEL=gemini-2.0-flash`. **גוגל הוציאה את המודל הזה משימוש** —
כל קריאה מחזירה `404 "This model is no longer available"`. אימות:
`curl "https://generativelanguage.googleapis.com/v1beta/models?key=<KEY>"` — הרשימה
מתחילה מ-2.5, ו-`gemini-2.5-flash` כבר "no longer available to new users". **זה השפיע גם על
בדיקת ה-AI של ההגשות** — שני הפיצ'רים חולקים את `GEMINI_MODEL`.

**מודל נוכחי:** `gemini-3.5-flash` (אומת מקצה לקצה: 10 שאלות עברית תקינות מתוכן שיעור אמיתי).

**שלוש תקלות משנה שהסתירו את השגיאה — כולן תוקנו:**
1. **בליעת שגיאות:** `getQuiz` החזיר רק `generating`/`ready`. כישלון job לא הגיע לשום מקום בממשק,
   ולכן כל תקלה נראתה כמו ספינר אינסופי. נוספו סטטוסים `unavailable` ו-`failed`.
2. **`jobId` נעל ניסיונות חוזרים לשבוע:** ה-dedup `quiz:<lessonId>` + `removeOnFail: 7 ימים` גרמו לכך
   ש-`quizQueue.add` התעלם בשקט מכל ניסיון נוסף. עכשיו job שנכשל **נמחק ברגע שהסטטוס מדווח**,
   כך שהבקשה הבאה פותחת ניסיון חדש.
3. **ה-rate limit חנק את הפולינג של עצמו:** polling כל 3 שניות = 20 בקשות/דקה מול `max: 20`.
   שונה ל-5 שניות ו-`max: 40`.

**לקח כללי:** קריאת AI שנכשלת חייבת להגיע לממשק עם הסיבה. תקלה שקטה בשכבת ה-AI נראית
זהה לתקלת רשת, למפתח שגוי ולמודל שהוסר — וכל אחת מהן דורשת תיקון אחר.

**כשהחידון ייפול שוב בעתיד:** המורה תראה עכשיו את הסיבה הטכנית ישירות במסך (התלמידה תראה
נוסח כללי). אם ההודעה היא `404 — the model ... is not available`, יש לעדכן את `GEMINI_MODEL`
לפי רשימת ה-`ListModels` למעלה, ולעדכן איתו את `GEMINI_PRICE_*` לפי מחירון גוגל.

**תקלה 4 — `jobId` עם נקודתיים (הכשל הראשון בפועל):** BullMQ זורק `Custom Id cannot contain :`
על כל custom job id שמכיל `:` ואינו בן 3 חלקים. ה-id היה `quiz:<lessonId>` — שני חלקים —
ולכן **`quizQueue.add` זרק בכל בקשה, מהיום הראשון. שום job של בוחן לא נכנס לתור מעולם.**
החריגה הפכה ל-500, והפרונט תרגם `status ?? 'generating'` לספינר. תוקן למקף.
זיהוי: לוג ה-worker הראה **אפס** jobs של quiz — לא נכשלים ולא מוצלחים. אפס jobs = כשל
לפני התור, לא בתוכו.

**תקלה 5 — תעודת נטפרי הלא-נכונה:** אחרי תיקון התור, הקריאה ל-Gemini נכשלה ב-
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. הסיבה: לנטפרי **שתי משפחות root** — `X2` והלא-X2.
ה-Dockerfile הוריד רק את X2, והרשת (019 טלזר) חותמת עם הלא-X2. ראה
`backend/certs/netfree/README.md`.

**אומת מקצה לקצה (2026-08-14):** `[quiz] job quiz-22b742c3-... completed` בלוג ה-worker,
10 שאלות תקינות בעברית על תוכן השיעור (Virtual DOM / React), `totalQuizzes: 1`,
עלות $0.001. שיעור בלי תוכן מחזיר `unavailable` עם ההודעה הנכונה למורה. בקשה חוזרת
מחזירה `ready` בלי חיוב נוסף.

## ⚠️ מכסת Upstash Redis נגמרה — כל התורים מושבתים בפרודקשן (2026-08-16, אבחון בלבד)

**התסמין:** בשרת (Render) יצירת בוחן נכשלה — באנר "השרת מתעורר" ואז "אירעה שגיאה בשרת".
ב-localhost עבד מושלם. **לא קשור ל-push ל-main ולא לקוד הבוחן.**

**השורש:** בלוג של Render —
`ERR max requests limit exceeded. Limit: 500000, Usage: 500000` (Upstash free = 500K פקודות/חודש).
כל פקודת Redis נדחית → `quizQueue.add` זורק → 502. **גם בדיקת ה-AI של ההגשות וגם המיילים
שבורים** (שלושת ה-workers נופלים על אותה שגיאה).

**למה נגמרה:** הקומיט `9044311` (31/07) כבר הקטין את הצריכה, ובכל זאת המכסה נגמרה תוך
פחות משבועיים. 3 workers עושים long-poll כל 30 שנ' **בסרק** ≈ 20–30K פקודות/יום ≈ 600–900K/חודש.
ה-keep-alive (פינג כל 10 דק') הוא מה שמשאיר אותם ערים 24/7 — כלומר הוא מזין את הבזבוז.
מעל זה: כשהפקודה נכשלת ה-worker מנסה שוב **מיד** (כמה פעמים בשנייה בלוג), לולאה חמה.

**שרשרת האבחון — שווה לזכור:** ההודעה הגנרית `אירעה שגיאה בשרת` מוכיחה שה-API **כן ענה**
(היא מגיעה רק מגוף JSON של `sendError`; שרת שלא זמין נותן `לא הצלחנו להתחבר לשרת`).
במסלול הבוחן ה-502 היחיד הוא ה-catch של ה-enqueue → כלומר Redis, עוד לפני שנגענו בלוג.
"כמה דקות עד השגיאה" = axios מתייחס ל-502 כ-cold-start ומנסה 5 פעמים ([axios.ts](../frontend/src/api/axios.ts)).

**✅ תוקן בקוד — בראנץ' `fix/redis-command-volume`, קומיט `3549b73` (טרם מוזג/נדחף):**
1. `worker-defaults.ts`: `drainDelay` 30→**300 שנ'**, `stalledInterval` 5→**30 דק'**.
   **בלי שום פגיעה בזמן התגובה** — ה-blocking read חוזר ברגע שנכנס job; drainDelay הוא ה-timeout
   של ההמתנה לכלום, לא של הרמת ה-job. ~9,500 → ~1,000 פקודות/יום לשלושת ה-workers.
2. `quizzes.service.ts::getQuiz`: דילוג על `getState()` כש-`finishedOn` ריק. זו הקריאה הכי תכופה
   באפליקציה (פולינג כל 5 שנ' מהדף הפתוח של המורה) — ירדה מכמה פקודות לאחת.
3. `deadline-check.ts`: `Set` בזיכרון של מטלות שכבר דווחו. קודם נשאלה אותה שאלה סגורה ב-Redis
   בכל ריצה במשך 7 ימים; עכשיו פעם אחת לכל הרצת תהליך.
4. `scheduled-tasks.ts`: בדיקת deadline 15 דק' → **שעה**.
5. `axios.ts`: 502 שנושא envelope שלנו (`success:false`) הוא תשובה מכוונת של האפליקציה, לא
   gateway שמתעורר → **בלי retry**. זה מה שהפך כשל מיידי ל-5 ניסיונות ולדקות של "השרת מתעורר".

**אימות:** tsc נקי בשני הצדדים; backend 267/272 עוברים (5 הכשלים שנותרו הם אותם
courses/email/grades/groups שקיימים ב-main מלפני השינוי).

**מה שנשאר:**
1. **מיידי, לא בקוד:** Upstash → pay-as-you-go (~$1.5–2/חודש) או להמתין לאיפוס החודשי.
   **עד אז הבוחן/AI/מיילים מושבתים בפרודקשן גם אחרי הדיפלוי** — המכסה נגמרה, לא הקוד אשם.
2. **אופציונלי:** איחוד 3 התורים לתור אחד עם שדה `type` → פי 3 נוסף.
3. ה-502 של `requestQuizGeneration` עדיין ממוסך ל"אירעה שגיאה בשרת". `expose: role === 'ADMIN'`
   יפתור, **אבל `sendError` תומך ב-`expose` רק בבראנץ' `fix/student-file-upload-403`** (קומיט
   `4f119b6`) שעדיין לא מוזג ל-main. אחרי מיזוגו — להוסיף שורה אחת.

**⚠️ שתי עבודות תקועות מחוץ ל-main:** לבראנץ' `fix/student-file-upload-403` יש 2 קומיטים
שלא מוזגו — `4f119b6` (מנגנון `expose`) ו-`ab0f5e6` (**תיקון אמיתי**: refresh של טוקן היה יכול
להחליף את המשתמש המחובר מתחת לדף). שווה למזג.

## הבוחן עבר לבעלות המורה (2026-08-16, בראנץ' `feature/teacher-owned-quiz`)

**הבעיה הקודמת:** הבוחן נוצר ע"י התלמידה הראשונה שנכנסה לדף — היא המתינה לקריאת AI שלא
ביקשה, והשאלות שה-AI כתב נכנסו לשימוש בכיתה בלי שאף אחד אישר אותן. המורה ראתה רק תוצאות
בדיעבד.

**המודל החדש:** טיוטה → עריכה → פרסום. `Quiz.published` (מיגרציה `20260815225526_quiz_published_draft`).

- `POST /lessons/:id/quiz/generate` (ADMIN) — הנתיב **היחיד** שיכול לעלות כסף. קריאת GET של
  תלמידה כבר לא מכניסה שום דבר לתור.
- טיוטה בלתי-נראית לתלמידה: `GET` מחזיר בדיוק אותה תשובה ל"אין בוחן" ול"יש טיוטה",
  ו-`POST /attempt` נכשל ב-409 — לא רק ה-GET מסתיר.
- `PUT /lessons/:id/quiz` — עריכת טקסט שאלה, אפשרויות ותשובה נכונה. **מוחק את כל הניסיונות
  בטרנזקציה אחת** (ציון שמור מתייחס לשאלות שכבר לא קיימות).
- `PATCH /lessons/:id/quiz/publish` — פרסום/החזרה לטיוטה.
- `GET /lessons/:id` מחזיר `quiz: { exists, published }` כדי שדף התלמידה לא יציע קישור
  לבוחן שלא ניתן לפתוח.

**דף נפרד + דשבורד (2026-08-16, המשך אותו בראנץ'):** כל ניהול החידון עבר ל-`/teacher/quiz/:lessonId`
(מקביל ל-`/student/quiz/:lessonId`); בדף השיעור נשאר רק כרטיס סיכום עם כפתור. הדף כולל
דשבורד פילוח **לפי שאלה** — כמה ענו נכון ואיזו תשובה שגויה בחרו — מסודר מהשאלה החלשה.
`getQuizResults` מחשב `optionCounts` / `unanswered` / `correctCount` / `correctRate` + `summary`.

**החלטת עיצוב מתועדת:** הפלטה של הפרויקט נמוכת-רוויה, ו-sage↔coral **נכשלים** בבדיקת
הפרדה לעיוורי-צבעים (ΔE 14.4 מול רף 15; גם sage↔ink-soft = 3.5, וב-dark mode sage↔indigo = 11.6).
לכן **שום דבר בדשבורד לא מקודד בצבע** — גוון אחד לכל העמודות, האורך נושא את הגודל,
והנכונות דרך ✓ + מילים + מספר מודפס. אם מוסיפים גרפים בעתיד — לא להסתמך על הבחנה בין
שני צבעי המותג.

**באג אמיתי שנתפס דרך בדיקה פלייקית:** כפתור "הגש חידון" היה פעיל לפריים אחד בטעינה, כי
`answers` מאותחל ב-`useEffect` ו-`[].some(...)` הוא `false`. לחיצה מהירה שלחה מערך ריק וקיבלה
400. התיקון: הבדיקה מול מספר השאלות, לא רק מול `answers`. **לקח:** בדיקה שנכשלת אחת ל-6
הרצות היא לרוב מרוץ אמיתי, לא רעש.

**מה לא נכלל (החלטה מפורשת):** אין regenerate (יצירה מחדש הייתה מוחקת בשקט שאלות שהמורה
ערכה — `/generate` מחזיר 409 כשקיים בוחן), אין הוספה/מחיקה של שאלות, ואין בחירת מספר שאלות.

**הערה על נתונים קיימים:** `published` נוסף עם `@default(false)`, כך שהבוחן שכבר היה ב-DB
הפך לטיוטה. יש לפרסם אותו ידנית מדף השיעור.

**תופעת לוואי חשובה:** בזמן העבודה רץ `npx prisma generate` (מהמחשב, לא מ-Docker) — ה-client
המקומי היה מיושן מאז מיגרציית `githubUrls`. זה תיקן את **7 כשלי הבדיקות** שהיו קיימים
ב-main. נותרו 5 כשלים ב-4 קבצים (courses/email/grades/groups) — fixtures ישנים מפיצ'רים
אחרים, קיימים ב-main, לא קשורים לבוחן.

**פקודות Prisma מהמחשב** — הקונפיג משתמש ב-`DIRECT_URL`, **לא** ב-`DATABASE_URL`, ו-
`--skip-generate` לא נתמך ב-migrate dev:
```powershell
$env:DIRECT_URL = "postgresql://user:pass@localhost:5432/homework_db"
npx prisma migrate dev --name <name>
```

**עדיין פתוח — איכות הבוחן:** הבוחן נבנה **אך ורק** מ-`lesson.contentMd`. לא נשלחים ל-AI:
`topic`, שם הקורס, קבצי השיעור, `githubUrls`, או המטלות. אין `aiInstructions` לבוחן
(למטלות יש). כלומר ה-prompt לא יודע כלום על הקורס מעבר לטקסט השיעור.

## Render suspended — נגמרה מכסת ה-bandwidth (2026-08-19, אבחון בלבד, לא שונה קוד)

**התסמין:** מיילים חוזרים מגיטהאב "Keep backend awake: All jobs have failed", ~3 בשעה.
ה-workflow `.github/workflows/keep-alive.yml` (cron כל 10 דק') נכשל אחרי ~10 שנ'.

**השורש:** `https://homework-system-3haq.onrender.com` מחזיר **503** בכל נתיב, עם הכותרת
`x-render-routing: suspend-by-user`. הדשבורד מראה `Suspended by Render` והבאנר:
*"You've used the 5 GB of free bandwidth in your Hobby workspace."*
כלומר **חריגת bandwidth**, לא חריגת 750 שעות instance ולא באג. **אזהרה: הכותרת
`suspend-by-user` מטעה — היא מופיעה גם בהשעיית workspace אוטומטית, לא רק בהשעיה ידנית.**

**היקף:** `.env` מראה ש-`FRONTEND_URL` == כתובת ה-backend — פרונט ובק על **אותו** Render
service (Docker, Frankfurt, שם `homework-system`). לכן ההשעיה מפילה את **כל** המערכת.

**מה אוכל את ה-bandwidth (ממצאי בדיקת קוד):**
1. **נכסי הפרונט** נשלחים מ-Render בכל טעינת דף. `frontend/nginx-spa.conf` מפעיל `gzip on`
   אבל **אין בו שום cache header** (`expires`/`Cache-Control`) — למרות ש-Vite מייצר שמות
   עם hash שבטוח לשמור לשנה. גם `gzip_types` חסר `image/svg+xml`.
2. **העלאות קבצים דרך ה-backend:** `backend/src/utils/storage.ts::uploadBuffer` שולח
   ל-Cloudinary **base64 data URI** — ניפוח של ~33% ביציאה מ-Render על כל קובץ. יש כבר
   נתיב ישיר דפדפן→Cloudinary אבל **רק לוידאו** (`POST /submissions/:id/video-upload-signature`).
   שאר הנתיבים (assignments/courses/groups/lessons) עדיין עוברים דרך multer בשרת.
3. **אין `compression` middleware** ב-Express (אומת: אין ב-`app.ts` ולא ב-`package.json`).
   *הורדות* קבצים לא עולות bandwidth — הן מוגשות מ-`secure_url` של Cloudinary.

**לא האשם:** ה-keep-alive עצמו — 4,320 פינגים × ~61 בייט ≈ 260KB לחודש (0.005% מ-5GB).

**האופציות שהוצגו למשתמשת (טרם נבחרה אחת):** כרטיס אשראי ב-Render ($0.15/GB) / להמתין
לאיפוס מחזור החיוב / Pro / **המלצה מבנית: להעביר את הפרונט ל-Vercel** — `frontend/vercel.json`
כבר קיים אבל עם ה-placeholder `YOUR-BACKEND.onrender.com` שמעולם לא מולא. מעבר כזה דורש
גם CORS + עדכון `FRONTEND_URL`/`OAUTH_SUCCESS_REDIRECT`/callbacks של Google+GitHub.

**קשור:** ההחלטה מ-2026-08-06 לעבור ל-keep-alive חיצוני (cron-job.org) **לא בוצעה** —
`keep-alive.yml` עדיין ב-main ועדיין רץ. עד שה-Render יחזור או שה-workflow יכובה,
המיילים ימשיכו.

## Render חזר, הכל תקין — ה"שרת רדום" הוא רק cold start (2026-09-02)

**התסמין:** המשתמשת המתינה לתחילת החודש שחריגת ה-bandwidth תתאפס. Render חזר, אבל
בכניסה היא עדיין רואה את הבאנר "השרת רדום/מתעורר".

**המסקנה הסופית: אין שום תקלה — המערכת עובדת במלואה.** הפרודקשן תקין: לוגין
מחזיר **200** עם טוקן, ה-DB (Supabase) עונה, Redis מחובר. הבאנר "השרת מתעורר" הוא
**cold start רגיל של Render free** (הרדמה אחרי 15 דק' חוסר פעילות; בקשה ראשונה ~30–70 שנ').
זו התנהגות קבועה, **לא** מכסה חודשית — ההמתנה לתחילת החודש תיקנה רק את חריגת ה-bandwidth.
הפתרון למשתמשת: להמתין ~דקה בלי לרענן; ה-retry האוטומטי ב-axios משלים את הלוגין.

**⚠️ לקח לגבי בדיקות — טעות אבחון שקרתה כאן:** בדיקות ראשונות עם
`curl.exe -d '{"...":"..."}'` **דרך PowerShell** נתנו 500, והסקתי בטעות ש"ה-DB נפל".
בפועל **PowerShell משבש את המרכאות** בהעברת ארגומנט ל-exe נייטיב — השרת קיבל
`{email:admin@school.com,...}` בלי מרכאות, body-parser זרק `entity.parse.failed` (400
שממוסך ל-500 ע"י ה-error handler הגלובלי), עוד **לפני** שנגע ב-DB. הלוגים של Render הם
שחשפו: `SyntaxError: Expected property name ... type: 'entity.parse.failed'`.
**הכלל:** ב-Windows להעביר גוף JSON ל-curl **דרך קובץ** (`--data @file.json`), לא inline.
עם קובץ: `login → 200`, `reset-password → 400 "הקישור אינו תקין"` (בדיוק תשובת DB-חי).

**עובדות פרודקשן שאומתו:**
- ה-DB הוא **Supabase** — `aws-0-eu-west-1.pooler.supabase.com:5432` (מלוג העלייה).
  גם `migrate deploy` (DIRECT_URL) וגם ה-seed/runtime (DATABASE_URL/pooler) עובדים.
- הפרונט על **Vercel** — `https://homework-system-mocha.vercel.app` (מכותרת CORS);
  ה-backend על `homework-system-3haq.onrender.com`. ה-boot log מראה `No pending migrations`,
  `Admin user already exists`, 3 workers + 4 חיבורי Redis ready, `Server running on port 4000`.
- מדידת cold start בפועל: בקשה ראשונה 72 שנ', `uptime` אחריה 18 שנ'.

**פתוח (אם ההמתנה מפריעה):** לוודא ש-keep-alive רץ שוב (ייתכן שכובה בגלל מיילי הכישלון
מזמן ההשעיה) — `keep-alive.yml` בריפו, או cron-job.org חיצוני על `/api/health`.

## מפתח Gemini נחסם בפרודקשן + "הגש חידון" נכשל בשקט (2026-09-09, branch fix/quiz-attempt-silent-failure)

### 1. Gemini 403 "Your project has been denied access" — נפתר

**התסמין:** בדומיין בלבד (לא ב-localhost) יצירת בוחן נכשלה עם
`Gemini API error: 403 Your project has been denied access. Please contact support.`

**האבחון:** המפתח שב-`.env` המקומי עבד מצוין (200). מיפוי הודעות Google שנבדק בפועל:
מפתח שגוי → **401 UNAUTHENTICATED**; מפתח ריק → **403 "unregistered callers"**;
ואילו *"your project has been denied access"* = **חסימה ברמת פרויקט Google Cloud** —
Google זיהתה את המפתח, מצאה את הפרויקט שלו, וחסמה את הפרויקט. כלומר לא מפתח שגוי ולא חסר.

**המסקנה:** ב-Render היה מפתח **אחר**, מפרויקט חסום. `.env` המקומי **לא רלוונטי לפרודקשן** —
Render קורא אך ורק ממשתני הסביבה בדשבורד (`dashboard.render.com/web/srv-XXXX/env`).

**התיקון:** המשתמשת יצרה מפתח חדש והגדירה אותו ב-Render תחת `GEMINI_API_KEY`. עובד.

**לזכור:** עדיף מפתח נפרד לכל סביבה (חסימה אחת לא מפילה את השתיים). אם המפתח נוצר בחשבון
Google מוסדי/עבודה — מדיניות ה-admin חוסמת את Generative Language API, ומפתח חדש **מאותו
חשבון ייחסם שוב**; צריך חשבון Gmail פרטי.

### 2. "הגש חידון" לא עשה כלום — תוקן

**שורש א' (למה בשקט):** `frontend/src/pages/student/QuizPage.tsx` היה העמוד היחיד שה-mutation
שלו **בלי `onError`**. כל דחייה מהשרת עצרה את הספינר ולא שינתה דבר על המסך — נראה בדיוק
ככפתור שבור. כל שאר העמודים משתמשים ב-`getApiErrorMessage`.

**שורש ב' (למה בכלל נכשל):** ב-`App.tsx` מקטע `/student/*` מוגן ב-`AuthGuard` בלבד —
**אין role guard** (לעומת `/teacher/*` שיש לו `AdminGuard`). לכן מורה מחוברת יכולה לפתוח
`/student/quiz/:lessonId`, ו-`getQuiz` מציג לה את הבוחן גם כשהוא טיוטה (`isTeacher || quiz.published`).
אבל `POST /lessons/:id/quiz/attempt` הוא `requireRole('STUDENT')` → **403 תמיד**.

**התיקון:** `onError` שמציג את הודעת השרת + באנר "תצוגה מקדימה" למורה + כפתור מושבת עבורה.

**כל השגיאות האפשריות בהגשה** (שימושי לאבחון עתידי):
403 `requireRole('STUDENT')` (מורה מגישה) · 403 `Forbidden` מ-`assertLessonAccess`
(תלמידה בלי שיוך לקבוצה ובלי `lessonAccess`) · 404 שיעור לא קיים · 409 בוחן לא פורסם ·
400 מספר תשובות לא תואם · 500 גנרי.

**חוב פתוח:** `backend/src/utils/access.ts` זורק `'Forbidden'` באנגלית, וההודעה מגיעה
כמות שהיא למסך התלמידה.

### אימות
- `npx tsc --noEmit` בפרונט → **0 שגיאות**.
- `tests/pages/QuizPage.test.tsx` → **8/8 עוברות**.

**⚠️ חוב בדיקות שקדם לשינוי (לא רגרסיה):** בסוויטת הפרונט המלאה **40 בדיקות ב-14 קבצים
נכשלות** (Badge, Button, Card, FileUpload, Input, Layouts + 8 עמודים). הורצה השוואה עם
ובלי השינוי — **רשימת הכשלים זהה בדיוק**, כלומר הכשל קדם לעבודה הזו. שווה טיפול בנפרד.

### שתי מלכודות שהתגלו בהרצה המקומית (אותו תאריך)

**1. `origin/main` הקדים ב-4 קומיטים — refactor של 121 קבצים.** הבראנץ' נוצר מ-main מקומי
מיושן. בוצע `rebase` על main המעודכן; הייתה **התנגשות ב-`student/QuizPage.tsx`** כי ה-refactor
ניסח מחדש בדיוק את השורות שתוקנו (הוסיף `unwrap` מ-`@/lib/api-utils`, הסיר `as any`, וקיצר
הערות ל-"history-free house style"). נפתר בלקיחת גרסת main והחלת התיקון מחדש **בסגנון שלהם**.
**חשוב: ה-refactor לא הוסיף `onError` — הבאג עדיין היה שם, התיקון עדיין נחוץ.**

**2. nginx מחזיק IP ישן אחרי `build` + `up -d` — 502 מטעה.** `docker compose up -d` יוצר מחדש
רק את השירותים שה-image שלהם השתנה. nginx **לא** מופעל מחדש, וממשיך להצביע על ה-IP הישן של
הקונטיינר `api` → **502 בכל `/api/*`** בזמן שהלוג של ה-api מראה `Server running on port 4000`.
**הפתרון:** `docker compose -p homework-app restart nginx` אחרי כל בנייה מחדש של ה-api.

**3. חסימת נטפרי על `cdn.playwright.dev`.** `npx playwright install chromium` נכשל ב-timeout.
עקיפה שעבדה: `chromium.launch({ channel: 'msedge' })` — משתמש ב-Edge המותקן במקום להוריד.
