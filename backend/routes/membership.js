const express = require('express');
const { body, param, query } = require('express-validator');
const User = require('../models/User');
const PassportPhoto = require('../models/PassportPhoto');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { uploadImageBuffer, destroyImage, destroyImages } = require('../utils/cloudinaryUpload');
const { createLimiter } = require('../utils/rateLimit');
const { buildSearchRegex } = require('../utils/sanitize');
const {
  membershipClause, isMembershipCurrent, normalizeMemberNumber, ensureMemberNumber, cardDetails, notifyUsers, MEMBER_NUMBER_PATTERN
} = require('../utils/membership');

const router = express.Router();

const PHOTO_FOLDER = 'eesa/passport-photos';
const REVIEW_FILTERS = ['pending', 'approved', 'rejected'];

// Public lookups are cheap to make and each one reveals a member's details, so
// they get a tight budget of their own.
const verifyLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many verification requests. Please wait a few minutes and try again.'
});

const idParam = param('id').isMongoId().withMessage('That photo could not be found.');
const userIdParam = param('userId').isMongoId().withMessage('That member could not be found.');

const REVIEW_USER_FIELDS = 'firstName lastName email regNumber department yearOfStudy academicStatus avatar passportPhoto memberNumber membershipPaid membershipExpiry';

const photoSummary = (photo) => photo && ({
  _id: photo._id,
  url: photo.url,
  status: photo.status,
  rejectionReason: photo.rejectionReason || '',
  submittedAt: photo.createdAt,
  reviewedAt: photo.reviewedAt || null
});

/**
 * A member's card, or what is still needed to get one. The same shape serves
 * the member's own page and an administrator looking at theirs.
 */
const cardStatus = async (user) => {
  const current = isMembershipCurrent(user);
  const latest = await PassportPhoto.findOne({ user: user._id }).sort({ createdAt: -1 }).lean();

  // A card exists only while the subscription is paid up and a photo has been approved.
  let card = null;
  if (current && user.passportPhoto) {
    await ensureMemberNumber(user);
    card = cardDetails(user);
  }

  return {
    membership: {
      current,
      paid: Boolean(user.membershipPaid),
      expiresAt: user.membershipExpiry || null
    },
    photo: {
      approvedUrl: user.passportPhoto || '',
      latest: photoSummary(latest)
    },
    card
  };
};

/**
 * Put an approved photo on a member's card: it replaces any earlier approved
 * photo, whose file is deleted, and the member gets a number if they lack one.
 */
const applyApprovedPhoto = async (photo, member) => {
  const previousPublicId = member.passportPhotoId;

  await User.updateOne({ _id: member._id }, { passportPhoto: photo.url, passportPhotoId: photo.publicId });
  member.passportPhoto = photo.url;
  member.passportPhotoId = photo.publicId;
  await PassportPhoto.updateMany(
    { user: member._id, status: 'approved', _id: { $ne: photo._id } },
    { status: 'replaced' }
  );
  if (previousPublicId && previousPublicId !== photo.publicId) await destroyImage(previousPublicId);

  await ensureMemberNumber(member);
};

const cardReadyNotice = (member, reviewer) => notifyUsers([member._id], {
  title: 'Your membership card is ready',
  message: isMembershipCurrent(member)
    ? 'Your passport photo was approved. Open Membership Card in the portal to view, download or print your card.'
    : 'Your passport photo was approved. Renew your membership subscription and your card will be available under Membership Card in the portal.',
  type: 'membership',
  createdBy: reviewer._id
});

/** Remove a member's submissions still waiting or turned down, with their files. */
const clearOpenSubmissions = async (userId) => {
  const open = await PassportPhoto.find({ user: userId, status: { $in: ['pending', 'rejected'] } }).select('publicId').lean();
  if (!open.length) return;
  await PassportPhoto.deleteMany({ _id: { $in: open.map((p) => p._id) } });
  await destroyImages(open.map((p) => p.publicId));
};

/* ------------------------------------------------------------------ *
 * Members
 * ------------------------------------------------------------------ */

// GET /api/membership/card - the member's card, or what is still needed to get one
router.get('/card', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json(await cardStatus(user));
}));

// POST /api/membership/photo - submit a passport photo for review
router.post('/photo', protect, uploadImage.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Choose a passport photo to upload.');

  // New members pay first; the card only exists for a current subscription.
  if (!isMembershipCurrent(req.user)) {
    throw new ApiError(403, 'Pay your membership subscription first. You can upload your passport photo once the payment is verified.');
  }

  const uploaded = await uploadImageBuffer(req.file.buffer, { folder: PHOTO_FOLDER, preset: 'passport' });

  // Only the newest submission matters. Earlier ones still waiting, and ones
  // already turned down, are removed with their files.
  await clearOpenSubmissions(req.user._id);

  const photo = await PassportPhoto.create({
    user: req.user._id,
    url: uploaded.url,
    publicId: uploaded.publicId
  });

  res.status(201).json({ photo: photoSummary(photo) });
}));

