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
| GET | `/:id` | ✓ | פרטי קורס + lessons + links + files. כל שיעור כולל `completed` לתלמידה; **403 אם התלמידה לא בקבוצת הקורס** |
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
| GET | `/lessons/:id` | ✓ | פרטי שיעור + files + assignments + `completed` (סימון התלמידה). **תלמידה: 403 אם השיעור לא בקבוצה שלה ואין LessonAccess** |
| POST | `/lessons/:id/progress` | ✓ | `{ completed: boolean }` — התלמידה מסמנת שסיימה שיעור (בסיס למד ההתקדמות) |
| PUT | `/lessons/:id` | ADMIN | עדכון |
| PATCH | `/lessons/reorder` | ADMIN | `{ lessons: [{ id, order }] }` |
| POST | `/lessons/:id/files` | ADMIN | multipart |
| DELETE | `/lessons/:id/files/:fileId` | ADMIN | |
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
| POST | `/submissions/:id/approve-ai` | ADMIN | `aiApproved=true` → תלמידה רואה ציון תוכן |
| POST | `/submissions/:id/allow-extra-ai` | ADMIN | `aiExtraAllowed=true` → בקשה נוספת |

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
| GET | `/unread-count` | ADMIN | `{ count }` |
| PATCH | `/:id/read` | ADMIN | `isRead=true` |

---

## AI Usage `/api/ai-usage`
| Method | Path | Auth | תיאור |
|---|---|---|---|
| GET | `/summary` | ADMIN | `{ totalReviews, totalQuizzes, totalCostUsd, last30Days: [{date, reviews, costUsd}] }` |

---

## Quizzes `/api/lessons/:id/quiz`
| Method | Path | Auth | תיאור |
|---|---|---|---|
| GET | `/lessons/:id/quiz` | ✓ | אם לא קיים → מוסיף ל-queue → `{ status: "generating" }` |
| POST | `/lessons/:id/quiz/attempt` | STUDENT | `{ answers: number[] }` → `{ score, correct, total }` |
| GET | `/lessons/:id/quiz/results` | ADMIN | תוצאות כל התלמידות |
