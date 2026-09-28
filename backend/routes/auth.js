const express = require('express');
const { body } = require('express-validator');
const { createLimiter } = require('../utils/rateLimit');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const { sendEmail } = require('../utils/email');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { passwordValidator, RULES_TEXT } = require('../utils/password');
const {
  REG_NUMBER_PATTERN, REG_NUMBER_EXAMPLE, normalizeRegNumber, sameName, SAME_NAME_MESSAGE,
  nameValidator, usernameValidator, bioValidator, emailValidator
} = require('../utils/identity');
const { announceApplicant } = require('../utils/accounts');
const { ROLE_LABELS, ALL_ROLES } = require('../utils/roles');
const { DEPARTMENTS } = require('../models/User');
const cloudinary = require('../config/cloudinary');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const generateToken = (user) =>
  jwt.sign(
    { id: user._id, pv: user.passwordVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

/**
 * The exact shape the frontend stores as the session user. Declared once so
 * login and profile updates cannot drift apart, and so no field is exposed by
 * accident.
 */
const publicUser = (user) => ({
  _id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: [user.firstName, user.lastName].filter(Boolean).join(' '),
  email: user.email,
  username: user.username,
  regNumber: user.regNumber,
  avatar: user.avatar,
  bio: user.bio,
  phone: user.phone,
  role: user.role,
  department: user.department,
  yearOfStudy: user.yearOfStudy,
  academicStatus: user.academicStatus,
  membershipPaid: user.membershipPaid,
  membershipExpiry: user.membershipExpiry,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt
});

/**
 * Credential endpoints get their own budget, far tighter than the global API
 * limit, because the global limit is shared with ordinary browsing and so is
 * useless as brute-force protection.
 */
const credentialLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  // Successful sign-ins should not consume the budget; only failures matter.
  skipSuccessfulRequests: true,
  message: 'Too many attempts. Please wait 15 minutes and try again.'
});

const resetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please try again later.'
});

// Names are stored raw and escaped at render time by React. Escaping on the
// way in corrupted legitimate names such as O'Brien into O&#x27;Brien.
const nameRule = (field, label, check = nameValidator(label)) => body(field).isString().withMessage(`${label} is required`)
  .trim().notEmpty().withMessage(`${label} is required`)
  .isLength({ max: 50 }).withMessage(`${label} must be 50 characters or fewer`)
  .bail()
  .custom(check);

const usernameRule = (check = usernameValidator) => body('username').optional({ values: 'falsy' }).trim().toLowerCase()
  .isLength({ min: 3, max: 50 }).withMessage('Username must be 3 to 50 characters')
  .matches(/^[a-z0-9._-]+$/).withMessage('Username may only contain letters, numbers, dots, underscores and hyphens')
  .bail()
  .custom(check);

/**
 * The profile form sends every field on each save, so only a changed value is
 * checked. A member whose older record would fail today's rules can still
 * update their phone number without being made to rename themselves.
 */
const ifChanged = (field, check) => (value, { req }) => value === req.user?.[field] || check(value);

