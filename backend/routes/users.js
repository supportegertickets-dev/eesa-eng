const express = require('express');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - Get all members (public, limited fields)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;
    const department = req.query.department;

    const filter = { isActive: true };
    if (department) filter.department = department;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('firstName lastName department yearOfStudy role avatar bio')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter)
    ]);

    res.json({
      users,
      page,
      totalPages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching users' });
  }
});

// GET /api/users/leaders - Get leadership team
router.get('/leaders', async (req, res) => {
  try {
    const leaders = await User.find({ role: { $in: ['admin', 'leader'] }, isActive: true })
      .select('firstName lastName department role avatar bio');
    res.json(leaders);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching leaders' });
  }
});

// GET /api/users/stats - Member statistics
router.get('/stats', async (req, res) => {
  try {
    const [total, byDepartment, byYear] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      User.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$yearOfStudy', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);
    res.json({ total, byDepartment, byYear });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching stats' });
  }
});

// PUT /api/users/:id/role - Admin: update user role
router.put('/:id/role', protect, adminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['member', 'leader', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    );

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating role' });
  }
});

// DELETE /api/users/:id - Admin: deactivate user
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deactivating user' });
  }
});

module.exports = router;
