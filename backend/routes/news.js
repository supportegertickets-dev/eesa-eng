const express = require('express');
const { body, validationResult } = require('express-validator');
const News = require('../models/News');
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

// GET /api/news - Public: published news
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const category = req.query.category;

    const filter = { isPublished: true };
    if (category) filter.category = category;

    const [news, total] = await Promise.all([
      News.find(filter)
        .populate('author', 'firstName lastName')
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit),
      News.countDocuments(filter)
    ]);

    res.json({
      news,
      page,
      totalPages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching news' });
  }
});

// GET /api/news/:id
router.get('/:id', async (req, res) => {
  try {
    const article = await News.findById(req.params.id)
      .populate('author', 'firstName lastName avatar');

    if (!article) return res.status(404).json({ message: 'Article not found' });
    res.json(article);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching article' });
  }
});

// POST /api/news - Leadership: create news
router.post('/', protect, leadershipOnly, [
  body('title').trim().notEmpty().withMessage('Title is required').escape(),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('excerpt').optional().trim().escape(),
  body('category').optional().isIn(['announcement', 'achievement', 'update', 'article', 'other']),
  body('isPublished').optional().isBoolean(),
  validate
], async (req, res) => {
  try {
    const newsData = {
      ...req.body,
      author: req.user._id
    };

    if (req.body.isPublished) {
      newsData.publishedAt = new Date();
    }

    const article = await News.create(newsData);
    await article.populate('author', 'firstName lastName');

    if (article.isPublished && POWER_ROLES.includes(req.user.role)) {
      const subject = `New EESA news: ${article.title}`;
      const htmlContent = `
        <h2>New news article added by ${req.user.firstName} ${req.user.lastName}</h2>
        <p><strong>${article.title}</strong></p>
        <p>${article.excerpt || article.content.slice(0, 250) || ''}</p>
        <p>Visit the EESA portal to read the full article.</p>
      `;
      sendEmailToMembers(subject, htmlContent).catch(err => console.error('Notification email failed:', err));
    }

    res.status(201).json(article);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating article' });
  }
});

// PUT /api/news/:id
router.put('/:id', protect, leadershipOnly, async (req, res) => {
  try {
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article not found' });

    const allowedFields = ['title', 'content', 'excerpt', 'image', 'category', 'tags', 'isPublished'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (req.body.isPublished && !article.publishedAt) {
      updates.publishedAt = new Date();
    }

    const updated = await News.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true
    }).populate('author', 'firstName lastName');

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating article' });
  }
});

// DELETE /api/news/:id
router.delete('/:id', protect, leadershipOnly, async (req, res) => {
  try {
    const article = await News.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article not found' });
    res.json({ message: 'Article deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting article' });
  }
});

module.exports = router;
