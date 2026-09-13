const nodemailer = require('nodemailer');
const User = require('../models/User');

/* ------------------------------------------------------------------ *
 * Escaping
 * ------------------------------------------------------------------ */

/**
 * Escape a value for interpolation into email HTML.
 *
 * Input is no longer HTML-escaped at the validation layer (escaping there
 * corrupted stored data, turning O'Brien into O&#x27;Brien). Escaping instead
 * happens at each render site, and email is one of them.
 */
const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Tagged template that escapes every interpolated value.
 * Usage: html`<p>Hello ${name}</p>` — `name` is escaped, the markup is not.
 */
const html = (strings, ...values) =>
  strings.reduce((out, chunk, i) => out + chunk + (i < values.length ? escapeHtml(values[i]) : ''), '');

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

const BRAND = { maroon: '#800020', gold: '#DAA520' };

/**
 * Wrap body markup in the shared EESA shell so every message looks the same.
 * `bodyHtml` is trusted markup; escape any user values with `html` first.
 * `imageUrl`, when given, is shown as a banner above the heading.
 */
const renderLayout = ({ heading, bodyHtml, ctaLabel, ctaUrl, footerNote, imageUrl }) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f6f6f6;">
    <div style="text-align:center;padding:24px;background:${BRAND.maroon};border-radius:10px 10px 0 0;">
      <h1 style="color:${BRAND.gold};margin:0;font-size:28px;letter-spacing:1px;">EESA</h1>
      <p style="color:#fff;margin:6px 0 0;font-size:13px;">Egerton Engineering Student Association</p>
    </div>
    <div style="padding:30px;background:#fff;border:1px solid #e9e9e9;border-top:0;">
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" width="540" style="width:100%;max-width:540px;height:auto;border-radius:8px;margin:0 0 20px;display:block;">` : ''}
      ${heading ? `<h2 style="color:#222;margin-top:0;font-size:20px;">${escapeHtml(heading)}</h2>` : ''}
      ${bodyHtml}
      ${ctaUrl && ctaLabel ? `
        <div style="text-align:center;margin:30px 0 10px;">
          <a href="${escapeHtml(ctaUrl)}" style="background:${BRAND.maroon};color:#fff;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">
            ${escapeHtml(ctaLabel)}
          </a>
        </div>` : ''}
      ${footerNote ? `<p style="color:#888;font-size:13px;margin-top:24px;">${escapeHtml(footerNote)}</p>` : ''}
    </div>
    <div style="text-align:center;padding:16px;color:#999;font-size:12px;">
      &copy; ${new Date().getFullYear()} EESA &middot; Egerton University
    </div>
  </div>
`;

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

let cachedTransporter = null;

// Built lazily so a deployment without SMTP credentials still boots; the error
// then surfaces on the first send rather than at import time.
const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;
  if (!process.env.SMTP_HOST) return null;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: parseInt(process.env.SMTP_PORT, 10) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    pool: true,
    maxConnections: 3
  });
  return cachedTransporter;
};

const sendViaBrevoApi = async (to, subject, htmlContent) => {
  if (!process.env.BREVO_API_KEY) throw new Error('BREVO_API_KEY is not configured');

  // Without a timeout a hung upstream would keep the request open until the
  // platform killed it.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'EESA', email: process.env.SMTP_FROM || 'noreply@eesa.org' },
        to: [{ email: to }],
        subject,
        htmlContent
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Brevo API responded ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Send one message, preferring the Brevo REST API and falling back to SMTP.
 */
const sendEmail = async (to, subject, htmlContent) => {
  const errors = [];

  try {
    await sendViaBrevoApi(to, subject, htmlContent);
    return;
  } catch (apiError) {
    errors.push(`Brevo API: ${apiError.message}`);
  }

  const transporter = getTransporter();
  if (!transporter) {
    throw new Error(`Email delivery unavailable (${errors.join('; ')}; SMTP not configured)`);
  }

  try {
    await transporter.sendMail({
      from: `"EESA" <${process.env.SMTP_FROM || 'noreply@eesa.org'}>`,
      to,
      subject,
      html: htmlContent
    });
  } catch (smtpError) {
    errors.push(`SMTP: ${smtpError.message}`);
    throw new Error(`Email delivery failed (${errors.join('; ')})`);
  }
};

/**
 * Broadcast to the membership.
 *
 * Two fixes over the previous version: it reaches every active account rather
 * than only `role: 'member'`, which silently excluded the entire leadership
 * team; and it sends in small batches instead of opening one request per member
 * at once, which tripped the provider's rate limit on any sizeable list.
 */
const sendEmailToMembers = async (subject, htmlContent, { batchSize = 20, batchDelayMs = 1000 } = {}) => {
  const recipients = await User.find({
    isActive: true,
    email: { $exists: true, $ne: '' }
  }).select('email').lean();

  if (!recipients.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((recipient) => sendEmail(recipient.email, subject, htmlContent))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') sent += 1;
      else failed += 1;
    }

    if (i + batchSize < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  console.log(`Broadcast "${subject}": ${sent} sent, ${failed} failed.`);
  return { sent, failed };
};

module.exports = { sendEmail, sendEmailToMembers, renderLayout, escapeHtml, html };
