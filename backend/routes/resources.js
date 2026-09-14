const crypto = require('crypto');
const express = require('express');
const { pipeline, Readable } = require('stream');
const { body, param, query } = require('express-validator');
const jwt = require('jsonwebtoken');
const Resource = require('../models/Resource');
const Unit = require('../models/Unit');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadFile } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { buildSearchRegex } = require('../utils/sanitize');
const { isPower } = require('../utils/roles');
const {
  RESOURCE_TYPES, TYPE_LABELS, detectUnitCode, folderPath, normalizeUnitCode, titleFromFileName
} = require('../utils/library');
const { placementRule, resolveUnit, saveUnit, removeIfUnused } = require('../utils/libraryUnits');
const { uploadLibraryFile, fetchLibraryFile, destroyLibraryFile } = require('../utils/libraryStorage');

const router = express.Router();

const UNIT_FIELDS = 'code name year semester verified';
const TICKET_SCOPE = 'resource-file';
const TICKET_TTL_SECONDS = 300;
const SORTS = {
  newest: { createdAt: -1 },
  popular: { downloads: -1, createdAt: -1 },
  title: { title: 1 },
  oldest: { createdAt: 1 }
};

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const idParam = param('id').isMongoId().withMessage('That file could not be found.');
const idOf = (value) => String(value?._id || value || '');
const isOwner = (resource, user) => idOf(resource.uploadedBy) === idOf(user);
const canSee = (resource, user) => resource.status === 'approved' || isOwner(resource, user) || isPower(user.role);
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const withDetails = (findQuery, uploaderFields = 'firstName lastName') =>
  findQuery.populate('unit', UNIT_FIELDS).populate('uploadedBy', uploaderFields);

const loadResource = async (id) => {
  const resource = await Resource.findById(id);
  if (!resource) throw new ApiError(404, 'That file could not be found.');
  return resource;
};

/** Multer reads multipart file names as Latin-1; browsers send UTF-8. */
const decodeFileName = (name = '') => {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
};

/** RFC 6266 header with an ASCII fallback, so non-English names survive. */
const contentDisposition = (type, fileName) => {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

const paginate = async (filter, { page = 1, limit = 20, sort = SORTS.newest, uploaderFields } = {}) => {
  const [resources, total] = await Promise.all([
    withDetails(Resource.find(filter), uploaderFields).sort(sort).skip((page - 1) * limit).limit(limit),
    Resource.countDocuments(filter)
  ]);
  return { resources, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
};

const notifyUploader = async (resource, reviewer, { title, message }) => {
  if (isOwner(resource, reviewer)) return;
  await Notification.create({
    type: 'resource',
    target: 'specific',
    targetUsers: [idOf(resource.uploadedBy)],
    title: clip(title, 200),
    message: clip(message, 2000),
    createdBy: reviewer._id
  }).catch((error) => console.warn('Could not create library notification:', error.message));
};

const pageRules = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt()
];

const detailRules = [
  body('title').optional().isString().trim().isLength({ max: 200 }).withMessage('Titles can be at most 200 characters.'),
  body('description').optional().isString().trim().isLength({ max: 1000 }).withMessage('Descriptions can be at most 1000 characters.'),
  body('category').optional().isIn(RESOURCE_TYPES).withMessage('Choose a valid document type.'),
  body('unit').optional({ values: 'falsy' }).isMongoId().withMessage('That unit could not be found.'),
  body('unitCode').optional().isString().trim(),
  body('unitName').optional().isString().trim().isLength({ max: 150 }).withMessage('Unit names can be at most 150 characters.'),
  placementRule('year'),
  placementRule('semester')
];

/* ------------------------------------------------------------------ *
 * Upload
 * ------------------------------------------------------------------ */

/**
 * POST /api/resources - upload one file.
 *
 * The file is filed under a unit chosen by id, by code, or detected from the
 * file name. Everything is validated before the file is stored, and the stored
 * file is deleted again if saving the record fails, so a rejected upload never
 * leaves an orphan in storage. Reviewers' own uploads are published at once.
 */
router.post('/', protect, uploadFile.single('file'), [...detailRules, validate], asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Choose a file to upload.');

  const originalFileName = decodeFileName(req.file.originalname);
  const trusted = isPower(req.user.role);
  const title = req.body.title || titleFromFileName(originalFileName).slice(0, 200) || 'Untitled document';

  const unit = await resolveUnit({
    unitId: req.body.unit,
    code: req.body.unitCode || detectUnitCode(`${originalFileName} ${title}`),
    name: req.body.unitName,
    year: req.body.year,
    semester: req.body.semester,
    user: req.user,
    trusted
  });

  const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const duplicate = await Resource.findOne({ fileHash, status: { $ne: 'rejected' } }).select('title unitCode').lean();
  if (duplicate) {
    const error = new ApiError(409, `This file is already in the library as "${duplicate.title}"${duplicate.unitCode ? ` (${duplicate.unitCode})` : ''}.`);
    error.code = 'duplicate_file';
    throw error;
  }

  const stored = await uploadLibraryFile({ ...req.file, originalname: originalFileName });

  let resource;
  try {
    const savedUnit = await saveUnit(unit);
    resource = await Resource.create({
      title,
      description: req.body.description || '',
      category: req.body.category || 'other',
      unit: savedUnit._id,
      unitCode: savedUnit.code,
      year: savedUnit.year,
      semester: savedUnit.semester,
      originalFileName,
      ...stored,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      fileHash,
      uploadedBy: req.user._id,
      status: trusted ? 'approved' : 'pending',
      ...(trusted && { reviewedBy: req.user._id, reviewedAt: new Date() })
    });
  } catch (error) {
    await destroyLibraryFile(stored);
    throw error;
  }

  res.status(201).json(await withDetails(Resource.findById(resource._id)));
}));

