const express = require('express');
const { body, param, query } = require('express-validator');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const LeadershipTerm = require('../models/LeadershipTerm');
const Signatory = require('../models/Signatory');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { uploadImageBuffer, destroyImage } = require('../utils/cloudinaryUpload');
const { createLimiter } = require('../utils/rateLimit');
const { buildSearchRegex } = require('../utils/sanitize');
const { OFFICE_ROLES } = require('../utils/roles');
const { isMembershipCurrent, normalizeMemberNumber, notifyUsers } = require('../utils/membership');
const {
  CERTIFICATE_NUMBER_PATTERN, academicYearOf, isAcademicYearLabel, membershipYears, fullName, recipientFields,
  signatoriesFor, createCertificate, certificateDetails, publicCertificate, syncExistingTerms, termStatus
} = require('../utils/certificates');

const { CERTIFICATE_TYPES, CERTIFICATE_STATUSES } = Certificate;
const { MAX_SIGNATORIES_PER_TYPE } = Signatory;

const router = express.Router();

const SIGNATURE_FOLDER = 'eesa/signatures';
const TYPE_NAMES = { leadership: 'Leadership', membership: 'Membership' };

// Each lookup reveals who holds a certificate, so the public check has a budget of its own.
const verifyLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many verification requests. Please wait a few minutes and try again.'
});

const idParam = param('id').isMongoId().withMessage('That record could not be found.');
const sameId = (a, b) => Boolean(a && b) && String(a) === String(b);
const longDate = (date) => new Date(date).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' });
const ISSUER_FIELDS = 'firstName lastName';

/* ------------------------------------------------------------------ *
 * Members
 * ------------------------------------------------------------------ */

// GET /api/certificates/my - the member's certificates, and the membership years they can still claim
router.get('/my', protect, asyncHandler(async (req, res) => {
  const [certificates, years, membershipSigners] = await Promise.all([
    Certificate.find({ user: req.user._id, status: 'valid' }).sort({ issuedAt: -1 }).lean(),
    membershipYears(req.user),
    Signatory.countDocuments({ certificateTypes: 'membership' })
  ]);
  const claimed = new Set(certificates.filter((c) => c.type === 'membership').map((c) => c.academicYear));

  res.json({
    certificates: certificates.map(certificateDetails),
    membership: {
      current: isMembershipCurrent(req.user),
      currentYear: academicYearOf(),
      available: years.filter((year) => !claimed.has(year)),
      // Until someone's signature is on file there is nothing to sign the certificate with.
      ready: membershipSigners > 0
    }
  });
}));

// POST /api/certificates/membership - a paid member claims their certificate for an academic year
router.post('/membership', protect, [
  body('academicYear').optional({ values: 'falsy' }).custom(isAcademicYearLabel).withMessage('Choose an academic year such as 2026/2027.'),
  validate
], asyncHandler(async (req, res) => {
  const academicYear = req.body.academicYear || academicYearOf();
  const years = await membershipYears(req.user);
  if (!years.includes(academicYear)) {
    throw new ApiError(403, years.length
      ? `You have no paid membership for ${academicYear}.`
      : 'Pay your membership subscription first. Your certificate is available once the payment is verified.');
  }

  const find = () => Certificate.findOne({ type: 'membership', user: req.user._id, academicYear, status: 'valid' }).lean();
  // Claiming twice hands back the same certificate.
  const existing = await find();
  if (existing) return res.json({ certificate: certificateDetails(existing) });

  const signatories = await signatoriesFor('membership');
  if (!signatories.length) {
    throw new ApiError(409, 'Membership certificates are not available yet because no signatures have been added. Please try again later.');
  }

  try {
    const certificate = await createCertificate({
      type: 'membership',
      ...recipientFields(req.user),
      academicYear,
      signatories,
      issuedBy: req.user._id
    });
    return res.status(201).json({ certificate: certificateDetails(certificate) });
  } catch (error) {
    // A double click raced this request; the other one issued it.
    const raced = error.code === 11000 && (await find());
    if (raced) return res.json({ certificate: certificateDetails(raced) });
    throw error;
  }
}));