/* ------------------------------------------------------------------ *
 * Review
 * ------------------------------------------------------------------ */

// GET /api/membership/photos - admin: passport photos by review status
router.get('/photos', protect, adminOnly, [
  query('status').optional({ values: 'falsy' }).isIn(REVIEW_FILTERS).withMessage('Choose pending, approved or rejected photos.'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  validate
], asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  // The oldest request is first in the queue; reviewed ones show the latest first.
  const sort = status === 'pending' ? { createdAt: 1 } : { reviewedAt: -1, createdAt: -1 };

  const [photos, total, pending] = await Promise.all([
    PassportPhoto.find({ status })
      .populate('user', REVIEW_USER_FIELDS)
      .populate('reviewedBy', 'firstName lastName')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PassportPhoto.countDocuments({ status }),
    PassportPhoto.countDocuments({ status: 'pending' })
  ]);

  const now = new Date();
  res.json({
    photos: photos.map((photo) => ({
      ...photo,
      membershipCurrent: photo.user ? isMembershipCurrent(photo.user, now) : false
    })),
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    total,
    pending
  });
}));

// PUT /api/membership/photos/:id/review - admin: approve or reject a passport photo
router.put('/photos/:id/review', protect, adminOnly, [
  idParam,
  body('status').isIn(['approved', 'rejected']).withMessage('Choose approve or reject.'),
  body('reason').if(body('status').equals('rejected'))
    .trim().notEmpty().withMessage('Say why the photo was not approved, so the member can fix it.')
    .isLength({ max: 300 }).withMessage('Keep the reason under 300 characters.'),
  validate
], asyncHandler(async (req, res) => {
  const photo = await PassportPhoto.findById(req.params.id);
  if (!photo) throw new ApiError(404, 'That photo could not be found.');
  if (photo.status !== 'pending') throw new ApiError(409, 'This photo has already been reviewed.');

  const member = await User.findById(photo.user);
  if (!member) throw new ApiError(404, 'The member who sent this photo no longer exists.');

  photo.reviewedBy = req.user._id;
  photo.reviewedAt = new Date();

  if (req.body.status === 'rejected') {
    photo.status = 'rejected';
    photo.rejectionReason = req.body.reason;
    await photo.save();

    await notifyUsers([member._id], {
      title: 'Passport photo not approved',
      message: `Your passport photo for the membership card was not approved. Reason: ${req.body.reason} Please upload a new photo from Membership Card in the portal.`,
      type: 'membership',
      createdBy: req.user._id
    });
  } else {
    photo.status = 'approved';
    photo.rejectionReason = undefined;
    await photo.save();

    await applyApprovedPhoto(photo, member);
    await cardReadyNotice(member, req.user);
  }

  const populated = await PassportPhoto.findById(photo._id)
    .populate('user', REVIEW_USER_FIELDS)
    .populate('reviewedBy', 'firstName lastName')
    .lean();
  res.json({ photo: populated });
}));

/* ------------------------------------------------------------------ *
 * Cards for administrators
 * ------------------------------------------------------------------ */

const CARD_STATES = ['ready', 'needs-photo', 'waiting', 'unpaid'];
const CARD_LIST_FIELDS = 'firstName lastName email regNumber department yearOfStudy academicStatus avatar passportPhoto memberNumber membershipPaid membershipExpiry lastPaymentDate createdAt';
const hasPhoto = { passportPhoto: { $nin: ['', null] } };
const noPhoto = { passportPhoto: { $in: ['', null] } };

/**
 * Where each active member stands with their card. The states do not overlap;
 * a ready card stays ready while a replacement photo waits for review.
 *  ready        paid up with an approved photo; the card can be printed
 *  waiting      a photo is waiting for review
 *  needs-photo  paid up, but no photo and none waiting
 *  unpaid       subscription not current, so no card
 */
const cardStateFilters = (waitingIds, now) => {
  const ready = { $and: [membershipClause('current', now), hasPhoto] };
  return {
    ready,
    waiting: { $and: [{ _id: { $in: waitingIds } }, { $nor: [ready] }] },
    'needs-photo': { $and: [membershipClause('current', now), noPhoto, { _id: { $nin: waitingIds } }] },
    unpaid: { $and: [{ $nor: [membershipClause('current', now)] }, { _id: { $nin: waitingIds } }] }
  };
};

const cardStateOf = (user, waiting, now) => {
  const current = isMembershipCurrent(user, now);
  if (current && user.passportPhoto) return 'ready';
  if (waiting.has(String(user._id))) return 'waiting';
  return current ? 'needs-photo' : 'unpaid';
};

