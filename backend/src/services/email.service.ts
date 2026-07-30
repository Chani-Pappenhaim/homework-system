// Transactional email via the Brevo HTTP API.
//
// We send over HTTP (not SMTP) because Render's free tier blocks outbound SMTP
// connections. The `sendMail` signature is intentionally unchanged, so nothing
// else in the project needs to change — only the delivery mechanism.

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  // Lazy/safe: importing or calling this never crashes when email isn't configured.
  if (!apiKey || !senderEmail) {
    console.warn(`[email] BREVO_API_KEY/BREVO_SENDER_EMAIL not set — skipping email "${subject}" to ${to}`);
    return;
  }

  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo email failed (${res.status}): ${detail}`);
  }
}
