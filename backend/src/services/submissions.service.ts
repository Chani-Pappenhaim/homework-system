import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { uploadBuffer, createUploadSignature, destroyByUrl, isOwnUpload, submissionFileLink } from '../utils/storage';
import { confirmUpload, discardPendingUpload } from './pending-uploads.service';
import { releaseFileUrls } from './file-refs.service';
import { assertLessonAccess } from './access.service';
import { computeSubmissionScore } from '../utils/grading';
import { getRepoStatus, normalizeRepoName, parseRepoRef } from '../utils/github';

function urlExtension(url: string): string {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(url);
  return match ? match[1]!.toLowerCase() : '';
}

type SubmitPayload = {
  repoName?: string;
  notes?: string;
  checklist?: unknown;
  file?: { buffer: Buffer; originalName: string; mimeType: string };
    // Already uploaded straight from the browser to Cloudinary (videos) —
    // the server only ever sees the resulting URL, never the file bytes.
    uploadedFile?: { url: string; originalName: string };
};

/**
 * Whatever the outcome, no stored file is left that nothing points at: a
 * rejected or failed submission removes the file it brought, and a successful
 * one removes the file it replaced.
 */
export async function submitAssignment(assignmentId: string, studentId: string, payload: SubmitPayload) {
  const uploaded: { url: string | null } = { url: null };
  try {
    const { submission, replacedFileUrl } = await saveSubmission(assignmentId, studentId, payload, uploaded);
    if (payload.uploadedFile) await confirmUpload(payload.uploadedFile.url);
    if (replacedFileUrl && replacedFileUrl !== submission.fileUrl) await releaseFileUrls([replacedFileUrl]);
    return submission;
  } catch (err) {
    if (uploaded.url) await destroyByUrl(uploaded.url).catch((e) => console.error('[storage] cleanup failed:', uploaded.url, e));
    if (payload.uploadedFile) await discardPendingUpload(payload.uploadedFile.url, studentId);
    throw err;
  }
}

