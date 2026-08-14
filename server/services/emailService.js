// Minimal wrapper around the Resend REST API (https://resend.com) used
// for password-reset emails. Resend has a free tier — grab an API key
// from https://resend.com/api-keys and put it in server/.env as
// RESEND_API_KEY (see .env for the other related variables).
//
// No SDK dependency needed — Node 18+ has global fetch, and this is a
// single simple POST call.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

async function sendPasswordResetEmail({ to, resetUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "TrackTrail <onboarding@resend.dev>";

  if (!apiKey) {
    // Don't crash the request flow in dev if the key hasn't been set up
    // yet — just log the link so the reset flow is still testable.
    console.warn(
      "RESEND_API_KEY is not set in server/.env — skipping email send. " +
        `Reset link for ${to}: ${resetUrl}`
    );
    return { skipped: true };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Reset your TrackTrail password",
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>Reset your password</h2>
          <p>We received a request to reset your TrackTrail password. This link expires in 30 minutes.</p>
          <p>
            <a href="${resetUrl}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block;">
              Reset password
            </a>
          </p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.message || `Failed to send email (${response.status})`);
  }

  return response.json();
}

module.exports = { sendPasswordResetEmail };