/* ------------------------------------------------------------------ *
 * Listing
 * ------------------------------------------------------------------ */

// GET /api/resources - approved files, filtered by folder and search
router.get('/', protect, [
  query('unit').optional().isMongoId().withMessage('That unit could not be found.'),
  query('type').optional().isIn(RESOURCE_TYPES),
  query('year').optional().isInt({ min: 1, max: 5 }).toInt(),
  query('semester').optional().isInt({ min: 1, max: 2 }).toInt(),
  query('sort').optional().isIn(Object.keys(SORTS)),
  ...pageRules,
  validate
], asyncHandler(async (req, res) => {
  const filter = { status: 'approved' };
  if (req.query.unit) filter.unit = req.query.unit;
  if (req.query.type) filter.category = req.query.type;
  if (req.query.year) filter.year = req.query.year;
  if (req.query.semester) filter.semester = req.query.semester;

  const search = buildSearchRegex(req.query.search);
  if (search) {
    // Match unit names too, so "power electronics" finds everything in EEEN 436.
    const unitIds = await Unit.find({ $or: [{ name: search }, { code: search }] }).distinct('_id');
    filter.$or = [
      { title: search },
      { description: search },
      { originalFileName: search },
      { unitCode: search },
      { unit: { $in: unitIds } }
    ];
    // "eeen481" should find EEEN 481.
    const code = normalizeUnitCode(req.query.search);
    if (code) filter.$or.push({ unitCode: code });
  }

  res.json(await paginate(filter, {
    page: req.query.page,
    limit: req.query.limit,
    sort: SORTS[req.query.sort] || SORTS.newest
  }));
}));

