/**
 * Move photos from the old single-stream gallery into albums.
 *
 *   npm run migrate:gallery                            dry run: report only
 *   npm run migrate:gallery -- --apply                 make the changes
 *   npm run migrate:gallery -- --apply --skip-dimensions
 *
 * Each category the old gallery used becomes one album ("Events", "Campus"),
 * dated by its newest photo. Every old image becomes a photo in that album,
 * oldest first, with its title and description as the caption. Files stay
 * where they are in Cloudinary; only database records are written.
 *
 * Photo dimensions are read from Cloudinary when it is configured, so the new
 * gallery can reserve each photo's space before it loads. Pass
 * --skip-dimensions to leave them blank.
 *
 * Safe to re-run: images already moved (matched by URL) are skipped. The old
 * `galleries` collection is left untouched; drop it once you are satisfied.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');
const Album = require('../models/Album');
const Photo = require('../models/Photo');
const User = require('../models/User');
const { POWER_ROLES } = require('../utils/roles');
const { refreshAlbumSummary } = require('../utils/gallery');

const APPLY = process.argv.includes('--apply');
const SKIP_DIMENSIONS = process.argv.includes('--skip-dimensions');

const ALBUM_TITLES = {
  events: 'Events',
  projects: 'Projects',
  campus: 'Campus',
  workshops: 'Workshops',
  competitions: 'Competitions',
  social: 'Social',
  other: 'More photos'
};

const readDimensions = async (publicId) => {
  if (SKIP_DIMENSIONS || !publicId || !cloudinary.config().api_secret) return {};
  try {
    const { width, height } = await cloudinary.api.resource(publicId);
    return { width, height };
  } catch (error) {
    console.warn(`  Could not read the size of ${publicId}: ${error.message || error.error?.message}`);
    return {};
  }
};

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(uri);

  console.log(APPLY ? 'Migrating the gallery.' : 'Dry run: nothing will be written. Pass --apply to migrate.');

  const legacy = await mongoose.connection.db.collection('galleries').find({}).sort({ createdAt: 1 }).toArray();
  if (!legacy.length) {
    console.log('The old gallery is empty. Nothing to do.');
    return;
  }

  const moved = new Set(await Photo.distinct('url', { url: { $in: legacy.map((image) => image.imageUrl) } }));
  const pending = legacy.filter((image) => image.imageUrl && !moved.has(image.imageUrl));
  console.log(`${legacy.length} old images, ${legacy.length - pending.length} already moved, ${pending.length} to move.`);
  if (!pending.length) return;

  // Albums need an owner; images uploaded before uploaders were recorded fall
  // back to an administrator.
  const fallbackOwner = await User.findOne({ role: { $in: POWER_ROLES } }).sort({ createdAt: 1 }).select('_id').lean();

  const byCategory = new Map();
  for (const image of pending) {
    const category = ALBUM_TITLES[image.category] ? image.category : 'other';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(image);
  }

  if (APPLY) await Promise.all([Album.createIndexes(), Photo.createIndexes()]);

  for (const [category, images] of byCategory) {
    const slug = `${category}-archive`;
    const owner = images.find((image) => image.uploadedBy)?.uploadedBy || fallbackOwner?._id;
    const newest = images[images.length - 1].createdAt || new Date();

    let album = await Album.findOne({ slug });
    console.log(`\n${album ? 'Adding to' : 'Creating'} album "${ALBUM_TITLES[category]}" (/gallery/${slug}): ${images.length} photos`);

    if (!owner) {
      console.warn('  Skipped: no uploader is recorded and there is no admin account to own the album.');
      continue;
    }
    if (!APPLY) continue;

    if (!album) {
      album = await Album.create({
        title: ALBUM_TITLES[category],
        slug,
        category,
        date: newest,
        description: 'Photos from the earlier EESA gallery.',
        createdBy: owner
      });
    } else if (newest > album.date) {
      album.date = newest;
      await album.save();
    }

    let position = album.nextPosition;
    for (const image of images) {
      await Photo.create({
        album: album._id,
        url: image.imageUrl,
        publicId: image.imagePublicId || '',
        ...(await readDimensions(image.imagePublicId)),
        caption: [image.title, image.description].filter(Boolean).join('\n').slice(0, 500),
        position,
        uploadedBy: image.uploadedBy || owner,
        createdAt: image.createdAt,
        updatedAt: image.updatedAt
      });
      position += 1;
    }

    await Album.updateOne({ _id: album._id }, { $set: { nextPosition: position } });
    await refreshAlbumSummary(album._id);
    console.log(`  Moved ${images.length} photos.`);
  }

  console.log(APPLY ? '\nDone. Rename or reorder the new albums from Portal › Gallery.' : '\nRe-run with --apply to migrate.');
};

run()
  .catch((error) => {
    console.error('Gallery migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
