const express = require('express');
const { body, param, query } = require('express-validator');
const Album = require('../models/Album');
const { GALLERY_CATEGORIES, MAX_ALBUM_PHOTOS } = require('../models/Album');
const Photo = require('../models/Photo');
const Event = require('../models/Event');
const { protect, optionalAuth, leadershipOnly, LEADERSHIP_ROLES, POWER_ROLES } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { uploadImageBuffer, destroyImage, destroyImages } = require('../utils/cloudinaryUpload');
const { buildSearchRegex } = require('../utils/sanitize');
const { uniqueSlug, refreshAlbumSummary } = require('../utils/gallery');
const { sendEmailToMembers, renderLayout, html } = require('../utils/email');

const router = express.Router();

/** First configured frontend origin, used to build links in outgoing email. */
const portalUrl = () => (process.env.FRONTEND_URL || '').split(',')[0].trim() || 'http://localhost:3000';

// Members hear about an album at most once in this window, however many
// batches of photos are added to it.
const ANNOUNCE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const SORTS = {
  newest: { date: -1, _id: -1 },
  oldest: { date: 1, _id: 1 },
  title: { title: 1, _id: 1 },
  updated: { updatedAt: -1, _id: -1 }
};

const isPower = (user) => POWER_ROLES.includes(user?.role);
const sameId = (a, b) => Boolean(a && b) && String(a._id || a) === String(b._id || b);

const withRelations = (albumQuery) => albumQuery
  .populate('createdBy', 'firstName lastName')
  .populate('event', 'title date');

const idParam = param('id').isMongoId().withMessage('That album could not be found.');
const photoIdParam = param('id').isMongoId().withMessage('That photo could not be found.');
const captionField = (chain) => chain.isString().trim().isLength({ max: 500 }).withMessage('Captions can be up to 500 characters.');

const albumFields = (isUpdate) => {
  const maybe = (chain) => (isUpdate ? chain.optional() : chain);
  return [
    maybe(body('title')).isString().trim().isLength({ min: 2, max: 120 }).withMessage('Album title must be 2 to 120 characters.'),
    body('description').optional({ values: 'null' }).isString().trim().isLength({ max: 2000 }).withMessage('The description can be up to 2000 characters.'),
    body('category').optional({ values: 'falsy' }).isIn(GALLERY_CATEGORIES).withMessage('Choose a valid category.'),
    body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid date.').toDate(),
    body('event').optional({ values: 'falsy' }).isMongoId().withMessage('Choose a valid event.')
  ];
};

const loadAlbum = async (id) => {
  const album = await Album.findById(id);
  if (!album) throw new ApiError(404, 'Album not found.');
  return album;
};

const assertEventExists = async (eventId) => {
  if (eventId && !(await Event.exists({ _id: eventId }))) throw new ApiError(400, 'That event could not be found.');
};

/**
 * Delete photos from one album. Admins, the chairperson and the album's
 * creator may delete any of its photos; other leaders only their own uploads.
 */
const deletePhotos = async (user, album, photoIds) => {
  const wanted = new Set(photoIds.map(String));
  const photos = await Photo.find({ _id: { $in: [...wanted] }, album: album._id }).select('publicId uploadedBy').lean();
  if (photos.length !== wanted.size) {
    throw new ApiError(404, 'Some of those photos are no longer in this album. Reload and try again.');
  }

  if (!isPower(user) && !sameId(album.createdBy, user._id)) {
    const blocked = photos.filter((photo) => !sameId(photo.uploadedBy, user._id)).length;
    if (blocked) {
      throw new ApiError(403, blocked === photos.length
        ? 'You can only delete photos you uploaded.'
        : `${blocked} of those photos were uploaded by someone else. You can only delete your own.`);
    }
  }

  await Photo.deleteMany({ _id: { $in: photos.map((photo) => photo._id) } });
  await refreshAlbumSummary(album._id);
  await destroyImages(photos.map((photo) => photo.publicId));
  return photos.length;
};