/* ------------------------------------------------------------------ *
 * Public verification
 * ------------------------------------------------------------------ */

// GET /api/certificates/verify/:number - anyone: is this certificate genuine?
router.get('/verify/:number', verifyLimiter, asyncHandler(async (req, res) => {
  const number = normalizeMemberNumber(req.params.number);
  if (!CERTIFICATE_NUMBER_PATTERN.test(number)) {
    throw new ApiError(400, 'Certificate numbers look like EESA-CERT-26-7K3M9Q. Check the number on the certificate and try again.');
  }
  const certificate = await Certificate.findOne({ number }).lean();
  if (!certificate) throw new ApiError(404, 'No certificate has that number.');
  res.json(publicCertificate(certificate));
}));

/* ------------------------------------------------------------------ *
 * Leadership terms
 * ------------------------------------------------------------------ */

const TERM_FILTERS = ['serving', 'ended'];
const TERM_USER_FIELDS = 'firstName lastName avatar department regNumber role isActive';
const officeRank = new Map(OFFICE_ROLES.map((role, index) => [role, index]));

const termFilter = (state, now) => {
  if (state === 'serving') return { $or: [{ endDate: null }, { endDate: { $gt: now } }] };
  if (state === 'ended') return { endDate: { $lte: now } };
  return {};
};

const termSummary = (term, certificate, now) => ({
  _id: term._id,
  name: term.user && term.user.firstName ? fullName(term.user) : term.name,
  user: term.user && term.user._id
    ? { _id: term.user._id, avatar: term.user.avatar, department: term.user.department, regNumber: term.user.regNumber, isActive: term.user.isActive }
    : null,
  role: term.role,
  office: term.office,
  startDate: term.startDate,
  endDate: term.endDate,
  source: term.source,
  status: termStatus(term, now),
  certificate: certificate ? certificateDetails(certificate) : null
});

/** Attach each term's valid certificate. */
const withCertificates = async (terms, now) => {
  const certificates = await Certificate.find({ term: { $in: terms.map((t) => t._id) }, status: 'valid' })
    .populate('issuedBy', ISSUER_FIELDS)
    .lean();
  const byTerm = new Map(certificates.map((c) => [String(c.term), c]));
  return terms.map((term) => termSummary(term, byTerm.get(String(term._id)), now));
};

const loadTerm = async (id) => {
  const term = await LeadershipTerm.findById(id);
  if (!term) throw new ApiError(404, 'That term could not be found.');
  return term;
};

const assertNotOwnTerm = (term, actor) => {
  if (sameId(term.user, actor._id)) {
    throw new ApiError(403, 'You cannot change or certify your own term. Ask another administrator.');
  }
};

const assertNoValidCertificate = async (term) => {
  const certificate = await Certificate.findOne({ term: term._id, status: 'valid' }).select('number').lean();
  if (certificate) {
    throw new ApiError(409, `Certificate ${certificate.number} has been issued for this term. Revoke it first, then make the change and issue a new one.`);
  }
};

