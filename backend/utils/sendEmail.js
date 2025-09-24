import sgMail from "@sendgrid/mail";
import * as nodemailer from "nodemailer";

/**
 * Unified email sender.
 * - Uses SendGrid if SENDGRID_API_KEY starts with "SG.".
 * - Falls back to SMTP using EMAIL_* or SMTP_* env vars.
 *
 * @param {object} options
 * @param {string} [options.to] - Recipient email (alias: options.email)
 * @param {string} options.subject - Subject line
 * @param {string} [options.text] - Plaintext body (alias: options.message)
 * @param {string} [options.html] - HTML body
 * @param {string} [options.from] - From address; defaults to env or fallback
 * @returns {Promise<{provider: 'sendgrid'|'smtp', ok: boolean}>}
 */
const sendEmail = async (options = {}) => {
  const to = options.to || options.email;
  const subject = options.subject;
  const text = options.text ?? options.message ?? "";
  const html = options.html;
  const from =
    options.from ||
    process.env.SENDGRID_FROM_EMAIL ||
    process.env.EMAIL_FROM ||
    "Zinnol Support <support@zinnol.app>";

  if (!to || !subject) {
    throw new Error("sendEmail: 'to' and 'subject' are required");
  }

  const sgKey = process.env.SENDGRID_API_KEY;
  const hasSendGrid = typeof sgKey === "string" && sgKey.startsWith("SG.");

  if (hasSendGrid) {
    try {
      sgMail.setApiKey(sgKey);
      await sgMail.send({ to, from, subject, text, html });
      return { provider: "sendgrid", ok: true };
    } catch (err) {
      console.error("SendGrid error:", err?.message || err);
      // fall through to SMTP
    }
  }

  // SMTP fallback
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 587);
  const user = process.env.EMAIL_USERNAME || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP configuration missing. Please set EMAIL_HOST/PORT/USERNAME/PASSWORD or SMTP_HOST/PORT/USER/PASS"
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({ from, to, subject, text, html });
  return { provider: "smtp", ok: true };
};

export default sendEmail;
