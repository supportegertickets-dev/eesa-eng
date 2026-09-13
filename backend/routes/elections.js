const express = require('express');
const { body, param, query } = require('express-validator');
const Election = require('../models/Election');
const { ELECTION_STATUSES } = require('../models/Election');
const Vote = require('../models/Vote');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect, optionalAuth, adminOnly, POWER_ROLES } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { uploadImageBuffer, destroyImage, destroyImages } = require('../utils/cloudinaryUpload');

const router = express.Router();

const CANDIDATE_USER_FIELDS = 'firstName lastName department yearOfStudy academicStatus avatar';
const PHOTO_FOLDER = 'eesa/elections';
const MIN_MANIFESTO = 20;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const isReviewer = (user) => Boolean(user && POWER_ROLES.includes(user.role));
const idOf = (value) => (value ? String(value._id || value) : '');
const sameUser = (candidateUser, viewer) => Boolean(viewer && candidateUser && idOf(candidateUser) === idOf(viewer));
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Members are in Kenya and the server runs in UTC, so dates in messages are
// formatted in Nairobi time explicitly.
const formatWhen = (date) => new Date(date).toLocaleString('en-KE', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi'
});

const idParam = param('id').isMongoId().withMessage('That election could not be found.');
const candidateParam = param('candidateId').isMongoId().withMessage('That candidate could not be found.');

const notify = (fields) =>
  Notification.create({ type: 'election', ...fields, title: clip(fields.title, 200) })
    .catch((error) => console.warn('Could not create election notification:', error.message));

const loadElection = async (id, { populate = true } = {}) => {
  await Election.syncStatuses();
  const findQuery = Election.findById(id);
  if (populate) {
    findQuery.populate('candidates.user', CANDIDATE_USER_FIELDS).populate('createdBy', 'firstName lastName');
  }
  const election = await findQuery;
  if (!election) throw new ApiError(404, 'Election not found.');
  return election;
};

/** Trim, collapse whitespace and reject duplicates in a list of positions. */
const normalisePositions = (positions) => {
  const cleaned = positions.map((p) => String(p).trim().replace(/\s+/g, ' ')).filter(Boolean);
  const unique = new Set(cleaned.map((p) => p.toLowerCase()));
  if (unique.size !== cleaned.length) throw new ApiError(400, 'Each position can only be listed once.');
  if (!cleaned.length) throw new ApiError(400, 'Add at least one position.');
  return cleaned;
};

const assertSchedule = ({ startDate, endDate, nominationDeadline }, now = new Date()) => {
  if (endDate <= startDate) throw new ApiError(400, 'Voting must close after it opens.');
  if (endDate <= now) throw new ApiError(400, 'The voting end time must be in the future.');
  if (nominationDeadline && nominationDeadline > startDate) {
    throw new ApiError(400, 'Nominations must close before voting opens.');
  }
};

/* ------------------------------------------------------------------ *
 * Vote counting
 * ------------------------------------------------------------------ */

/** Count votes per candidate and distinct voters, including legacy ballots. */
const tallyVotes = async (election) => {
  const counts = new Map();
  const rows = await Vote.aggregate([
    { $match: { election: election._id } },
    { $group: { _id: '$candidate', count: { $sum: 1 } } }
  ]);
  rows.forEach((row) => counts.set(String(row._id), row.count));

  const voters = new Set((await Vote.distinct('voter', { election: election._id })).map(String));

  for (const candidate of election.candidates) {
    const legacy = candidate.votes || [];
    if (!legacy.length) continue;
    counts.set(String(candidate._id), (counts.get(String(candidate._id)) || 0) + legacy.length);
    legacy.forEach((voter) => voters.add(String(voter)));
  }

  return { counts, turnout: voters.size };
};

const buildResults = async (election) => {
  const { counts, turnout } = await tallyVotes(election);

  const positions = election.positions.map((position) => {
    const candidates = election.candidates
      .filter((c) => c.position === position && c.status === 'approved')
      .map((c) => ({ _id: c._id, voteCount: counts.get(String(c._id)) || 0 }));

    const totalVotes = candidates.reduce((sum, c) => sum + c.voteCount, 0);
    const top = candidates.reduce((max, c) => Math.max(max, c.voteCount), 0);
    const leaders = candidates.filter((c) => top > 0 && c.voteCount === top);

    return {
      position,
      totalVotes,
      tie: leaders.length > 1,
      candidates: candidates
        .map((c) => ({
          ...c,
          percentage: totalVotes ? Math.round((c.voteCount / totalVotes) * 1000) / 10 : 0,
          isWinner: leaders.length === 1 && c.voteCount === top
        }))
        .sort((a, b) => b.voteCount - a.voteCount)
    };
  });

  return { turnout, positions };
};

