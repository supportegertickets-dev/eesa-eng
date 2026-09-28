const os = require('os');
const express = require('express');
const mongoose = require('mongoose');
const { body, param, query } = require('express-validator');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const Resource = require('../models/Resource');
const Photo = require('../models/Photo');
const AuditLog = require('../models/AuditLog');
const { MODES, ANNOUNCEMENT_TONES } = require('../models/PlatformSetting');
const { protect, superadminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { createLimiter } = require('../utils/rateLimit');
const { buildSearchRegex } = require('../utils/sanitize');
const { FEATURES, FEATURE_KEYS, featureByKey, describeFeature } = require('../utils/platformFeatures');
const {
  DEFAULT_MESSAGES, getPlatformSettings, updatePlatformSettings, effectiveState, publicStatus, readOverride
} = require('../utils/platform');
const { recordAudit, userTarget, nameOf } = require('../utils/audit');
const { recentServerErrors } = require('../utils/serverErrors');
const { mpesaConfigured } = require('../utils/mpesa');
const { membershipFee } = require('../utils/membership');
const { expireStaleOrders } = require('../utils/merchandise');
const { advanceAcademicYears } = require('../utils/academicYear');
const { FULL_ADMIN_ROLES, ROLES } = require('../utils/roles');

const router = express.Router();

const MODE_NAMES = { normal: 'normal', read_only: 'read-only mode', maintenance: 'maintenance mode' };

// Audit summaries are read in Kenya, whatever zone the server runs in.
const nairobiTime = (date) => date.toLocaleString('en-KE', {
  timeZone: 'Africa/Nairobi', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
});

const listOf = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/* ------------------------------------------------------------------ *
 * Public
 * ------------------------------------------------------------------ */

// GET /api/platform/status - what the website needs to know: the mode, paused
// features, the banner and any maintenance coming up. Always reachable.
router.get('/status', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(publicStatus(await getPlatformSettings()));
}));

/* ------------------------------------------------------------------ *
 * Superadmin only from here on
 * ------------------------------------------------------------------ */

router.use(protect, superadminOnly);

/**
 * Every control that can lock people out asks for the superadmin's password
 * again, so an unattended or stolen session cannot flip it. Failures count
 * towards their own limit and are written to the audit log.
 */
const passwordLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: 'Too many attempts. Please wait 15 minutes and try again.'
});

const passwordRule = body('password').isString().withMessage('Enter your password to confirm.')
  .notEmpty().withMessage('Enter your password to confirm.');

const checkPassword = asyncHandler(async (req, res, next) => {
  const me = await User.findById(req.user._id).select('+password');
  if (me && await me.matchPassword(req.body.password)) return next();

  await recordAudit(req, {
    action: 'security.password_failed',
    summary: `${nameOf(req.user)} entered a wrong password to confirm a platform control (${req.method} ${req.baseUrl}${req.path}).`
  });
  // 403, not 401: the session is fine, and a 401 would sign them out.
  const error = new ApiError(403, 'That password is incorrect.');
  error.code = 'wrong_password';
  throw error;
});

/** Everything the controls screen shows, so each change returns it in one go. */
const buildOverview = async (settings) => {
  const now = new Date();
  const updatedBy = settings.updatedBy ? await User.findById(settings.updatedBy).select('firstName lastName').lean() : null;
  return {
    settings: {
      mode: settings.mode,
      message: settings.message,
      expectedBackAt: settings.expectedBackAt,
      disabledFeatures: settings.disabledFeatures,
      window: settings.window,
      announcement: settings.announcement,
      sessionsRevokedAt: settings.sessionsRevokedAt,
      updatedAt: settings.updatedAt,
      updatedBy: updatedBy ? nameOf(updatedBy) : null
    },
    state: effectiveState(settings, now),
    override: readOverride(),
    status: publicStatus(settings, now),
    features: FEATURES.map(describeFeature),
    defaultMessages: DEFAULT_MESSAGES,
    modes: MODES,
    tones: ANNOUNCEMENT_TONES
  };
};

const overrideNote = () => (readOverride()
  ? ' MAINTENANCE_OVERRIDE is set on the server, so it decides what is in force until it is removed.'
  : '');

