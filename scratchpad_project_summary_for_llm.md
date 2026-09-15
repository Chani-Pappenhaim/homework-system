# תיאור פרויקט — מערכת הגשת שיעורי בית

## מה זו המערכת
מערכת Web מלאה (Full Stack) לניהול קורסים, שיעורים, מטלות והגשות, עבור מורה אחת (ADMIN) ומספר תלמידות (STUDENT). כוללת בדיקה אוטומטית של הגשות באמצעות AI, חידונים, ודוחות ציונים.

## Stack טכנולוגי
- **Backend:** Node.js + Express + TypeScript, מסד נתונים PostgreSQL עם Prisma ORM (Prisma 7, driver adapter ל-pg).
- **Frontend:** React + TypeScript + Vite, Tailwind CSS + shadcn/ui, React Query.
- **תשתית אסינכרונית:** BullMQ + Redis — worker נפרד לבדיקת AI, חידונים, מיילים, דוחות דדליין.
- **אחסון קבצים/וידאו:** Cloudinary (כולל העלאה ישירה מהדפדפן בחתימה חתומה מהשרת, ל-video/large files).
- **AI:** Google Gemini לבדיקת הגשות אוטומטית ולחידונים.
- **מיילים:** Brevo (HTTP API).
- **אימות:** JWT (access+refresh), Google OAuth, GitHub OAuth, flow שכחתי-סיסמה.
- **Deploy/Infra:** Docker Compose — שירותים: nginx (gateway), frontend, api, worker, postgres, redis.

## ארכיטקטורת השירותים (docker-compose)
| שירות | תפקיד |
|---|---|
| nginx | שער כניסה — מגיש frontend, מנתב API |
| frontend | React בבנייה סטטית |
| api | Express server |
| worker | עיבוד רקע (BullMQ) |
| postgres | DB ראשי |
| redis | תור משימות + cache |

## תכונות עיקריות
- ניהול קורסים → שיעורים → מטלות, עם קבוצות תלמידות והרשאות גישה פר-שיעור/קבוצה.
- הגשת מטלות (קובץ/וידאו/GitHub URL) + checklist דרישות.
- בדיקה אוטומטית ע"י AI (Gemini) עם ציון תוכן (aiScore) + ציון הגשה אוטומטי (submissionScore לפי עמידה בזמנים ובדרישות), אישור/דריסה ע"י המורה.
- חידונים אוטומטיים מבוססי AI.
- מערכת הודעות בין מורה לתלמידה, מקושרת למטלות.
- דוחות/סטטיסטיקות שימוש ב-AI וציונים.
- ניהול תלמידות: ייבוא מ-Excel, autocomplete, הענקת גישה קבוצתית.
- אבטחה: הרשאות מבוססות תפקיד, אכיפת שייכות לקבוצה/קורס בכל endpoint (utils/access.ts), הסתרת שדות רגישים (aiInstructions, aiScore) מהתלמידה בצד השרת.

## מבנה קוד
**Backend** (`backend/src`): `controllers` / `services` / `routes` / `middleware` / `workers` / `emails` / `utils` / `config` / `infrastructure` / `types`.
**Frontend** (`frontend/src`): `pages` (מפוצל teacher/student) / `components` (כולל `ui` — shadcn) / `hooks` / `api` / `store` / `lib`.

## מצב נוכחי
המערכת פונקציונלית מקצה לקצה, רצה ב-Docker, עם בדיקות (Vitest) בשני הצדדים. עדיין קיימות סוגיות ארכיטקטורה ידועות (ראו ביקורת ארכיטקטורה בהמשך) שטרם טופלו: לוגיקת Prisma ישירות ב-controllers במקום ב-service, `gemini.service` שעושה כמה דברים בבת אחת, קומפוננטת frontend גדולה מדי (LessonDetailPage, ~640 שורות), שימוש נרחב ב-`as any` בתקשורת API, אין error-middleware מרכזי, אין ולידציה עם zod.