// GET /api/certificates/terms - admin: leadership terms, with their certificates
router.get('/terms', protect, adminOnly, [
  query('state').optional({ values: 'falsy' }).isIn(TERM_FILTERS).withMessage('Choose serving or ended terms.'),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  validate
], asyncHandler(async (req, res) => {
  await syncExistingTerms();

  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const now = new Date();
  const clauses = [termFilter(req.query.state, now)];
  const search = buildSearchRegex(req.query.search);
  if (search) {
    const users = await User.find({ $or: [{ firstName: search }, { lastName: search }, { regNumber: search }] }).select('_id').limit(200).lean();
    clauses.push({ $or: [{ name: search }, { office: search }, { user: { $in: users.map((u) => u._id) } }] });
  }
  const filter = { $and: clauses };

  let terms;
  const total = await LeadershipTerm.countDocuments(filter);
  if (req.query.state === 'serving') {
    // The current committee is short, and reads best in order of office.
    terms = await LeadershipTerm.find(filter).populate('user', TERM_USER_FIELDS).limit(500).lean();
    terms.sort((a, b) => (officeRank.get(a.role) ?? 99) - (officeRank.get(b.role) ?? 99)
      || String(a.office).localeCompare(String(b.office)));
    terms = terms.slice((page - 1) * limit, page * limit);
  } else {
    terms = await LeadershipTerm.find(filter)
      .populate('user', TERM_USER_FIELDS)
      .sort({ endDate: -1, startDate: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
  }

  const [serving, ended] = await Promise.all(TERM_FILTERS.map((state) => LeadershipTerm.countDocuments(termFilter(state, now))));

  res.json({
    terms: await withCertificates(terms, now),
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    total,
    counts: { serving, ended }
  });
}));

const termDateRules = [
  body('startDate').optional().isISO8601().withMessage('Enter a valid start date.').toDate(),
  body('endDate').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid end date.').toDate()
];

// POST /api/certificates/terms - admin: record a term by hand, usually a leader from before the platform
router.post('/terms', protect, adminOnly, [
  body('userId').optional({ values: 'falsy' }).isMongoId().withMessage('That member could not be found.'),
  body('name').if(body('userId').not().exists({ values: 'falsy' }))
    .trim().notEmpty().withMessage('Enter the leader\'s name, or choose a member.')
    .isLength({ max: 100 }).withMessage('Keep the name under 100 characters.'),
  body('office').trim().notEmpty().withMessage('Enter the office held.').isLength({ max: 80 }).withMessage('Keep the office under 80 characters.'),
  body('startDate').exists({ values: 'falsy' }).withMessage('Enter the date the term started.'),
  body('endDate').exists({ values: 'falsy' }).withMessage('Enter the date the term ended.'),
  ...termDateRules,
  validate
], asyncHandler(async (req, res) => {
  let user = null;
  if (req.body.userId) {
    user = await User.findById(req.body.userId).select('firstName lastName');
    if (!user) throw new ApiError(404, 'That member could not be found.');
    if (sameId(user._id, req.user._id)) throw new ApiError(403, 'You cannot add a term for yourself. Ask another administrator.');
  }

  // Manual terms carry no role, so they never stand in for the term of someone holding the office now.
  const term = await LeadershipTerm.create({
    user: user?._id,
    name: user ? fullName(user) : req.body.name,
    office: req.body.office,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    source: 'manual',
    createdBy: req.user._id
  });
  await term.populate('user', TERM_USER_FIELDS);
  res.status(201).json({ term: termSummary(term.toObject(), null, new Date()) });
}));

// PUT /api/certificates/terms/:id - admin: correct a term's name, office or dates
router.put('/terms/:id', protect, adminOnly, [
  idParam,
  body('name').optional().trim().notEmpty().withMessage('Enter the leader\'s name.').isLength({ max: 100 }),
  body('office').optional().trim().notEmpty().withMessage('Enter the office held.').isLength({ max: 80 }),
  ...termDateRules,
  validate
], asyncHandler(async (req, res) => {
  const term = await loadTerm(req.params.id);
  assertNotOwnTerm(term, req.user);
  await assertNoValidCertificate(term);

  // A member's name comes from their profile, so it is corrected there.
  if (req.body.name !== undefined && !term.user) term.name = req.body.name;
  if (req.body.office !== undefined) term.office = req.body.office;
  if (req.body.startDate !== undefined) term.startDate = req.body.startDate;
  if (req.body.endDate !== undefined) {
    const endDate = req.body.endDate || null;
    if (!endDate) {
      if (!term.role) throw new ApiError(400, 'A term added by hand needs an end date.');
      const stillHolds = await User.exists({ _id: term.user, role: term.role, isActive: true });
      if (!stillHolds) throw new ApiError(400, 'This person no longer holds the office, so the term needs an end date.');
    }
    term.endDate = endDate;
  }

  await term.save();
  await term.populate('user', TERM_USER_FIELDS);
  res.json({ term: termSummary(term.toObject(), null, new Date()) });
}));

// DELETE /api/certificates/terms/:id - admin: remove a term recorded by mistake
router.delete('/terms/:id', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const term = await loadTerm(req.params.id);
  assertNotOwnTerm(term, req.user);
  await assertNoValidCertificate(term);

  if (term.role && !term.endDate && (await User.exists({ _id: term.user, role: term.role, isActive: true }))) {
    throw new ApiError(409, 'This person still holds the office, so the term would be recorded again. Change their role, or correct the dates instead.');
  }

  await term.deleteOne();
  res.json({ message: 'Term removed.' });
}));