// GET /api/platform/overview - the controls and what is in force
router.get('/overview', asyncHandler(async (req, res) => {
  res.json(await buildOverview(await getPlatformSettings()));
}));

/* ------------------------------------------------------------------ *
 * The kill switch
 * ------------------------------------------------------------------ */

const MODE_DONE = {
  normal: 'EESA is back to normal for everyone.',
  read_only: 'Read-only mode is on. People can look around, but nothing can be changed until you switch it off.',
  maintenance: 'Maintenance mode is on. Nobody but you can use EESA until you switch it off.'
};

// PUT /api/platform/mode - normal, read-only or maintenance
router.put('/mode', passwordLimiter, [
  body('mode').isIn(MODES).withMessage('Choose normal, read-only or maintenance.'),
  body('message').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }).withMessage('Keep the message to 500 characters.'),
  body('expectedBackAt').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid date and time.').toDate(),
  passwordRule,
  validate
], checkPassword, asyncHandler(async (req, res) => {
  const { mode, expectedBackAt } = req.body;
  if (expectedBackAt && expectedBackAt <= new Date()) {
    throw new ApiError(400, 'The time you expect to be back must be in the future.');
  }

  const before = await getPlatformSettings();
  const set = mode === 'normal'
    ? { mode, message: '', expectedBackAt: null }
    : { mode, message: req.body.message || '', expectedBackAt: expectedBackAt || null };
  const settings = await updatePlatformSettings({ $set: set }, req.user);

  await recordAudit(req, {
    action: 'platform.mode',
    summary: mode === 'normal'
      ? `${nameOf(req.user)} returned the platform to normal from ${MODE_NAMES[before.mode]}.`
      : `${nameOf(req.user)} switched on ${MODE_NAMES[mode]}.`,
    target: { type: 'platform', label: 'Platform mode' },
    details: { from: before.mode, to: mode, message: set.message || undefined, expectedBackAt: set.expectedBackAt || undefined }
  });

  res.json({ message: MODE_DONE[mode] + overrideNote(), overview: await buildOverview(settings) });
}));

// PUT /api/platform/features - switch individual features off or back on
router.put('/features', passwordLimiter, [
  body('disabled').isArray({ max: FEATURE_KEYS.length }).withMessage('Choose the features to switch off.'),
  body('disabled.*').isIn(FEATURE_KEYS).withMessage('One of those features does not exist.'),
  passwordRule,
  validate
], checkPassword, asyncHandler(async (req, res) => {
  const disabled = FEATURE_KEYS.filter((key) => req.body.disabled.includes(key));
  const before = await getPlatformSettings();
  const switchedOff = disabled.filter((key) => !before.disabledFeatures.includes(key));
  const switchedOn = before.disabledFeatures.filter((key) => !disabled.includes(key));

  if (!switchedOff.length && !switchedOn.length) {
    return res.json({ message: 'Nothing changed.', overview: await buildOverview(before) });
  }

  const settings = await updatePlatformSettings({ $set: { disabledFeatures: disabled } }, req.user);
  const labels = (keys) => listOf(keys.map((key) => featureByKey.get(key).label.toLowerCase()));
  const changes = [
    switchedOff.length && `switched off ${labels(switchedOff)}`,
    switchedOn.length && `switched ${labels(switchedOn)} back on`
  ].filter(Boolean).join(' and ');

  await recordAudit(req, {
    action: 'platform.features',
    summary: `${nameOf(req.user)} ${changes}.`,
    target: { type: 'platform', label: 'Feature switches' },
    details: { switchedOff, switchedOn, disabled }
  });

  res.json({ message: `Saved: ${changes}.`, overview: await buildOverview(settings) });
}));

