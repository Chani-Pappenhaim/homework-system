# מערכת הגשת שיעורי בית

מערכת לניהול קורסים, שיעורים, מטלות והגשות, עם בדיקת AI אוטומטית, חידונים, ודוחות ציונים.
המערכת מיועדת למורה אחת (ADMIN) ולתלמידות (STUDENT).

---

## דרישות מקדימות

- **Docker Desktop** מותקן ורץ (כולל Docker Compose)
- **Node.js 22** — נדרש רק אם ה־migration האוטומטי נכשל וצריך להריץ אותו ידנית מהמחשב (ראה שלב 3)
- קובץ `.env` בתיקיית השורש (מקבלים מבעלת הפרויקט, או מרכיבים מ־`.env.example`)

---

## מבנה המערכת (Docker Compose)

| שירות | תפקיד | פורט |
|---|---|---|
| `nginx` | שער כניסה — מגיש את הפרונט ומעביר קריאות API | 80, 443 |
| `frontend` | React (נבנה ל־static, מוגש דרך nginx) | פנימי |
| `api` | שרת Node/Express | 4000 |
| `worker` | עיבוד רקע (בדיקת AI, חידונים, מיילים, דוחות deadline) | פנימי |
| `postgres` | מסד הנתונים הראשי | 5432 |
| `redis` | תור משימות (BullMQ) ומטמון | פנימי |

---

## הרצה ראשונה — שלב אחר שלב

> כל הפקודות מורצות ב־**PowerShell** מתיקיית השורש של הפרויקט.

### שלב 1 — קובץ סביבה `.env`

צריך קובץ `.env` בתיקיית השורש של הפרויקט. **הוא לא נמצא ב־Git** (הוא מכיל מפתחות סודיים).

- **אם קיבלת את הקובץ מבעלת הפרויקט** — פשוט שים אותו בתיקיית השורש (ליד `docker-compose.yml`). זהו, אין מה למלא.
- **אם את מרכיבה אותו לבד** — העתק את התבנית ומלא ערכים:

  ```powershell
  Copy-Item .env.example .env
  ```

  ערכים חשובים:
  - `JWT_SECRET`, `JWT_REFRESH_SECRET` — מחרוזות אקראיות ארוכות (יש ערכי dev מוכנים ב־`.env.example`)
  - `GEMINI_API_KEY` — לבדיקת AI (Google Gemini)
  - `CLOUDINARY_*` — לאחסון קבצי הגשה
  - `GITHUB_*` / `GOOGLE_*` — התחברות OAuth (אופציונלי)
  - `SMTP_*` — שליחת מיילים (אם ריק — המערכת רצה, רק לא שולחת מיילים)

> ⚠️ לעולם אל תעלה את `.env` ל־Git.

### שלב 2 — בנייה + הרמה

```powershell
docker compose -p homework-app up -d --build
```

הבנייה הראשונה לוקחת כמה דקות (מוריד image-ים ומתקין חבילות).
בדוק שכל הקונטיינרים עלו:

```powershell
docker ps
```

### שלב 3 — בסיס הנתונים (migrations + seed)

בפעם הראשונה שה־API עולה הוא **אמור להריץ אוטומטית** את ה־migrations
(בניית טבלאות מסד הנתונים) ואת ה־seed (יצירת משתמש המורה). עקוב אחרי הלוגים:

```powershell
docker compose -p homework-app logs -f api
```

אם רואים בלוגים `==> Applying database migrations...` ואחריו
`==> Seeding initial data...` — הכל תקין, אפשר לדלג לשלב 4.

#### אם ההרצה האוטומטית נכשלה (למשל שגיאת SSL של רשת נטפרי)

> כרגע, כל עוד נטפרי לא הוציאו את הדומיינים מפענוח SSL (ראה "בעיות ידועות"),
> ייתכן שה־migration האוטומטי ייכשל. במקרה כזה מריצים אותו **ידנית מהמחשב** —
> המחשב מכיר את אישורי נטפרי, אז זה עובד. Postgres כבר רץ בקונטיינר, אז זה בטוח.

```powershell
cd backend
npm install

# בניית מבנה מסד הנתונים (localhost כי מריצים מהמחשב, לא מתוך Docker)
$env:DATABASE_URL = "postgresql://user:pass@localhost:5432/homework_db"
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
npx prisma migrate deploy --config prisma.config.ts

# יצירת משתמש המורה הראשוני
npm run db:seed

cd ..
```

לאחר מכן אתחל את ה־API כדי שיתפוס את הסכימה החדשה:

```powershell
docker compose -p homework-app restart api worker
```

### שלב 4 — כניסה למערכת

פתח בדפדפן: **http://localhost**

פרטי כניסה של המורה (נוצרים ב־seed):

| שדה | ערך |
|---|---|
| אימייל | `admin@school.com` |
| סיסמה | `admin123` |

תלמידה שנוספת לקבוצה מקבלת סיסמת ברירת מחדל `12345678` ומתבקשת להחליף אותה בכניסה הראשונה.

---

## פקודות שימושיות

| פעולה | פקודה |
|---|---|
| הרמה | `docker compose -p homework-app up -d` |
| עצירה | `docker compose -p homework-app down` |
| עצירה + מחיקת נתונים | `docker compose -p homework-app down -v` |
| לוגים של ה־API | `docker compose -p homework-app logs -f api` |
| לוגים של ה־worker | `docker compose -p homework-app logs -f worker` |
| בנייה מחדש (אחרי שינוי קוד) | `docker compose -p homework-app build api frontend` ואז `up -d` |
| בנייה נקייה (כששינויים לא נטענים) | `docker compose -p homework-app build --no-cache api frontend` |

---

## פיתוח מקומי (בלי Docker, אופציונלי)

מריצים Postgres ו־Redis בלבד ב־Docker, ואת ה־API וה־frontend מקומית:

```powershell
# טרמינל 1 — Backend
cd backend
npm install
npm run dev

# טרמינל 2 — Frontend
cd frontend
npm install
npm run dev
```

> בפיתוח מקומי ה־`DATABASE_URL` צריך להצביע על `localhost:5432` (ולא `postgres:5432`).

---

## בעיות ידועות

- **רשת נטפרי — יירוט SSL:** בזמן `docker build` עלולה להופיע השגיאה
  `unable to get local issuer certificate` כש־Docker/Prisma/npm מורידים קבצים.
  הפתרון הנקי הוא לבקש מנטפרי להוציא מפענוח SSL את הדומיינים:
  `binaries.prisma.sh`, `registry.npmjs.org`, `registry-1.docker.io`,
  `auth.docker.io`, `production.cloudflare.docker.com`.
  כ־workaround, מוגדר כבר ב־Dockerfile `NODE_TLS_REJECT_UNAUTHORIZED=0`.
  ה־migrations רצים אוטומטית בתוך הקונטיינר דרך ה־driver adapter (חיבור ישיר
  ל־Postgres, בלי הורדות חיצוניות), כך שהם לא מושפעים מיירוט ה־SSL.

- **"read-only file system" בזמן build:** הרץ `docker builder prune -f` ואז build מחדש.

- **שינויים בקוד לא נטענים:** בנה עם `--no-cache` והרם עם `--force-recreate`.

- **`/bin/sh: bad interpreter: ...^M` בהרצת ה־api:** קרה אם ה־entrypoint נשמר עם
  סופי־שורה של Windows (CRLF). ה־`.gitattributes` שבפרויקט מכריח LF, אז זה
  לא אמור לקרות; אם כן — ודא ש־`git clone` נעשה אחרי שה־`.gitattributes` קיים.
