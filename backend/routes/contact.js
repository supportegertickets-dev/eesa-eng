const express = require('express');
const { body, validationResult } = require('express-validator');
const Contact = require('../models/Contact');
const { protect, adminOnly } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many submissions. Please try again later.' }
});

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// POST /api/contact - Public: submit contact form
router.post('/', contactLimiter, [
  body('name').trim().notEmpty().withMessage('Name is required').escape(),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('subject').trim().notEmpty().withMessage('Subject is required').escape(),
  body('message').trim().notEmpty().withMessage('Message is required')
    .isLength({ max: 3000 }).withMessage('Message too long').escape(),
  validate
], async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    await Contact.create({ name, email, subject, message });
    res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error sending message' });
  }
});

// GET /api/contact - Admin: view messages
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      Contact.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Contact.countDocuments()
    ]);

    res.json({ messages, page, totalPages: Math.ceil(total / limit), total });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching messages' });
  }
});

// PUT /api/contact/:id/read - Admin: mark as read
router.put('/:id/read', protect, adminOnly, async (req, res) => {
  try {
    const message = await Contact.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json(message);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating message' });
  }
});

// DELETE /api/contact/:id - Admin: delete message
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const message = await Contact.findByIdAndDelete(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json({ message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting message' });
  }
});

module.exports = router;