// PUT /api/platform/schedule - maintenance that starts (and ends) by itself;
// send no startsAt to cancel it
router.put('/schedule', passwordLimiter, [
  body('startsAt').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid start time.').toDate(),
  body('endsAt').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid end time.').toDate(),
  body('message').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }).withMessage('Keep the message to 500 characters.'),
  passwordRule,
  validate
], checkPassword, asyncHandler(async (req, res) => {
  const { startsAt, endsAt } = req.body;
  const before = await getPlatformSettings();

  if (!startsAt) {
    if (!before.window) return res.json({ message: 'No maintenance was scheduled.', overview: await buildOverview(before) });
    const settings = await updatePlatformSettings({ $unset: { window: 1 } }, req.user);
    await recordAudit(req, {
      action: 'platform.schedule',
      summary: `${nameOf(req.user)} cancelled the scheduled maintenance.`,
      target: { type: 'platform', label: 'Scheduled maintenance' },
      details: { cancelled: before.window }
    });
    return res.json({ message: 'The scheduled maintenance is cancelled.', overview: await buildOverview(settings) });
  }

  const now = new Date();
  if (endsAt && endsAt <= startsAt) throw new ApiError(400, 'The end time must be after the start time.');
  if (endsAt && endsAt <= now) throw new ApiError(400, 'That window has already ended. Choose a time in the future.');

  const window = { startsAt, endsAt: endsAt || null, message: req.body.message || '' };
  const settings = await updatePlatformSettings({ $set: { window } }, req.user);
  const startsNow = startsAt <= now;

  await recordAudit(req, {
    action: 'platform.schedule',
    summary: `${nameOf(req.user)} scheduled maintenance from ${nairobiTime(startsAt)}${endsAt ? ` to ${nairobiTime(endsAt)}` : ' with no end time'} (Nairobi time).`,
    target: { type: 'platform', label: 'Scheduled maintenance' },
    details: window
  });

  res.json({
    message: startsNow
      ? 'Maintenance has started. It ends by itself at the end time, or cancel the schedule to end it now.'
      : 'Maintenance is scheduled. Everyone sees a notice until it starts.',
    overview: await buildOverview(settings)
  });
}));

// PUT /api/platform/announcement - the site-wide banner; an empty message removes it
router.put('/announcement', [
  body('message').optional({ values: 'null' }).isString().trim().isLength({ max: 300 }).withMessage('Keep the announcement to 300 characters.'),
  body('tone').optional({ values: 'falsy' }).isIn(ANNOUNCEMENT_TONES).withMessage('Choose information, warning or critical.'),
  body('expiresAt').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid date and time.').toDate(),
  validate
], asyncHandler(async (req, res) => {
  const { message, tone, expiresAt } = req.body;
  const before = await getPlatformSettings();

  if (!message) {
    if (!before.announcement) return res.json({ message: 'There was no announcement to remove.', overview: await buildOverview(before) });
    const settings = await updatePlatformSettings({ $unset: { announcement: 1 } }, req.user);
    await recordAudit(req, {
      action: 'platform.announcement',
      summary: `${nameOf(req.user)} removed the site announcement.`,
      target: { type: 'platform', label: 'Site announcement' },
      details: { removed: before.announcement.message }
    });
    return res.json({ message: 'The announcement is removed.', overview: await buildOverview(settings) });
  }

  if (expiresAt && expiresAt <= new Date()) throw new ApiError(400, 'The announcement would already have ended. Choose a time in the future.');

  const announcement = { message, tone: tone || 'info', expiresAt: expiresAt || null };
  const settings = await updatePlatformSettings({ $set: { announcement } }, req.user);
  await recordAudit(req, {
    action: 'platform.announcement',
    summary: `${nameOf(req.user)} posted a site announcement: "${message}"`,
    target: { type: 'platform', label: 'Site announcement' },
    details: announcement
  });
  res.json({ message: 'The announcement is live.', overview: await buildOverview(settings) });
}));

// POST /api/platform/sessions/revoke - sign everyone out, superadmins excepted
router.post('/sessions/revoke', passwordLimiter, [passwordRule, validate], checkPassword, asyncHandler(async (req, res) => {
  const settings = await updatePlatformSettings({ $inc: { sessionEpoch: 1 }, $set: { sessionsRevokedAt: new Date() } }, req.user);
  await recordAudit(req, {
    action: 'security.sessions_revoked',
    summary: `${nameOf(req.user)} signed everyone out.`,
    target: { type: 'platform', label: 'All sessions' },
    details: { sessionEpoch: settings.sessionEpoch }
  });
  res.json({
    message: 'Everyone has been signed out, apart from superadmins. They will need to sign in again.',
    overview: await buildOverview(settings)
  });
}));

/* ------------------------------------------------------------------ *
 * System health
 * ------------------------------------------------------------------ */

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

