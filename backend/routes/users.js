const express = require('express');
const { body, param, query } = require('express-validator');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Event = require('../models/Event');
const Resource = require('../models/Resource');
const Project = require('../models/Project');
const News = require('../models/News');
const Photo = require('../models/Photo');
const Election = require('../models/Election');
const { protect, adminOnly, adminRoleOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { buildSearchRegex } = require('../utils/sanitize');
const { toCsv } = require('../utils/csv');
const { ALL_ROLES, LEADERSHIP_ROLES, ROLES, labelFor } = require('../utils/roles');
const { DEPARTMENTS } = require('../models/User');
const {
  membershipClause, membershipActivatedNotice, membershipActivatedNotices, membershipFee, isMembershipCurrent, notifyUsers
} = require('../utils/membership');
const { recordRoleChange } = require('../utils/certificates');
const { accountHistory, deleteAccount } = require('../utils/accounts');
const { sendEmail, renderLayout, html } = require('../utils/email');

const router = express.Router();

// Fields safe to expose in a member listing. Deliberately excludes email, phone
// and registration number.
const DIRECTORY_FIELDS = 'firstName lastName username department yearOfStudy academicStatus role avatar bio createdAt';

const ADMIN_LIST_FIELDS = 'firstName lastName email username regNumber memberNumber phone department yearOfStudy academicStatus role avatar isActive pendingApproval membershipPaid membershipExpiry lastPaymentDate lastLoginAt createdAt';

// Matches the term applied when a submitted payment is verified.
const MEMBERSHIP_TERM_MS = 180 * 24 * 60 * 60 * 1000;

const PROFILE_LIST_LIMIT = 6;
const ACTIVITY_LIST_LIMIT = 10;
const PAYMENT_LIST_LIMIT = 25;
const EXPORT_LIMIT = 5000;

const idParam = param('id').isMongoId().withMessage('That identifier is not valid.');

const sameId = (a, b) => String(a) === String(b);

// GET /api/users - member directory
// Requires a session: the directory is personal data about students and was
// previously readable by anyone who could reach the API.
router.get('/', protect, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('department').optional({ values: 'falsy' }).isIn(DEPARTMENTS).withMessage('Unknown department'),
  query('year').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).toInt(),
  query('status').optional({ values: 'falsy' }).isIn(['student', 'alumni']),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  validate
], asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const skip = (page - 1) * limit;

  const filter = { isActive: true };
  if (req.query.department) filter.department = req.query.department;
  if (req.query.year) filter.yearOfStudy = req.query.year;
  if (req.query.status) filter.academicStatus = req.query.status;

  // Regex metacharacters are escaped, so a search for "C++" matches literally
  // instead of throwing, and no input can trigger catastrophic backtracking.
  const search = buildSearchRegex(req.query.search);
  if (search) {
    filter.$or = [{ firstName: search }, { lastName: search }, { username: search }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).select(DIRECTORY_FIELDS).sort({ firstName: 1, lastName: 1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter)
  ]);

  res.json({ users, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), total });
}));

// GET /api/users/leaders - leadership team, shown on the public About page
router.get('/leaders', asyncHandler(async (req, res) => {
  const leaders = await User.find({ role: { $in: LEADERSHIP_ROLES }, isActive: true })
    .select('firstName lastName department role avatar bio')
    .lean();

  // Present the committee in constitutional order rather than insertion order.
  const rank = new Map(LEADERSHIP_ROLES.map((role, index) => [role, index]));
  leaders.sort((a, b) => (rank.get(a.role) ?? 99) - (rank.get(b.role) ?? 99));

  res.json(leaders);
}));