async function saveSubmission(
  assignmentId: string, studentId: string, payload: SubmitPayload, uploaded: { url: string | null }
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { lesson: { include: { course: true } } },
  });
  if (!assignment) throw new AppError('Assignment not found', 'המטלה לא נמצאה', 404);

  await assertLessonAccess(studentId, 'STUDENT', assignment.lessonId);

  // Checked before anything is uploaded, so a refusal costs no upload.
  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    include: { grade: true },
  });
  if (existing?.aiStatus === 'pending') {
    throw new AppError(
      'AI review in progress',
      'בדיקת AI של ההגשה הקודמת עדיין רצה - אפשר להגיש מחדש כשהיא תסתיים',
      409
    );
  }
  if (existing && teacherChecked(existing.grade) && !existing.changesAllowed) {
    throw new AppError('Submission already checked by the teacher', CHECKED_BY_TEACHER, 409);
  }

  // Every submission is exactly one kind: whichever field doesn't apply is
  // cleared, so a resubmission in another form leaves nothing of the old one.
  let fileUrl: string | null = null;
  let fileName: string | null = null;
  let githubUrl: string | null = null;

  if (payload.repoName) {
    if (!assignment.allowGithub) throw new AppError('GitHub not allowed for this assignment', 'הגשת GitHub אינה מותרת במטלה זו', 400);
    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student?.githubUsername) throw new AppError('No GitHub username set for your account', 'לא הוגדר שם משתמש GitHub בחשבון שלך - יש לעדכן אותו בפרופיל', 400);
    const repoName = normalizeRepoName(payload.repoName);
    if (!repoName) throw new AppError('Empty repo name', 'יש להזין שם ריפו', 400);
    const repoStatus = await getRepoStatus(student.githubUsername, repoName);
    if (repoStatus === 'missing') {
      throw new AppError(
        `Repo ${student.githubUsername}/${repoName} not found`,
        `הריפו github.com/${student.githubUsername}/${repoName} לא נמצא. יש לבדוק את שם הריפו, את שם המשתמש בפרופיל, ושהריפו ציבורי`,
        400
      );
    }
    // An unverified link is not accepted: it may well be a typo, and the
    // teacher would only find out when grading.
    if (repoStatus === 'unknown') {
      throw new AppError(
        'GitHub could not be reached to verify the repo',
        'לא ניתן לאמת כרגע את הריפו מול GitHub. ההגשה לא נשמרה - יש לנסות שוב בעוד כמה דקות',
        503
      );
    }
    githubUrl = `https://github.com/${student.githubUsername}/${repoName}`;
  } else if (payload.file || payload.uploadedFile) {
    if (!assignment.allowFile) throw new AppError('File upload not allowed for this assignment', 'העלאת קובץ אינה מותרת במטלה זו', 400);
    const originalName = payload.file ? payload.file.originalName : payload.uploadedFile!.originalName;
    // The browser reports a direct upload's URL and name itself, so neither is
    // trusted: the URL must be our own Cloudinary submissions folder (anything
    // else would be fetched by the AI worker and shown to the teacher), and the
    // type check covers the stored file's extension as well as the name.
    if (payload.uploadedFile && !isOwnUpload(payload.uploadedFile.url, 'submissions')) {
      throw new AppError('Uploaded file URL is not ours', 'כתובת הקובץ שהועלה אינה תקינה', 400);
    }
    if (assignment.allowedTypes.length > 0) {
      const ext = originalName.split('.').pop()?.toLowerCase() ?? '';
      const storedExt = payload.uploadedFile ? urlExtension(payload.uploadedFile.url) : ext;
      if (!assignment.allowedTypes.includes(ext) || (storedExt && !assignment.allowedTypes.includes(storedExt))) {
        throw new AppError(
          `File type not allowed. Allowed: ${assignment.allowedTypes.join(', ')}`,
          `סוג הקובץ אינו מורשה. סוגים מותרים: ${assignment.allowedTypes.join(', ')}`,
          400
        );
      }
    }
    if (payload.file) {
      fileUrl = (await uploadBuffer(payload.file.buffer, payload.file.mimeType, 'submissions', payload.file.originalName)).url;
      uploaded.url = fileUrl;
    } else {
      fileUrl = payload.uploadedFile!.url;
    }
    fileName = originalName;
  } else {
    throw new AppError('No file or repo name provided', 'לא סופק קובץ או שם ריפו', 400);
  }

  const isLate = assignment.deadline ? new Date() > assignment.deadline : false;
  const notes = payload.notes ?? null;
  // undefined leaves the stored checklist untouched on resubmit; a real array replaces it.
  const checklist = payload.checklist === undefined ? undefined : (payload.checklist as any);

  const submission = await writeSubmission(assignmentId, studentId, existing, { fileUrl, fileName, githubUrl, notes, checklist, isLate });
  return { submission, replacedFileUrl: existing?.fileUrl ?? null };
}

/**
 * Saves new content as the student's submission of the assignment, over her
 * existing one if there is one, with its automatic submission score.
 */
async function writeSubmission(
  assignmentId: string,
  studentId: string,
  existing: { id: string } | null,
  content: {
    fileUrl: string | null; fileName: string | null; githubUrl: string | null;
    notes: string | null; checklist: any; isLate: boolean;
  },
) {
  const { fileUrl, fileName, githubUrl, notes, checklist, isLate } = content;
  // New content makes the old AI review and the teacher's approval stale: the
  // review is cleared and the content score goes back to unpublished, so an
  // approved grade never ends up on work nobody looked at. The review count
  // stays, or resubmitting would refill the AI quota - and so does the count a
  // deleted submission left behind. The teacher's permission to change a
  // checked submission is used up by this resubmit.
  let submission;
  if (existing) {
    submission = await prisma.submission.update({
      where: { id: existing.id },
      data: {
        fileUrl, fileName, githubUrl, notes, checklist, submittedAt: new Date(), isLate, changesAllowed: false,
        aiStatus: 'none', aiScore: null, aiCodeReview: null, aiVerbalReview: null, aiApproved: false, aiError: null,
      },
    });
  } else {
    const key = { assignmentId_studentId: { assignmentId, studentId } };
    const carried = await prisma.aiReviewCarryover.findUnique({ where: key });
    submission = await prisma.submission.create({
      data: {
        assignmentId, studentId, fileUrl, fileName, githubUrl, notes, checklist, isLate,
        ...(carried ? { aiReviewCount: carried.aiReviewCount, aiExtraAllowed: carried.aiExtraAllowed } : {}),
      },
    });
    if (carried) await prisma.aiReviewCarryover.deleteMany({ where: { assignmentId, studentId } });
  }

  // Automatic submission score, visible to the student right away. Any
  // contentScore/feedback already given by the teacher is left untouched.
  const submissionScore = computeSubmissionScore(isLate, submission.checklist);
  await prisma.grade.upsert({
    where: { submissionId: submission.id },
    create: { submissionId: submission.id, submissionScore },
    update: { submissionScore, contentApproved: false },
  });

  return submission;
}

