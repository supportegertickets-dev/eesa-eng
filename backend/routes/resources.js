const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const Resource = require('../models/Resource');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadFile } = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// POST /api/resources - upload resource (members)
router.post('/', protect, uploadFile.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'eesa/resources', resource_type: 'auto', access_mode: 'public' },
        (error, result) => { if (error) reject(error); else resolve(result); }
      );
      stream.end(req.file.buffer);
    });

    const resource = await Resource.create({
      title: req.body.title || req.file.originalname,
      description: req.body.description || '',
      category: req.body.category || 'other',
      department: req.body.department || 'General',
      fileUrl: result.secure_url,
      filePublicId: result.public_id,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.user._id
    });

    res.status(201).json(resource);
  } catch (error) {
    console.error('Resource upload error:', error);
    res.status(500).json({ message: error.message || 'Server error uploading resource' });
  }
});

// GET /api/resources - list approved resources (members)
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const filter = { status: 'approved' };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.department) filter.department = req.query.department;
    if (req.query.search) {
      filter.title = { $regex: req.query.search, $options: 'i' };
    }

    const [resources, total] = await Promise.all([
      Resource.find(filter)
        .populate('uploadedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Resource.countDocuments(filter)
    ]);

    res.json({ resources, page, totalPages: Math.ceil(total / limit), total });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching resources' });
  }
});

// GET /api/resources/my - user's uploaded resources
router.get('/my', protect, async (req, res) => {
  try {
    const resources = await Resource.find({ uploadedBy: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ resources });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/resources/pending - admin: pending resources
router.get('/pending', protect, adminOnly, async (req, res) => {
  try {
    const resources = await Resource.find({ status: 'pending' })
      .populate('uploadedBy', 'firstName lastName email department')
      .sort({ createdAt: -1 });
    res.json({ resources });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/resources/:id/review - admin: approve/reject
router.put('/:id/review', protect, adminOnly, [
  body('status').isIn(['approved', 'rejected']).withMessage('Invalid status'),
  body('rejectionReason').optional().trim().escape(),
  validate
], async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });

    resource.status = req.body.status;
    resource.reviewedBy = req.user._id;
    resource.reviewedAt = new Date();
    if (req.body.status === 'rejected' && req.body.rejectionReason) {
      resource.rejectionReason = req.body.rejectionReason;
    }

    await resource.save();

    const populated = await Resource.findById(resource._id)
      .populate('uploadedBy', 'firstName lastName email department');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error reviewing resource' });
  }
});

// GET /api/resources/:id/file - proxy file content (auth via query token)
router.get('/:id/file', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(401).json({ message: 'Not authorized' });

    try {
      jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });

    if (!resource.fileUrl) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Build list of URLs to try (in order)
    const urlsToTry = [];

    // 1) Try the original stored URL first (works for public resources)
    urlsToTry.push({ label: 'stored URL', url: resource.fileUrl });

    // 2) Generate signed URLs with different resource_types
    if (resource.filePublicId) {
      // Detect resource_type from URL path
      const urlPath = resource.fileUrl;
      let detectedType = 'raw';
      if (urlPath.includes('/image/upload/')) detectedType = 'image';
      else if (urlPath.includes('/video/upload/')) detectedType = 'video';

      // Extract version from URL
      const vMatch = urlPath.match(/\/v(\d+)\//);
      const version = vMatch ? vMatch[1] : undefined;

      // Try detected type first, then others
      const types = [detectedType, ...['image', 'raw', 'video'].filter(t => t !== detectedType)];
      for (const resType of types) {
        try {
          const opts = { resource_type: resType, type: 'upload', sign_url: true, secure: true };
          if (version) opts.version = version;
          const signedUrl = cloudinary.url(resource.filePublicId, opts);
          if (signedUrl !== resource.fileUrl) {
            urlsToTry.push({ label: `signed ${resType}`, url: signedUrl });
          }
        } catch {}
      }
    }

    // Try each URL until one works
    for (const { label, url } of urlsToTry) {
      try {
        const upstream = await fetch(url, { redirect: 'follow' });
        if (upstream.ok) {
          const buffer = Buffer.from(await upstream.arrayBuffer());
          res.set('Content-Type', resource.fileType || upstream.headers.get('content-type') || 'application/octet-stream');
          const safeName = (resource.title || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
          res.set('Content-Disposition', `inline; filename="${safeName}"`);
          res.set('Content-Length', buffer.length);
          return res.send(buffer);
        }
        console.log(`File proxy: ${label} returned ${upstream.status} for resource ${req.params.id}`);
      } catch (err) {
        console.log(`File proxy: ${label} error for resource ${req.params.id}:`, err.message);
      }
    }

    // All attempts failed - try making the resource public on Cloudinary
    if (resource.filePublicId) {
      try {
        const urlPath = resource.fileUrl;
        let resType = 'raw';
        if (urlPath.includes('/image/upload/')) resType = 'image';
        else if (urlPath.includes('/video/upload/')) resType = 'video';

        await cloudinary.api.update(resource.filePublicId, {
          resource_type: resType,
          access_mode: 'public',
        });
        console.log(`Made resource ${req.params.id} public on Cloudinary (${resType})`);

        // Retry with original URL after making public
        const upstream = await fetch(resource.fileUrl, { redirect: 'follow' });
        if (upstream.ok) {
          const buffer = Buffer.from(await upstream.arrayBuffer());
          res.set('Content-Type', resource.fileType || upstream.headers.get('content-type') || 'application/octet-stream');
          const safeName = (resource.title || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
          res.set('Content-Disposition', `inline; filename="${safeName}"`);
          res.set('Content-Length', buffer.length);
          return res.send(buffer);
        }
      } catch (e) {
        console.error('Cloudinary make-public failed:', e.message);
      }
    }

    console.error(`File proxy: ALL attempts failed for resource ${req.params.id}, fileUrl: ${resource.fileUrl}, publicId: ${resource.filePublicId}`);
    return res.status(502).json({ message: 'Failed to fetch file from storage' });
  } catch (error) {
    console.error('File proxy error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/resources/:id/download - increment download count
router.put('/:id/download', protect, async (req, res) => {
  try {
    await Resource.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } });
    res.json({ message: 'Download tracked' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/resources/:id
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });

    if (resource.filePublicId) {
      await cloudinary.uploader.destroy(resource.filePublicId, { resource_type: 'raw' }).catch(() => {});
    }

    await Resource.findByIdAndDelete(req.params.id);
    res.json({ message: 'Resource deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting resource' });
  }
});

module.exports = router;