// GET /api/users/stats - aggregate membership figures for the public home page
router.get('/stats', asyncHandler(async (req, res) => {
  const [total, students, alumni, byDepartment, byYear] = await Promise.all([
    User.countDocuments({ isActive: true }),
    User.countDocuments({ isActive: true, academicStatus: 'student' }),
    User.countDocuments({ isActive: true, academicStatus: 'alumni' }),
    User.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    User.aggregate([
      { $match: { isActive: true, academicStatus: 'student' } },
      { $group: { _id: '$yearOfStudy', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  ]);

  res.json({ total, students, alumni, byDepartment, byYear });
}));

/* ------------------------------------------------------------------ *
 * Member administration
 * ------------------------------------------------------------------ */

// "unpaid" is everyone not paid up: never paid, or expired.
const MEMBERSHIP_STATES = ['current', 'expired', 'none', 'unpaid'];
const ADMIN_SORTS = {
  newest: { createdAt: -1 },
  name: { firstName: 1, lastName: 1 },
  lastLogin: { lastLoginAt: -1 }
};


const membershipLabel = (user, now = new Date()) => {
  if (!user.membershipPaid) return 'Not paid';
  return user.membershipExpiry && user.membershipExpiry <= now ? 'Expired' : 'Paid';
};

// The account filter: 'true' is active, 'false' deactivated, 'pending' the
// sign-ups awaiting approval. Awaiting approval is inactive too, but is not
// counted or listed as deactivated.
const ACCOUNT_STATES = ['true', 'false', 'pending'];
const accountClause = (state) => ({
  true: { isActive: true },
  false: { isActive: false, pendingApproval: { $ne: true } },
  pending: { pendingApproval: true }
}[state] || null);

const adminListRules = [
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  query('role').optional({ values: 'falsy' }).isIn(ALL_ROLES),
  query('active').optional({ values: 'falsy' }).isIn(ACCOUNT_STATES),
  query('department').optional({ values: 'falsy' }).isIn(DEPARTMENTS).withMessage('Unknown department'),
  query('year').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).toInt(),
  query('status').optional({ values: 'falsy' }).isIn(['student', 'alumni']),
  query('membership').optional({ values: 'falsy' }).isIn(MEMBERSHIP_STATES),
  query('sort').optional({ values: 'falsy' }).isIn(Object.keys(ADMIN_SORTS))
];

/** Shared by the list and the export, so a download always matches the screen. */
const buildAdminFilter = (q) => {
  const clauses = [];
  if (q.role) clauses.push({ role: q.role });
  if (q.active) clauses.push(accountClause(q.active));
  if (q.department) clauses.push({ department: q.department });
  if (q.year) clauses.push({ yearOfStudy: q.year });
  if (q.status) clauses.push({ academicStatus: q.status });

  const membership = q.membership === 'unpaid' ? { $nor: [membershipClause('current')] } : membershipClause(q.membership);
  if (membership) clauses.push(membership);

  const search = buildSearchRegex(q.search);
  if (search) {
    clauses.push({ $or: [{ firstName: search }, { lastName: search }, { email: search }, { username: search }, { regNumber: search }, { memberNumber: search }] });
  }

  return clauses.length ? { $and: clauses } : {};
};

// A tiebreak on _id keeps pagination stable when many rows share a sort value.
const adminSort = (key) => ({ ...(ADMIN_SORTS[key] || ADMIN_SORTS.newest), _id: -1 });

// GET /api/users/admin/list - full records for member administration
router.get('/admin/list', protect, adminOnly, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ...adminListRules,
  validate
], asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 25;
  const skip = (page - 1) * limit;
  const filter = buildAdminFilter(req.query);

  const [users, total] = await Promise.all([
    User.find(filter).select(ADMIN_LIST_FIELDS).sort(adminSort(req.query.sort)).skip(skip).limit(limit).lean(),
    User.countDocuments(filter)
  ]);

  res.json({ users, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), total });
}));

// GET /api/users/admin/summary - headline counts for the member administration page
router.get('/admin/summary', protect, adminOnly, asyncHandler(async (req, res) => {
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total, active, deactivated, pending, paid, joinedLast30Days] = await Promise.all([
    User.countDocuments(),
    User.countDocuments(accountClause('true')),
    User.countDocuments(accountClause('false')),
    User.countDocuments(accountClause('pending')),
    User.countDocuments({ $and: [{ isActive: true }, membershipClause('current', now)] }),
    User.countDocuments({ createdAt: { $gte: monthAgo } })
  ]);

  res.json({ total, active, deactivated, pending, paid, unpaid: active - paid, joinedLast30Days });
}));

