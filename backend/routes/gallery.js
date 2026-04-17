const express = require('express');
const { body, validationResult } = require('express-validator');
const Gallery = require('../models/Gallery');
const { protect, adminOnly, leadershipOnly, POWER_ROLES } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const { sendEmailToMembers } = require('../utils/email');
const cloudinary = require('../config/cloudinary');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

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
  body('title').trim().notEmpty().withMessage('Title is required').escape(),
  body('category').optional().isIn(['events', 'projects', 'campus', 'workshops', 'competitions', 'social', 'other']),
  body('description').optional().trim().escape(),
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
      const htmlContent = `
        <h2>New gallery image uploaded by ${req.user.firstName} ${req.user.lastName}</h2>
        <p><strong>${image.title}</strong></p>
        <p>${image.description || ''}</p>
        <p>Visit the EESA portal gallery to view the new image.</p>
      `;
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
