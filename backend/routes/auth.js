const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// SMTP email transporter (Brevo)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Brevo REST API fallback
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
  // Try Brevo REST API first, fall back to SMTP
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

// POST /api/auth/register
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name is required').escape(),
  body('lastName').trim().notEmpty().withMessage('Last name is required').escape(),
  body('username').optional({ values: 'falsy' }).trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers and underscores'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('department').optional().isIn([
    'Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering',
    'Agricultural Engineering', 'Chemical Engineering', 'Other'
  ]),
  body('regNumber').optional({ values: 'falsy' }).trim().escape(),
  body('yearOfStudy').optional().isInt({ min: 1, max: 6 }),
  validate
], async (req, res) => {
  try {
    const { firstName, lastName, username, email, password, regNumber, department, yearOfStudy } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    if (username) {
      const existingUsername = await User.findOne({ username: username.toLowerCase() });
      if (existingUsername) {
        return res.status(400).json({ message: 'Username already taken' });
      }
    }

    if (regNumber) {
      const existingReg = await User.findOne({ regNumber });
      if (existingReg) {
        return res.status(400).json({ message: 'Registration number already in use' });
      }
    }

    const user = await User.create({
      firstName, lastName, email, password, department, yearOfStudy,
      username: username ? username.toLowerCase() : undefined,
      regNumber: regNumber || undefined
    });

    res.status(201).json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      role: user.role,
      token: generateToken(user._id)
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ message: `${field === 'email' ? 'Email' : field === 'username' ? 'Username' : 'Registration number'} already in use` });
    }
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// POST /api/auth/login - supports email OR username
router.post('/login', [
  body('identifier').trim().notEmpty().withMessage('Email or username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
], async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // Try email first, then username
    let user = await User.findOne({ email: identifier.toLowerCase() });
    if (!user) {
      user = await User.findOne({ username: identifier.toLowerCase() });
    }

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account has been deactivated' });
    }

    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      role: user.role,
      membershipPaid: user.membershipPaid,
      membershipExpiry: user.membershipExpiry,
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  validate
], async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="text-align:center;padding:20px;background:#800020;border-radius:10px 10px 0 0;">
          <h1 style="color:#DAA520;margin:0;">EESA</h1>
          <p style="color:#fff;margin:5px 0 0;">Egerton Engineering Student Association</p>
        </div>
        <div style="padding:30px;background:#fff;border:1px solid #eee;">
          <h2 style="color:#333;">Password Reset Request</h2>
          <p style="color:#555;">Hello ${user.firstName},</p>
          <p style="color:#555;">You requested a password reset. Click the button below to set a new password:</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${resetURL}" 
               style="background:#800020;color:#fff;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold;">
              Reset Password
            </a>
          </div>
          <p style="color:#888;font-size:13px;">This link expires in 30 minutes. If you didn't request this, ignore this email.</p>
        </div>
        <div style="text-align:center;padding:15px;color:#888;font-size:12px;">
          &copy; ${new Date().getFullYear()} EESA - Egerton University
        </div>
      </div>
    `;

    await sendEmail(user.email, 'EESA - Password Reset', htmlContent);

    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error sending reset email. Please try again later.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
], async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.body.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Token is invalid or has expired' });
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. You can now login.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error resetting password' });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json(req.user);
});

// PUT /api/auth/profile
router.put('/profile', protect, [
  body('firstName').optional().trim().notEmpty().escape(),
  body('lastName').optional().trim().notEmpty().escape(),
  body('bio').optional().trim().escape(),
  body('phone').optional().trim().escape(),
  body('department').optional().isIn([
    'Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering',
    'Agricultural Engineering', 'Chemical Engineering', 'Other'
  ]),
  body('yearOfStudy').optional().isInt({ min: 1, max: 6 }),
  validate
], async (req, res) => {
  try {
    const allowedFields = ['firstName', 'lastName', 'bio', 'phone', 'department', 'yearOfStudy'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true, runValidators: true
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

module.exports = router;