// GET /api/users/admin/export - the filtered member list as CSV
router.get('/admin/export', protect, adminOnly, [...adminListRules, validate], asyncHandler(async (req, res) => {
  const users = await User.find(buildAdminFilter(req.query))
    .select(ADMIN_LIST_FIELDS)
    .sort(adminSort(req.query.sort))
    .limit(EXPORT_LIMIT)
    .lean();

  const now = new Date();
  const day = (value) => (value ? value.toISOString().slice(0, 10) : '');
  const columns = [
    { label: 'First name', value: (u) => u.firstName },
    { label: 'Last name', value: (u) => u.lastName },
    { label: 'Username', value: (u) => u.username },
    { label: 'Email', value: (u) => u.email },
    { label: 'Phone', value: (u) => u.phone },
    { label: 'Registration number', value: (u) => u.regNumber },
    { label: 'Member number', value: (u) => u.memberNumber },
    { label: 'Department', value: (u) => u.department },
    { label: 'Year of study', value: (u) => (u.academicStatus === 'alumni' ? 'Alumni' : u.yearOfStudy) },
    { label: 'Role', value: (u) => labelFor(u.role) },
    { label: 'Membership', value: (u) => membershipLabel(u, now) },
    { label: 'Membership expires', value: (u) => day(u.membershipExpiry) },
    { label: 'Account', value: (u) => (u.pendingApproval ? 'Awaiting approval' : u.isActive ? 'Active' : 'Deactivated') },
    { label: 'Joined', value: (u) => day(u.createdAt) },
    { label: 'Last sign-in', value: (u) => day(u.lastLoginAt) }
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="eesa-members-${day(now)}.csv"`);
  res.send(toCsv(columns, users));
}));

// GET /api/users/admin/:id - everything an administrator needs to know about one member
router.get('/admin/:id', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  // lockedUntil feeds the isLocked virtual; toJSON strips the field itself.
  const user = await User.findById(req.params.id).select('+lockedUntil');
  if (!user) throw new ApiError(404, 'Member not found.');

  const id = user._id;
  const projectFilter = { $or: [{ teamLead: id }, { teamMembers: id }] };

  const [
    payments, paymentTotals, events, eventCount, organisedEventCount,
    resources, resourceStatuses, projects, articles, photoCount, elections
  ] = await Promise.all([
    Payment.find({ user: id })
      .select('type amount semester academicYear reference paymentMethod mpesaReceiptNumber status verifiedBy verifiedAt rejectionReason notes createdAt')
      .populate('verifiedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(PAYMENT_LIST_LIMIT)
      .lean(),
    Payment.aggregate([
      { $match: { user: id } },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }
    ]),
    Event.find({ attendees: id }).select('title date status location').sort({ date: -1 }).limit(ACTIVITY_LIST_LIMIT).lean(),
    Event.countDocuments({ attendees: id }),
    Event.countDocuments({ organizer: id }),
    Resource.find({ uploadedBy: id })
      .select('title category unitCode year semester status downloads createdAt')
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_LIST_LIMIT)
      .lean(),
    Resource.aggregate([{ $match: { uploadedBy: id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Project.find(projectFilter).select('title category status teamLead').sort({ createdAt: -1 }).limit(ACTIVITY_LIST_LIMIT).lean(),
    News.find({ author: id }).select('title isPublished publishedAt createdAt').sort({ createdAt: -1 }).limit(ACTIVITY_LIST_LIMIT).lean(),
    Photo.countDocuments({ uploadedBy: id }),
    // Only the nomination fields are projected. Legacy ballots are stored on the
    // candidate as `votes` and must never leave the server.
    Election.find({ 'candidates.user': id })
      .select('title status startDate endDate candidates._id candidates.user candidates.position candidates.status candidates.nominatedBy candidates.rejectionReason candidates.createdAt')
      .sort({ startDate: -1 })
      .lean()
  ]);

  const byStatus = (rows) => Object.fromEntries(rows.map((row) => [row._id, row]));
  const paymentsByStatus = byStatus(paymentTotals);
  const resourcesByStatus = byStatus(resourceStatuses);

  const nominations = elections.flatMap((election) => election.candidates
    .filter((candidate) => sameId(candidate.user, id))
    .map((candidate) => ({
      _id: candidate._id,
      position: candidate.position,
      status: candidate.status,
      nominatedBy: candidate.nominatedBy,
      rejectionReason: candidate.rejectionReason,
      appliedAt: candidate.createdAt,
      election: { _id: election._id, title: election.title, status: election.status, startDate: election.startDate, endDate: election.endDate }
    })));

  res.json({
    user: user.toJSON(),
    payments,
    paymentSummary: {
      count: paymentTotals.reduce((sum, row) => sum + row.count, 0),
      verifiedAmount: paymentsByStatus.verified?.amount || 0,
      pending: paymentsByStatus.pending?.count || 0
    },
    activity: {
      events,
      eventCount,
      organisedEventCount,
      resources,
      resourceCounts: {
        approved: resourcesByStatus.approved?.count || 0,
        pending: resourcesByStatus.pending?.count || 0,
        rejected: resourcesByStatus.rejected?.count || 0
      },
      projects: projects.map(({ teamLead, ...project }) => ({ ...project, isLead: sameId(teamLead, id) })),
      articles,
      photoCount
    },
    nominations
  });
}));

/**
 * Guard against an administrator locking the association out of its own portal
 * by demoting or deactivating the last remaining admin account.
 */
const assertNotLastAdmin = async (userId, action) => {
  const remaining = await User.countDocuments({ role: ROLES.ADMIN, isActive: true, _id: { $ne: userId } });
  if (remaining === 0) {
    throw new ApiError(400, `This is the only active admin account, so it cannot be ${action}. Promote another admin first.`);
  }
};

/** Only a full admin may change another admin's account. */
const assertCanManage = (actor, target) => {
  if (target.role === ROLES.ADMIN && actor.role !== ROLES.ADMIN) {
    throw new ApiError(403, 'Only an admin can change another admin account.');
  }
};

// PUT /api/users/:id/role - change a member's role
// Restricted to the admin role. Previously the chairperson could reach this too,
// which meant any chairperson could promote themselves to full admin.
router.put('/:id/role', protect, adminRoleOnly, [
  body('role').isIn(ALL_ROLES).withMessage('Unknown role'),
  validate
], asyncHandler(async (req, res) => {
  const { role } = req.body;

  // Self-demotion is the most common way to lose access by accident.
  if (sameId(req.params.id, req.user._id)) {
    throw new ApiError(400, 'You cannot change your own role. Ask another admin to do it.');
  }

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'Member not found.');

  if (target.role === ROLES.ADMIN && role !== ROLES.ADMIN) {
    await assertNotLastAdmin(target._id, 'demoted');
  }

  const previousRole = target.role;
  target.role = role;
  await target.save({ validateBeforeSave: false });
  // Offices are recorded as terms, which leadership certificates are issued from.
  await recordRoleChange(target, previousRole, role, req.user);

  res.json({ message: `${target.firstName} ${target.lastName} is now ${labelFor(role)}.`, user: target.toJSON() });
}));

// PATCH /api/users/:id/status - deactivate or restore a member
// Replaces the previous DELETE-only route, which could suspend an account with
// no way to bring it back other than editing the database by hand.
router.patch('/:id/status', protect, adminOnly, [
  body('isActive').isBoolean().withMessage('isActive must be true or false').toBoolean(),
  validate
], asyncHandler(async (req, res) => {
  const { isActive } = req.body;

  if (sameId(req.params.id, req.user._id)) {
    throw new ApiError(400, 'You cannot change your own account status.');
  }

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'Member not found.');
  assertCanManage(req.user, target);

  // Restoring would skip the approval, which also emails the applicant.
  if (target.pendingApproval) {
    throw new ApiError(400, `${target.firstName} is waiting for approval. Approve or delete the account instead.`);
  }

  if (!isActive && target.role === ROLES.ADMIN) {
    await assertNotLastAdmin(target._id, 'deactivated');
  }

  target.isActive = isActive;
  await target.save({ validateBeforeSave: false });

  res.json({
    message: isActive
      ? `${target.firstName}'s account has been restored.`
      : `${target.firstName}'s account has been deactivated.`,
    user: target.toJSON()
  });
}));