/** The viewer's own choices, as { position: candidateId }. */
const votesBy = async (election, viewer) => {
  if (!viewer) return {};
  const choices = {};
  const votes = await Vote.find({ election: election._id, voter: viewer._id }).select('position candidate').lean();
  votes.forEach((v) => { choices[v.position] = String(v.candidate); });

  for (const candidate of election.candidates) {
    if ((candidate.votes || []).some((v) => String(v) === String(viewer._id))) {
      choices[candidate.position] = choices[candidate.position] || String(candidate._id);
    }
  }
  return choices;
};

/* ------------------------------------------------------------------ *
 * Serialisation
 * ------------------------------------------------------------------ */

const serializeCandidate = (candidate, { includeReview = false } = {}) => {
  const user = candidate.user && candidate.user.firstName !== undefined ? candidate.user : null;
  return {
    _id: candidate._id,
    user: user ? {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      department: user.department,
      yearOfStudy: user.yearOfStudy,
      academicStatus: user.academicStatus,
      avatar: user.avatar
    } : null,
    position: candidate.position,
    manifesto: candidate.manifesto || '',
    photo: candidate.photo || '',
    status: candidate.status,
    nominatedBy: candidate.nominatedBy,
    createdAt: candidate.createdAt,
    ...(includeReview ? { rejectionReason: candidate.rejectionReason || '', reviewedAt: candidate.reviewedAt } : {})
  };
};

/**
 * Shape an election for one viewer.
 *
 * Vote arrays are never included. Members see approved candidates plus their
 * own application; reviewers also see pending and rejected applications.
 * Results appear only once voting has closed.
 */
const serializeElection = async (election, viewer, { withResults = false } = {}) => {
  const reviewer = isReviewer(viewer);
  const mine = viewer ? election.candidates.find((c) => sameUser(c.user, viewer)) : null;

  const visible = election.candidates.filter(
    (c) => c.status === 'approved' || reviewer || sameUser(c.user, viewer)
  );

  return {
    _id: election._id,
    title: election.title,
    description: election.description || '',
    positions: election.positions,
    status: election.status,
    nominationDeadline: election.nominationDeadline || null,
    nominationsCloseAt: election.nominationsCloseAt(),
    nominationsOpen: election.nominationsOpen(),
    startDate: election.startDate,
    endDate: election.endDate,
    createdBy: election.createdBy && election.createdBy.firstName
      ? { _id: election.createdBy._id, firstName: election.createdBy.firstName, lastName: election.createdBy.lastName }
      : null,
    createdAt: election.createdAt,
    candidates: visible.map((c) => serializeCandidate(c, { includeReview: reviewer || sameUser(c.user, viewer) })),
    myApplication: mine ? serializeCandidate(mine, { includeReview: true }) : null,
    myVotes: await votesBy(election, viewer),
    results: withResults && election.status === 'completed' ? await buildResults(election) : null
  };
};

const respondWithElection = async (res, id, viewer, { status = 200, message } = {}) => {
  const fresh = await loadElection(id);
  const election = await serializeElection(fresh, viewer, { withResults: true });
  res.status(status).json(message ? { message, election } : election);
};

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

// GET /api/elections
router.get('/', optionalAuth, [
  query('status').optional({ values: 'falsy' }).isIn(ELECTION_STATUSES).withMessage('Unknown status'),
  validate
], asyncHandler(async (req, res) => {
  await Election.syncStatuses();

  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const elections = await Election.find(filter)
    .populate('candidates.user', CANDIDATE_USER_FIELDS)
    .populate('createdBy', 'firstName lastName');

  // Open elections first, then upcoming by start, then closed by most recent.
  const order = { active: 0, upcoming: 1, completed: 2 };
  elections.sort((a, b) => (order[a.status] - order[b.status])
    || (a.status === 'completed' ? b.endDate - a.endDate : a.startDate - b.startDate));

  res.json({ elections: await Promise.all(elections.map((e) => serializeElection(e, req.user))) });
}));

// GET /api/elections/:id
router.get('/:id', optionalAuth, [idParam, validate], asyncHandler(async (req, res) => {
  await respondWithElection(res, req.params.id, req.user);
}));

