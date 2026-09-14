const { body } = require('express-validator');
const Unit = require('../models/Unit');
const Resource = require('../models/Resource');
const { ApiError } = require('./asyncHandler');
const { normalizeUnitCode, YEARS, SEMESTERS } = require('./library');

/**
 * Validator for an optional year or semester. An empty string or null means
 * "not set", which is how "Other units" are expressed.
 */
const placementRule = (field) => body(field)
  .optional()
  .customSanitizer((value) => (value === '' || value === null || value === 'null' ? null : Number(value)))
  .custom((value) => value === null || (field === 'year' ? YEARS : SEMESTERS).includes(value))
  .withMessage(field === 'year' ? 'Choose a year between 1 and 5.' : 'Choose semester 1 or 2.');

/** Copy a unit's code and placement onto its files, which store them for filtering. */
const syncUnitResources = (unit) => Resource.updateMany(
  { unit: unit._id },
  { $set: { unitCode: unit.code, year: unit.year ?? null, semester: unit.semester ?? null } }
);

/**
 * Find the unit an upload or move refers to, or prepare a new one.
 *
 * A new unit is returned unsaved, so nothing is written if the upload that
 * named it then fails. Call saveUnit once the file is safely stored.
 *
 * @param {object} options
 * @param {string} [options.unitId] an existing unit, chosen from a list
 * @param {string} [options.code] a unit code, typed or detected from the file
 * @param {boolean} options.trusted whether the actor is a reviewer, whose new units are verified at once
 */
const resolveUnit = async ({ unitId, code, name, year, semester, user, trusted }) => {
  if (unitId) {
    const unit = await Unit.findById(unitId);
    if (!unit) throw new ApiError(400, 'That unit no longer exists. Choose another one.');
    return unit;
  }

  const normalized = normalizeUnitCode(code);
  if (!normalized) {
    throw new ApiError(400,
      'We could not tell which unit this file belongs to. Choose the unit, or include its code (for example EEEN 481) in the file name.',
      { unitCode: 'Enter a unit code such as EEEN 481.' });
  }

  const existing = await Unit.findOne({ code: normalized });
  if (existing) {
    // An unconfirmed unit may still be missing details this uploader knows.
    if (!existing.verified) {
      if (!existing.name && name) existing.name = name;
      if (existing.year == null && year != null && semester != null) {
        existing.year = year;
        existing.semester = semester;
      }
    }
    return existing;
  }

  const unit = new Unit({
    code: normalized,
    name: name || '',
    year: year ?? null,
    semester: semester ?? null,
    verified: Boolean(trusted),
    createdBy: user._id
  });
  await unit.validate();
  return unit;
};

/**
 * Save a unit prepared by resolveUnit, keeping its files in step if it moved.
 * A concurrent upload may have created the same unit first; that one is used.
 */
const saveUnit = async (unit) => {
  if (!unit.isNew && !unit.isModified()) return unit;

  const moved = !unit.isNew && (unit.isModified('year') || unit.isModified('semester'));
  try {
    await unit.save();
  } catch (error) {
    if (error.code === 11000 && unit.isNew) return Unit.findOne({ code: unit.code });
    throw error;
  }
  if (moved) await syncUnitResources(unit);
  return unit;
};

/**
 * Delete a unit that an upload created if its last file has gone, so a typo in
 * a file name does not leave an empty folder behind. Reviewer-confirmed units
 * are kept even when empty.
 */
const removeIfUnused = async (unitId) => {
  if (!unitId) return;
  const unit = await Unit.findById(unitId).select('verified').lean();
  if (!unit || unit.verified) return;
  if (!(await Resource.exists({ unit: unitId }))) await Unit.deleteOne({ _id: unitId });
};

module.exports = { placementRule, syncUnitResources, resolveUnit, saveUnit, removeIfUnused };