type TeacherSubmitPayload = {
  /** A repo name (of the student's own GitHub account), owner/repo, or a full GitHub link. */
  repo?: string;
  file?: { buffer: Buffer; originalName: string; mimeType: string };
  isLate?: boolean;
};

/**
 * The teacher submits an assignment for a student - work she handed in another
 * way. Unlike the student, the teacher is not held to the assignment's ways of
 * submitting or file types, nor to a check already given: she decides. It is
 * on time unless she marks it late.
 */
export async function submitForStudent(assignmentId: string, studentId: string, payload: TeacherSubmitPayload) {
  const uploaded: { url: string | null } = { url: null };
  try {
    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { id: true } });
    if (!assignment) throw new AppError('Assignment not found', 'המטלה לא נמצאה', 404);
    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { role: true, githubUsername: true } });
    if (student?.role !== 'STUDENT') throw new AppError('Student not found', 'התלמידה לא נמצאה', 404);

    const existing = await prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } } });
    if (existing?.aiStatus === 'pending') {
      throw new AppError('AI review in progress', 'בדיקת AI של ההגשה הקיימת עדיין רצה - אפשר להגיש במקומה כשהיא תסתיים', 409);
    }

    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let githubUrl: string | null = null;
    if (payload.repo?.trim()) {
      const ref = parseRepoRef(payload.repo);
      if (!ref) throw new AppError('Invalid repo', 'יש לכתוב שם ריפו, owner/repo או קישור מלא ל-GitHub', 400);
      const owner = ref.owner ?? student.githubUsername;
      if (!owner) {
        throw new AppError('No GitHub username', 'לתלמידה לא מוגדר שם משתמש GitHub - יש לכתוב owner/repo או קישור מלא', 400);
      }
      const repoStatus = await getRepoStatus(owner, ref.repo);
      if (repoStatus === 'missing') {
        throw new AppError(`Repo ${owner}/${ref.repo} not found`, `הריפו github.com/${owner}/${ref.repo} לא נמצא (או שאינו ציבורי)`, 400);
      }
      if (repoStatus === 'unknown') {
        throw new AppError('GitHub could not be reached', 'לא ניתן לאמת כרגע את הריפו מול GitHub - יש לנסות שוב בעוד כמה דקות', 503);
      }
      githubUrl = `https://github.com/${owner}/${ref.repo}`;
    } else if (payload.file) {
      fileUrl = (await uploadBuffer(payload.file.buffer, payload.file.mimeType, 'submissions', payload.file.originalName)).url;
      uploaded.url = fileUrl;
      fileName = payload.file.originalName;
    } else {
      throw new AppError('No file or repo provided', 'יש לצרף קובץ או קישור לריפו', 400);
    }

    const submission = await writeSubmission(assignmentId, studentId, existing, {
      fileUrl, fileName, githubUrl, notes: existing?.notes ?? null, checklist: undefined, isLate: payload.isLate === true,
    });
    if (existing?.fileUrl && existing.fileUrl !== submission.fileUrl) await releaseFileUrls([existing.fileUrl]);
    return submission;
  } catch (err) {
    if (uploaded.url) await destroyByUrl(uploaded.url).catch((e) => console.error('[storage] cleanup failed:', uploaded.url, e));
    throw err;
  }
}

/** The only uploads a student's browser sends to Cloudinary directly; everything else goes through the server. */
const VIDEO_FORMATS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v', '3gp', 'mpeg', 'mpg', 'ogv'];

/** Signed params so a student's browser can upload a video straight to Cloudinary. */
export async function getVideoUploadSignature(assignmentId: string, studentId: string, tagged = false) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw new AppError('Assignment not found', 'המטלה לא נמצאה', 404);

  await assertLessonAccess(studentId, 'STUDENT', assignment.lessonId);
  if (!assignment.allowFile) throw new AppError('File upload not allowed for this assignment', 'העלאת קובץ אינה מותרת במטלה זו', 400);

  return createUploadSignature('submissions', { uploaderId: tagged ? studentId : undefined, allowedFormats: VIDEO_FORMATS });
}

interface SubmissionAiFields {
  aiStatus: string;
  aiScore: number | null;
  aiApproved: boolean;
  aiCodeReview: string | null;
  aiVerbalReview: string | null;
  aiError?: string | null;
}