// GET /api/elections/:id/results - published only after voting closes
router.get('/:id/results', optionalAuth, [idParam, validate], asyncHandler(async (req, res) => {
  const election = await loadElection(req.params.id);

  if (election.status !== 'completed') {
    const error = new ApiError(403, `Results will be published when voting closes on ${formatWhen(election.endDate)}.`);
    error.code = 'results_hidden';
    throw error;
  }

  res.json({
    election: { _id: election._id, title: election.title, status: election.status, endDate: election.endDate },
    candidates: election.candidates.filter((c) => c.status === 'approved').map((c) => serializeCandidate(c)),
    results: await buildResults(election)
  });
}));

/* ------------------------------------------------------------------ *
 * Managing elections
 * ------------------------------------------------------------------ */

const scheduleValidators = (isUpdate) => {
  const maybe = (chain) => (isUpdate ? chain.optional() : chain);
  return [
    maybe(body('title')).isString().trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3 to 200 characters.'),
    body('description').optional({ values: 'null' }).isString().trim().isLength({ max: 2000 }).withMessage('Description must be 2000 characters or fewer.'),
    maybe(body('positions')).isArray({ min: 1, max: 20 }).withMessage('Add between 1 and 20 positions.'),
    body('positions.*').isString().trim().isLength({ min: 2, max: 80 }).withMessage('Each position must be 2 to 80 characters.'),
    maybe(body('startDate')).isISO8601().withMessage('Enter a valid time for voting to open.').toDate(),
    maybe(body('endDate')).isISO8601().withMessage('Enter a valid time for voting to close.').toDate(),
    body('nominationDeadline').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid nomination deadline.').toDate()
  ];
};

// POST /api/elections
router.post('/', protect, adminOnly, [...scheduleValidators(false), validate], asyncHandler(async (req, res) => {
  const positions = normalisePositions(req.body.positions);
  const { title, description, startDate, endDate } = req.body;
  const nominationDeadline = req.body.nominationDeadline || undefined;

  assertSchedule({ startDate, endDate, nominationDeadline });

  const election = await Election.create({
    title, description, positions, startDate, endDate, nominationDeadline, createdBy: req.user._id
  });

  await respondWithElection(res, election._id, req.user, { status: 201 });
}));

// PUT /api/elections/:id
router.put('/:id', protect, adminOnly, [idParam, ...scheduleValidators(true), validate], asyncHandler(async (req, res) => {
  const election = await loadElection(req.params.id, { populate: false });
  if (election.status === 'completed') throw new ApiError(400, 'A closed election cannot be edited.');

  const upcoming = election.status === 'upcoming';

  if (req.body.title !== undefined) election.title = req.body.title;
  if (req.body.description !== undefined) election.description = req.body.description || '';

  if (req.body.positions !== undefined) {
    if (!upcoming) throw new ApiError(400, 'Positions cannot change once voting has started.');
    const positions = normalisePositions(req.body.positions);
    const orphaned = election.candidates.filter((c) => c.status !== 'rejected' && !positions.includes(c.position));
    if (orphaned.length) {
      const names = [...new Set(orphaned.map((c) => c.position))].join(', ');
      throw new ApiError(400, `Remove the candidates for ${names} before removing that position.`);
    }
    election.positions = positions;
  }

  if (req.body.startDate !== undefined || req.body.nominationDeadline !== undefined) {
    if (!upcoming) throw new ApiError(400, 'The opening time cannot change once voting has started.');
    if (req.body.startDate !== undefined) election.startDate = req.body.startDate;
    if (req.body.nominationDeadline !== undefined) election.nominationDeadline = req.body.nominationDeadline || undefined;
  }

  if (req.body.endDate !== undefined) election.endDate = req.body.endDate;

  assertSchedule(election);
  await election.save();

  await respondWithElection(res, election._id, req.user);
}));

