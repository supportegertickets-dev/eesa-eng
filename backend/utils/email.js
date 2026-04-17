const nodemailer = require('nodemailer');
const User = require('../models/User');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendBrevoApi = async (to, subject, htmlContent) => {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'EESA', email: process.env.SMTP_FROM || 'noreply@eesa.org' },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Brevo API email failed');
  }
};

const sendEmail = async (to, subject, htmlContent) => {
  try {
    await sendBrevoApi(to, subject, htmlContent);
  } catch (apiErr) {
    console.warn('Brevo API failed, falling back to SMTP:', apiErr.message);
    await transporter.sendMail({
      from: `"EESA" <${process.env.SMTP_FROM || 'noreply@eesa.org'}>`,
      to,
      subject,
      html: htmlContent,
    });
  }
};

const sendEmailToMembers = async (subject, htmlContent) => {
  const recipients = await User.find({ role: 'member', isActive: true, email: { $exists: true } }).select('email').lean();
  if (!recipients.length) return;

  await Promise.allSettled(recipients.map((recipient) =>
    sendEmail(recipient.email, subject, htmlContent)
  ));
};

module.exports = { sendEmail, sendEmailToMembers };