/* ------------------------------------------------------------------ *
 * Sign-up approval and junk accounts
 * ------------------------------------------------------------------ */

const APPROVE_LIMIT = 200;
const EMAIL_BATCH = 10;

/** Welcome approved members by email, a few at a time. Failures are logged; the approval stands. */
const sendApprovalEmails = async (members) => {
  const baseUrl = (process.env.FRONTEND_URL || '').split(',')[0].trim() || 'http://localhost:3000';
  for (let i = 0; i < members.length; i += EMAIL_BATCH) {
    await Promise.all(members.slice(i, i + EMAIL_BATCH).map((member) => sendEmail(
      member.email,
      'Your EESA account is approved',
      renderLayout({
        heading: 'Welcome to EESA',
        bodyHtml: html`
          <p style="color:#555;">Hello ${member.firstName},</p>
          <p style="color:#555;">Your EESA account has been approved. You can now sign in with the email address and password you registered with.</p>`,
        ctaLabel: 'Sign in',
        ctaUrl: `${baseUrl}/login`,
        footerNote: 'Once you are signed in, pay the membership fee under Payments to get your membership card.'
      })
    ).catch((error) => console.warn(`Approval email to ${member.email} failed:`, error.message))));
  }
};

// POST /api/users/admin/approve - let sign-ups awaiting approval in
router.post('/admin/approve', protect, adminOnly, [
  body('ids').isArray({ min: 1, max: APPROVE_LIMIT }).withMessage(`Choose between 1 and ${APPROVE_LIMIT} accounts.`),
  body('ids.*').isMongoId().withMessage('One of the chosen accounts could not be found.'),
  validate
], asyncHandler(async (req, res) => {
  const applicants = await User.find({ _id: { $in: req.body.ids }, pendingApproval: true })
    .select('firstName lastName email')
    .lean();
  if (!applicants.length) throw new ApiError(400, 'None of those accounts is waiting for approval.');

  const ids = applicants.map((applicant) => applicant._id);
  await User.updateMany(
    { _id: { $in: ids }, pendingApproval: true },
    { $set: { isActive: true, approvedAt: new Date(), approvedBy: req.user._id }, $unset: { pendingApproval: 1 } }
  );
  await notifyUsers(ids, {
    title: 'Welcome to EESA',
    message: 'Your account has been approved. Pay the membership fee under Payments, then upload a passport photo under Membership Card to get your card.',
    type: 'membership',
    createdBy: req.user._id
  });
  // Not awaited: a slow mail provider must not hold up the administrator.
  sendApprovalEmails(applicants);

  const skipped = req.body.ids.length - applicants.length;
  const done = applicants.length === 1
    ? `${applicants[0].firstName} ${applicants[0].lastName} is approved and can now sign in.`
    : `${plural(applicants.length, 'account')} approved. They can now sign in.`;
  res.json({
    approved: applicants.length,
    message: skipped ? `${done} ${plural(skipped, 'other')} ${skipped === 1 ? 'was' : 'were'} not waiting for approval.` : done
  });
}));