/**
 * What a student is allowed to see of an AI review.
 *
 * The comments (code review and verbal summary) are hers as soon as the review
 * is done; the score is the teacher's call and stays server-side until she
 * approves. Hiding it in the client is not hiding it — the value would still
 * be sent over the wire and be visible in devtools.
 */
export function toStudentAiView(sub: SubmissionAiFields) {
  const done = sub.aiStatus === 'done';
  return {
    aiStatus: sub.aiStatus,
    aiApproved: sub.aiApproved,
    aiCodeReview: done ? sub.aiCodeReview : null,
    aiVerbalReview: done ? sub.aiVerbalReview : null,
    aiError: sub.aiStatus === 'error' ? (sub.aiError ?? null) : null,
    aiScore: done && sub.aiApproved ? sub.aiScore : null,
  };
}

export async function getMySubmissions(studentId: string) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    include: {
      studentGroups: { select: { groupId: true } },
      courseAccess: { select: { courseId: true } },
      lessonAccess: { select: { lessonId: true } },
    },
  });
  const groupIds = student?.studentGroups.map((sg) => sg.groupId) ?? [];
  const accessCourseIds = student?.courseAccess.map((ca) => ca.courseId) ?? [];
  const accessLessonIds = student?.lessonAccess.map((la) => la.lessonId) ?? [];

  // The same reach as assertLessonAccess: her group's courses, courses and
  // lessons opened to her personally — never a hidden lesson or course.
  const allAssignments = await prisma.assignment.findMany({
    where: {
      lesson: {
        hidden: false,
        course: { hidden: false },
        OR: [
          { course: { groupId: { in: groupIds } } },
          { courseId: { in: accessCourseIds } },
          { id: { in: accessLessonIds } },
        ],
      },
    },
    include: {
      lesson: { select: { topic: true, course: { select: { name: true } } } },
      submissions: { where: { studentId } },
    },
  });

  const pending = [];
  const submitted = [];

  for (const assignment of allAssignments) {
    const sub = assignment.submissions[0];
    if (!sub) {
      pending.push({
        assignmentId: assignment.id, assignmentTitle: assignment.title,
        lessonId: assignment.lessonId, lessonTopic: assignment.lesson.topic, courseName: assignment.lesson.course.name,
        deadline: assignment.deadline,
      });
    } else {
      const grade = await prisma.grade.findUnique({ where: { submissionId: sub.id } });
      submitted.push({
        submissionId: sub.id, id: sub.id,
        deleteBlockedReason: submissionDeleteBlock({ ...sub, grade }),
        assignmentId: assignment.id, assignmentTitle: assignment.title,
        lessonTopic: assignment.lesson.topic, courseName: assignment.lesson.course.name,
        submittedAt: sub.submittedAt, isLate: sub.isLate, notes: sub.notes,
        checklist: sub.checklist,
        githubUrl: sub.githubUrl, fileUrl: submissionFileLink(sub, studentId), fileName: sub.fileName,
        ...toStudentAiView(sub),
        grade: grade ? { submissionScore: grade.submissionScore, contentScore: grade.contentApproved ? grade.contentScore : null, contentApproved: grade.contentApproved, feedback: grade.feedback, checklist: grade.checklist } : null,
      });
    }
  }

  pending.sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.getTime() - b.deadline.getTime();
  });

  return { pending, submitted };
}

export async function getSubmissionById(id: string, userId: string, role: string) {
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { grade: true },
  });
  if (!submission) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
  if (role !== 'ADMIN' && submission.studentId !== userId) {
    throw new AppError('Forbidden', 'אין לך הרשאה לצפות בהגשה זו', 403);
  }
  const fileUrl = submissionFileLink(submission, userId);
  if (role === 'ADMIN') return { ...submission, fileUrl };
  // The content score is the teacher's call and stays hidden until she approves
  // it; the submission score is always the student's to see.
  const grade = submission.grade
    ? { ...submission.grade, contentScore: submission.grade.contentApproved ? submission.grade.contentScore : null }
    : submission.grade;
  return { ...submission, fileUrl, grade, ...toStudentAiView(submission) };
}

/**
 * The teacher lets the student delete or replace a submission she already
 * checked (or takes that back). A resubmit uses the permission up.
 */
export async function setSubmissionChangesAllowed(submissionId: string, allowed: boolean) {
  const updated = await prisma.submission.updateMany({ where: { id: submissionId }, data: { changesAllowed: allowed } });
  if (updated.count === 0) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
}