// GET /api/resources/my - the member's own uploads, in every status
router.get('/my', protect, [
  query('status').optional().isIn(['pending', 'approved', 'rejected']),
  ...pageRules,
  validate
], asyncHandler(async (req, res) => {
  const filter = { uploadedBy: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  res.json(await paginate(filter, { page: req.query.page, limit: req.query.limit }));
}));

// GET /api/resources/pending - review queue, oldest first
router.get('/pending', protect, adminOnly, pageRules, validate, asyncHandler(async (req, res) => {
  res.json(await paginate({ status: 'pending' }, {
    page: req.query.page,
    limit: req.query.limit,
    sort: SORTS.oldest,
    uploaderFields: 'firstName lastName email yearOfStudy'
  }));
}));

// GET /api/resources/:id - one file, for deep links from notifications
router.get('/:id', protect, [idParam, validate], asyncHandler(async (req, res) => {
  const resource = await withDetails(Resource.findById(req.params.id));
  // Hidden files answer 404, not 403, so their existence is not revealed.
  if (!resource || !canSee(resource, req.user)) throw new ApiError(404, 'That file could not be found.');
  res.json(resource);
}));

/* ------------------------------------------------------------------ *
 * Editing and review
 * ------------------------------------------------------------------ */

/**
 * PATCH /api/resources/:id - edit details or move to another unit.
 *
 * Uploaders may edit their own files; reviewers may edit any. An uploader's
 * change sends the file back for review when it was rejected, or when it now
 * sits in a unit no reviewer has confirmed.
 */
router.patch('/:id', protect, [idParam, ...detailRules, validate], asyncHandler(async (req, res) => {
  const resource = await loadResource(req.params.id);
  const trusted = isPower(req.user.role);
  if (!trusted && !isOwner(resource, req.user)) throw new ApiError(403, 'You can only edit files you uploaded.');

  if (req.body.title !== undefined) {
    if (!req.body.title) throw new ApiError(400, 'A title is required.', { title: 'A title is required.' });
    resource.title = req.body.title;
  }
  if (req.body.description !== undefined) resource.description = req.body.description;
  if (req.body.category !== undefined) resource.category = req.body.category;

  const previousUnit = resource.unit;
  let unit = null;
  if (req.body.unit || req.body.unitCode) {
    unit = await saveUnit(await resolveUnit({
      unitId: req.body.unit,
      code: req.body.unitCode,
      name: req.body.unitName,
      year: req.body.year,
      semester: req.body.semester,
      user: req.user,
      trusted
    }));
    resource.unit = unit._id;
    resource.unitCode = unit.code;
    resource.year = unit.year;
    resource.semester = unit.semester;
  }

  if (!trusted && (resource.status === 'rejected' || (unit && !unit.verified))) {
    resource.status = 'pending';
    resource.rejectionReason = undefined;
    resource.reviewedBy = undefined;
    resource.reviewedAt = undefined;
  }

  await resource.save();
  if (unit && idOf(previousUnit) !== idOf(unit)) await removeIfUnused(previousUnit);

  res.json(await withDetails(Resource.findById(resource._id)));
}));

// PUT /api/resources/:id/review - approve or reject, and tell the uploader
router.put('/:id/review', protect, adminOnly, [
  idParam,
  body('status').isIn(['approved', 'rejected']).withMessage('Choose approve or reject.'),
  body('rejectionReason')
    .if(body('status').equals('rejected'))
    .isString().trim().isLength({ min: 3, max: 500 })
    .withMessage('Tell the uploader why (3–500 characters).'),
  validate
], asyncHandler(async (req, res) => {
  const resource = await withDetails(Resource.findById(req.params.id));
  if (!resource) throw new ApiError(404, 'That file could not be found.');
  if (resource.status === req.body.status) throw new ApiError(409, `This file is already ${resource.status}.`);

  resource.status = req.body.status;
  resource.reviewedBy = req.user._id;
  resource.reviewedAt = new Date();

  const location = resource.unit
    ? `${folderPath(resource.unit)} › ${TYPE_LABELS[resource.category]}`
    : TYPE_LABELS[resource.category];

  const approved = req.body.status === 'approved';
  resource.rejectionReason = approved ? undefined : req.body.rejectionReason;
  await resource.save();

  // Approving a file confirms the unit it was filed under.
  if (approved && resource.unit && !resource.unit.verified) {
    await Unit.updateOne({ _id: resource.unit._id }, { $set: { verified: true } });
  }

  await notifyUploader(resource, req.user, approved ? {
    title: 'Your upload is in the library',
    message: `"${resource.title}" was approved and is now available under ${location}.`
  } : {
    title: 'Your upload was not approved',
    message: `"${resource.title}" was not added to the library. Reason: ${req.body.rejectionReason}. You can fix it from My uploads and it will be reviewed again.`
  });
  res.json(await withDetails(Resource.findById(resource._id)));
}));

/* ------------------------------------------------------------------ *
 * File access
 * ------------------------------------------------------------------ */

/**
 * GET /api/resources/:id/ticket
 *
 * Mint a short-lived token that authorises exactly one file. The file endpoint
 * is opened directly by the browser and by document viewers, where an
 * Authorization header cannot be attached, so the credential travels in the
 * URL. A five-minute, single-file ticket makes a leaked URL near-worthless.
 */
router.get('/:id/ticket', protect, [idParam, validate], asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id).select('status uploadedBy originalFileName title').lean();
  if (!resource || !canSee(resource, req.user)) throw new ApiError(404, 'That file could not be found.');

  const token = jwt.sign(
    { id: req.user._id, rid: String(resource._id), scope: TICKET_SCOPE },
    process.env.JWT_SECRET,
    { expiresIn: TICKET_TTL_SECONDS }
  );

  res.json({ token, expiresIn: TICKET_TTL_SECONDS, fileName: resource.originalFileName || resource.title });
}));

