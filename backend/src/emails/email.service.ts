import { sendMail } from '../services/email.service';
import type { EmailJobData, EmailJobMap, EmailJobName } from './email.types';
import {
  resetPasswordHtml,
  forgotPasswordLinkHtml,
  storageAlertHtml,
  studentMessageHtml,
  teacherReplyHtml,
  deadlineReportHtml,
} from './email.templates';

// Decides *who* receives each email and *which* template renders it, then hands
// off to the low-level SMTP transport (services/email.service). Anything that
// throws here propagates to the worker so BullMQ can retry; the only silent path
// is a report that has no admin recipient configured, which is skipped by design.
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
      await sendMail({
        to: d.studentEmail,
        subject: 'התקבלה תשובה מהמורה',
        html: teacherReplyHtml(d),
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

    default:
      console.warn(`[email] Unknown email job: ${name}`);
  }
}
