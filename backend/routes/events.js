const express = require('express');
const { body } = require('express-validator');
const Event = require('../models/Event');
const { protect, adminOnly, POWER_ROLES } = require('../middleware/auth');
const { sendEmailToMembers, renderLayout, html } = require('../utils/email');

const { validate } = require('../middleware/validate');

const router = express.Router();

/** First configured frontend origin, used to build links in outgoing email. */
const portalUrl = () => (process.env.FRONTEND_URL || '').split(',')[0].trim() || 'http://localhost:3000';

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

// POST /api/events - Admin/Chairperson only: create event
router.post('/', protect, adminOnly, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('location').trim().notEmpty().withMessage('Location is required'),
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
      const htmlContent = renderLayout({
        heading: event.title,
        bodyHtml: html`
          <p style="color:#555;">Organised by ${req.user.firstName} ${req.user.lastName}</p>
          <p style="color:#333;">${event.description || ''}</p>
          <p style="color:#333;"><strong>When:</strong> ${new Date(event.date).toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short' })}</p>
          <p style="color:#333;"><strong>Where:</strong> ${event.location}</p>`,
        ctaLabel: 'View event details',
        ctaUrl: `${portalUrl()}/events/${event._id}`
      });
      sendEmailToMembers(subject, htmlContent).catch(err => console.error('Notification email failed:', err));
    }

    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating event' });
  }
});

// PUT /api/events/:id - Admin/Chairperson only: update event
router.put('/:id', protect, adminOnly, async (req, res) => {
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

// DELETE /api/events/:id - Admin/Chairperson only: delete event
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting event' });
  }
});

module.exports = router;