/* ------------------------------------------------------------------ *
 * Browsing (public)
 * ------------------------------------------------------------------ */

// GET /api/gallery/albums - search, filter and sort albums
router.get('/albums', optionalAuth, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 48 }).toInt(),
  query('category').optional({ values: 'falsy' }).isIn(GALLERY_CATEGORIES).withMessage('Choose a valid category.'),
  query('sort').optional({ values: 'falsy' }).isIn(Object.keys(SORTS)).withMessage('Choose a valid sort order.'),
  query('event').optional({ values: 'falsy' }).isMongoId().withMessage('Choose a valid event.'),
  query('search').optional().isString(),
  validate
], asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 24;
  const sort = req.query.sort || 'newest';

  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.event) filter.event = req.query.event;

  const search = buildSearchRegex(req.query.search);
  if (search) filter.$or = [{ title: search }, { description: search }];

  // An album with no photos yet is only useful to the leaders filling it.
  const isLeader = LEADERSHIP_ROLES.includes(req.user?.role);
  if (!(isLeader && req.query.includeEmpty === 'true')) filter.photoCount = { $gt: 0 };

  let albumsQuery = withRelations(Album.find(filter)).sort(SORTS[sort]).skip((page - 1) * limit).limit(limit);
  if (sort === 'title') albumsQuery = albumsQuery.collation({ locale: 'en', strength: 2 });

  const [albums, total] = await Promise.all([albumsQuery, Album.countDocuments(filter)]);
  res.json({ albums, page, totalPages: Math.max(1, Math.ceil(total / limit)), total });
}));

// GET /api/gallery/albums/:key - one album, by id or slug, with its photos in order
router.get('/albums/:key', [
  param('key').isString().isLength({ min: 1, max: 100 }).withMessage('Album not found.'),
  validate
], asyncHandler(async (req, res) => {
  const key = req.params.key.toLowerCase();
  const filter = /^[a-f0-9]{24}$/.test(key) ? { $or: [{ _id: key }, { slug: key }] } : { slug: key };

  const album = await withRelations(Album.findOne(filter));
  if (!album) throw new ApiError(404, 'Album not found.');

  const photos = await Photo.find({ album: album._id })
    .sort({ position: 1, createdAt: 1 })
    .select('url width height caption position uploadedBy createdAt')
    .lean();

  res.json({ album, photos });
}));

/* ------------------------------------------------------------------ *
 * Albums (leadership)
 * ------------------------------------------------------------------ */

// POST /api/gallery/albums
router.post('/albums', protect, leadershipOnly, [...albumFields(false), validate], asyncHandler(async (req, res) => {
  const { title, description, category, date, event } = req.body;
  await assertEventExists(event);

  const fields = {
    title,
    description: description || '',
    category: category || undefined,
    date: date || undefined,
    event: event || null,
    createdBy: req.user._id
  };

  let album;
  for (let attempt = 1; !album; attempt += 1) {
    try {
      album = await Album.create({ ...fields, slug: await uniqueSlug(title) });
    } catch (error) {
      // Another album with the same title was created at the same moment; the
      // next attempt picks the following free slug.
      if (error.code !== 11000 || attempt >= 3) throw error;
    }
  }

  res.status(201).json(await withRelations(Album.findById(album._id)));
}));

// PUT /api/gallery/albums/:id - edit details or choose the cover
router.put('/albums/:id', protect, leadershipOnly, [
  idParam,
  ...albumFields(true),
  body('coverPhoto').optional({ values: 'falsy' }).isMongoId().withMessage('Choose a photo from this album as the cover.'),
  validate
], asyncHandler(async (req, res) => {
  const album = await loadAlbum(req.params.id);

  for (const field of ['title', 'category', 'date']) {
    if (req.body[field]) album[field] = req.body[field];
  }
  if (req.body.description !== undefined) album.description = req.body.description || '';
  if (req.body.event !== undefined) {
    await assertEventExists(req.body.event);
    album.event = req.body.event || null;
  }

  const coverChanged = req.body.coverPhoto !== undefined;
  if (coverChanged) {
    if (req.body.coverPhoto && !(await Photo.exists({ _id: req.body.coverPhoto, album: album._id }))) {
      throw new ApiError(400, 'The cover must be a photo from this album.');
    }
    album.coverPhoto = req.body.coverPhoto || null;
  }

  await album.save();
  if (coverChanged) await refreshAlbumSummary(album._id);

  res.json(await withRelations(Album.findById(album._id)));
}));