/**
 * GET /api/resources/:id/file[/:name]?token=…[&download=1]
 *
 * Stream a file from private storage. The optional trailing name exists for
 * document viewers that infer the format from the URL.
 */
const serveFile = asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) throw new ApiError(401, 'Not authorized');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'This link has expired. Open the file from the library again.');
  }

  // Only a ticket for this very file is accepted, never a session token.
  if (decoded.scope !== TICKET_SCOPE || decoded.rid !== req.params.id) {
    throw new ApiError(403, 'This link is not valid for that file.');
  }

  // The account must still be active, or a deactivated member keeps access
  // for the life of the ticket.
  const requester = await User.findById(decoded.id).select('role isActive').lean();
  if (!requester?.isActive) throw new ApiError(403, 'Not authorized');

  const resource = await loadResource(req.params.id);
  if (!canSee(resource, requester)) throw new ApiError(404, 'That file could not be found.');

  const upstream = await fetchLibraryFile(resource);
  if (!upstream) throw new ApiError(502, 'The file could not be fetched from storage. Please try again shortly.');

  const fileName = resource.originalFileName || resource.title || 'file';
  res.set('Content-Type', resource.fileType || upstream.headers.get('content-type') || 'application/octet-stream');
  if (!upstream.headers.get('content-encoding') && upstream.headers.get('content-length')) {
    res.set('Content-Length', upstream.headers.get('content-length'));
  }
  res.set('Cache-Control', 'private, max-age=300');
  res.set('Content-Disposition', contentDisposition(req.query.download === '1' ? 'attachment' : 'inline', fileName));

  pipeline(Readable.fromWeb(upstream.body), res, (error) => {
    if (error && !res.writableEnded) console.warn(`Streaming resource ${resource._id} failed:`, error.message);
  });
});

router.get('/:id/file', [idParam, validate], serveFile);
router.get('/:id/file/:name', [idParam, validate], serveFile);

// PUT /api/resources/:id/download - count each member once per file
router.put('/:id/download', protect, [idParam, validate], asyncHandler(async (req, res) => {
  const result = await Resource.updateOne(
    { _id: req.params.id, status: 'approved', downloadedBy: { $ne: req.user._id } },
    { $addToSet: { downloadedBy: req.user._id }, $inc: { downloads: 1 } }
  );
  res.json({ counted: result.modifiedCount === 1 });
}));

// DELETE /api/resources/:id - reviewers delete anything; uploaders their own
router.delete('/:id', protect, [idParam, validate], asyncHandler(async (req, res) => {
  const resource = await loadResource(req.params.id);
  if (!isOwner(resource, req.user) && !isPower(req.user.role)) {
    throw new ApiError(403, 'You can only delete files you uploaded.');
  }

  await destroyLibraryFile(resource);
  await Resource.deleteOne({ _id: resource._id });
  await removeIfUnused(resource.unit);

  res.json({ message: 'File deleted.' });
}));

module.exports = router;
