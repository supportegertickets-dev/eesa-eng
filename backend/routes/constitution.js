const crypto = require('crypto');
const path = require('path');
const { pipeline, Readable } = require('stream');
const express = require('express');
const { body, param } = require('express-validator');
const Constitution = require('../models/Constitution');
const { protect, optionalAuth, adminOnly } = require('../middleware/auth');
const { uploadDocument } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { isPower } = require('../utils/roles');
const cloudinary = require('../config/cloudinary');

const router = express.Router();

const FILE_FOLDER = 'eesa/constitution';
const { MAX_SECTIONS } = Constitution;

const idParam = param('id').isMongoId().withMessage('That version could not be found.');

// Listings leave out the article text, which can run to tens of kilobytes.
const SUMMARY_FIELDS = '-sections.body';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * The constitution is a public document, so the original is stored publicly.
 * It is stored as `raw`, which avoids Cloudinary's account-level block on
 * delivering PDFs uploaded as images.
 */
const storeFile = (file) => new Promise((resolve, reject) => {
  const extension = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  const stream = cloudinary.uploader.upload_stream({
    folder: FILE_FOLDER,
    public_id: `${crypto.randomBytes(8).toString('hex')}${extension}`,
    resource_type: 'raw',
    overwrite: false
  }, (error, result) => {
    if (error) return reject(error);
    return resolve({
      url: result.secure_url,
      publicId: result.public_id,
      name: (file.originalname || `constitution${extension}`).slice(0, 200),
      size: file.size,
      mimeType: file.mimetype
    });
  });
  stream.end(file.buffer);
});

const destroyFile = async (file) => {
  if (!file?.publicId) return;
  try {
    await cloudinary.uploader.destroy(file.publicId, { resource_type: 'raw', invalidate: true });
  } catch (error) {
    console.warn(`Could not delete constitution file ${file.publicId}:`, error.message);
  }
};

/**
 * Articles arrive as JSON: a string inside a multipart upload, or an array in
 * a JSON body. Returns undefined when absent so an update can leave them alone.
 */
const parseSections = (value) => {
  if (value === undefined) return undefined;
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      throw new ApiError(400, 'The articles could not be read. Refresh the page and try again.');
    }
  }
  if (!Array.isArray(list)) throw new ApiError(400, 'The articles could not be read. Refresh the page and try again.');
  if (list.length > MAX_SECTIONS) throw new ApiError(400, `The constitution can have at most ${MAX_SECTIONS} articles.`);

  return list.map((section, index) => {
    const title = String(section?.title || '').trim();
    if (!title) throw new ApiError(400, `Article ${index + 1} needs a title.`);
    return {
      number: String(section.number || '').trim().slice(0, 20),
      title: title.slice(0, 200),
      body: String(section.body || '').replace(/\r\n?/g, '\n').trim()
    };
  });
};

const metadataRules = (optional) => [
  (optional ? body('version').optional() : body('version'))
    .trim().notEmpty().withMessage('Give this version a number, such as 2.0.')
    .isLength({ max: 30 }).withMessage('Keep the version under 30 characters.'),
  body('title').optional().trim().isLength({ max: 200 }).withMessage('Keep the title under 200 characters.'),
  body('summary').optional().trim().isLength({ max: 1000 }).withMessage('Keep the summary under 1000 characters.'),
  body('adoptedOn').optional({ values: 'falsy' }).isISO8601().withMessage('Enter the date it was adopted.').toDate()
];

const makeCurrent = async (doc) => {
  await Constitution.updateMany({ _id: { $ne: doc._id }, isCurrent: true }, { isCurrent: false });
  doc.status = 'published';
  doc.isCurrent = true;
  doc.publishedAt = doc.publishedAt || new Date();
};

