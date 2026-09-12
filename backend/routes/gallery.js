const express = require('express');
const { body } = require('express-validator');
const Gallery = require('../models/Gallery');
const { protect, adminOnly, leadershipOnly, POWER_ROLES } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const { sendEmailToMembers, renderLayout, html } = require('../utils/email');
const cloudinary = require('../config/cloudinary');

const { validate } = require('../middleware/validate');

const router = express.Router();

/** First configured frontend origin, used to build links in outgoing email. */
const portalUrl = () => (process.env.FRONTEND_URL || '').split(',')[0].trim() || 'http://localhost:3000';

// GET /api/gallery - public
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.category) filter.category = req.query.category;

    const [images, total] = await Promise.all([
      Gallery.find(filter)
        .populate('uploadedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Gallery.countDocuments(filter)
    ]);

    res.json({ images, page, totalPages: Math.ceil(total / limit), total });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching gallery' });
  }
});

// POST /api/gallery - admin/leader: upload image
router.post('/', protect, leadershipOnly, uploadImage.single('image'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('category').optional().isIn(['events', 'projects', 'campus', 'workshops', 'competitions', 'social', 'other']),
  body('description').optional().trim(),
  validate
], async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Image is required' });

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'eesa/gallery', transformation: [{ width: 1200, quality: 'auto' }] },
        (error, result) => { if (error) reject(error); else resolve(result); }
      );
      stream.end(req.file.buffer);
    });

    const image = await Gallery.create({
      title: req.body.title,
      description: req.body.description || '',
      category: req.body.category || 'other',
      imageUrl: result.secure_url,
      imagePublicId: result.public_id,
      uploadedBy: req.user._id
    });

    if (POWER_ROLES.includes(req.user.role)) {
      const subject = `New EESA gallery upload: ${image.title}`;
      const htmlContent = renderLayout({
        heading: image.title,
        bodyHtml: html`
          <p style="color:#555;">Uploaded by ${req.user.firstName} ${req.user.lastName}</p>
          <p style="color:#333;">${image.description || ''}</p>`,
        ctaLabel: 'Open the gallery',
        ctaUrl: `${portalUrl()}/gallery`
      });
      sendEmailToMembers(subject, htmlContent).catch(err => console.error('Notification email failed:', err));
    }

    res.status(201).json(image);
  } catch (error) {
    res.status(500).json({ message: 'Server error uploading image' });
  }
});

// DELETE /api/gallery/:id - admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const image = await Gallery.findById(req.params.id);
    if (!image) return res.status(404).json({ message: 'Image not found' });

    if (image.imagePublicId) {
      await cloudinary.uploader.destroy(image.imagePublicId).catch(() => {});
    }

    await Gallery.findByIdAndDelete(req.params.id);
    res.json({ message: 'Image deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting image' });
  }
});

module.exports = router;