// POST /api/certificates/terms/:id/certificate - admin: issue the leadership certificate for a term
router.post('/terms/:id/certificate', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const term = await loadTerm(req.params.id);
  assertNotOwnTerm(term, req.user);
  if (!term.startDate || !term.endDate) {
    throw new ApiError(400, 'Enter when the term started and ended before issuing its certificate.');
  }
  await assertNoValidCertificate(term);

  const signatories = await signatoriesFor('leadership');
  if (!signatories.length) {
    throw new ApiError(409, 'Add at least one signatory for leadership certificates under Signatories first.');
  }

  const holder = term.user ? await User.findById(term.user) : null;
  const recipient = holder ? recipientFields(holder) : { recipientName: term.name };

  let certificate;
  try {
    certificate = await createCertificate({
      type: 'leadership',
      ...recipient,
      term: term._id,
      office: term.office,
      startDate: term.startDate,
      endDate: term.endDate,
      signatories,
      issuedBy: req.user._id
    });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'A certificate has just been issued for this term.');
    throw error;
  }

  if (holder?.isActive) {
    await notifyUsers([holder._id], {
      title: 'Your leadership certificate is ready',
      message: `Your certificate for serving as ${term.office} from ${longDate(term.startDate)} to ${longDate(term.endDate)} has been issued. Open Certificates in the portal to download or print it.`,
      type: 'certificate',
      createdBy: req.user._id
    });
  }

  await certificate.populate('issuedBy', ISSUER_FIELDS);
  res.status(201).json({ certificate: certificateDetails(certificate) });
}));

/* ------------------------------------------------------------------ *
 * Signatories
 * ------------------------------------------------------------------ */

const signatorySummary = (s) => ({
  _id: s._id,
  name: s.name,
  title: s.title,
  signatureUrl: s.signatureUrl,
  certificateTypes: s.certificateTypes,
  order: s.order
});

/** Multipart forms send the list as repeated fields, a comma list or JSON. */
const readTypes = (value) => {
  if (value === undefined) return undefined;
  let list = value;
  if (typeof value === 'string') {
    try {
      list = value.trim().startsWith('[') ? JSON.parse(value) : value.split(',');
    } catch {
      list = [];
    }
  }
  return [...new Set((Array.isArray(list) ? list : [list]).map((t) => String(t).trim()).filter(Boolean))];
};

const signatoryRules = (required) => {
  const field = (name, missing) => (required
    ? body(name).exists({ values: 'falsy' }).withMessage(missing).bail()
    : body(name).optional());
  return [
    field('name', 'Enter the signatory\'s name.').trim().notEmpty().withMessage('Enter the signatory\'s name.')
      .isLength({ max: 80 }).withMessage('Keep the name under 80 characters.'),
    field('title', 'Enter the signatory\'s title, such as Chairperson.').trim().notEmpty().withMessage('Enter the signatory\'s title.')
      .isLength({ max: 80 }).withMessage('Keep the title under 80 characters.'),
    body('certificateTypes').optional().customSanitizer(readTypes)
      .custom((types) => types.length > 0 && types.every((t) => CERTIFICATE_TYPES.includes(t)))
      .withMessage('Choose which certificates this person signs.'),
    validate
  ];
};

