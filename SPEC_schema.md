# Schema — Homework Submission System

> Prisma schema (PostgreSQL). עדכן גם migration אחרי כל שינוי.

## Models Summary
| Model | תיאור |
|---|---|
| User | מורה (ADMIN) / תלמידה (STUDENT) |
| Group | קבוצת תלמידות + סמינר + שנה |
| StudentGroup | many-to-many: User ↔ Group |
| Course | קורס השייך לקבוצה אחת |
| Lesson | שיעור בתוך קורס |
| LessonAccess | גישה חריגה לשיעור לתלמידה ספציפית |
| LessonProgress | סימון עצמי של תלמידה שסיימה שיעור (בסיס למד ההתקדמות) |
| Assignment | מטלה בתוך שיעור |
| Submission | הגשה של תלמידה למטלה (אחת בלבד) |
| Grade | ציון להגשה — שני ציונים נפרדים |
| AiUsageLog | מעקב שימוש + עלות Gemini |
| TeacherMessage | הודעה מתלמידה למורה |
| Quiz | חידון אמריקאי לשיעור (נוצר פעם אחת) |
| QuizAttempt | ניסיון חידון של תלמידה |

## Key Fields to Remember

**User:** `githubUsername String?` — נדרש לבנות URL להגשה

**Assignment:**
- `requirements Json?` — תבנית checklist שהמורה מגדירה
- `aiInstructions String?` — הנחיות למורה לAI לבדיקה

**Submission:**
- `checklist Json?` — עותק ממולא של requirements בזמן הגשה
- `githubUrl String?` — נבנה מ-`githubUsername/repoName`
- `isLate Boolean` — מחושב אוטומטית בזמן הגשה
- AI fields: `aiStatus`, `aiScore`, `aiCodeReview`, `aiVerbalReview`, `aiApproved`, `aiReviewCount`, `aiExtraAllowed`

**Grade — שני ציונים נפרדים (לעולם אל תערבב):**
- `submissionScore Float? @default(100)` — ציון הגשה: אוטומטי (100 − איחור − checklist)
- `contentScore Float?` — ציון תוכן: מה-AI, עריכה ידנית ע"י מורה, מוסתר עד aiApproved

**AiUsageLog:** `type` ("homework_review" | "quiz_generation"), `tokensInput`, `tokensOutput`, `costUsd`

**TeacherMessage:** `assignmentId String?` — אם קיים → בקשת הגשה מאוחרת למטלה ספציפית; `isRead Boolean`

## Schema (מלא)

```prisma
enum Role { ADMIN; STUDENT }

model User {
  id String @id @default(uuid())
  name String
  email String @unique
  password String?
  role Role @default(STUDENT)
  mustChangePassword Boolean @default(true)
  githubUsername String?
  oauthProvider String?
  oauthId String?
  createdAt DateTime @default(now())
  studentGroups StudentGroup[]
  submissions Submission[]
  quizAttempts QuizAttempt[]
  gradesGiven Grade[]
  lessonAccess LessonAccess[]
  teacherMessages TeacherMessage[]
}

model Group {
  id String @id @default(uuid())
  name String
  seminar String?
  year String
  createdAt DateTime @default(now())
  students StudentGroup[]
  courses Course[]
}

model StudentGroup {
  studentId String
  groupId String
  student User @relation(fields: [studentId], references: [id], onDelete: Cascade)
  group Group @relation(fields: [groupId], references: [id], onDelete: Cascade)
  @@id([studentId, groupId])
}

model Course {
  id String @id @default(uuid())
  name String
  year String?
  description String?
  imageUrl String?
  hidden Boolean @default(false)
  groupId String
  group Group @relation(fields: [groupId], references: [id])
  createdAt DateTime @default(now())
  lessons Lesson[]
  links CourseLink[]
  files CourseFile[]
}

model LessonAccess {
  studentId String
  lessonId String
  student User @relation(fields: [studentId], references: [id], onDelete: Cascade)
  lesson Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  @@id([studentId, lessonId])
}

model Lesson {
  id String @id @default(uuid())
  courseId String
  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
  topic String
  lessonDate DateTime?
  contentMd String?
  githubUrl String?
  hidden Boolean @default(false)
  order Int @default(0)
  createdAt DateTime @default(now())
  assignments Assignment[]
  files LessonFile[]
  quiz Quiz?
  lessonAccess LessonAccess[]
  progress LessonProgress[]
}

// קיום שורה = התלמידה סימנה שסיימה את השיעור
model LessonProgress {
  studentId String
  lessonId String
  completedAt DateTime @default(now())
  student User @relation(fields: [studentId], references: [id], onDelete: Cascade)
  lesson Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  @@id([studentId, lessonId])
}

model Assignment {
  id String @id @default(uuid())
  lessonId String
  lesson Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  title String
  description String?
  deadline DateTime?
  allowedTypes String[] @default([])
  allowGithub Boolean @default(true)
  allowFile Boolean @default(true)
  requirements Json?
  aiInstructions String?
  createdAt DateTime @default(now())
  submissions Submission[]
}

model Submission {
  id String @id @default(uuid())
  assignmentId String
  studentId String
  assignment Assignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  student User @relation(fields: [studentId], references: [id], onDelete: Cascade)
  fileUrl String?
  fileName String?
  githubUrl String?
  notes String?
  checklist Json?
  submittedAt DateTime @default(now())
  isLate Boolean @default(false)
  aiStatus String @default("none")   // "none"|"pending"|"done"|"error"
  aiScore Float?
  aiCodeReview String?
  aiVerbalReview String?
  aiApproved Boolean @default(false)
  aiReviewCount Int @default(0)
  aiExtraAllowed Boolean @default(false)
  grade Grade?
  @@unique([assignmentId, studentId])
}

model Grade {
  id String @id @default(uuid())
  submissionId String @unique
  submission Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  submissionScore Float? @default(100)   // ציון הגשה — אוטומטי
  contentScore Float?                    // ציון תוכן — מAI, עריכה ידנית
  feedback String?
  gradedAt DateTime @default(now())
  gradedById String
  gradedBy User @relation(fields: [gradedById], references: [id])
}

model AiUsageLog {
  id String @id @default(uuid())
  type String   // "homework_review"|"quiz_generation"
  tokensInput Int
  tokensOutput Int
  costUsd Float
  createdAt DateTime @default(now())
}

model TeacherMessage {
  id String @id @default(uuid())
  studentId String
  student User @relation(fields: [studentId], references: [id], onDelete: Cascade)
  content String
  assignmentId String?
  isRead Boolean @default(false)
  createdAt DateTime @default(now())
}

model Quiz {
  id String @id @default(uuid())
  lessonId String @unique
  lesson Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  questions Json   // Array<{ id, question, options: string[4], correctIndex: 0|1|2|3 }>
  createdAt DateTime @default(now())
  attempts QuizAttempt[]
}

model QuizAttempt {
  id String @id @default(uuid())
  quizId String
  studentId String
  quiz Quiz @relation(fields: [quizId], references: [id], onDelete: Cascade)
  student User @relation(fields: [studentId], references: [id], onDelete: Cascade)
  answers Json   // Array<number>
  score Float
  takenAt DateTime @default(now())
  @@unique([quizId, studentId])
}
```
