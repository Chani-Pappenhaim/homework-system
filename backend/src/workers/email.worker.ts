import { Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { connection } from './index';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

new Worker(
  'email',
  async (job) => {
    if (job.name === 'reset-password') {
      const { email, name } = job.data;
      await transporter.sendMail({
        from: process.env.FROM_EMAIL,
        to: email,
        subject: 'איפוס סיסמא',
        html: `<p>שלום ${name},</p><p>הסיסמא שלך אופסה. הסיסמא החדשה היא: <strong>12345678</strong></p><p>אנא התחברי ושני את הסיסמא בהקדם.</p>`,
      });
    }
  },
  { connection }
);
