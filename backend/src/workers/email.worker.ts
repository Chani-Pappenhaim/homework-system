import { Worker } from 'bullmq';
import { connection } from '../config/redis';
import { sendMail } from '../services/email.service';

function wrapRtl(body: string): string {
  return `<div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">${body}</div>`;
}

function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

interface DeadlineReportRow {
  name: string;
  status: 'submitted' | 'late' | 'missing';
  submittedAt?: string | Date;
}

const STATUS_META: Record<DeadlineReportRow['status'], { label: string; color: string; bg: string }> = {
  submitted: { label: 'הגישה', color: '#166534', bg: '#dcfce7' },
  late: { label: 'באיחור', color: '#9a3412', bg: '#ffedd5' },
  missing: { label: 'לא הגישה', color: '#991b1b', bg: '#fee2e2' },
};

function buildDeadlineReportHtml(data: {
  assignmentTitle: string;
  courseName: string;
  deadline?: string | Date | null;
  rows: DeadlineReportRow[];
}): string {
  const counts = { submitted: 0, late: 0, missing: 0 };
  for (const row of data.rows) counts[row.status]++;

  const summary = `
    <div style="display: flex; gap: 12px; margin: 16px 0;">
      <div style="background: ${STATUS_META.submitted.bg}; color: ${STATUS_META.submitted.color}; padding: 10px 18px; border-radius: 8px; font-weight: bold;">
        הגישו: ${counts.submitted}
      </div>
      <div style="background: ${STATUS_META.late.bg}; color: ${STATUS_META.late.color}; padding: 10px 18px; border-radius: 8px; font-weight: bold;">
        באיחור: ${counts.late}
      </div>
      <div style="background: ${STATUS_META.missing.bg}; color: ${STATUS_META.missing.color}; padding: 10px 18px; border-radius: 8px; font-weight: bold;">
        לא הגישו: ${counts.missing}
      </div>
    </div>`;

  const tableRows = data.rows
    .map((row) => {
      const meta = STATUS_META[row.status];
      return `
      <tr>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${row.name}</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">
          <span style="background: ${meta.bg}; color: ${meta.color}; padding: 3px 10px; border-radius: 12px; font-weight: bold;">${meta.label}</span>
        </td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${formatDate(row.submittedAt)}</td>
      </tr>`;
    })
    .join('');

  return wrapRtl(`
    <h2 style="margin-bottom: 4px;">דוח הגשות — ${data.assignmentTitle}</h2>
    <p style="margin-top: 0; color: #555;">
      קורס: ${data.courseName} | מועד הגשה אחרון: ${formatDate(data.deadline)}
    </p>
    ${summary}
    <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
      <thead>
        <tr style="background: #f3f4f6;">
          <th style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: right;">שם התלמידה</th>
          <th style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: right;">סטטוס</th>
          <th style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: right;">מועד הגשה</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `);
}

const emailWorker = new Worker(
  'email',
  async (job) => {
    const adminEmail = process.env.ADMIN_EMAIL;

    switch (job.name) {
      case 'reset-password': {
        const { email, name } = job.data;
        await sendMail({
          to: email,
          subject: 'איפוס סיסמא',
          html: wrapRtl(
            `<p>שלום ${name},</p><p>הסיסמא שלך אופסה. הסיסמא החדשה היא: <strong>12345678</strong></p><p>אנא התחברי ושני את הסיסמא בהקדם.</p>`
          ),
        });
        break;
      }

      case 'storage-alert': {
        if (!adminEmail) { console.warn('[email] ADMIN_EMAIL not set — skipping storage-alert'); return; }
        await sendMail({
          to: adminEmail,
          subject: 'אזהרה: שטח האחסון ב-Cloudinary עבר 80%',
          html: wrapRtl(
            `<p>שלום,</p><p>שטח האחסון בחשבון ה-Cloudinary עבר <strong>80%</strong> מהמכסה.</p><p>מומלץ למחוק קבצים ישנים או להרחיב את המכסה כדי שהגשות חדשות לא ייכשלו.</p>`
          ),
        });
        break;
      }

      case 'student-message': {
        if (!adminEmail) { console.warn('[email] ADMIN_EMAIL not set — skipping student-message'); return; }
        const { studentName, content, assignmentTitle } = job.data;
        const assignmentLine = assignmentTitle ? `<p>בנוגע למטלה: <strong>${assignmentTitle}</strong></p>` : '';
        await sendMail({
          to: adminEmail,
          subject: `הודעה חדשה מ${studentName}`,
          html: wrapRtl(
            `<p>התקבלה הודעה חדשה מ<strong>${studentName}</strong>:</p>${assignmentLine}<blockquote style="border-right: 3px solid #ccc; padding-right: 12px; margin: 12px 0; color: #333;">${content}</blockquote><p>ניתן להשיב דרך המערכת.</p>`
          ),
        });
        break;
      }

      case 'teacher-reply': {
        const { studentEmail, studentName, originalContent, replyContent } = job.data;
        await sendMail({
          to: studentEmail,
          subject: 'התקבלה תשובה מהמורה',
          html: wrapRtl(
            `<p>שלום ${studentName},</p><p>המורה השיבה להודעה ששלחת:</p><blockquote style="border-right: 3px solid #ccc; padding-right: 12px; margin: 12px 0; color: #666;">${originalContent}</blockquote><p><strong>תשובת המורה:</strong></p><blockquote style="border-right: 3px solid #4f46e5; padding-right: 12px; margin: 12px 0; color: #333;">${replyContent}</blockquote>`
          ),
        });
        break;
      }

      case 'deadline-report': {
        if (!adminEmail) { console.warn('[email] ADMIN_EMAIL not set — skipping deadline-report'); return; }
        const { assignmentTitle, courseName, deadline, rows } = job.data;
        await sendMail({
          to: adminEmail,
          subject: `דוח הגשות: ${assignmentTitle}`,
          html: buildDeadlineReportHtml({ assignmentTitle, courseName, deadline, rows }),
        });
        break;
      }

      default:
        console.warn(`[email] Unknown email job: ${job.name}`);
    }
  },
  { connection }
);

emailWorker.on('error', (err) => console.error('[email] worker error:', err));
emailWorker.on('failed', (job, err) => console.error(`[email] job ${job?.id} failed:`, err.message));
