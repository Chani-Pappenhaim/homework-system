import nodemailer, { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

// Lazy creation — importing this module never crashes even if SMTP is not configured
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!process.env.SMTP_HOST) {
    console.warn(`[email] SMTP_HOST not set — skipping email "${subject}" to ${to}`);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.FROM_EMAIL,
    to,
    subject,
    html,
  });
}