// PUT /api/gallery/albums/:id/order - save a new photo order
router.put('/albums/:id/order', protect, leadershipOnly, [
  idParam,
  body('photoIds').isArray({ min: 1, max: MAX_ALBUM_PHOTOS }).withMessage('Send the new photo order.'),
  body('photoIds.*').isMongoId().withMessage('Send the new photo order.'),
  validate
], asyncHandler(async (req, res) => {
  const album = await loadAlbum(req.params.id);
  const ids = req.body.photoIds.map(String);

  const current = new Set((await Photo.find({ album: album._id }).select('_id').lean()).map((photo) => String(photo._id)));
  const complete = new Set(ids).size === ids.length && ids.length === current.size && ids.every((id) => current.has(id));
  if (!complete) {
    throw new ApiError(409, 'Photos were added or removed while you were reordering. Reload the album and try again.');
  }

  await Photo.bulkWrite(ids.map((id, position) => ({
    updateOne: { filter: { _id: id }, update: { $set: { position } } }
  })));
  await Album.updateOne({ _id: album._id }, { $max: { nextPosition: ids.length } });
  await refreshAlbumSummary(album._id);

  res.json(await withRelations(Album.findById(album._id)));
}));

// DELETE /api/gallery/albums/:id - the album and every photo in it
router.delete('/albums/:id', protect, leadershipOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const album = await loadAlbum(req.params.id);
  if (!isPower(req.user) && !sameId(album.createdBy, req.user._id)) {
    throw new ApiError(403, 'Only the leader who created this album, an admin or the chairperson can delete it.');
  }

  const photos = await Photo.find({ album: album._id }).select('publicId').lean();
  await Photo.deleteMany({ album: album._id });
  await album.deleteOne();
  await destroyImages(photos.map((photo) => photo.publicId));

  res.json({ message: 'Album deleted.' });
}));

// POST /api/gallery/albums/:id/announce - email members once a batch of uploads finishes
router.post('/albums/:id/announce', protect, leadershipOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const album = await loadAlbum(req.params.id);

  // Matches the previous gallery: only an admin's or the chairperson's uploads
  // reach every member's inbox.
  if (!isPower(req.user)) return res.json({ sent: false });
  if (album.announcedAt && Date.now() - album.announcedAt.getTime() < ANNOUNCE_COOLDOWN_MS) return res.json({ sent: false });

  const added = await Photo.countDocuments({ album: album._id, createdAt: { $gt: album.announcedAt || new Date(0) } });
  if (!added) return res.json({ sent: false });

  // Claimed atomically, so two tabs finishing at once still send one email.
  const claimed = await Album.findOneAndUpdate(
    { _id: album._id, announcedAt: album.announcedAt },
    { $set: { announcedAt: new Date() } }
  );
  if (!claimed) return res.json({ sent: false });

  const noun = added === 1 ? 'photo' : 'photos';
  const htmlContent = renderLayout({
    imageUrl: album.cover?.url,
    heading: album.title,
    bodyHtml: html`
      <p style="color:#555;">${added} new ${noun} added by ${req.user.firstName} ${req.user.lastName}</p>
      <p style="color:#333;">${album.description || ''}</p>`,
    ctaLabel: 'View the album',
    ctaUrl: `${portalUrl()}/gallery/${album.slug}`
  });
  sendEmailToMembers(`New photos in the EESA gallery: ${album.title}`, htmlContent)
    .catch((err) => console.error('Notification email failed:', err.message));

  return res.json({ sent: true, photos: added });
}));