const listOf = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]);

// DELETE /api/users/admin/:id - permanently remove a junk account
// Only an account with no history can go. Anyone who paid, bought, uploaded,
// voted or held office is deactivated instead, so the records stay whole.
router.delete('/admin/:id', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  if (sameId(req.params.id, req.user._id)) {
    throw new ApiError(400, 'You cannot delete your own account.');
  }

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'Member not found.');
  assertCanManage(req.user, target);

  // Two steps for an active member, so one mistaken click cannot delete them.
  if (target.isActive) {
    throw new ApiError(400, `Deactivate ${target.firstName}'s account before deleting it.`);
  }

  const history = await accountHistory(target);
  if (history.length) {
    throw new ApiError(409, `${target.firstName}'s account has ${listOf(history)}, so it cannot be deleted. Leave it deactivated instead.`);
  }

  await deleteAccount(target);
  res.json({ message: `${target.firstName} ${target.lastName}'s account has been deleted.` });
}));

// PATCH /api/users/:id - correct a member's details on their behalf
router.patch('/:id', protect, adminOnly, [
  idParam,
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty').isLength({ max: 50 }),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty').isLength({ max: 50 }),
  body('regNumber').optional().isString().trim().toUpperCase().isLength({ max: 30 }).withMessage('Registration number is too long'),
  body('department').optional().isIn(DEPARTMENTS).withMessage('Select a valid department'),
  body('yearOfStudy').optional().isInt({ min: 1, max: 5 }).withMessage('Year of study must be between 1 and 5').toInt(),
  body('academicStatus').optional().isIn(['student', 'alumni']).withMessage('Choose student or alumni'),
  validate
], asyncHandler(async (req, res) => {
  // Registration numbers are not editable from a member's own profile, so an
  // administrator changing their own would bypass that. Another admin can do it.
  if (sameId(req.params.id, req.user._id)) {
    throw new ApiError(400, 'You cannot edit your own details here. Ask another administrator.');
  }

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'Member not found.');
  assertCanManage(req.user, target);

  const set = {};
  const unset = {};
  for (const field of ['firstName', 'lastName', 'department', 'yearOfStudy', 'academicStatus']) {
    if (req.body[field] !== undefined) set[field] = req.body[field];
  }
  if (req.body.regNumber !== undefined) {
    // An empty value clears the number. Storing '' would collide on the unique
    // index with every other cleared number.
    if (req.body.regNumber) set.regNumber = req.body.regNumber;
    else unset.regNumber = 1;
  }

  // The yearly rollover counts from academicYearStartedAt. Restart it when the
  // year or status is corrected, or a member moved back from alumni would be
  // graduated again on the next pass.
  const yearChanged = set.yearOfStudy !== undefined && set.yearOfStudy !== target.yearOfStudy;
  const statusChanged = set.academicStatus !== undefined && set.academicStatus !== target.academicStatus;
  if (yearChanged || statusChanged) set.academicYearStartedAt = new Date();

  const update = { $set: set };
  if (Object.keys(unset).length) update.$unset = unset;

  const user = await User.findByIdAndUpdate(target._id, update, { new: true, runValidators: true });
  res.json({ message: `${user.firstName}'s details have been updated.`, user: user.toJSON() });
}));

