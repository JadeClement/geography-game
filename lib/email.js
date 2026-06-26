import { Resend } from "resend";

const FROM_EMAIL = process.env.EMAIL_FROM ?? "Worldly <onboarding@resend.dev>";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

function emailShell({ preview, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${preview}</title>
</head>
<body style="margin:0;padding:0;background:#0a1426;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a1426;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#111827;border:1px solid #1f2937;border-radius:8px;padding:32px;">
          <tr>
            <td style="color:#f0fdfa;font-size:24px;font-weight:700;padding-bottom:8px;">Worldly</td>
          </tr>
          <tr>
            <td style="color:#d1d5db;font-size:15px;line-height:1.6;">${body}</td>
          </tr>
        </table>
        <p style="color:#6b7280;font-size:12px;margin-top:24px;">You received this email because of activity on your Worldly account.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function actionButton(href, label) {
  return `<a href="${href}" style="display:inline-block;margin:24px 0 8px;padding:12px 24px;background:linear-gradient(135deg,#34d399,#22c55e);color:#ffffff;text-decoration:none;font-weight:600;border-radius:4px;">${label}</a>`;
}

export function verificationEmailTemplate({ name, verifyUrl }) {
  const safeName = escapeHtml(name);
  const greeting = safeName ? `Hi ${safeName},` : "Hi,";
  return {
    subject: "Verify your Worldly email",
    html: emailShell({
      preview: "Verify your email for Worldly",
      body: `
        <p style="margin:0 0 16px;">${greeting}</p>
        <p style="margin:0 0 16px;">Thanks for signing up! Please verify your email address to secure your account.</p>
        ${actionButton(verifyUrl, "Verify email")}
        <p style="margin:16px 0 0;color:#9ca3af;font-size:13px;">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
        <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;word-break:break-all;">Or copy this link: ${verifyUrl}</p>
      `,
    }),
  };
}

export function passwordResetEmailTemplate({ name, resetUrl }) {
  const safeName = escapeHtml(name);
  const greeting = safeName ? `Hi ${safeName},` : "Hi,";
  return {
    subject: "Reset your Worldly password",
    html: emailShell({
      preview: "Reset your Worldly password",
      body: `
        <p style="margin:0 0 16px;">${greeting}</p>
        <p style="margin:0 0 16px;">We received a request to reset your password. Click the button below to choose a new one.</p>
        ${actionButton(resetUrl, "Reset password")}
        <p style="margin:16px 0 0;color:#9ca3af;font-size:13px;">This link expires in 1 hour and can only be used once. If you didn't request a reset, you can safely ignore this email.</p>
        <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;word-break:break-all;">Or copy this link: ${resetUrl}</p>
      `,
    }),
  };
}

export function passwordChangedEmailTemplate({ name }) {
  const safeName = escapeHtml(name);
  const greeting = safeName ? `Hi ${safeName},` : "Hi,";
  return {
    subject: "Your Worldly password was changed",
    html: emailShell({
      preview: "Your Worldly password was changed",
      body: `
        <p style="margin:0 0 16px;">${greeting}</p>
        <p style="margin:0 0 16px;">Your Worldly account password was just changed. If this was you, no action is needed.</p>
        <p style="margin:0;color:#fbbf24;font-size:14px;">If you didn't make this change, please reset your password immediately and contact support if you need help.</p>
      `,
    }),
  };
}

async function sendEmail({ to, subject, html }) {
  const resend = getResendClient();
  if (!resend) {
    console.warn("RESEND_API_KEY is not configured — email not sent.");
    return { sent: false, error: "Email service is not configured." };
  }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("Email send error:", error);
    return { sent: false, error: error.message };
  }

  return { sent: true };
}

export async function sendVerificationEmail({ to, name, verifyUrl }) {
  const { subject, html } = verificationEmailTemplate({ name, verifyUrl });
  return sendEmail({ to, subject, html });
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const { subject, html } = passwordResetEmailTemplate({ name, resetUrl });
  return sendEmail({ to, subject, html });
}

export async function sendPasswordChangedEmail({ to, name }) {
  const { subject, html } = passwordChangedEmailTemplate({ name });
  return sendEmail({ to, subject, html });
}
