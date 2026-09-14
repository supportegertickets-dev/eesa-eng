/**
 * Move existing library files onto units and private storage.
 *
 *   npm run migrate:library                           dry run: report only
 *   npm run migrate:library -- --apply                make the changes
 *   npm run migrate:library -- --apply --skip-storage database changes only
 *
 * For each file not yet linked to a unit, this finds or creates the unit named
 * by its stored unit code and copies that unit's year and semester onto the
 * file. A unit created here is confirmed if any of its files was already
 * approved. The retired `folder`, `unitName` and `department` fields are
 * removed. Unless storage is skipped, each public upload is also moved into
 * private storage.
 *
 * Unit names are not known to the old data. Fill them in afterwards from
 * Library › Manage units, where many can be pasted in at once.
 *
 * Safe to re-run: linked, private files are left alone.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Resource = require('../models/Resource');
const Unit = require('../models/Unit');
const { detectUnitCode, normalizeUnitCode } = require('../utils/library');
const { makeLibraryFilePrivate, storageOf } = require('../utils/libraryStorage');

const APPLY = process.argv.includes('--apply');
const SKIP_STORAGE = process.argv.includes('--skip-storage');
const RETIRED_FIELDS = ['folder', 'unitName', 'department'];

const describe = (resource) => `${resource._id} "${resource.title}"`;

const findOrCreateUnit = async (code, resource, cache, report) => {
  let unit = cache.get(code) || await Unit.findOne({ code });

  if (!unit) {
    const placed = resource.year != null && resource.semester != null;
    unit = new Unit({
      code,
      year: placed ? resource.year : null,
      semester: placed ? resource.semester : null,
      verified: resource.status === 'approved',
      createdBy: resource.uploadedBy
    });
    if (APPLY) await unit.save();
    report.unitsCreated.push(code);
  } else if (!unit.verified && resource.status === 'approved') {
    unit.verified = true;
    if (APPLY) await unit.save();
  }

  cache.set(code, unit);
  return unit;
};

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(uri);

  console.log(APPLY ? 'Migrating the library.' : 'Dry run: nothing will be written. Pass --apply to migrate.');
  if (SKIP_STORAGE) console.log('Storage changes skipped.');

  if (APPLY) await Promise.all([Unit.createIndexes(), Resource.createIndexes()]);

  const report = { linked: 0, unitsCreated: [], placementChanged: [], unplaced: [], madePrivate: 0, storageFailures: [] };
  const cache = new Map();

  // Lean, so the retired fields that are no longer in the schema are visible.
  const resources = await Resource.find({}).lean();

  for (const resource of resources) {
    const set = {};
    const unset = {};

    if (!resource.unit) {
      const code = normalizeUnitCode(resource.unitCode)
        || detectUnitCode(`${resource.title} ${resource.originalFileName || ''}`);

      if (!code) {
        report.unplaced.push(describe(resource));
      } else {
        const unit = await findOrCreateUnit(code, resource, cache, report);
        if ((resource.year ?? null) !== (unit.year ?? null) || (resource.semester ?? null) !== (unit.semester ?? null)) {
          report.placementChanged.push(
            `${describe(resource)}: was Year ${resource.year ?? '-'} Semester ${resource.semester ?? '-'}, ${code} is Year ${unit.year ?? '-'} Semester ${unit.semester ?? '-'}`
          );
        }
        Object.assign(set, { unit: unit._id, unitCode: unit.code, year: unit.year ?? null, semester: unit.semester ?? null });
        report.linked += 1;
      }
    }

    RETIRED_FIELDS.forEach((field) => {
      if (resource[field] !== undefined) unset[field] = '';
    });

    if (!SKIP_STORAGE && resource.filePublicId && storageOf(resource).deliveryType === 'upload') {
      if (APPLY) {
        try {
          Object.assign(set, await makeLibraryFilePrivate(resource));
          report.madePrivate += 1;
        } catch (error) {
          report.storageFailures.push(`${describe(resource)}: ${error.message || error.error?.message || error}`);
        }
      } else {
        report.madePrivate += 1;
      }
    }

    const update = {
      ...(Object.keys(set).length && { $set: set }),
      ...(Object.keys(unset).length && { $unset: unset })
    };
    // strict: false, or Mongoose would drop the $unset of fields it no longer knows.
    if (APPLY && Object.keys(update).length) await Resource.updateOne({ _id: resource._id }, update, { strict: false });
  }

  const verb = APPLY ? '' : ' (would be)';
  console.log(`\nFiles checked: ${resources.length}`);
  console.log(`Linked to a unit${verb}: ${report.linked}`);
  console.log(`Units created${verb}: ${report.unitsCreated.length}${report.unitsCreated.length ? ` (${report.unitsCreated.join(', ')})` : ''}`);
  console.log(`Moved to private storage${verb}: ${report.madePrivate}`);

  const list = (title, items) => {
    if (!items.length) return;
    console.log(`\n${title}:`);
    items.forEach((item) => console.log(`  - ${item}`));
  };
  list('Files refiled to match their unit\'s year and semester', report.placementChanged);
  list('Files with no recognisable unit code (edit them in the portal)', report.unplaced);
  list('Files that could not be made private (re-run to retry)', report.storageFailures);
};

run()
  .catch((error) => {
    console.error('Library migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
