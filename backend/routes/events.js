const express = require('express');
const { body, validationResult } = require('express-validator');
const Event = require('../models/Event');
const { protect, leadershipOnly, POWER_ROLES } = require('../middleware/auth');
const { sendEmailToMembers } = require('../utils/email');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/events - Public: list events
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const category = req.query.category;

    const filter = { isPublic: true };
    if (status) filter.status = status;
    if (category) filter.category = category;

    const [events, total] = await Promise.all([
      Event.find(filter)
        .populate('organizer', 'firstName lastName')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Event.countDocuments(filter)
    ]);

    res.json({
      events,
      page,
      totalPages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching events' });
  }
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('organizer', 'firstName lastName avatar')
      .populate('attendees', 'firstName lastName avatar');

    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching event' });
  }
});

// POST /api/events - Leadership: create event
router.post('/', protect, leadershipOnly, [
  body('title').trim().notEmpty().withMessage('Title is required').escape(),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('location').trim().notEmpty().withMessage('Location is required').escape(),
  body('category').optional().isIn(['workshop', 'seminar', 'competition', 'social', 'trip', 'meeting', 'other']),
  body('maxAttendees').optional().isInt({ min: 0 }),
  validate
], async (req, res) => {
  try {
    const event = await Event.create({
      ...req.body,
      organizer: req.user._id
    });

    await event.populate('organizer', 'firstName lastName');

    if (POWER_ROLES.includes(req.user.role)) {
      const subject = `New EESA event: ${event.title}`;
      const htmlContent = `
        <h2>New event added by ${req.user.firstName} ${req.user.lastName}</h2>
        <p><strong>${event.title}</strong></p>
        <p>${event.description || ''}</p>
        <p><strong>Date:</strong> ${new Date(event.date).toLocaleString()}</p>
        <p><strong>Location:</strong> ${event.location}</p>
        <p>Visit the EESA portal to learn more.</p>
      `;
      sendEmailToMembers(subject, htmlContent).catch(err => console.error('Notification email failed:', err));
    }

    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating event' });
  }
});

// PUT /api/events/:id - Leadership: update event
router.put('/:id', protect, leadershipOnly, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const allowedFields = ['title', 'description', 'date', 'endDate', 'location', 'category', 'image', 'maxAttendees', 'isPublic', 'status'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const updated = await Event.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true
    }).populate('organizer', 'firstName lastName');

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating event' });
  }
});

// POST /api/events/:id/rsvp - Member: RSVP to event
router.post('/:id/rsvp', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const alreadyRSVP = event.attendees.includes(req.user._id);
    if (alreadyRSVP) {
      event.attendees = event.attendees.filter(id => id.toString() !== req.user._id.toString());
      await event.save();
      return res.json({ message: 'RSVP cancelled', attending: false });
    }

    if (event.maxAttendees > 0 && event.attendees.length >= event.maxAttendees) {
      return res.status(400).json({ message: 'Event is full' });
    }

    event.attendees.push(req.user._id);
    await event.save();
    res.json({ message: 'RSVP confirmed', attending: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error processing RSVP' });
  }
});

// DELETE /api/events/:id - Leadership: delete event
router.delete('/:id', protect, leadershipOnly, async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting event' });
  }
});

module.exports = router;