// GET /api/membership/cards - admin: every active member's card status, with the card when ready
router.get('/cards', protect, adminOnly, [
  query('state').optional({ values: 'falsy' }).isIn(CARD_STATES).withMessage('Unknown card status.'),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  validate
], asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const now = new Date();

  const waitingIds = await PassportPhoto.distinct('user', { status: 'pending' });
  const filters = cardStateFilters(waitingIds, now);

  const clauses = [{ isActive: true }];
  if (req.query.state) clauses.push(filters[req.query.state]);
  const search = buildSearchRegex(req.query.search);
  if (search) {
    clauses.push({ $or: [{ firstName: search }, { lastName: search }, { email: search }, { regNumber: search }, { memberNumber: search }] });
  }
  const filter = { $and: clauses };

  const [users, total, ...counts] = await Promise.all([
    User.find(filter).select(CARD_LIST_FIELDS).sort({ firstName: 1, lastName: 1, _id: 1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
    ...CARD_STATES.map((state) => User.countDocuments({ $and: [{ isActive: true }, filters[state]] }))
  ]);

  const waiting = new Set(waitingIds.map(String));
  const members = [];
  for (const user of users) {
    const state = cardStateOf(user, waiting, now);
    if (state === 'ready') await ensureMemberNumber(user);
    members.push({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      regNumber: user.regNumber,
      department: user.department,
      avatar: user.avatar,
      memberNumber: user.memberNumber || '',
      // What the manual membership form needs, so an unpaid member can be marked paid from the list.
      membershipPaid: Boolean(user.membershipPaid),
      membershipExpiry: user.membershipExpiry || null,
      lastPaymentDate: user.lastPaymentDate || null,
      state,
      card: state === 'ready' ? cardDetails(user) : null
    });
  }

  res.json({
    members,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    total,
    counts: Object.fromEntries(CARD_STATES.map((state, index) => [state, counts[index]]))
  });
}));

// GET /api/membership/cards/:userId - admin: one member's card, or what it still needs
router.get('/cards/:userId', protect, adminOnly, [userIdParam, validate], asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) throw new ApiError(404, 'That member could not be found.');
  res.json({
    member: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      regNumber: user.regNumber,
      department: user.department,
      avatar: user.avatar,
      isActive: user.isActive,
      membershipPaid: Boolean(user.membershipPaid),
      membershipExpiry: user.membershipExpiry || null,
      lastPaymentDate: user.lastPaymentDate || null
    },
    ...(await cardStatus(user))
  });
}));

// POST /api/membership/cards/:userId/photo - admin: add a member's passport photo, approved at once
router.post('/cards/:userId/photo', protect, adminOnly, uploadImage.single('photo'), [userIdParam, validate], asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Choose a passport photo to upload.');

  const member = await User.findById(req.params.userId);
  if (!member) throw new ApiError(404, 'That member could not be found.');
  if (!member.isActive) throw new ApiError(409, 'This account is deactivated. Restore it before issuing a card.');

  const uploaded = await uploadImageBuffer(req.file.buffer, { folder: PHOTO_FOLDER, preset: 'passport' });

  // The administrator is the reviewer, so the photo goes straight onto the card.
  // Anything the member had waiting is superseded.
  await clearOpenSubmissions(member._id);
  const photo = await PassportPhoto.create({
    user: member._id,
    url: uploaded.url,
    publicId: uploaded.publicId,
    status: 'approved',
    reviewedBy: req.user._id,
    reviewedAt: new Date()
  });

  await applyApprovedPhoto(photo, member);
  if (String(member._id) !== String(req.user._id)) await cardReadyNotice(member, req.user);

  res.status(201).json(await cardStatus(member));
}));

/* ------------------------------------------------------------------ *
 * Public verification
 * ------------------------------------------------------------------ */

// GET /api/membership/verify/:number - anyone: is this membership card valid?
router.get('/verify/:number', verifyLimiter, asyncHandler(async (req, res) => {
  const memberNumber = normalizeMemberNumber(req.params.number);
  if (!MEMBER_NUMBER_PATTERN.test(memberNumber)) {
    throw new ApiError(400, 'Member numbers look like EESA-26-7K3M9Q. Check the number on the card and try again.');
  }

  const user = await User.findOne({ memberNumber })
    .select('firstName lastName department yearOfStudy academicStatus passportPhoto memberNumber membershipPaid membershipExpiry isActive createdAt')
    .lean();
  if (!user) throw new ApiError(404, 'No membership card has that number.');

  // A deactivated account's card is void; say so without describing the person.
  if (!user.isActive) {
    return res.json({ memberNumber, valid: false, status: 'revoked' });
  }

  const current = isMembershipCurrent(user);
  const { regNumber, ...details } = cardDetails(user);
  res.json({ ...details, valid: current, status: current ? 'active' : 'expired' });
}));

module.exports = router;
