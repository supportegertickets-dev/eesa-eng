const express = require('express');
const { body, param, query } = require('express-validator');
const Contact = require('../models/Contact');
const { protect, adminOnly } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');

const { validate } = require('../middleware/validate');

const router = express.Router();

const contactLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many submissions. Please try again in a few minutes.'
});

const READ_FILTERS = { unread: { isRead: false }, read: { isRead: true } };
const CATEGORIES = ['general', 'partnership'];

const idParam = param('id').isMongoId().withMessage('That message could not be found.');

// POST /api/contact - Public: submit contact form
router.post('/', contactLimiter, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('message').trim().notEmpty().withMessage('Message is required')
    .isLength({ max: 3000 }).withMessage('Message too long'),
  body('category').optional({ values: 'falsy' }).isIn(CATEGORIES).withMessage('Unknown message type'),
  body('organization').if(body('category').equals('partnership'))
    .trim().notEmpty().withMessage('Organisation name is required')
    .isLength({ max: 150 }).withMessage('Organisation name is too long'),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 30 }).withMessage('Phone number is too long'),
  body('interest').optional({ values: 'falsy' }).trim().isLength({ max: 60 }).withMessage('Partnership type is too long'),
  validate
], async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    const partnership = req.body.category === 'partnership';
    await Contact.create({
      name,
      email,
      subject,
      message,
      category: partnership ? 'partnership' : 'general',
      ...(partnership && {
        organization: req.body.organization,
        phone: req.body.phone || undefined,
        interest: req.body.interest || undefined
      })
    });
    res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error sending message' });
  }
});

// GET /api/contact - Admin: view messages, optionally only unread or read ones
router.get('/', protect, adminOnly, [
  query('status').optional({ values: 'falsy' }).isIn(Object.keys(READ_FILTERS)).withMessage('Choose unread or read messages.'),
  query('category').optional({ values: 'falsy' }).isIn(CATEGORIES).withMessage('Choose general or partnership messages.'),
  validate
], async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;
    const filter = { ...(READ_FILTERS[req.query.status] || {}) };
    // Messages sent before categories existed have none and are general.
    if (req.query.category === 'partnership') filter.category = 'partnership';
    else if (req.query.category === 'general') filter.category = { $ne: 'partnership' };

    // The unread counts ignore the filter, so the inbox badge stays right
    // whichever view is open.
    const [messages, total, unread, unreadPartnerships] = await Promise.all([
      Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Contact.countDocuments(filter),
      Contact.countDocuments({ isRead: false }),
      Contact.countDocuments({ isRead: false, category: 'partnership' })
    ]);

    res.json({ messages, page, totalPages: Math.ceil(total / limit), total, unread, unreadPartnerships });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching messages' });
  }
});

// PUT /api/contact/:id/read - Admin: mark as read, or as unread again with { isRead: false }
router.put('/:id/read', protect, adminOnly, [
  idParam,
  body('isRead').optional().isBoolean().withMessage('isRead must be true or false.').toBoolean(),
  validate
], async (req, res) => {
  try {
    const message = await Contact.findByIdAndUpdate(
      req.params.id,
      { isRead: req.body.isRead !== false },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json(message);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating message' });
  }
});

// DELETE /api/contact/:id - Admin: delete message
router.delete('/:id', protect, adminOnly, [idParam, validate], async (req, res) => {
  try {
    const message = await Contact.findByIdAndDelete(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json({ message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting message' });
  }
});

module.exports = router;