// POST /api/elections/:id/open - start voting immediately
router.post('/:id/open', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const election = await loadElection(req.params.id, { populate: false });
  if (election.status !== 'upcoming') throw new ApiError(400, 'Voting can only be opened for an upcoming election.');
  if (!election.candidates.some((c) => c.status === 'approved')) {
    throw new ApiError(400, 'Approve at least one candidate before opening voting.');
  }

  const now = new Date();
  if (election.endDate <= now) throw new ApiError(400, 'The closing time has already passed. Set a later closing time first.');

  election.startDate = now;
  if (election.nominationDeadline && election.nominationDeadline > now) election.nominationDeadline = now;
  election.status = 'active';
  await election.save();

  notify({
    title: `Voting is open: ${election.title}`,
    message: `Voting in "${election.title}" is now open. Cast your vote in the member portal before ${formatWhen(election.endDate)}.`,
    target: 'all',
    createdBy: req.user._id
  });

  const pending = election.candidates.filter((c) => c.status === 'pending').length;
  await respondWithElection(res, election._id, req.user, {
    message: pending
      ? `Voting is open. ${pending} pending application${pending === 1 ? '' : 's'} will not appear on the ballot.`
      : 'Voting is open.'
  });
}));

// POST /api/elections/:id/close - end voting immediately and publish results
router.post('/:id/close', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const election = await loadElection(req.params.id, { populate: false });
  if (election.status !== 'active') throw new ApiError(400, 'Only an election that is currently voting can be closed.');

  const now = new Date();
  if (election.startDate > now) election.startDate = now;
  election.endDate = now;
  election.status = 'completed';
  await election.save();

  notify({
    title: `Results are out: ${election.title}`,
    message: `Voting in "${election.title}" has closed. The results are now available in the member portal.`,
    target: 'all',
    createdBy: req.user._id
  });

  await respondWithElection(res, election._id, req.user, { message: 'Voting has closed and results are published.' });
}));

// DELETE /api/elections/:id
router.delete('/:id', protect, adminOnly, [idParam, validate], asyncHandler(async (req, res) => {
  const election = await Election.findById(req.params.id);
  if (!election) throw new ApiError(404, 'Election not found.');

  await Vote.deleteMany({ election: election._id });
  await Election.deleteOne({ _id: election._id });
  await destroyImages(election.candidates.map((c) => c.photoPublicId));

  res.json({ message: 'Election deleted.' });
}));

/* ------------------------------------------------------------------ *
 * Candidates
 * ------------------------------------------------------------------ */

// POST /api/elections/:id/apply - a member applies to stand
router.post('/:id/apply', protect, uploadImage.single('photo'), [
  idParam,
  body('position').isString().trim().notEmpty().withMessage('Choose the position you are running for.'),
  body('manifesto').isString().trim().isLength({ min: MIN_MANIFESTO, max: 2000 })
    .withMessage(`Your manifesto must be between ${MIN_MANIFESTO} and 2000 characters.`),
  validate
], asyncHandler(async (req, res) => {
  const election = await loadElection(req.params.id, { populate: false });
  if (!election.nominationsOpen()) throw new ApiError(400, 'Nominations for this election are closed.');

  const { position, manifesto } = req.body;
  if (!election.positions.includes(position)) throw new ApiError(400, 'That position is not part of this election.');

  const existing = election.candidates.find((c) => sameUser(c.user, req.user));
  if (existing && existing.status !== 'rejected') {
    throw new ApiError(409, existing.status === 'pending'
      ? 'You already have an application waiting for review.'
      : 'You are already a candidate in this election.');
  }

  const uploaded = req.file
    ? await uploadImageBuffer(req.file.buffer, { folder: PHOTO_FOLDER, preset: 'portrait' })
    : null;

  try {
    if (existing) {
      // A rejected applicant may correct and resubmit their application.
      const previousPhoto = uploaded ? existing.photoPublicId : null;
      Object.assign(existing, {
        position, manifesto, status: 'pending', nominatedBy: 'self',
        rejectionReason: '', reviewedBy: undefined, reviewedAt: undefined
      });
      if (uploaded) {
        existing.photo = uploaded.url;
        existing.photoPublicId = uploaded.publicId;
      }
      await election.save();
      if (previousPhoto) await destroyImage(previousPhoto);
    } else {
      // Conditional push, so two submissions sent together cannot both land.
      const result = await Election.updateOne(
        { _id: election._id, status: 'upcoming', 'candidates.user': { $ne: req.user._id } },
        {
          $push: {
            candidates: {
              user: req.user._id, position, manifesto, status: 'pending', nominatedBy: 'self',
              photo: uploaded?.url || '', photoPublicId: uploaded?.publicId || ''
            }
          }
        },
        { runValidators: true }
      );
      if (!result.modifiedCount) throw new ApiError(409, 'You already have an application for this election.');
    }
  } catch (error) {
    if (uploaded) await destroyImage(uploaded.publicId);
    throw error;
  }

  await respondWithElection(res, election._id, req.user, {
    status: 201,
    message: 'Application submitted. An administrator will review it before nominations close.'
  });
}));