const contentDisposition = (type, fileName) => {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

/* ------------------------------------------------------------------ *
 * Public
 * ------------------------------------------------------------------ */

// GET /api/constitution - the current constitution and the other published versions
router.get('/', asyncHandler(async (req, res) => {
  const [constitution, versions] = await Promise.all([
    Constitution.findOne({ isCurrent: true, status: 'published' }).lean(),
    Constitution.find({ status: 'published' }).select('version title adoptedOn publishedAt isCurrent').sort({ publishedAt: -1 }).lean()
  ]);
  res.json({ constitution, versions });
}));

// GET /api/constitution/versions/:id - one version; drafts only for administrators
router.get('/versions/:id', optionalAuth, [idParam, validate], asyncHandler(async (req, res) => {
  const constitution = await Constitution.findById(req.params.id).lean();
  if (!constitution || (constitution.status !== 'published' && !isPower(req.user?.role))) {
    throw new ApiError(404, 'That version could not be found.');
  }
  res.json({ constitution });
}));

// GET /api/constitution/versions/:id/file - the original document, for download or printing
router.get('/versions/:id/file', [idParam, validate], asyncHandler(async (req, res) => {
  const constitution = await Constitution.findById(req.params.id).select('status version file').lean();
  if (!constitution || constitution.status !== 'published' || !constitution.file?.url) {
    throw new ApiError(404, 'That document could not be found.');
  }

  let upstream;
  try {
    upstream = await fetch(constitution.file.url, { redirect: 'follow' });
  } catch {
    upstream = null;
  }
  if (!upstream?.ok || !upstream.body) throw new ApiError(502, 'The document could not be fetched from storage. Please try again shortly.');

  const extension = path.extname(constitution.file.name || '') || '.pdf';
  const fileName = `EESA-Constitution-v${constitution.version}${extension}`.replace(/\s+/g, '-');
  res.set('Content-Type', constitution.file.mimeType || upstream.headers.get('content-type') || 'application/octet-stream');
  if (!upstream.headers.get('content-encoding') && upstream.headers.get('content-length')) {
    res.set('Content-Length', upstream.headers.get('content-length'));
  }
  res.set('Cache-Control', 'public, max-age=3600');
  res.set('Content-Disposition', contentDisposition(req.query.download === '1' ? 'attachment' : 'inline', fileName));

  pipeline(Readable.fromWeb(upstream.body), res, (error) => {
    if (error && !res.writableEnded) console.warn(`Streaming constitution ${constitution._id} failed:`, error.message);
  });
}));

/* ------------------------------------------------------------------ *
 * Administration
 * ------------------------------------------------------------------ */

// GET /api/constitution/admin - every version, drafts included
router.get('/admin', protect, adminOnly, asyncHandler(async (req, res) => {
  const versions = await Constitution.find()
    .select(SUMMARY_FIELDS)
    .populate('updatedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ versions });
}));

// POST /api/constitution - upload a new version with the articles read from it
router.post('/', protect, adminOnly, uploadDocument.single('file'), [...metadataRules(false), validate], asyncHandler(async (req, res) => {
  const sections = parseSections(req.body.sections) || [];
  if (!sections.length) throw new ApiError(400, 'Add at least one article before saving.');

  const file = req.file ? await storeFile(req.file) : undefined;

  try {
    const doc = new Constitution({
      version: req.body.version,
      ...(req.body.title && { title: req.body.title }),
      adoptedOn: req.body.adoptedOn || undefined,
      summary: req.body.summary || '',
      sections,
      ...(file && { file }),
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    if (req.body.publish === 'true' || req.body.publish === true) await makeCurrent(doc);
    await doc.save();
    res.status(201).json({ constitution: doc });
  } catch (error) {
    await destroyFile(file);
    throw error;
  }
}));

// PUT /api/constitution/:id - edit a version's details and articles, or replace its file
router.put('/:id', protect, adminOnly, uploadDocument.single('file'), [idParam, ...metadataRules(true), validate], asyncHandler(async (req, res) => {
  const doc = await Constitution.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'That version could not be found.');

  const sections = parseSections(req.body.sections);
  if (sections && !sections.length) throw new ApiError(400, 'Keep at least one article.');

  if (req.body.version !== undefined) doc.version = req.body.version;
  if (req.body.title !== undefined) doc.title = req.body.title || doc.title;
  if (req.body.summary !== undefined) doc.summary = req.body.summary;
  if (req.body.adoptedOn !== undefined) doc.adoptedOn = req.body.adoptedOn || undefined;
  if (sections) doc.sections = sections;
  doc.updatedBy = req.user._id;

  const previousPublicId = doc.file?.publicId;
  const file = req.file ? await storeFile(req.file) : null;
  if (file) doc.file = file;

  try {
    await doc.save();
  } catch (error) {
    await destroyFile(file);
    throw error;
  }
  if (file && previousPublicId) await destroyFile({ publicId: previousPublicId });

  res.json({ constitution: doc });
}));

// POST /api/constitution/:id/publish - make this version the one the site shows
router.post('/:id/publish', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const doc = await Constitution.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'That version could not be found.');
  if (!doc.sections.length) throw new ApiError(400, 'Add at least one article before publishing.');

  await makeCurrent(doc);
  doc.updatedBy = req.user._id;
  await doc.save();
  res.json({ constitution: doc });
}));

// DELETE /api/constitution/:id - remove a version that is not the current one
router.delete('/:id', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const doc = await Constitution.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'That version could not be found.');
  if (doc.isCurrent) throw new ApiError(409, 'This is the version the site shows. Publish another version before deleting it.');

  await doc.deleteOne();
  await destroyFile(doc.file);
  res.json({ message: 'Version deleted' });
}));

module.exports = router;
