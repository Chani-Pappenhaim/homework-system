import { sendMail } from '../services/email.service';
import { prisma } from '../config/prisma';
import type { EmailJobData, EmailJobMap, EmailJobName } from './email.types';
import {
  resetPasswordHtml,
  forgotPasswordLinkHtml,
  verifyEmailHtml,
  storageAlertHtml,
  studentMessageHtml,
  teacherReplyHtml,
  teacherMessageHtml,
  studentReplyHtml,
  deadlineReportHtml,
  gradeApprovedHtml,
} from './email.templates';

// Decides *who* receives each email and *which* template renders it, then hands
// off to the low-level SMTP transport (services/email.service). Anything that
// throws here propagates to the worker so BullMQ can retry; the only silent path
// is a report that has no admin recipient configured, which is skipped by design.
/**
 * Notification emails (replies, new messages, grades) go only to a student who
 * confirmed her address and has not turned them off. Account emails — password
 * resets and the verification email itself — are not gated, since they are how
 * a student gets in and confirms the address in the first place.
 */
async function wantsNotifications(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailVerifiedAt: true, emailNotifications: true },
  });
  return Boolean(user?.emailVerifiedAt && user.emailNotifications);
}

export async function handleEmailJob(name: EmailJobName, data: EmailJobData): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;

  switch (name) {
    case 'reset-password': {
      const d = data as EmailJobMap['reset-password'];
      await sendMail({ to: d.email, subject: 'איפוס סיסמא', html: resetPasswordHtml(d) });
      return;
    }

    case 'forgot-password-link': {
      const d = data as EmailJobMap['forgot-password-link'];
      await sendMail({ to: d.email, subject: 'איפוס סיסמא', html: forgotPasswordLinkHtml(d) });
      return;
    }

    case 'verify-email': {
      const d = data as EmailJobMap['verify-email'];
      await sendMail({ to: d.email, subject: 'אישור כתובת המייל', html: verifyEmailHtml(d) });
      return;
    }

    case 'storage-alert': {
      if (!adminEmail) { console.warn('[email] ADMIN_EMAIL not set — skipping storage-alert'); return; }
      await sendMail({
        to: adminEmail,
        subject: 'אזהרה: שטח האחסון ב-Cloudinary עבר 80%',
        html: storageAlertHtml(),
      });
      return;
    }

    case 'student-message': {
      if (!adminEmail) { console.warn('[email] ADMIN_EMAIL not set — skipping student-message'); return; }
      const d = data as EmailJobMap['student-message'];
      await sendMail({
        to: adminEmail,
        subject: `הודעה חדשה מ${d.studentName}`,
        html: studentMessageHtml(d),
      });
      return;
    }

    case 'teacher-reply': {
      const d = data as EmailJobMap['teacher-reply'];
      if (!(await wantsNotifications(d.studentEmail))) return;
      await sendMail({
        to: d.studentEmail,
        subject: 'התקבלה תשובה מהמורה',
        html: teacherReplyHtml(d),
      });
      return;
    }

    case 'teacher-message': {
      const d = data as EmailJobMap['teacher-message'];
      if (!(await wantsNotifications(d.studentEmail))) return;
      await sendMail({
        to: d.studentEmail,
        subject: 'התקבלה הודעה חדשה מהמורה',
        html: teacherMessageHtml(d),
      });
      return;
    }

    case 'student-reply': {
      if (!adminEmail) { console.warn('[email] ADMIN_EMAIL not set — skipping student-reply'); return; }
      const d = data as EmailJobMap['student-reply'];
      await sendMail({
        to: adminEmail,
        subject: `תגובה חדשה מ${d.studentName}`,
        html: studentReplyHtml(d),
      });
      return;
    }

    case 'deadline-report': {
      if (!adminEmail) { console.warn('[email] ADMIN_EMAIL not set — skipping deadline-report'); return; }
      const d = data as EmailJobMap['deadline-report'];
      await sendMail({
        to: adminEmail,
        subject: `דוח הגשות: ${d.assignmentTitle}`,
        html: deadlineReportHtml(d),
      });
      return;
    }

    case 'grade-approved': {
      const d = data as EmailJobMap['grade-approved'];
      if (!(await wantsNotifications(d.studentEmail))) return;
      await sendMail({
        to: d.studentEmail,
        subject: `הציון עבור "${d.assignmentTitle}" פורסם`,
        html: gradeApprovedHtml(d),
      });
      return;
    }

    default:
      console.warn(`[email] Unknown email job: ${name}`);
  }
}