// POST /api/elections/:id/candidates - an admin adds a candidate directly
router.post('/:id/candidates', protect, adminOnly, uploadImage.single('photo'), [
  idParam,
  body('userId').isMongoId().withMessage('Choose a member.'),
  body('position').isString().trim().notEmpty().withMessage('Choose a position.'),
  body('manifesto').optional({ values: 'falsy' }).isString().trim().isLength({ max: 2000 }).withMessage('Manifesto must be 2000 characters or fewer.'),
  validate
], asyncHandler(async (req, res) => {
  const election = await loadElection(req.params.id, { populate: false });
  if (election.status !== 'upcoming') throw new ApiError(400, 'Candidates can only be added before voting starts.');
  if (!election.positions.includes(req.body.position)) throw new ApiError(400, 'That position is not part of this election.');

  const member = await User.findOne({ _id: req.body.userId, isActive: true }).select('_id').lean();
  if (!member) throw new ApiError(404, 'That member was not found or their account is deactivated.');

  const uploaded = req.file
    ? await uploadImageBuffer(req.file.buffer, { folder: PHOTO_FOLDER, preset: 'portrait' })
    : null;

  const result = await Election.updateOne(
    { _id: election._id, 'candidates.user': { $ne: member._id } },
    {
      $push: {
        candidates: {
          user: member._id,
          position: req.body.position,
          manifesto: req.body.manifesto || '',
          photo: uploaded?.url || '',
          photoPublicId: uploaded?.publicId || '',
          status: 'approved',
          nominatedBy: 'admin',
          reviewedBy: req.user._id,
          reviewedAt: new Date()
        }
      }
    },
    { runValidators: true }
  ).catch(async (error) => {
    if (uploaded) await destroyImage(uploaded.publicId);
    throw error;
  });

  if (!result.modifiedCount) {
    if (uploaded) await destroyImage(uploaded.publicId);
    throw new ApiError(409, 'This member is already a candidate or applicant in this election.');
  }

  await respondWithElection(res, election._id, req.user, { status: 201, message: 'Candidate added to the ballot.' });
}));

// PUT /api/elections/:id/candidates/:candidateId/review - approve or reject
router.put('/:id/candidates/:candidateId/review', protect, adminOnly, [
  idParam,
  candidateParam,
  body('status').isIn(['approved', 'rejected']).withMessage('Choose approve or reject.'),
  body('rejectionReason').if(body('status').equals('rejected'))
    .isString().trim().isLength({ min: 5, max: 500 }).withMessage('Give the applicant a reason of 5 to 500 characters.'),
  validate
], asyncHandler(async (req, res) => {
  const election = await loadElection(req.params.id, { populate: false });
  if (election.status !== 'upcoming') throw new ApiError(400, 'Applications can only be reviewed before voting starts.');

  const candidate = election.candidates.id(req.params.candidateId);
  if (!candidate) throw new ApiError(404, 'Candidate not found.');
  if (sameUser(candidate.user, req.user)) throw new ApiError(403, 'You cannot review your own application.');

  const approved = req.body.status === 'approved';
  candidate.status = req.body.status;
  candidate.rejectionReason = approved ? '' : req.body.rejectionReason;
  candidate.reviewedBy = req.user._id;
  candidate.reviewedAt = new Date();
  await election.save();

  notify({
    title: approved ? `You're on the ballot for ${candidate.position}` : `Application not approved: ${candidate.position}`,
    message: approved
      ? `Your application to run for ${candidate.position} in "${election.title}" has been approved. Voting opens ${formatWhen(election.startDate)}.`
      : `Your application to run for ${candidate.position} in "${election.title}" was not approved. Reason: ${candidate.rejectionReason}${election.nominationsOpen() ? ' You can update your application and resubmit it until nominations close.' : ''}`,
    target: 'specific',
    targetUsers: [candidate.user],
    createdBy: req.user._id
  });

  await respondWithElection(res, election._id, req.user, {
    message: approved ? 'Application approved.' : 'Application rejected. The applicant has been told why.'
  });
}));

