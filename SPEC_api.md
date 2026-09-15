# API Routes — Homework Submission System

## Response Format (כל endpoint)
```typescript
{ success: true, data: <any> }      // הצלחה
{ success: false, error: "..." }     // שגיאה
```

## Authorization
- כל route מחייב access token חוץ מ-login + OAuth callbacks
- `(ADMIN)` → 403 אם לא ADMIN
- תלמידה ניגשת לנתונים של תלמידה אחרת → 403

---

## Auth `/api/auth`
| Method | Path | Auth | תיאור |
|---|---|---|---|
| POST | `/login` | — | `{ email, password }` → `{ user, accessToken }` + cookie |
| POST | `/refresh` | cookie | → `{ accessToken }` |
| POST | `/logout` | — | מוחק cookie |
| POST | `/change-password` | ✓ | `{ currentPassword, newPassword }` |
| GET | `/me` | ✓ | → `{ user: UserDTO }` |
| GET | `/github` | — | OAuth redirect |
| GET | `/google` | — | OAuth redirect |

---

## Groups `/api/groups` — כל ADMIN
| Method | Path | תיאור |
|---|---|---|
| GET | `/` | רשימת קבוצות + studentCount |
| POST | `/` | `{ name, seminar?, year }` |
| GET | `/:id` | פרטי קבוצה + students + courses |
| PUT | `/:id` | עדכון |
| POST | `/:id/students` | הוסף תלמידה `{ name, email, githubUsername? }` → יוצר User + StudentGroup |
| DELETE | `/:id/students/:studentId` | הסר מקבוצה (לא מוחק User) |
| POST | `/:id/import` | Excel: name\|email\|githubUsername |
| POST | `/:id/reset-password/:studentId` | איפוס סיסמא ל-12345678 |

---

## Courses `/api/courses`
| Method | Path | Auth | תיאור |
|---|---|---|---|
| GET | `/` | ✓ | ADMIN: כולם; STUDENT: רק של הקבוצה שלה. לתלמידה `lessonCount` סופר רק שיעורים גלויים + `completedLessons` (למד ההתקדמות) |
| POST | `/` | ADMIN | `{ name, year?, description?, groupId }` |
| GET | `/:id` | ✓ | פרטי קורס + lessons + links + files. כל שיעור כולל `completed` לתלמידה; ל-ADMIN כל שיעור כולל גם `completedCount`/`groupStudentCount` (כמה תלמידות בקבוצה סיימו את השיעור). **403 אם התלמידה לא בקבוצת הקורס** |
| PUT | `/:id` | ADMIN | עדכון |
| POST | `/:id/copy` | ADMIN | `{ targetGroupId }` — מעתיק תוכן (לא submissions) |
| POST | `/:id/links` | ADMIN | `{ label, url, order? }` |
| DELETE | `/:id/links/:linkId` | ADMIN | |
| POST | `/:id/files` | ADMIN | multipart upload → Cloudinary |
| DELETE | `/:id/files/:fileId` | ADMIN | מחיקה מ-Cloudinary + DB |

---

## Lessons `/api/lessons` + `/api/courses/:courseId/lessons`
| Method | Path | Auth | תיאור |
|---|---|---|---|
| GET | `/courses/:courseId/lessons` | ✓ | STUDENT: ללא hidden |
| POST | `/courses/:courseId/lessons` | ADMIN | `{ topic, lessonDate?, contentMd?, githubUrl?, hidden?, order? }` |
| GET | `/lessons/:id` | ✓ | פרטי שיעור + files (כל קובץ כולל `required`, ולתלמידה גם `viewed`) + assignments + `completed` (סימון התלמידה). **תלמידה: 403 אם השיעור לא בקבוצה שלה ואין LessonAccess** |
| POST | `/lessons/:id/progress` | ✓ | `{ completed: boolean }` — התלמידה מסמנת שסיימה שיעור (בסיס למד ההתקדמות). אם `completed: true` וקיימים קבצי `required` שלא סומנו כנצפו → 400 עם שמות הקבצים החסרים |
| PUT | `/lessons/:id` | ADMIN | עדכון |
| PATCH | `/lessons/reorder` | ADMIN | `{ lessons: [{ id, order }] }` |
| POST | `/lessons/:id/files` | ADMIN | multipart |
| DELETE | `/lessons/:id/files/:fileId` | ADMIN | |
| PATCH | `/lessons/:id/files/:fileId/required` | ADMIN | `{ required: boolean }` — סימון/ביטול קובץ כחובה לצפייה |
| POST | `/lessons/:id/files/:fileId/view` | ✓ | התלמידה מסמנת שצפתה/קראה קובץ חובה (יוצר/מוודא שורת `LessonFileView`) |
| POST | `/lessons/:id/import-md` | ADMIN | קובץ .md → contentMd |
| GET | `/lessons/:id/access` | ADMIN | תלמידות עם גישה חריגה |
| POST | `/lessons/:id/access` | ADMIN | `{ studentId }` — מתן גישה |
| DELETE | `/lessons/:id/access/:studentId` | ADMIN | ביטול גישה |