/* ------------------------------------------------------------------ *
 * Photos (leadership)
 * ------------------------------------------------------------------ */

// POST /api/gallery/albums/:id/photos - upload one photo; clients send a batch as parallel requests
router.post('/albums/:id/photos', protect, leadershipOnly, uploadImage.single('photo'), [
  idParam,
  captionField(body('caption').optional()),
  validate
], asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Choose a photo to upload.');

  // Claims a position and checks the limit in one step, so photos appear in
  // the order they arrived even when several upload at once.
  const reserved = await Album.findOneAndUpdate(
    { _id: req.params.id, photoCount: { $lt: MAX_ALBUM_PHOTOS } },
    { $inc: { nextPosition: 1 } },
    { new: false, projection: { nextPosition: 1 } }
  );
  if (!reserved) {
    if (await Album.exists({ _id: req.params.id })) {
      throw new ApiError(400, `An album can hold up to ${MAX_ALBUM_PHOTOS} photos. Start a new album for the rest.`);
    }
    throw new ApiError(404, 'Album not found.');
  }

  const uploaded = await uploadImageBuffer(req.file.buffer, { folder: `eesa/gallery/${reserved._id}`, preset: 'photo' });

  let photo;
  try {
    photo = await Photo.create({
      album: reserved._id,
      url: uploaded.url,
      publicId: uploaded.publicId,
      width: uploaded.width,
      height: uploaded.height,
      caption: req.body.caption || '',
      position: reserved.nextPosition,
      uploadedBy: req.user._id
    });

    const { matchedCount } = await Album.updateOne({ _id: reserved._id }, { $inc: { photoCount: 1 } });
    if (!matchedCount) throw new ApiError(404, 'This album was deleted while the photo was uploading.');
  } catch (error) {
    if (photo) await Photo.deleteOne({ _id: photo._id }).catch(() => {});
    await destroyImage(uploaded.publicId);
    throw error;
  }

  // The first photo into an album without a cover becomes its cover.
  await Album.updateOne(
    { _id: reserved._id, 'cover.url': { $in: ['', null] } },
    { $set: { cover: { url: photo.url, width: photo.width, height: photo.height } } }
  );

  res.status(201).json(photo);
}));

// POST /api/gallery/albums/:id/photos/delete - delete several photos at once
router.post('/albums/:id/photos/delete', protect, leadershipOnly, [
  idParam,
  body('photoIds').isArray({ min: 1, max: MAX_ALBUM_PHOTOS }).withMessage('Choose the photos to delete.'),
  body('photoIds.*').isMongoId().withMessage('Choose the photos to delete.'),
  validate
], asyncHandler(async (req, res) => {
  const album = await loadAlbum(req.params.id);
  const deleted = await deletePhotos(req.user, album, req.body.photoIds);
  res.json({ deleted, album: await withRelations(Album.findById(album._id)) });
}));

// PATCH /api/gallery/photos/:id - edit a caption
router.patch('/photos/:id', protect, leadershipOnly, [
  photoIdParam,
  captionField(body('caption')),
  validate
], asyncHandler(async (req, res) => {
  const photo = await Photo.findByIdAndUpdate(
    req.params.id,
    { $set: { caption: req.body.caption } },
    { new: true, runValidators: true }
  );
  if (!photo) throw new ApiError(404, 'Photo not found.');
  res.json(photo);
}));

// DELETE /api/gallery/photos/:id
router.delete('/photos/:id', protect, leadershipOnly, [photoIdParam, validate], asyncHandler(async (req, res) => {
  const photo = await Photo.findById(req.params.id).select('album').lean();
  if (!photo) throw new ApiError(404, 'Photo not found.');

  const album = await loadAlbum(photo.album);
  await deletePhotos(req.user, album, [photo._id]);
  res.json({ message: 'Photo deleted.', album: await withRelations(Album.findById(album._id)) });
}));

module.exports = router;
