// Sends transactional email via the Brevo HTTP API rather than SMTP, since
// some hosting providers block outbound SMTP connections.

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  // Missing config disables email silently rather than throwing
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
