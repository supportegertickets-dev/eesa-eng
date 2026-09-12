const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

/**
 * One-off cleanup for text mangled by the old input sanitiser.
 *
 * Routes previously ran express-validator's `.escape()` on free-text fields,
 * which HTML-encodes on the way *in*. That corrupted stored data: a member
 * called O'Brien was saved as "O&#x27;Brien", and it rendered that way
 * everywhere, because React escapes again at render time.
 *
 * The escaping has been removed. This script repairs rows written while it was
 * in force. It is idempotent: decoding text that contains no entities is a
 * no-op, so running it twice is safe.
 *
 * Usage:
 *   node scripts/unescape-stored-text.js --dry-run   # report only
 *   node scripts/unescape-stored-text.js             # apply
 */

const { decodeEntities } = require('../utils/htmlEntities');

// Collections and the free-text fields that were escaped on write.
const TARGETS = [
  { model: 'User', collection: 'users', fields: ['firstName', 'lastName', 'bio'] },
  { model: 'Event', collection: 'events', fields: ['title', 'location', 'description'] },
  { model: 'News', collection: 'news', fields: ['title', 'excerpt', 'content'] },
  { model: 'Project', collection: 'projects', fields: ['title', 'description'] },
  { model: 'Election', collection: 'elections', fields: ['title', 'description'] },
  { model: 'Sponsor', collection: 'sponsors', fields: ['name', 'description'] },
  { model: 'Gallery', collection: 'galleries', fields: ['title', 'description'] },
  { model: 'Notification', collection: 'notifications', fields: ['title', 'message'] },
  { model: 'Contact', collection: 'contacts', fields: ['name', 'subject', 'message'] },
  { model: 'Payment', collection: 'payments', fields: ['reference', 'semester', 'academicYear', 'notes', 'rejectionReason'] },
  { model: 'Resource', collection: 'resources', fields: ['title', 'description', 'rejectionReason'] }
];

const run = async () => {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(`Connected. Mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

  let totalDocs = 0;
  let totalFields = 0;

  for (const { collection, fields } of TARGETS) {
    const coll = mongoose.connection.db.collection(collection);

    // Only look at documents where at least one target field contains an
    // ampersand, which is a prerequisite for any HTML entity.
    const query = { $or: fields.map((f) => ({ [f]: { $regex: '&' } })) };
    const docs = await coll.find(query).toArray();

    let changedDocs = 0;

    for (const doc of docs) {
      const updates = {};
      for (const field of fields) {
        const before = doc[field];
        const after = decodeEntities(before);
        if (typeof before === 'string' && after !== before) {
          updates[field] = after;
        }
      }

      if (!Object.keys(updates).length) continue;

      changedDocs += 1;
      totalFields += Object.keys(updates).length;

      const preview = Object.entries(updates)
        .map(([k, v]) => `${k}: ${JSON.stringify(String(doc[k]).slice(0, 50))} -> ${JSON.stringify(v.slice(0, 50))}`)
        .join('; ');
      console.log(`  ${collection}/${doc._id}  ${preview}`);

      if (!dryRun) {
        await coll.updateOne({ _id: doc._id }, { $set: updates });
      }
    }

    if (changedDocs) {
      console.log(`${collection}: ${changedDocs} document(s)${dryRun ? ' would be' : ''} updated\n`);
      totalDocs += changedDocs;
    }
  }

  console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${totalFields} field(s) across ${totalDocs} document(s).`);
  if (dryRun && totalDocs > 0) console.log('Re-run without --dry-run to apply.');

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
