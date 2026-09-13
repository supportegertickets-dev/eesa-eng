const express = require('express');
const { body } = require('express-validator');
const Notification = require('../models/Notification');
const { protect, adminOnly, leadershipOnly, LEADERSHIP_ROLES } = require('../middleware/auth');

const { validate } = require('../middleware/validate');

const router = express.Router();

/**
 * Notifications a given user is entitled to see. Shared by the list and the
 * bulk mark-as-read so the two can never disagree about the audience.
 */
const audienceFilter = (user) => {
  const clauses = [
    { target: 'all' },
    { target: 'members' },
    { target: 'specific', targetUsers: user._id }
  ];
  if (LEADERSHIP_ROLES.includes(user.role)) clauses.push({ target: 'leaders' });
  return { $or: clauses };
};


// GET /api/notifications - get notifications for current user
router.get('/', protect, async (req, res) => {
  try {
    const filter = audienceFilter(req.user);

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
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
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
    // Must match the audience used for listing. It previously omitted the
    // 'leaders' target, so "mark all as read" never cleared leadership
    // notifications and the unread badge stayed lit for office holders.
    const filter = { ...audienceFilter(req.user), readBy: { $ne: req.user._id } };

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
