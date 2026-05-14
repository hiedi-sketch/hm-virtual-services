import nodemailer from "nodemailer";

export function isMailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
): Promise<void> {
  if (!isMailConfigured()) {
    console.warn(`[mailer] SMTP not configured — skipping email to ${to}: "${subject}"`);
    return;
  }
  const transport = createTransport();
  const fromAddr = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  const from = `"HM Virtual Services" <${fromAddr}>`;
  await transport.sendMail({
    from, to, subject, html,
    attachments: attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
}

// ── Simple HTML template ───────────────────────────────────────────────────
export function template(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr>
          <td style="background:#266b75;padding:20px 28px;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">HM Virtual Services Business Suite</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;color:#1e293b;font-size:15px;line-height:1.6;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
            <span style="color:#94a3b8;font-size:12px;">Sent by HM Virtual Services Business Suite &mdash; Helping you get your day running smoothly.</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