// PATCH /api/users/:id/membership - set membership by hand, optionally recording a cash payment
router.patch('/:id/membership', protect, adminOnly, [
  idParam,
  body('membershipPaid').isBoolean().withMessage('Choose paid or not paid').toBoolean(),
  body('membershipExpiry').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid expiry date').toDate(),
  body('payment').optional({ values: 'null' }).isObject().withMessage('Payment details are invalid'),
  body('payment.amount').optional().isFloat({ min: 1, max: 1000000 }).withMessage('Enter the amount received').toFloat(),
  body('payment.type').optional().isIn(['registration', 'renewal']).withMessage('Choose registration or renewal'),
  body('payment.reference').optional({ values: 'falsy' }).isString().trim().isLength({ max: 100 }).withMessage('Reference is too long'),
  validate
], asyncHandler(async (req, res) => {
  // Treasury records should always involve a second person.
  if (sameId(req.params.id, req.user._id)) {
    throw new ApiError(400, 'You cannot change your own membership. Ask another administrator.');
  }

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'Member not found.');

  const { membershipPaid, membershipExpiry } = req.body;
  const cash = req.body.payment?.amount ? req.body.payment : null;
  const now = new Date();
  // Already paid up means this is a change of expiry, and the message says so.
  const wasCurrent = isMembershipCurrent(target, now);

  if (cash && !membershipPaid) {
    throw new ApiError(400, 'A payment can only be recorded when marking the membership as paid.');
  }

  if (membershipPaid) {
    const expiry = membershipExpiry || new Date(now.getTime() + MEMBERSHIP_TERM_MS);
    if (expiry <= now) throw new ApiError(400, 'The expiry date must be in the future.');
    target.membershipPaid = true;
    target.membershipExpiry = expiry;
  } else {
    target.membershipPaid = false;
    target.membershipExpiry = undefined;
  }

  let payment = null;
  if (cash) {
    payment = await Payment.create({
      user: target._id,
      type: cash.type || 'renewal',
      amount: cash.amount,
      reference: cash.reference || '',
      paymentMethod: 'manual',
      status: 'verified',
      verifiedBy: req.user._id,
      verifiedAt: now,
      notes: `Recorded by ${req.user.firstName} ${req.user.lastName} from the member's profile.`
    });
    target.lastPaymentDate = now;
  }

  await target.save({ validateBeforeSave: false });
  if (membershipPaid) await membershipActivatedNotice(target, req.user._id);

  res.json({
    message: !membershipPaid
      ? `${target.firstName}'s membership is marked as not paid.`
      : wasCurrent
        ? `${target.firstName}'s membership now runs until ${longDay(target.membershipExpiry)}.`
        : `${target.firstName}'s membership is marked as paid.`,
    user: target.toJSON(),
    payment
  });
}));

const BULK_MEMBERSHIP_LIMIT = 1000;

/**
 * The member-list filters sent with "mark all matching", checked as strictly
 * as the list's own query string, so the action covers exactly the list shown.
 */
