const express = require('express');
const { body, validationResult } = require('express-validator');
const Sponsor = require('../models/Sponsor');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// GET /api/sponsors - public
router.get('/', async (req, res) => {
  try {
    const sponsors = await Sponsor.find({ isActive: true }).sort({ tier: 1, createdAt: -1 });
    res.json({ sponsors });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching sponsors' });
  }
});

// POST /api/sponsors - admin
router.post('/', protect, adminOnly, uploadImage.single('logo'), [
  body('name').trim().notEmpty().withMessage('Name is required').escape(),
  body('tier').optional().isIn(['platinum', 'gold', 'silver', 'bronze', 'partner']),
  body('website').optional().trim(),
  body('description').optional().trim().escape(),
  validate
], async (req, res) => {
  try {
    let logo = '';
    let logoPublicId = '';
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'eesa/sponsors', transformation: [{ width: 300, height: 300, crop: 'fit' }] },
          (error, result) => { if (error) reject(error); else resolve(result); }
        );
        stream.end(req.file.buffer);
      });
      logo = result.secure_url;
      logoPublicId = result.public_id;
    }

    const sponsor = await Sponsor.create({
      name: req.body.name,
      description: req.body.description || '',
      website: req.body.website || '',
      tier: req.body.tier || 'partner',
      logo,
      logoPublicId,
      createdBy: req.user._id
    });

    res.status(201).json(sponsor);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating sponsor' });
  }
});

// PUT /api/sponsors/:id - admin
router.put('/:id', protect, adminOnly, uploadImage.single('logo'), async (req, res) => {
  try {
    const sponsor = await Sponsor.findById(req.params.id);
    if (!sponsor) return res.status(404).json({ message: 'Sponsor not found' });

    if (req.file) {
      if (sponsor.logoPublicId) {
        await cloudinary.uploader.destroy(sponsor.logoPublicId).catch(() => {});
      }
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'eesa/sponsors', transformation: [{ width: 300, height: 300, crop: 'fit' }] },
          (error, result) => { if (error) reject(error); else resolve(result); }
        );
        stream.end(req.file.buffer);
      });
      sponsor.logo = result.secure_url;
      sponsor.logoPublicId = result.public_id;
    }

    const fields = ['name', 'description', 'website', 'tier', 'isActive'];
    fields.forEach(f => { if (req.body[f] !== undefined) sponsor[f] = req.body[f]; });

    await sponsor.save();
    res.json(sponsor);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating sponsor' });
  }
});

// DELETE /api/sponsors/:id - admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const sponsor = await Sponsor.findById(req.params.id);
    if (!sponsor) return res.status(404).json({ message: 'Sponsor not found' });

    if (sponsor.logoPublicId) {
      await cloudinary.uploader.destroy(sponsor.logoPublicId).catch(() => {});
    }

    await Sponsor.findByIdAndDelete(req.params.id);
    res.json({ message: 'Sponsor deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting sponsor' });
  }
});

module.exports = router;
