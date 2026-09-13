const express = require('express');
const { body, param, query } = require('express-validator');
const Event = require('../models/Event');
const { EVENT_CATEGORIES, EVENT_STATUSES, MAX_EVENT_PHOTOS } = require('../models/Event');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { uploadImageBuffer, uploadImageBuffers, destroyImage, destroyImages } = require('../utils/cloudinaryUpload');
const { sendEmailToMembers, renderLayout, html } = require('../utils/email');

const router = express.Router();

/** First configured frontend origin, used to build links in outgoing email. */
const portalUrl = () => (process.env.FRONTEND_URL || '').split(',')[0].trim() || 'http://localhost:3000';

const COVER_FOLDER = 'eesa/events/covers';
const PHOTO_FOLDER = 'eesa/events/photos';

// Cover arrives as `image`, gallery photos as `photos`.
const eventUploads = uploadImage.fields([
  { name: 'image', maxCount: 1 },
  { name: 'photos', maxCount: MAX_EVENT_PHOTOS }
]);

/** Multipart forms send every value as text, so booleans arrive as "true". */
const truthy = (value) => value === true || value === 'true' || value === '1' || value === 'on';

/** Accept a list of ids as an array, a JSON array string or a comma-separated string. */
const parseIdList = (value) => {
  if (!value) return [];
  let list = value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      list = Array.isArray(parsed) ? parsed : [value];
    } catch {
      list = value.split(',');
    }
  }
  return (Array.isArray(list) ? list : [list]).map((v) => String(v).trim()).filter(Boolean);
};

const toPhoto = (uploaded, userId) => ({
  url: uploaded.url,
  publicId: uploaded.publicId,
  width: uploaded.width,
  height: uploaded.height,
  uploadedBy: userId
});

const idParam = param('id').isMongoId().withMessage('That event could not be found.');

const fieldValidators = (isUpdate) => {
  const maybe = (chain) => (isUpdate ? chain.optional() : chain);
  return [
    maybe(body('title')).isString().trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3 to 200 characters.'),
    maybe(body('description')).isString().trim().isLength({ min: 10, max: 5000 }).withMessage('Description must be 10 to 5000 characters.'),
    maybe(body('date')).isISO8601().withMessage('Enter a valid start date and time.').toDate(),
    body('endDate').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid end date and time.').toDate(),
    maybe(body('location')).isString().trim().isLength({ min: 2, max: 200 }).withMessage('Location must be 2 to 200 characters.'),
    body('category').optional({ values: 'falsy' }).isIn(EVENT_CATEGORIES).withMessage('Choose a valid category.'),
    body('maxAttendees').optional({ values: 'falsy' }).isInt({ min: 0, max: 100000 }).withMessage('Capacity must be a whole number; use 0 for unlimited.').toInt(),
    body('isPublic').optional().isIn(['true', 'false', true, false]).withMessage('Visibility must be true or false.'),
    body('status').optional({ values: 'falsy' }).isIn(EVENT_STATUSES).withMessage('Choose a valid status.')
  ];
};

// GET /api/events - public list
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('status').optional({ values: 'falsy' }).isIn(EVENT_STATUSES),
  query('category').optional({ values: 'falsy' }).isIn(EVENT_CATEGORIES),
  validate
], asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;

  const filter = { isPublic: true };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;

  const [events, total] = await Promise.all([
    Event.find(filter)
      .populate('organizer', 'firstName lastName')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Event.countDocuments(filter)
  ]);

  res.json({ events, page, totalPages: Math.max(1, Math.ceil(total / limit)), total });
}));

// GET /api/events/:id
router.get('/:id', [idParam, validate], asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id)
    .populate('organizer', 'firstName lastName avatar')
    .populate('attendees', 'firstName lastName avatar');

  if (!event) throw new ApiError(404, 'Event not found.');
  res.json(event);
}));