const readListFilter = (filter) => {
  const q = {};
  const pick = (key, allowed) => {
    const value = filter[key];
    if (value === undefined || value === null || value === '') return;
    if (!allowed(String(value))) throw new ApiError(400, 'The filters are invalid. Refresh the page and try again.');
    q[key] = String(value);
  };
  if (filter.search) q.search = String(filter.search).slice(0, 80);
  pick('role', (v) => ALL_ROLES.includes(v));
  pick('active', (v) => ACCOUNT_STATES.includes(v));
  pick('department', (v) => DEPARTMENTS.includes(v));
  pick('status', (v) => ['student', 'alumni'].includes(v));
  pick('membership', (v) => MEMBERSHIP_STATES.includes(v));
  pick('year', (v) => /^[1-5]$/.test(v));
  if (q.year) q.year = Number(q.year);
  return q;
};

const longDay = (date) => date.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' });
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// POST /api/users/admin/membership - mark ticked members, or everyone matching the list filters, as paid (or ticked ones as not paid)
router.post('/admin/membership', protect, adminOnly, [
  body('membershipPaid').isBoolean().withMessage('Choose paid or not paid').toBoolean(),
  body('ids').optional().isArray({ min: 1, max: BULK_MEMBERSHIP_LIMIT }).withMessage(`Choose between 1 and ${BULK_MEMBERSHIP_LIMIT} members.`),
  body('ids.*').isMongoId().withMessage('One of the chosen members could not be found.'),
  body('filter').optional().isObject().withMessage('The filters are invalid.'),
  body('membershipExpiry').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid expiry date').toDate(),
  body('recordPayment').optional().isBoolean().toBoolean(),
  // Report what would happen without changing anything, for the confirmation.
  body('dryRun').optional().isBoolean().toBoolean(),
  validate
], asyncHandler(async (req, res) => {
  const { membershipPaid, ids, filter, membershipExpiry, recordPayment, dryRun } = req.body;
  const now = new Date();

  if (Boolean(ids) === Boolean(filter)) throw new ApiError(400, 'Choose members, or mark everyone matching the filters.');
  if (!membershipPaid && filter) throw new ApiError(400, 'Tick the members to mark as not paid.');
  if (!membershipPaid && recordPayment) throw new ApiError(400, 'A payment can only be recorded when marking members as paid.');
  if (membershipPaid) {
    if (!membershipExpiry) throw new ApiError(400, 'Choose the date the membership is paid until.');
    if (membershipExpiry <= now) throw new ApiError(400, 'The expiry date must be in the future.');
  }

  const scope = ids ? { _id: { $in: ids } } : buildAdminFilter(readListFilter(filter));
  const candidates = await User.find(scope)
    .select('firstName lastName isActive membershipPaid membershipExpiry lastPaymentDate passportPhoto')
    .limit(BULK_MEMBERSHIP_LIMIT + 1)
    .lean();
  if (candidates.length > BULK_MEMBERSHIP_LIMIT) {
    throw new ApiError(400, `That is more than ${BULK_MEMBERSHIP_LIMIT} members. Narrow the filters and do it in parts.`);
  }

  // Who changes, and why the rest are left alone.
  const skipped = { self: 0, inactive: 0, unchanged: 0 };
  const targets = [];
  for (const member of candidates) {
    // Treasury records should always involve a second person.
    if (sameId(member._id, req.user._id)) skipped.self += 1;
    else if (!member.isActive) skipped.inactive += 1;
    else if (membershipPaid
      // Already paid up to the chosen date or later: a bulk action never shortens a membership.
      ? isMembershipCurrent(member, now) && (!member.membershipExpiry || member.membershipExpiry >= membershipExpiry)
      : !member.membershipPaid) skipped.unchanged += 1;
    else targets.push(member);
  }

  // Returning members pay renewal; anyone never paid before pays registration.
  let payments = null;
  if (recordPayment && targets.length) {
    const paidBefore = new Set((await Payment.distinct('user', { user: { $in: targets.map((t) => t._id) }, status: 'verified' })).map(String));
    const typeOf = (member) => (member.lastPaymentDate || paidBefore.has(String(member._id)) ? 'renewal' : 'registration');
    payments = { registration: { count: 0, fee: membershipFee('registration') }, renewal: { count: 0, fee: membershipFee('renewal') }, total: 0 };
    targets.forEach((member) => { payments[typeOf(member)].count += 1; });
    for (const type of ['registration', 'renewal']) {
      if (payments[type].count && !payments[type].fee) {
        throw new ApiError(400, `The ${type} fee is not set on the server, so payments cannot be recorded. Untick “Record a payment”, or set ${type === 'registration' ? 'REGISTRATION_FEE' : 'RENEWAL_FEE'} first.`);
      }
      payments.total += payments[type].count * (payments[type].fee || 0);
    }
    payments.typeOf = typeOf;
  }

  const summary = {
    matched: candidates.length,
    updated: targets.length,
    skipped,
    payments: payments && { registration: payments.registration, renewal: payments.renewal, total: payments.total }
  };
  if (dryRun) return res.json({ ...summary, dryRun: true });

  const targetIds = targets.map((t) => t._id);
  if (targetIds.length) {
    if (membershipPaid) {
      await User.updateMany({ _id: { $in: targetIds } }, { membershipPaid: true, membershipExpiry });
      if (payments) {
        const recorder = `${req.user.firstName} ${req.user.lastName}`;
        await Payment.insertMany(targets.map((member) => {
          const type = payments.typeOf(member);
          return {
            user: member._id,
            type,
            amount: payments[type].fee,
            paymentMethod: 'manual',
            status: 'verified',
            verifiedBy: req.user._id,
            verifiedAt: now,
            notes: `Recorded by ${recorder} when marking members paid together.`
          };
        }));
        await User.updateMany({ _id: { $in: targetIds } }, { lastPaymentDate: now });
      }
      await membershipActivatedNotices(targets.map((member) => ({ ...member, membershipExpiry })), req.user._id);
    } else {
      await User.updateMany({ _id: { $in: targetIds } }, { membershipPaid: false, $unset: { membershipExpiry: 1 } });
    }
  }

  const done = membershipPaid
    ? `${plural(targets.length, 'member')} marked as paid until ${longDay(membershipExpiry)}.`
    : `${plural(targets.length, 'member')} marked as not paid.`;
  const notes = [
    skipped.unchanged && (membershipPaid ? `${skipped.unchanged} already paid until then or later` : `${skipped.unchanged} already not paid`),
    skipped.inactive && `${skipped.inactive} deactivated`,
    skipped.self && 'your own account, which another administrator marks'
  ].filter(Boolean);

  res.json({ ...summary, message: notes.length ? `${done} Left alone: ${notes.join('; ')}.` : done });
}));