---

## Assignments `/api/lessons/:lessonId/assignments` + `/api/assignments/:id`
| Method | Path | Auth | תיאור |
|---|---|---|---|
| GET | `/lessons/:lessonId/assignments` | ✓ | |
| POST | `/lessons/:lessonId/assignments` | ADMIN | `{ title, description?, deadline?, allowedTypes?, allowGithub?, allowFile?, requirements?, aiInstructions? }` |
| PUT | `/assignments/:id` | ADMIN | עדכון |
| DELETE | `/assignments/:id` | ADMIN | |

---

## Submissions `/api/submissions` + `/api/assignments/:id/submit`
| Method | Path | Auth | תיאור |
|---|---|---|---|
| POST | `/assignments/:id/submit` | STUDENT | multipart (file+notes) או JSON (repoName+notes) — בונה githubUrl מ-githubUsername |
| GET | `/submissions/mine` | STUDENT | pending + submitted עם grades |
| GET | `/submissions/:id` | ✓ | ADMIN: תמיד; STUDENT: שלה בלבד |
| GET | `/assignments/:id/submissions` | ADMIN | כל הגשות למטלה |
| POST | `/submissions/import` | ADMIN | Excel: assignmentTitle\|studentEmail\|repoName |
| POST | `/submissions/:id/request-ai-review` | STUDENT | בקשת בדיקת AI (מוגבל לפעם אחת) |
| POST | `/submissions/:id/approve-ai` | ADMIN | `aiApproved=true` וגם `Grade.contentApproved=true` (לתאימות לאחור) |
| POST | `/submissions/:id/allow-extra-ai` | ADMIN | `aiExtraAllowed=true` → בקשה נוספת |
| POST | `/submissions/:id/approve-content` | ADMIN | `Grade.contentApproved=true` → תלמידה רואה ציון תוכן, שולח מייל 'grade-approved' |
| POST | `/submissions/bulk-approve-content` | ADMIN | body: `{ submissionIds: string[] }` — אישור מרובה, best-effort (מדלג על הגשות ללא ציון תוכן) |

---

## Grades `/api/grades`
| Method | Path | Auth | תיאור |
|---|---|---|---|
| POST | `/submissions/:id/grade` | ADMIN | upsert `{ submissionScore?, contentScore?, feedback?, checklist?, approveAi? }` |
| GET | `/grades/report` | ADMIN | query: groupId? courseId? |
| GET | `/grades/report/export` | ADMIN | Excel download |
| GET | `/grades/pending` | ADMIN | הגשות ממתינות לבדיקה |

---

## Messages `/api/messages`
| Method | Path | Auth | תיאור |
|---|---|---|---|
| POST | `/` | STUDENT | `{ content, assignmentId? }` — הודעה כללית או בקשת הגשה מאוחרת |
| GET | `/` | ADMIN | כל ההודעות, newest first |
| GET | `/mine` | STUDENT | ההודעות שהתלמידה שלחה + תגובות המורה |
| GET | `/unread-count` | ADMIN | `{ count }` — הודעות תלמידות שלא נקראו |
| GET | `/unread-replies-count` | STUDENT | `{ count }` — תגובות מורה שהתלמידה עוד לא פתחה (`replySeen=false`) |
| PATCH | `/:id/read` | ADMIN | `isRead=true` |
| PATCH | `/:id/reply-seen` | STUDENT | `replySeen=true` — נקרא כשהתלמידה פותחת את דיאלוג ההודעה שלה (רק הודעה שלה) |
| POST | `/:id/reply` | ADMIN | `{ reply }` — שומר `replyContent`, מאפס `replySeen=false` |
| DELETE | `/:id` | ADMIN | מוחקת שיחה שלמה |
| DELETE | `/:id/reply` | ADMIN | מוחקת רק את התגובה, ההודעה המקורית חוזרת ל"ממתין" |
| DELETE | `/:id/mine` | STUDENT | מוחקת הודעה שהיא שלחה (רק שלה) |