/** Certificates have room for three signatures. */
const assertRoomFor = async (types, exceptId) => {
  for (const type of types) {
    const filter = { certificateTypes: type };
    if (exceptId) filter._id = { $ne: exceptId };
    if (await Signatory.countDocuments(filter) >= MAX_SIGNATORIES_PER_TYPE) {
      throw new ApiError(409, `${TYPE_NAMES[type]} certificates already have ${MAX_SIGNATORIES_PER_TYPE} signatories. Remove one from them first.`);
    }
  }
};

/**
 * Delete a signature image unless a certificate already issued still prints it.
 * Certificates are drawn from their own copy of the signatories, so the file
 * must outlive the signatory.
 */
const releaseSignature = async (url, publicId) => {
  if (!publicId) return;
  if (await Certificate.exists({ 'signatories.signatureUrl': url })) return;
  await destroyImage(publicId);
};

// GET /api/certificates/signatories - admin: who signs certificates
router.get('/signatories', protect, adminOnly, asyncHandler(async (req, res) => {
  const signatories = await Signatory.find().sort({ order: 1, createdAt: 1 }).lean();
  res.json({ signatories: signatories.map(signatorySummary), maxPerType: MAX_SIGNATORIES_PER_TYPE });
}));

// POST /api/certificates/signatories - admin: add a signatory with their signature
router.post('/signatories', protect, adminOnly, uploadImage.single('signature'), signatoryRules(true), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Upload an image of the signature.');
  const certificateTypes = req.body.certificateTypes || [...CERTIFICATE_TYPES];
  await assertRoomFor(certificateTypes);

  const uploaded = await uploadImageBuffer(req.file.buffer, { folder: SIGNATURE_FOLDER, preset: 'signature' });
  const last = await Signatory.findOne().sort({ order: -1 }).select('order').lean();
  try {
    const signatory = await Signatory.create({
      name: req.body.name,
      title: req.body.title,
      signatureUrl: uploaded.url,
      signaturePublicId: uploaded.publicId,
      certificateTypes,
      order: (last?.order ?? -1) + 1,
      updatedBy: req.user._id
    });
    res.status(201).json({ signatory: signatorySummary(signatory) });
  } catch (error) {
    await destroyImage(uploaded.publicId);
    throw error;
  }
}));

// PUT /api/certificates/signatories/order - admin: left-to-right order on the certificate
router.put('/signatories/order', protect, adminOnly, [
  body('ids').isArray({ min: 1, max: 20 }).withMessage('Send the signatories in their new order.'),
  body('ids.*').isMongoId().withMessage('That signatory could not be found.'),
  validate
], asyncHandler(async (req, res) => {
  await Promise.all(req.body.ids.map((id, index) => Signatory.updateOne({ _id: id }, { order: index })));
  const signatories = await Signatory.find().sort({ order: 1, createdAt: 1 }).lean();
  res.json({ signatories: signatories.map(signatorySummary), maxPerType: MAX_SIGNATORIES_PER_TYPE });
}));

// PUT /api/certificates/signatories/:id - admin: change a signatory, optionally with a new signature
router.put('/signatories/:id', protect, adminOnly, uploadImage.single('signature'), [idParam, ...signatoryRules(false)], asyncHandler(async (req, res) => {
  const signatory = await Signatory.findById(req.params.id);
  if (!signatory) throw new ApiError(404, 'That signatory could not be found.');

  if (req.body.certificateTypes) {
    await assertRoomFor(req.body.certificateTypes.filter((t) => !signatory.certificateTypes.includes(t)), signatory._id);
    signatory.certificateTypes = req.body.certificateTypes;
  }
  if (req.body.name !== undefined) signatory.name = req.body.name;
  if (req.body.title !== undefined) signatory.title = req.body.title;
  signatory.updatedBy = req.user._id;

  const previous = { url: signatory.signatureUrl, publicId: signatory.signaturePublicId };
  if (req.file) {
    const uploaded = await uploadImageBuffer(req.file.buffer, { folder: SIGNATURE_FOLDER, preset: 'signature' });
    signatory.signatureUrl = uploaded.url;
    signatory.signaturePublicId = uploaded.publicId;
  }

  await signatory.save();
  if (req.file) await releaseSignature(previous.url, previous.publicId);
  res.json({ signatory: signatorySummary(signatory) });
}));