type TeacherGradeFields = { gradedById: string | null; contentScore: number | null; feedback: string | null; contentApproved: boolean };

type DeletableSubmission = {
  aiStatus: string;
  changesAllowed: boolean;
  grade: TeacherGradeFields | null;
};

const CHECKED_BY_TEACHER = 'המורה כבר בדקה את ההגשה, ולכן אי אפשר למחוק או לעדכן אותה. אפשר לבקש ממנה בהודעה לאפשר זאת';

/** Whether the teacher graded, commented or approved — an AI review alone does not count. */
function teacherChecked(g: TeacherGradeFields | null | undefined): boolean {
  return Boolean(g && (g.gradedById || g.contentScore != null || g.feedback || g.contentApproved));
}

/**
 * Why the student may not delete (or replace) her submission, or null when she
 * may. An AI review does not lock it; the teacher's check does, unless she
 * explicitly allowed changes.
 */
export function submissionDeleteBlock(sub: DeletableSubmission): string | null {
  if (sub.aiStatus === 'pending') return 'בדיקת AI של ההגשה עדיין רצה - אפשר למחוק כשהיא תסתיים';
  if (teacherChecked(sub.grade) && !sub.changesAllowed) return CHECKED_BY_TEACHER;
  return null;
}

/**
 * The student deletes her own submission, so the assignment is open to submit
 * again. Its grade goes with it (cascade) and its stored file is released. The
 * AI reviews she used are kept aside for her next submission of it.
 */
export async function deleteMySubmission(submissionId: string, studentId: string) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, include: { grade: true } });
  if (!submission || submission.studentId !== studentId) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
  const block = submissionDeleteBlock(submission);
  if (block) throw new AppError('Submission can no longer be deleted', block, 409);

  // No review is running (checked above), so the count cannot move before the delete.
  await keepAiReviewsAside(submission);

  // The same conditions in the delete itself: an AI review claimed or a grade
  // saved between the read and here keeps the submission.
  const deleted = await prisma.submission.deleteMany({
    where: {
      id: submissionId, studentId, aiStatus: { not: 'pending' },
      OR: [
        { changesAllowed: true },
        { grade: { is: null } },
        { grade: { is: { gradedById: null, contentScore: null, feedback: null, contentApproved: false } } },
      ],
    },
  });
  if (deleted.count === 0) {
    throw new AppError('Submission changed while deleting', 'ההגשה השתנתה בינתיים ולא נמחקה - יש לרענן את הדף', 409);
  }
  if (submission.fileUrl) await releaseFileUrls([submission.fileUrl]);
}

/** The AI reviews used on a submission about to be deleted, kept for the student's next submission of the assignment. */
async function keepAiReviewsAside(submission: { assignmentId: string; studentId: string; aiReviewCount: number; aiExtraAllowed: boolean }) {
  if (submission.aiReviewCount === 0 && !submission.aiExtraAllowed) return;
  const { assignmentId, studentId } = submission;
  const carried = { aiReviewCount: submission.aiReviewCount, aiExtraAllowed: submission.aiExtraAllowed };
  await prisma.aiReviewCarryover.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    create: { assignmentId, studentId, ...carried },
    update: carried,
  });
}

/**
 * The teacher deletes a student's submission - checked or not - so the
 * assignment is open to her again. As when the student deletes it herself, the
 * grade goes with it and the AI reviews she used are kept aside.
 */
export async function deleteSubmissionAsTeacher(submissionId: string) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
  if (submission.aiStatus === 'pending') {
    throw new AppError('AI review in progress', 'בדיקת AI של ההגשה עדיין רצה - אפשר למחוק כשהיא תסתיים', 409);
  }
  await keepAiReviewsAside(submission);
  // A review claimed between the read and here keeps the submission.
  const deleted = await prisma.submission.deleteMany({ where: { id: submissionId, aiStatus: { not: 'pending' } } });
  if (deleted.count === 0) {
    throw new AppError('Submission changed while deleting', 'ההגשה השתנתה בינתיים ולא נמחקה - יש לרענן את הדף', 409);
  }
  if (submission.fileUrl) await releaseFileUrls([submission.fileUrl]);
}

// The Excel import and the AI-review lifecycle live in their own services; re-exported so callers keep one entry point.
export * from './submissions-import.service';
export * from './submission-ai-review.service';