// DELETE /api/users/:id - retained for compatibility; deactivates rather than deletes
router.delete('/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  if (sameId(req.params.id, req.user._id)) {
    throw new ApiError(400, 'You cannot deactivate your own account.');
  }

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'Member not found.');

  if (target.role === ROLES.ADMIN) {
    if (req.user.role !== ROLES.ADMIN) throw new ApiError(403, 'Only an admin can deactivate another admin account.');
    await assertNotLastAdmin(target._id, 'deactivated');
  }

  target.isActive = false;
  await target.save({ validateBeforeSave: false });

  res.json({ message: `${target.firstName}'s account has been deactivated.` });
}));

// GET /api/users/:id - a member's profile as other members see it
// Registered last so it cannot shadow the named routes above. Contact details,
// payments and account state are left out; administrators use /admin/:id.
router.get('/:id', protect, [idParam, validate], asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, isActive: true }).select(DIRECTORY_FIELDS).lean();
  if (!user) throw new ApiError(404, 'Member not found.');

  const resourceFilter = { uploadedBy: user._id, status: 'approved' };

  const [resources, resourceCount, projects] = await Promise.all([
    Resource.find(resourceFilter).select('title category unitCode year semester createdAt').sort({ createdAt: -1 }).limit(PROFILE_LIST_LIMIT).lean(),
    Resource.countDocuments(resourceFilter),
    Project.find({ $or: [{ teamLead: user._id }, { teamMembers: user._id }] })
      .select('title category status teamLead')
      .sort({ createdAt: -1 })
      .limit(PROFILE_LIST_LIMIT)
      .lean()
  ]);

  res.json({
    user,
    contributions: {
      resources,
      resourceCount,
      projects: projects.map(({ teamLead, ...project }) => ({ ...project, isLead: sameId(teamLead, user._id) }))
    }
  });
}));

module.exports = router;