const databaseHealth = async () => {
  const connection = mongoose.connection;
  const result = { state: DB_STATES[connection.readyState] || 'unknown', name: connection.name || null, pingMs: null, storage: null };
  if (connection.readyState !== 1) return result;

  try {
    const started = Date.now();
    await connection.db.admin().ping();
    result.pingMs = Date.now() - started;
  } catch (error) {
    result.error = error.message;
  }
  try {
    // Not every hosted plan allows dbStats; the page copes without it.
    const stats = await connection.db.stats();
    result.storage = {
      collections: stats.collections, objects: stats.objects,
      dataSize: stats.dataSize, storageSize: stats.storageSize, indexSize: stats.indexSize
    };
  } catch {
    result.storage = null;
  }
  return result;
};

const serviceChecks = () => {
  const env = process.env;
  const emailProvider = env.BREVO_API_KEY ? 'Brevo' : env.SMTP_HOST ? 'SMTP' : null;
  const registration = membershipFee('registration');
  const renewal = membershipFee('renewal');
  const frontend = (env.FRONTEND_URL || '').split(',')[0].trim();

  return [
    {
      key: 'storage',
      label: 'File storage',
      ok: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
      detail: env.CLOUDINARY_CLOUD_NAME ? 'Cloudinary' : 'Cloudinary is not set up: uploads will fail.'
    },
    {
      key: 'email',
      label: 'Email',
      ok: Boolean(emailProvider),
      detail: emailProvider ? `Sending through ${emailProvider}` : 'No email provider: approval and password reset emails cannot be sent.'
    },
    {
      key: 'mpesa',
      label: 'M-Pesa',
      ok: mpesaConfigured(),
      detail: mpesaConfigured() ? `${env.MPESA_ENV || 'sandbox'} environment` : 'Not set up: members can only pay manually.'
    },
    {
      key: 'fees',
      label: 'Membership fees',
      ok: Boolean(registration && renewal),
      detail: registration && renewal
        ? `Registration KSh ${registration.toLocaleString('en-KE')}, renewal KSh ${renewal.toLocaleString('en-KE')}`
        : 'REGISTRATION_FEE or RENEWAL_FEE is not set.'
    },
    {
      key: 'frontend',
      label: 'Website address',
      ok: Boolean(frontend),
      detail: frontend || 'FRONTEND_URL is not set: links in emails point to localhost.'
    }
  ];
};

// GET /api/platform/health - the server, database, services and recent faults
router.get('/health', asyncHandler(async (req, res) => {
  const now = new Date();
  const settings = await getPlatformSettings();
  const [database, counts] = await Promise.all([
    databaseHealth(),
    Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ pendingApproval: true }),
      User.countDocuments({ lockedUntil: { $gt: now } }),
      User.countDocuments({ role: ROLES.SUPERADMIN, isActive: true }),
      User.countDocuments({ role: ROLES.ADMIN, isActive: true }),
      Payment.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'awaiting_payment' }),
      Resource.countDocuments({ status: 'pending' }),
      Photo.estimatedDocumentCount(),
      AuditLog.estimatedDocumentCount()
    ]).catch(() => null)
  ]);

  const [activeMembers, pendingApprovals, lockedAccounts, superadmins, admins, pendingPayments, unpaidOrders, pendingResources, photos, auditEntries] = counts || [];
  const memory = process.memoryUsage();

  res.json({
    generatedAt: now,
    server: {
      environment: process.env.NODE_ENV || 'development',
      node: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: new Date(now.getTime() - process.uptime() * 1000),
      memory: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal },
      system: { totalMemory: os.totalmem(), freeMemory: os.freemem(), loadAverage: os.loadavg(), cpus: os.cpus().length }
    },
    database,
    records: counts && { activeMembers, pendingApprovals, pendingPayments, unpaidOrders, pendingResources, photos, auditEntries },
    services: serviceChecks(),
    security: {
      lockedAccounts: lockedAccounts ?? null,
      superadmins: superadmins ?? null,
      admins: admins ?? null,
      sessionsRevokedAt: settings.sessionsRevokedAt,
      rateLimiting: process.env.DISABLE_RATE_LIMIT !== 'true',
      sessionLength: process.env.JWT_EXPIRES_IN || '7d',
      override: readOverride()
    },
    recentErrors: recentServerErrors()
  });
}));

/* ------------------------------------------------------------------ *
 * Audit log
 * ------------------------------------------------------------------ */