// POST /api/auth/register
// The account is created waiting for an administrator's approval, so no
// session is issued. The applicant signs in once they are approved.
// There is no per-network sign-up limit: students registering together on
// campus Wi-Fi share one address, and the approval step already keeps junk
// accounts out.
router.post('/register', [
  nameRule('firstName', 'First name'),
  nameRule('lastName', 'Last name')
    .custom((value, { req }) => {
      if (sameName(req.body.firstName, value)) throw new Error(SAME_NAME_MESSAGE);
      return true;
    }),
  usernameRule(),
  body('email').isEmail().withMessage('Valid email is required').bail().custom(emailValidator).normalizeEmail(),
  body('password').custom(passwordValidator),
  body('department').optional({ values: 'falsy' }).isIn(DEPARTMENTS).withMessage('Select a valid department'),
  body('regNumber').customSanitizer(normalizeRegNumber)
    .notEmpty().withMessage('Registration number is required')
    .matches(REG_NUMBER_PATTERN).withMessage(`Enter your engineering registration number, for example ${REG_NUMBER_EXAMPLE}`),
  body('yearOfStudy').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).withMessage('Year of study must be between 1 and 5').toInt(),
  validate
], asyncHandler(async (req, res) => {
  const { firstName, lastName, username, email, password, regNumber, department, yearOfStudy } = req.body;

  // One query instead of three round trips, and it reports every clash at once
  // rather than making the user resubmit for each.
  const clauses = [{ email }, { regNumber }];
  if (username) clauses.push({ username });

  const conflicts = await User.find({ $or: clauses }).select('email username regNumber').lean();
  if (conflicts.length) {
    if (conflicts.some((c) => c.email === email)) {
      throw new ApiError(409, 'An account with this email already exists.');
    }
    if (username && conflicts.some((c) => c.username === username)) {
      throw new ApiError(409, 'That username is already taken.');
    }
    throw new ApiError(409, 'That registration number is already in use. If it is yours, contact the EESA committee.');
  }

  const user = await User.create({
    firstName, lastName, email, password, department, yearOfStudy, regNumber,
    username: username || undefined,
    isActive: false,
    pendingApproval: true
  });

  await announceApplicant(user);

  res.status(201).json({
    pending: true,
    email: user.email,
    message: `Thanks, ${user.firstName}. Your registration has been received. The EESA committee will check it `
      + `and email ${user.email} once your account is approved. You can sign in after that.`
  });
}));

// POST /api/auth/login - accepts an email address or a username
router.post('/login', credentialLimiter, [
  body('identifier').isString().withMessage('Email or username is required')
    .trim().notEmpty().withMessage('Email or username is required')
    .isLength({ max: 120 }).withMessage('Email or username is too long'),
  body('password').isString().withMessage('Password is required').notEmpty().withMessage('Password is required'),
  validate
], asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const normalized = identifier.toLowerCase();

  // Single query covering both sign-in identifiers. The password, attempt
  // counter and lock expiry are all `select: false`, so they are opted into here.
  const user = await User.findOne({ $or: [{ email: normalized }, { username: normalized }] })
    .select('+password +failedLoginAttempts +lockedUntil');

  const invalid = () => {
    throw new ApiError(401, 'Invalid credentials. Check your email or username and password.');
  };

  if (!user) return invalid();

  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil - Date.now()) / 60000));
    throw new ApiError(429, `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }

  const matches = await user.matchPassword(password);

  if (!matches) {
    // Per-account lockout complements the per-IP limiter above: it stops a
    // distributed attack on one account that never trips a single IP budget.
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      user.failedLoginAttempts = 0;
    }
    await user.save({ validateBeforeSave: false });
    return invalid();
  }

  // Checked only after the password, so this cannot reveal who has applied.
  if (user.pendingApproval) {
    throw new ApiError(403, 'Your account is waiting for approval by the EESA committee. You will get an email as soon as it is approved.');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'This account has been deactivated. Contact an administrator.');
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.json({ ...publicUser(user), token: generateToken(user) });
}));

// POST /api/auth/forgot-password
router.post('/forgot-password', resetLimiter, [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  validate
], asyncHandler(async (req, res) => {
  // The response is identical whether or not the address exists, so this
  // endpoint cannot be used to enumerate members.
  const genericResponse = { message: 'If an account with that email exists, a reset link has been sent.' };

  const user = await User.findOne({ email: req.body.email });
  if (!user || !user.isActive) return res.json(genericResponse);

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const baseUrl = (process.env.FRONTEND_URL || '').split(',')[0].trim() || 'http://localhost:3000';
  const resetURL = `${baseUrl}/reset-password?token=${resetToken}`;

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
        <p style="color:#555;font-size:13px;">Or copy this link into your browser:<br>
          <span style="color:#800020;word-break:break-all;">${resetURL}</span>
        </p>
        <p style="color:#888;font-size:13px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
      <div style="text-align:center;padding:15px;color:#888;font-size:12px;">
        &copy; ${new Date().getFullYear()} EESA - Egerton University
      </div>
    </div>
  `;

  try {
    await sendEmail(user.email, 'EESA - Password Reset', htmlContent);
  } catch (error) {
    // Clear the token so a failed send does not leave a live reset token behind.
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({ validateBeforeSave: false });
    console.error('Password reset email failed:', error.message);
    throw new ApiError(502, 'Could not send the reset email right now. Please try again shortly.');
  }

  res.json(genericResponse);
}));