// POST /api/events - create, optionally with a cover image and photos
router.post('/', protect, adminOnly, eventUploads, [...fieldValidators(false), validate], asyncHandler(async (req, res) => {
  const { title, description, date, location, category, maxAttendees } = req.body;
  const endDate = req.body.endDate || undefined;
  if (endDate && endDate < date) throw new ApiError(400, 'The end time must be after the start time.');

  const coverFile = req.files?.image?.[0];
  const photoFiles = req.files?.photos || [];

  const cover = coverFile
    ? await uploadImageBuffer(coverFile.buffer, { folder: COVER_FOLDER, preset: 'cover' })
    : null;

  let photos = [];
  try {
    photos = await uploadImageBuffers(photoFiles, { folder: PHOTO_FOLDER, preset: 'photo' });
  } catch (error) {
    if (cover) await destroyImage(cover.publicId);
    throw error;
  }

  let event;
  try {
    event = await Event.create({
      title,
      description,
      date,
      endDate,
      location,
      category: category || undefined,
      maxAttendees: maxAttendees || 0,
      isPublic: req.body.isPublic === undefined ? true : truthy(req.body.isPublic),
      image: cover?.url || '',
      imagePublicId: cover?.publicId || '',
      photos: photos.map((p) => toPhoto(p, req.user._id)),
      organizer: req.user._id
    });
  } catch (error) {
    // The record failed to save, so nothing references these files.
    await destroyImages([cover?.publicId, ...photos.map((p) => p.publicId)]);
    throw error;
  }

  await event.populate('organizer', 'firstName lastName');

  const htmlContent = renderLayout({
    imageUrl: event.image,
    heading: event.title,
    bodyHtml: html`
      <p style="color:#555;">Organised by ${req.user.firstName} ${req.user.lastName}</p>
      <p style="color:#333;">${event.description || ''}</p>
      <p style="color:#333;"><strong>When:</strong> ${new Date(event.date).toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Nairobi' })}</p>
      <p style="color:#333;"><strong>Where:</strong> ${event.location}</p>`,
    ctaLabel: 'View event details',
    ctaUrl: `${portalUrl()}/events/${event._id}`
  });
  sendEmailToMembers(`New EESA event: ${event.title}`, htmlContent)
    .catch((err) => console.error('Notification email failed:', err.message));

  res.status(201).json(event);
}));

// PUT /api/events/:id - edit details, replace or remove the cover, add or remove photos
router.put('/:id', protect, adminOnly, eventUploads, [
  idParam,
  ...fieldValidators(true),
  body('removeImage').optional().isIn(['true', 'false', true, false]),
  validate
], asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, 'Event not found.');

  for (const field of ['title', 'description', 'date', 'location', 'category', 'maxAttendees', 'status']) {
    if (req.body[field] !== undefined && req.body[field] !== '') event[field] = req.body[field];
  }
  if (req.body.endDate !== undefined) event.endDate = req.body.endDate || undefined;
  if (req.body.isPublic !== undefined) event.isPublic = truthy(req.body.isPublic);

  const removeIds = parseIdList(req.body.removePhotoIds);
  const removedPhotos = event.photos.filter((p) => removeIds.includes(String(p._id)));
  if (removeIds.length) event.photos = event.photos.filter((p) => !removeIds.includes(String(p._id)));

  const newPhotoFiles = req.files?.photos || [];
  if (event.photos.length + newPhotoFiles.length > MAX_EVENT_PHOTOS) {
    throw new ApiError(400, `An event can have at most ${MAX_EVENT_PHOTOS} photos. Remove some before adding more.`);
  }

  // Files the event stops pointing at; deleted only after the save succeeds.
  const stale = removedPhotos.map((p) => p.publicId);
  const uploadedIds = [];

  try {
    const coverFile = req.files?.image?.[0];
    if (coverFile) {
      const cover = await uploadImageBuffer(coverFile.buffer, { folder: COVER_FOLDER, preset: 'cover' });
      uploadedIds.push(cover.publicId);
      stale.push(event.imagePublicId);
      event.image = cover.url;
      event.imagePublicId = cover.publicId;
    } else if (truthy(req.body.removeImage)) {
      stale.push(event.imagePublicId);
      event.image = '';
      event.imagePublicId = '';
    }

    const photos = await uploadImageBuffers(newPhotoFiles, { folder: PHOTO_FOLDER, preset: 'photo' });
    uploadedIds.push(...photos.map((p) => p.publicId));
    photos.forEach((p) => event.photos.push(toPhoto(p, req.user._id)));

    await event.save();
  } catch (error) {
    await destroyImages(uploadedIds);
    throw error;
  }

  await destroyImages(stale);
  await event.populate('organizer', 'firstName lastName');
  res.json(event);
}));

