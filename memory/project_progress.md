# התקדמות הפרויקט

> קובץ זה עוקב אחרי מה שהושלם ומה שנשאר. יש לעדכן אותו בסוף כל שיחה שבה נעשתה עבודה.

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

## טיפול בהרדמות השרת / cold start (2026-07-24, branch feat/handle-server-sleep — טרם מוזג)

- **הרקע:** backend על Render free tier נרדם אחרי ~15 דק' חוסר פעילות → הבקשה הבאה סובלת מ-cold start של 30–60 שנ'. frontend על Vercel.
- **Backend:** נוסף `GET /api/health` ב-`app.ts` (לפני ה-rate limiter, בלי auth/DB) — מחזיר `{status:'ok', uptime}`. משמש גם ל-keep-alive חיצוני וגם ל-warm-up מהקליינט. (ביטל את ההנחה הישנה ש-/api/health הוא 404.)
- **Frontend:** 
  - `store/serverStatus.ts` (zustand) — דגל `waking`.
  - `api/axios.ts` שוכתב: timeout 60s; ספירת בקשות in-flight (פעם אחת לכל בקשה לוגית דרך `_counted`) → אם משהו תקוע מעל 4s מדליק באנר; **retry אוטומטי** עד 4 פעמים עם backoff (2/4/6/8s) על שגיאות cold-start (timeout / אין response / 502/503/504). זרימת ה-401 refresh הקיימת נשמרה ומשולבת עם ה-bookkeeping.
  - `components/ui/server-waking-banner.tsx` — באנר עליון "השרת מתעורר..." מונע מ-`serverStatus`. הורכב ב-`main.tsx` בתוך `Root` (רץ עם ה-bootstrap שהוא הבקשה הראשונה/הקרה).
- **בדיקות:** health test ב-`app.test.ts`, `ServerWakingBanner.test.tsx` (3). backend 217, frontend 232, tsc+build נקיים.
- **keep-alive בקוד:** נוסף `.github/workflows/keep-alive.yml` — GitHub Actions cron כל 10 דק' שמפינג `https://homework-system-3haq.onrender.com/api/health` (הכתובת הציבורית מ-`.env`; frontend+backend על אותו Render service). **רץ רק אחרי מיזוג ל-main** (scheduled workflows רצים רק מה-default branch). **אזהרת עלות:** אם הריפו פרטי — 10 דק' חורג מ-2000 דקות Actions החינמיות בחודש; אז עדיף UptimeRobot/cron-job.org על אותו URL. הכתובת `homework-system-3haq.onrender.com` מקודדת בworkflow — לעדכן אם השרת עובר כתובת.
- **גיט:** המשתמשת מבצעת בעצמה. השינויים בבראנץ' `feat/handle-server-sleep`, לא מוזגו ולא נדחפו.

## הערות טכניות חשובות

- **קובץ `.env`**: חייב להיות בשורש בשם `.env` בדיוק (עם נקודה). Windows Explorer יוצר לפעמים `env` בלי נקודה — Docker Compose לא ימצא אותו. תוקן ב-2026-07-20.
- ה-`.env` לא נכנס ל-git (מכוסה ב-`.gitignore`).

## נשאר לעשות / מפתחות חסרים ב-.env (פיצ'רים מושבתים עד למילוי)

- `CLAUDE_API_KEY` — **חסר לגמרי**. יצירת חידונים לא תעבוד ([backend/src/workers/quiz.worker.ts](../backend/src/workers/quiz.worker.ts)).
- `GEMINI_API_KEY` — קיים אך מתחיל ב-`AQ.` (מפתחות Gemini רגילים מתחילים ב-`AIza`). ייתכן שבדיקת ה-AI של הגשות תיכשל — כדאי לאמת.
- `CLOUDINARY_*` — ריק. העלאת קבצי הגשה לא תעבוד.
- `SMTP_*` — ריק. מיילים לא יישלחו (המערכת רצה רגיל בלי זה).
- ~~`GITHUB_*` / `GOOGLE_*` — ריק. OAuth לא זמין.~~ ✅ **הושלם (2026-07-20):** שני ה-OAuth מוגדרים ועובדים (Google + GitHub). callback URLs מכוונים ל-`http://localhost/...` — יש לעדכן לדומיין אמיתי בפריסה לשרת.

## הערות OAuth (2026-07-20)

- **חשוב — עדכון `.env` לא נקלט ב-`restart`:** משתני סביבה מוזרקים רק ביצירת קונטיינר. אחרי שינוי `.env` חובה `docker compose -p homework-app up -d api worker` (יוצר מחדש), **לא** `restart`.
- **502 אחרי יצירת api מחדש:** nginx שומר את ה-IP הישן של הקונטיינר. פתרון: `docker compose -p homework-app restart nginx` אחרי כל `up -d` שיוצר מחדש את api.
- **פריסה לשרת:** בעת מעבר מ-localhost לדומיין יש לעדכן ב-3 מקומות — (1) callback URLs ב-Google Console + GitHub OAuth App, (2) `GITHUB_CALLBACK_URL`/`GOOGLE_CALLBACK_URL`/`OAUTH_SUCCESS_REDIRECT`/`FRONTEND_URL` ב-`.env`, (3) `up -d` מחדש. הדומיין יידרש `https`.
- **Google Test users:** כל עוד ה-consent screen ב-mode "Testing", רק אימיילים ברשימת Test users יכולים להתחבר.

לאחר מילוי מפתחות: `docker compose -p homework-app restart api worker`.