// GET /api/platform/audit - sensitive actions, newest first
router.get('/audit', [
  query('category').optional({ values: 'falsy' }).isIn(AuditLog.CATEGORIES).withMessage('Unknown category'),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  query('from').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid start date').toDate(),
  query('to').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid end date').toDate(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validate
], asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 25;
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = req.query.from;
    if (req.query.to) filter.createdAt.$lte = req.query.to;
  }
  const search = buildSearchRegex(req.query.search);
  if (search) filter.$or = [{ summary: search }, { actorName: search }, { targetLabel: search }, { action: search }];

  const [entries, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter)
  ]);
  res.json({ entries, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
}));

/* ------------------------------------------------------------------ *
 * Admins and accounts
 * ------------------------------------------------------------------ */

// GET /api/platform/admins - everyone with full admin rights. Admins are made
// and removed through PUT /api/users/:id/role; superadmins only on the server.
router.get('/admins', asyncHandler(async (req, res) => {
  const admins = await User.find({ role: { $in: FULL_ADMIN_ROLES } })
    .select('firstName lastName email username role avatar isActive lastLoginAt createdAt')
    .lean();
  admins.sort((a, b) => (a.role === b.role ? a.firstName.localeCompare(b.firstName) : a.role === ROLES.SUPERADMIN ? -1 : 1));
  res.json({ admins });
}));

// GET /api/platform/accounts/locked - accounts locked by failed sign-ins
router.get('/accounts/locked', asyncHandler(async (req, res) => {
  const accounts = await User.find({ lockedUntil: { $gt: new Date() } })
    .select('firstName lastName email role +lockedUntil')
    .sort({ lockedUntil: -1 })
    .limit(100)
    .lean();
  res.json({ accounts });
}));

// POST /api/platform/accounts/:id/unlock - let a locked account sign in again now
router.post('/accounts/:id/unlock', [param('id').isMongoId().withMessage('That identifier is not valid.'), validate], asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id).select('+lockedUntil');
  if (!target) throw new ApiError(404, 'Account not found.');
  if (!target.isLocked) return res.json({ message: `${target.firstName}'s account is not locked.` });

  await User.updateOne({ _id: target._id }, { $set: { failedLoginAttempts: 0 }, $unset: { lockedUntil: 1 } });
  await recordAudit(req, {
    action: 'security.unlocked',
    summary: `${nameOf(req.user)} unlocked ${nameOf(target)}'s account after failed sign-ins.`,
    target: userTarget(target)
  });
  res.json({ message: `${target.firstName} can sign in again.` });
}));

/* ------------------------------------------------------------------ *
 * Background jobs
 * ------------------------------------------------------------------ */

const JOBS = {
  'expire-orders': {
    label: 'Expire unpaid shop orders',
    description: 'Cancel shop orders left unpaid past the hold period and put their stock back. Runs every hour by itself.',
    run: () => expireStaleOrders({ force: true }),
    done: (count) => (count ? `${plural(count, 'unpaid order')} cancelled and the stock put back.` : 'No unpaid orders were due to expire.')
  },
  'academic-rollover': {
    label: 'Academic year rollover',
    description: 'Move students up a year once their year of study has passed, and final-year students to alumni. Runs every day by itself.',
    run: () => advanceAcademicYears({ force: true }),
    done: (count) => (count ? `${plural(count, 'member')} moved on a year.` : 'Nobody was due to move on a year.')
  }
};

// GET /api/platform/jobs - the jobs that can be run by hand
router.get('/jobs', (req, res) => {
  res.json({ jobs: Object.entries(JOBS).map(([key, { label, description }]) => ({ key, label, description })) });
});

// POST /api/platform/jobs/:job - run one now
router.post('/jobs/:job', [param('job').isIn(Object.keys(JOBS)).withMessage('Unknown job.'), validate], asyncHandler(async (req, res) => {
  const job = JOBS[req.params.job];
  const count = await job.run();
  const message = job.done(count);
  await recordAudit(req, {
    action: 'platform.job',
    summary: `${nameOf(req.user)} ran "${job.label}": ${message}`,
    target: { type: 'job', label: job.label },
    details: { job: req.params.job, count }
  });
  res.json({ message, count });
}));

module.exports = router;
