const express = require('express');
const { body, query } = require('express-validator');
const User = require('../models/User');
const { protect, adminOnly, adminRoleOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { buildSearchRegex } = require('../utils/sanitize');
const { ALL_ROLES, LEADERSHIP_ROLES, ROLES } = require('../utils/roles');
const { DEPARTMENTS } = require('../models/User');

const router = express.Router();

// Fields safe to expose in a member listing. Deliberately excludes email, phone
// and registration number.
const DIRECTORY_FIELDS = 'firstName lastName username department yearOfStudy academicStatus role avatar bio createdAt';

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

// GET /api/users/admin/list - full records for member administration
router.get('/admin/list', protect, adminOnly, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  query('role').optional({ values: 'falsy' }).isIn(ALL_ROLES),
  query('active').optional({ values: 'falsy' }).isIn(['true', 'false']),
  validate
], asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 25;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.active !== undefined) filter.isActive = req.query.active === 'true';

  const search = buildSearchRegex(req.query.search);
  if (search) {
    filter.$or = [{ firstName: search }, { lastName: search }, { email: search }, { username: search }, { regNumber: search }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('firstName lastName email username regNumber department yearOfStudy academicStatus role avatar isActive membershipPaid membershipExpiry lastLoginAt createdAt')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter)
  ]);

  res.json({ users, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), total });
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

// PUT /api/users/:id/role - change a member's role
// Restricted to the admin role. Previously the chairperson could reach this too,
// which meant any chairperson could promote themselves to full admin.
router.put('/:id/role', protect, adminRoleOnly, [
  body('role').isIn(ALL_ROLES).withMessage('Unknown role'),
  validate
], asyncHandler(async (req, res) => {
  const { role } = req.body;

  // Self-demotion is the most common way to lose access by accident.
  if (String(req.params.id) === String(req.user._id)) {
    throw new ApiError(400, 'You cannot change your own role. Ask another admin to do it.');
  }

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'Member not found.');

  if (target.role === ROLES.ADMIN && role !== ROLES.ADMIN) {
    await assertNotLastAdmin(target._id, 'demoted');
  }

  target.role = role;
  await target.save({ validateBeforeSave: false });

  res.json({ message: `${target.firstName} ${target.lastName} is now ${role.replace(/_/g, ' ')}.`, user: target.toJSON() });
}));

// PATCH /api/users/:id/status - deactivate or restore a member
// Replaces the previous DELETE-only route, which could suspend an account with
// no way to bring it back other than editing the database by hand.
router.patch('/:id/status', protect, adminOnly, [
  body('isActive').isBoolean().withMessage('isActive must be true or false').toBoolean(),
  validate
], asyncHandler(async (req, res) => {
  const { isActive } = req.body;

  if (String(req.params.id) === String(req.user._id)) {
    throw new ApiError(400, 'You cannot change your own account status.');
  }

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'Member not found.');

  // Only a full admin may suspend another admin.
  if (target.role === ROLES.ADMIN && req.user.role !== ROLES.ADMIN) {
    throw new ApiError(403, 'Only an admin can change another admin account.');
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

// DELETE /api/users/:id - retained for compatibility; deactivates rather than deletes
router.delete('/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
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

module.exports = router;