// POST /api/auth/reset-password
router.post('/reset-password', resetLimiter, [
  body('token').isString().trim().notEmpty().withMessage('Reset token is required'),
  body('password').custom(passwordValidator),
  validate
], asyncHandler(async (req, res) => {
  const hashedToken = crypto.createHash('sha256').update(req.body.token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  }).select('+password +resetPasswordToken +resetPasswordExpires +failedLoginAttempts +lockedUntil');

  if (!user) {
    throw new ApiError(400, 'This reset link is invalid or has expired. Request a new one.');
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  // A successful reset also clears any lockout, so a locked-out member can
  // recover without waiting.
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();

  res.json({ message: 'Password reset successful. You can now sign in with your new password.' });
}));

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json(publicUser(req.user));
});

// GET /api/auth/roles - labels and departments, so the frontend stops hardcoding them
router.get('/roles', (req, res) => {
  res.json({
    roles: ALL_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] })),
    departments: DEPARTMENTS,
    passwordRules: RULES_TEXT
  });
});

// PUT /api/auth/profile
// The same name rules as registration, so an approved account cannot be
// renamed to something that would never have been approved.
router.put('/profile', protect, [
  nameRule('firstName', 'First name', ifChanged('firstName', nameValidator('First name'))).optional(),
  nameRule('lastName', 'Last name', ifChanged('lastName', nameValidator('Last name'))).optional(),
  usernameRule(ifChanged('username', usernameValidator)),
  body('bio').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Bio must be 500 characters or fewer')
    .bail()
    .custom(ifChanged('bio', bioValidator)),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 20 }).withMessage('Phone number is too long'),
  body('department').optional({ values: 'falsy' }).isIn(DEPARTMENTS).withMessage('Select a valid department'),
  body('yearOfStudy').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).withMessage('Year of study must be between 1 and 5').toInt(),
  validate
], asyncHandler(async (req, res) => {
  const allowedFields = ['firstName', 'lastName', 'username', 'bio', 'phone', 'department', 'yearOfStudy'];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  const first = updates.firstName ?? req.user.firstName;
  const last = updates.lastName ?? req.user.lastName;
  if ((first !== req.user.firstName || last !== req.user.lastName) && sameName(first, last)) {
    throw new ApiError(400, SAME_NAME_MESSAGE);
  }

  // Changing a username must not silently collide with someone else's.
  if (updates.username) {
    const taken = await User.findOne({ username: updates.username, _id: { $ne: req.user._id } }).select('_id').lean();
    if (taken) throw new ApiError(409, 'That username is already taken.');
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  res.json(publicUser(user));
}));

// POST /api/auth/profile/avatar
router.post('/profile/avatar', protect, uploadImage.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Choose an image to upload.');

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'eesa/profile-pictures',
        resource_type: 'image',
        access_mode: 'public',
        // Normalise avatars server-side so a 5MB portrait does not become a
        // 5MB download on every page that renders the sidebar.
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' }]
      },
      (error, uploaded) => (error ? reject(error) : resolve(uploaded))
    );
    stream.end(req.file.buffer);
  });

  const user = await User.findByIdAndUpdate(req.user._id, { avatar: result.secure_url }, { new: true });
  res.json(publicUser(user));
}));

// PUT /api/auth/change-password
router.put('/change-password', protect, credentialLimiter, [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  body('newPassword').custom(passwordValidator),
  validate
], asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.matchPassword(req.body.currentPassword))) {
    throw new ApiError(400, 'Your current password is incorrect.');
  }

  if (req.body.currentPassword === req.body.newPassword) {
    throw new ApiError(400, 'Your new password must be different from the current one.');
  }

  user.password = req.body.newPassword;
  await user.save();

  // The save bumped passwordChangedAt, invalidating every existing token. Issue
  // a fresh one so the member who made the change stays signed in here.
  res.json({
    message: 'Password changed successfully. Other devices have been signed out.',
    token: generateToken(user)
  });
}));

module.exports = router;
