const express = require('express');
const { body, validationResult } = require('express-validator');
const Notification = require('../models/Notification');
const { protect, adminOnly, leadershipOnly } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// GET /api/notifications - get notifications for current user
router.get('/', protect, async (req, res) => {
  try {
    const filter = {
      $or: [
        { target: 'all' },
        { target: 'members' },
        { target: 'leaders', },
        { target: 'specific', targetUsers: req.user._id }
      ]
    };

    // Filter by role
    if (req.user.role === 'member') {
      filter.$or = [
        { target: 'all' },
        { target: 'members' },
        { target: 'specific', targetUsers: req.user._id }
      ];
    }

    const notifications = await Notification.find(filter)
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = notifications.filter(
      n => !n.readBy.some(id => id.toString() === req.user._id.toString())
    ).length;

    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching notifications' });
  }
});

// POST /api/notifications - admin: create notification
router.post('/', protect, leadershipOnly, [
  body('title').trim().notEmpty().withMessage('Title is required').escape(),
  body('message').trim().notEmpty().withMessage('Message is required').escape(),
  body('type').optional().isIn(['general', 'event', 'payment', 'election', 'resource', 'announcement']),
  body('target').optional().isIn(['all', 'members', 'leaders', 'specific']),
  validate
], async (req, res) => {
  try {
    const { title, message, type, target, targetUsers } = req.body;

    const notification = await Notification.create({
      title,
      message,
      type: type || 'general',
      target: target || 'all',
      targetUsers: targetUsers || [],
      createdBy: req.user._id
    });

    const populated = await Notification.findById(notification._id)
      .populate('createdBy', 'firstName lastName');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating notification' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', protect, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, {
      $addToSet: { readBy: req.user._id }
    });
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', protect, async (req, res) => {
  try {
    const filter = {
      readBy: { $ne: req.user._id },
      $or: [
        { target: 'all' },
        { target: 'members' },
        { target: 'specific', targetUsers: req.user._id }
      ]
    };

    await Notification.updateMany(filter, {
      $addToSet: { readBy: req.user._id }
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/notifications/:id - admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting notification' });
  }
});

module.exports = router;