---

## AI Usage `/api/ai-usage`
| Method | Path | Auth | תיאור |
|---|---|---|---|
| GET | `/summary` | ADMIN | `{ totalReviews, totalQuizzes, totalCostUsd, last30Days: [{date, reviews, costUsd}] }` |

---

## Quizzes `/api/lessons/:id/quiz`
| Method | Path | Auth | תיאור |
|---|---|---|---|
**הבוחן בבעלות המורה.** היא יוצרת, עורכת ומפרסמת; תלמידה רק עונה.
קריאת GET **לא** מייצרת בוחן — רק `POST .../generate` (ADMIN) עושה זאת.

| Method | Path | Auth | תיאור |
|---|---|---|---|
| GET | `/lessons/:id/quiz` | ✓ | סטטוס + שאלות. ADMIN מקבל גם טיוטה ו-`correctIndex`; STUDENT מקבל רק בוחן שפורסם |
| POST | `/lessons/:id/quiz/generate` | ADMIN | `{ includeFiles?: boolean }` (ברירת מחדל `false`) — האם ה-AI יקבל גם את הקבצים המצורפים לשיעור (`.docx`/`.txt`/`.md` בלבד) בנוסף ל-`contentMd`. מוסיף ל-queue → `202 { status: "generating" }`. 409 אם כבר קיים בוחן או שאין `contentMd` |
| PUT | `/lessons/:id/quiz` | ADMIN | `{ questions: [...] }` — מחליף את השאלות. **מוחק את כל הניסיונות** |
| PATCH | `/lessons/:id/quiz/publish` | ADMIN | `{ published: boolean }` |
| POST | `/lessons/:id/quiz/attempt` | STUDENT | `{ answers: number[] }` → `{ score, correct, total }`. 409 אם הבוחן לא פורסם |
| GET | `/lessons/:id/quiz/results` | ADMIN | `{ quiz, summary, questions, results }` — ראה למטה |

**סטטוסים של GET:**
| status | מי רואה | משמעות |
|---|---|---|
| `ready` | שניהם | יש בוחן (למורה — גם טיוטה) |
| `none` | ADMIN | אין בוחן, יש `contentMd` → אפשר ליצור |
| `generating` | ADMIN | job בתור/רץ |
| `failed` | ADMIN | היצירה נכשלה, כולל הסיבה הטכנית |
| `unavailable` | שניהם | למורה: אין `contentMd`. לתלמידה: אין בוחן **או** שהוא טיוטה — שני המקרים נראים זהים |

`GET /lessons/:id` מחזיר גם `quiz: { exists, published }`. עבור תלמידה `exists` מתקפל
ל-"האם יש בוחן שאני יכולה לפתוח" — טיוטה מחזירה `false`.

**`POST /attempt` מחזיר גם `review`** — זה **המקום היחיד** שתלמידה מקבלת את התשובות הנכונות,
ורק אחרי שענתה:
```
review: [{ id, question, options, correctIndex, selectedIndex, isCorrect }]
```

**`GET /quiz/results` — נתוני הדשבורד של המורה:**
```
summary:   { attemptCount, averageScore }        // averageScore=null אם אין ניסיונות
questions: [{ id, question, options, correctIndex,
              optionCounts,   // כמה בחרו בכל אפשרות, לפי אינדקס
              unanswered,     // דילגו או ערך מחוץ לטווח
              correctCount,
              correctRate }]  // null אם אין ניסיונות — לא 0, שנקרא "כולן טעו"
results:   [{ studentName, studentEmail, score, takenAt }]
```
