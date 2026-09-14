const express = require('express');
const { body, param } = require('express-validator');
const Unit = require('../models/Unit');
const Resource = require('../models/Resource');
const { protect, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { isPower } = require('../utils/roles');
const { normalizeUnitCode } = require('../utils/library');
const { placementRule, syncUnitResources } = require('../utils/libraryUnits');

const router = express.Router();

const MAX_IMPORT_ROWS = 500;

const idParam = param('id').isMongoId().withMessage('That unit could not be found.');

const unitFields = [
  body('code').optional().isString().trim(),
  body('name').optional().isString().trim().isLength({ max: 150 }).withMessage('Unit names can be at most 150 characters.'),
  placementRule('year'),
  placementRule('semester'),
  body('verified').optional().isBoolean().toBoolean()
];

const loadUnit = async (id) => {
  const unit = await Unit.findById(id);
  if (!unit) throw new ApiError(404, 'That unit could not be found.');
  return unit;
};

const requireCode = (value) => {
  const code = normalizeUnitCode(value);
  if (!code) throw new ApiError(400, 'Unit codes look like EEEN 481.', { code: 'Enter a unit code such as EEEN 481.' });
  return code;
};

/**
 * File counts per unit: { total, byType: { notes: 3, ... }, pending }.
 * Pending counts are included only for reviewers.
 */
const countFiles = async ({ includePending }) => {
  const rows = await Resource.aggregate([
    { $match: { unit: { $ne: null }, status: { $in: includePending ? ['approved', 'pending'] : ['approved'] } } },
    { $group: { _id: { unit: '$unit', status: '$status', category: '$category' }, count: { $sum: 1 } } }
  ]);

  const counts = new Map();
  for (const { _id, count } of rows) {
    const key = String(_id.unit);
    if (!counts.has(key)) counts.set(key, { total: 0, byType: {}, ...(includePending && { pending: 0 }) });
    const entry = counts.get(key);
    if (_id.status === 'pending') {
      entry.pending += count;
    } else {
      entry.total += count;
      entry.byType[_id.category] = (entry.byType[_id.category] || 0) + count;
    }
  }
  return counts;
};

const emptyCounts = (includePending) => ({ total: 0, byType: {}, ...(includePending && { pending: 0 }) });

// GET /api/units - the folder tree. `?scope=all` adds unverified units for reviewers.
router.get('/', protect, asyncHandler(async (req, res) => {
  const manage = req.query.scope === 'all' && isPower(req.user.role);
  const [units, counts] = await Promise.all([
    Unit.find(manage ? {} : { verified: true }).sort({ year: 1, semester: 1, code: 1 }).lean(),
    countFiles({ includePending: manage })
  ]);

  res.json({
    units: units.map((unit) => ({ ...unit, files: counts.get(String(unit._id)) || emptyCounts(manage) }))
  });
}));

// POST /api/units - create a unit
router.post('/', protect, adminOnly, [...unitFields, validate], asyncHandler(async (req, res) => {
  const code = requireCode(req.body.code);
  if (await Unit.exists({ code })) throw new ApiError(409, `${code} already exists.`, { code: 'This unit already exists.' });

  const unit = await Unit.create({
    code,
    name: req.body.name || '',
    year: req.body.year ?? null,
    semester: req.body.semester ?? null,
    verified: true,
    createdBy: req.user._id
  });
  res.status(201).json(unit);
}));

/**
 * POST /api/units/import - add or update many units at once.
 * Body: { units: [{ code, name, year, semester }] }. Existing codes are updated
 * and confirmed; rows that cannot be read are reported, not fatal.
 */
router.post('/import', protect, adminOnly, [
  body('units').isArray({ min: 1, max: MAX_IMPORT_ROWS }).withMessage(`Import between 1 and ${MAX_IMPORT_ROWS} units at a time.`),
  validate
], asyncHandler(async (req, res) => {
  const summary = { created: 0, updated: 0, skipped: [] };

  for (const [index, row] of req.body.units.entries()) {
    const code = normalizeUnitCode(row?.code);
    const year = row?.year === '' || row?.year == null ? null : Number(row.year);
    const semester = row?.semester === '' || row?.semester == null ? null : Number(row.semester);
    const name = typeof row?.name === 'string' ? row.name.trim().slice(0, 150) : '';

    if (!code) {
      summary.skipped.push({ row: index + 1, reason: `"${row?.code ?? ''}" is not a unit code.` });
      continue;
    }

    try {
      const unit = (await Unit.findOne({ code })) || new Unit({ code, createdBy: req.user._id });
      const isNew = unit.isNew;
      if (name) unit.name = name;
      if (isNew || year != null || semester != null) {
        unit.year = year;
        unit.semester = semester;
      }
      unit.verified = true;

      const moved = !isNew && (unit.isModified('year') || unit.isModified('semester'));
      await unit.save();
      if (moved) await syncUnitResources(unit);
      summary[isNew ? 'created' : 'updated'] += 1;
    } catch (error) {
      const reason = error.name === 'ValidationError'
        ? Object.values(error.errors)[0]?.message
        : 'Could not be saved.';
      summary.skipped.push({ row: index + 1, code, reason });
    }
  }

  res.json(summary);
}));

// PUT /api/units/:id - rename, re-place or confirm a unit
router.put('/:id', protect, adminOnly, [idParam, ...unitFields, validate], asyncHandler(async (req, res) => {
  const unit = await loadUnit(req.params.id);

  if (req.body.code !== undefined) {
    const code = requireCode(req.body.code);
    if (code !== unit.code && await Unit.exists({ code })) {
      throw new ApiError(409, `${code} already exists. Merge the two units instead.`, { code: 'This unit already exists.' });
    }
    unit.code = code;
  }
  if (req.body.name !== undefined) unit.name = req.body.name;
  if (req.body.year !== undefined) unit.year = req.body.year;
  if (req.body.semester !== undefined) unit.semester = req.body.semester;
  if (req.body.verified !== undefined) unit.verified = req.body.verified;

  const refile = unit.isModified('code') || unit.isModified('year') || unit.isModified('semester');
  await unit.save();
  if (refile) await syncUnitResources(unit);

  res.json(unit);
}));

// POST /api/units/:id/merge - move every file into another unit, then delete this one
router.post('/:id/merge', protect, adminOnly, [
  idParam,
  body('into').isMongoId().withMessage('Choose the unit to merge into.'),
  validate
], asyncHandler(async (req, res) => {
  if (req.params.id === req.body.into) throw new ApiError(400, 'A unit cannot be merged into itself.');
  const [source, target] = await Promise.all([loadUnit(req.params.id), loadUnit(req.body.into)]);

  const { modifiedCount } = await Resource.updateMany(
    { unit: source._id },
    { $set: { unit: target._id, unitCode: target.code, year: target.year ?? null, semester: target.semester ?? null } }
  );
  await Unit.deleteOne({ _id: source._id });

  res.json({ message: `Moved ${modifiedCount} file${modifiedCount === 1 ? '' : 's'} from ${source.code} into ${target.code}.`, unit: target });
}));

// DELETE /api/units/:id - only an empty unit
router.delete('/:id', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const unit = await loadUnit(req.params.id);
  const files = await Resource.countDocuments({ unit: unit._id });
  if (files) {
    throw new ApiError(409, `${unit.code} still has ${files} file${files === 1 ? '' : 's'}. Move or delete them, or merge the unit into another one.`);
  }
  await Unit.deleteOne({ _id: unit._id });
  res.json({ message: `${unit.code} deleted.` });
}));

module.exports = router;