// PUT /api/elections/:id/candidates/:candidateId - edit a candidacy
router.put('/:id/candidates/:candidateId', protect, uploadImage.single('photo'), [
  idParam,
  candidateParam,
  body('position').optional().isString().trim().notEmpty().withMessage('Choose a position.'),
  body('manifesto').optional().isString().trim().isLength({ max: 2000 }).withMessage('Manifesto must be 2000 characters or fewer.'),
  validate
], asyncHandler(async (req, res) => {
  const election = await loadElection(req.params.id, { populate: false });
  if (election.status !== 'upcoming') throw new ApiError(400, 'Candidates cannot be changed once voting has started.');

  const candidate = election.candidates.id(req.params.candidateId);
  if (!candidate) throw new ApiError(404, 'Candidate not found.');

  const reviewer = isReviewer(req.user);
  if (!reviewer) {
    if (!sameUser(candidate.user, req.user)) throw new ApiError(403, 'You can only edit your own application.');
    if (candidate.status !== 'pending' || !election.nominationsOpen()) {
      throw new ApiError(400, 'You can only edit your application while it is waiting for review and nominations are open.');
    }
    if (req.body.manifesto !== undefined && req.body.manifesto.length < MIN_MANIFESTO) {
      throw new ApiError(400, `Your manifesto must be at least ${MIN_MANIFESTO} characters.`);
    }
  }

  if (req.body.position !== undefined) {
    if (!election.positions.includes(req.body.position)) throw new ApiError(400, 'That position is not part of this election.');
    candidate.position = req.body.position;
  }
  if (req.body.manifesto !== undefined) candidate.manifesto = req.body.manifesto;

  let previousPhoto = null;
  let uploaded = null;
  if (req.file) {
    uploaded = await uploadImageBuffer(req.file.buffer, { folder: PHOTO_FOLDER, preset: 'portrait' });
    previousPhoto = candidate.photoPublicId;
    candidate.photo = uploaded.url;
    candidate.photoPublicId = uploaded.publicId;
  }

  try {
    await election.save();
  } catch (error) {
    if (uploaded) await destroyImage(uploaded.publicId);
    throw error;
  }
  if (previousPhoto) await destroyImage(previousPhoto);

  await respondWithElection(res, election._id, req.user, { message: 'Candidate details saved.' });
}));

// DELETE /api/elections/:id/candidates/:candidateId - withdraw or remove
router.delete('/:id/candidates/:candidateId', protect, [idParam, candidateParam, validate], asyncHandler(async (req, res) => {
  const election = await loadElection(req.params.id, { populate: false });

  const candidate = election.candidates.id(req.params.candidateId);
  if (!candidate) throw new ApiError(404, 'Candidate not found.');

  const owner = sameUser(candidate.user, req.user);
  const reviewer = isReviewer(req.user);
  if (!owner && !reviewer) throw new ApiError(403, 'You can only withdraw your own application.');

  // Once voting starts, removing a candidate would discard votes already cast.
  if (election.status !== 'upcoming') throw new ApiError(400, 'Candidates cannot be removed once voting has started.');

  const photo = candidate.photoPublicId;
  election.candidates.pull(candidate._id);
  await election.save();
  await destroyImage(photo);

  await respondWithElection(res, election._id, req.user, {
    message: owner && !reviewer ? 'Your application has been withdrawn.' : 'Candidate removed.'
  });
}));

/* ------------------------------------------------------------------ *
 * Voting
 * ------------------------------------------------------------------ */

// POST /api/elections/:id/vote/:candidateId
router.post('/:id/vote/:candidateId', protect, [idParam, candidateParam, validate], asyncHandler(async (req, res) => {
  const election = await loadElection(req.params.id, { populate: false });
  if (election.status !== 'active') throw new ApiError(400, 'Voting is not open for this election.');

  const candidate = election.candidates.id(req.params.candidateId);
  if (!candidate || candidate.status !== 'approved') throw new ApiError(404, 'That candidate is not on the ballot.');

  const alreadyVoted = () => new ApiError(409, `You have already voted for ${candidate.position}.`);

  const legacyVote = election.candidates.some((c) => c.position === candidate.position
    && (c.votes || []).some((v) => String(v) === String(req.user._id)));
  if (legacyVote) throw alreadyVoted();

  try {
    // The unique index on (election, position, voter) is what actually
    // prevents a second vote, including two requests that arrive together.
    await Vote.create({
      election: election._id,
      position: candidate.position,
      candidate: candidate._id,
      voter: req.user._id
    });
  } catch (error) {
    if (error.code === 11000) throw alreadyVoted();
    throw error;
  }

  res.status(201).json({
    message: `Your vote for ${candidate.position} has been recorded.`,
    position: candidate.position,
    candidateId: String(candidate._id)
  });
}));

module.exports = router;