// POST /api/events/:id/photos - add photos, for example after the event
router.post('/:id/photos', protect, adminOnly, uploadImage.array('photos', MAX_EVENT_PHOTOS), [idParam, validate], asyncHandler(async (req, res) => {
  if (!req.files?.length) throw new ApiError(400, 'Choose at least one photo to upload.');

  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, 'Event not found.');

  if (event.photos.length + req.files.length > MAX_EVENT_PHOTOS) {
    const room = MAX_EVENT_PHOTOS - event.photos.length;
    throw new ApiError(400, room > 0
      ? `This event has room for ${room} more photo${room === 1 ? '' : 's'}.`
      : `This event already has the maximum of ${MAX_EVENT_PHOTOS} photos.`);
  }

  const photos = await uploadImageBuffers(req.files, { folder: PHOTO_FOLDER, preset: 'photo' });
  photos.forEach((p) => event.photos.push(toPhoto(p, req.user._id)));

  try {
    await event.save();
  } catch (error) {
    await destroyImages(photos.map((p) => p.publicId));
    throw error;
  }

  await event.populate('organizer', 'firstName lastName');
  res.status(201).json(event);
}));

// DELETE /api/events/:id/photos/:photoId
router.delete('/:id/photos/:photoId', protect, adminOnly, [
  idParam,
  param('photoId').isMongoId().withMessage('That photo could not be found.'),
  validate
], asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, 'Event not found.');

  const photo = event.photos.id(req.params.photoId);
  if (!photo) throw new ApiError(404, 'Photo not found.');

  const { publicId } = photo;
  event.photos.pull(photo._id);
  await event.save();
  await destroyImage(publicId);

  await event.populate('organizer', 'firstName lastName');
  res.json(event);
}));

// POST /api/events/:id/rsvp - toggle attendance
router.post('/:id/rsvp', protect, [idParam, validate], asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id).select('attendees maxAttendees status');
  if (!event) throw new ApiError(404, 'Event not found.');

  const userId = req.user._id;

  if (event.attendees.some((a) => String(a) === String(userId))) {
    await Event.updateOne({ _id: event._id }, { $pull: { attendees: userId } });
    return res.json({ message: 'RSVP cancelled', attending: false });
  }

  if (event.status === 'cancelled') throw new ApiError(400, 'This event has been cancelled.');
  if (event.status === 'completed') throw new ApiError(400, 'This event has already taken place.');

  // The capacity check is part of the update itself, so two members taking the
  // last place at the same moment cannot both get in.
  const filter = { _id: event._id, attendees: { $ne: userId } };
  if (event.maxAttendees > 0) filter[`attendees.${event.maxAttendees - 1}`] = { $exists: false };

  const result = await Event.updateOne(filter, { $addToSet: { attendees: userId } });
  if (!result.modifiedCount) throw new ApiError(400, 'This event is full.');

  return res.json({ message: 'RSVP confirmed', attending: true });
}));

// DELETE /api/events/:id
router.delete('/:id', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const event = await Event.findByIdAndDelete(req.params.id);
  if (!event) throw new ApiError(404, 'Event not found.');

  await destroyImages([event.imagePublicId, ...event.photos.map((p) => p.publicId)]);
  res.json({ message: 'Event deleted.' });
}));

module.exports = router;