// DELETE /api/certificates/signatories/:id - admin: stop printing someone's signature on new certificates
router.delete('/signatories/:id', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const signatory = await Signatory.findById(req.params.id);
  if (!signatory) throw new ApiError(404, 'That signatory could not be found.');
  await signatory.deleteOne();
  await releaseSignature(signatory.signatureUrl, signatory.signaturePublicId);
  res.json({ message: `${signatory.name} no longer signs new certificates.` });
}));

/* ------------------------------------------------------------------ *
 * Issued certificates
 * ------------------------------------------------------------------ */

// GET /api/certificates - admin: every certificate issued
router.get('/', protect, adminOnly, [
  query('type').optional({ values: 'falsy' }).isIn(CERTIFICATE_TYPES).withMessage('Unknown kind of certificate.'),
  query('status').optional({ values: 'falsy' }).isIn(CERTIFICATE_STATUSES).withMessage('Choose valid or revoked certificates.'),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  validate
], asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;

  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  filter.status = req.query.status || 'valid';
  const search = buildSearchRegex(req.query.search);
  if (search) filter.$or = [{ recipientName: search }, { number: search }, { office: search }, { regNumber: search }, { academicYear: search }];

  const [certificates, total, ...counts] = await Promise.all([
    Certificate.find(filter)
      .populate('issuedBy', ISSUER_FIELDS)
      .populate('revokedBy', ISSUER_FIELDS)
      .sort({ issuedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Certificate.countDocuments(filter),
    ...CERTIFICATE_TYPES.map((type) => Certificate.countDocuments({ type, status: 'valid' })),
    Certificate.countDocuments({ status: 'revoked' })
  ]);

  res.json({
    certificates: certificates.map(certificateDetails),
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    total,
    counts: { ...Object.fromEntries(CERTIFICATE_TYPES.map((type, index) => [type, counts[index]])), revoked: counts[CERTIFICATE_TYPES.length] }
  });
}));

// POST /api/certificates/:id/revoke - admin: withdraw a certificate, for example one with a mistake on it
router.post('/:id/revoke', protect, adminOnly, [
  idParam,
  body('reason').trim().notEmpty().withMessage('Say why the certificate is being revoked.')
    .isLength({ max: 300 }).withMessage('Keep the reason under 300 characters.'),
  validate
], asyncHandler(async (req, res) => {
  const certificate = await Certificate.findById(req.params.id);
  if (!certificate) throw new ApiError(404, 'That certificate could not be found.');
  if (certificate.status === 'revoked') throw new ApiError(409, 'This certificate has already been revoked.');

  certificate.status = 'revoked';
  certificate.revokedAt = new Date();
  certificate.revokedBy = req.user._id;
  certificate.revokeReason = req.body.reason;
  await certificate.save();

  if (certificate.user && !sameId(certificate.user, req.user._id)) {
    await notifyUsers([certificate.user], {
      title: 'A certificate was withdrawn',
      message: `Your ${certificate.type} certificate ${certificate.number} was revoked and no longer verifies. Reason: ${req.body.reason}`,
      type: 'certificate',
      createdBy: req.user._id
    });
  }

  await certificate.populate([{ path: 'issuedBy', select: ISSUER_FIELDS }, { path: 'revokedBy', select: ISSUER_FIELDS }]);
  res.json({ certificate: certificateDetails(certificate) });
}));

module.exports = router;
