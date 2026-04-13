const express = require('express');
const { body, validationResult } = require('express-validator');
const Election = require('../models/Election');
const { protect, adminOnly, leadershipOnly } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// GET /api/elections - list elections
router.get('/', async (req, res) => {
  try {
    const status = req.query.status;
    const filter = {};
    if (status) filter.status = status;

    const elections = await Election.find(filter)
      .populate('candidates.user', 'firstName lastName department avatar')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({ elections });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching elections' });
  }
});

// GET /api/elections/:id
router.get('/:id', async (req, res) => {
  try {
    const election = await Election.findById(req.params.id)
      .populate('candidates.user', 'firstName lastName department avatar yearOfStudy')
      .populate('createdBy', 'firstName lastName');

    if (!election) return res.status(404).json({ message: 'Election not found' });
    res.json(election);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/elections - create election (admin/leader)
router.post('/', protect, leadershipOnly, [
  body('title').trim().notEmpty().withMessage('Title is required').escape(),
  body('description').optional().trim().escape(),
  body('startDate').notEmpty().withMessage('Start date is required'),
  body('endDate').notEmpty().withMessage('End date is required'),
  body('positions').isArray({ min: 1 }).withMessage('At least one position is required'),
  validate
], async (req, res) => {
  try {
    const { title, description, positions, startDate, endDate } = req.body;
    const election = await Election.create({
      title, description, positions, startDate, endDate,
      createdBy: req.user._id
    });
    res.status(201).json(election);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating election' });
  }
});

// PUT /api/elections/:id - update election
router.put('/:id', protect, leadershipOnly, async (req, res) => {
  try {
    const updates = {};
    const allowed = ['title', 'description', 'positions', 'status', 'startDate', 'endDate'];
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const election = await Election.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('candidates.user', 'firstName lastName department avatar');

    if (!election) return res.status(404).json({ message: 'Election not found' });
    res.json(election);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating election' });
  }
});

// POST /api/elections/:id/candidates - register as candidate
router.post('/:id/candidates', protect, uploadImage.single('photo'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ message: 'Election not found' });
    if (election.status !== 'upcoming') {
      return res.status(400).json({ message: 'Can only register for upcoming elections' });
    }

    const alreadyCandidate = election.candidates.some(
      c => c.user.toString() === req.user._id.toString()
    );
    if (alreadyCandidate) {
      return res.status(400).json({ message: 'Already registered as a candidate' });
    }

    let photo = '';
    let photoPublicId = '';
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'eesa/elections', transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }] },
          (error, result) => { if (error) reject(error); else resolve(result); }
        );
        stream.end(req.file.buffer);
      });
      photo = result.secure_url;
      photoPublicId = result.public_id;
    }

    election.candidates.push({
      user: req.user._id,
      position: req.body.position,
      manifesto: req.body.manifesto || '',
      photo,
      photoPublicId
    });

    await election.save();

    const populated = await Election.findById(election._id)
      .populate('candidates.user', 'firstName lastName department avatar');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error registering candidate' });
  }
});

// POST /api/elections/:id/vote/:candidateId - vote
router.post('/:id/vote/:candidateId', protect, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ message: 'Election not found' });
    if (election.status !== 'active') {
      return res.status(400).json({ message: 'Election is not currently active' });
    }

    const candidate = election.candidates.id(req.params.candidateId);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    // Check if user already voted for any candidate in the same position
    const samePositionCandidates = election.candidates.filter(
      c => c.position === candidate.position
    );
    const alreadyVoted = samePositionCandidates.some(
      c => c.votes.some(v => v.toString() === req.user._id.toString())
    );
    if (alreadyVoted) {
      return res.status(400).json({ message: 'Already voted for this position' });
    }

    candidate.votes.push(req.user._id);
    await election.save();

    res.json({ message: 'Vote cast successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error casting vote' });
  }
});

// GET /api/elections/:id/results
router.get('/:id/results', async (req, res) => {
  try {
    const election = await Election.findById(req.params.id)
      .populate('candidates.user', 'firstName lastName department avatar');

    if (!election) return res.status(404).json({ message: 'Election not found' });

    const results = {};
    election.positions.forEach(position => {
      const positionCandidates = election.candidates
        .filter(c => c.position === position)
        .map(c => ({
          _id: c._id,
          user: c.user,
          position: c.position,
          photo: c.photo,
          manifesto: c.manifesto,
          voteCount: c.votes.length
        }))
        .sort((a, b) => b.voteCount - a.voteCount);
      results[position] = positionCandidates;
    });

    res.json({ election: { title: election.title, status: election.status }, results });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching results' });
  }
});

// PUT /api/elections/:id/candidates/:candidateId - admin: update candidate (photo, manifesto, position)
router.put('/:id/candidates/:candidateId', protect, adminOnly, uploadImage.single('photo'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ message: 'Election not found' });

    const candidate = election.candidates.id(req.params.candidateId);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    if (req.file) {
      // Remove old photo from Cloudinary
      if (candidate.photoPublicId) {
        await cloudinary.uploader.destroy(candidate.photoPublicId).catch(() => {});
      }
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'eesa/elections', transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }] },
          (error, result) => { if (error) reject(error); else resolve(result); }
        );
        stream.end(req.file.buffer);
      });
      candidate.photo = result.secure_url;
      candidate.photoPublicId = result.public_id;
    }

    if (req.body.position) candidate.position = req.body.position;
    if (req.body.manifesto !== undefined) candidate.manifesto = req.body.manifesto;

    await election.save();

    const populated = await Election.findById(election._id)
      .populate('candidates.user', 'firstName lastName department avatar');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating candidate' });
  }
});

// DELETE /api/elections/:id/candidates/:candidateId - admin: remove candidate
router.delete('/:id/candidates/:candidateId', protect, adminOnly, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ message: 'Election not found' });

    const candidate = election.candidates.id(req.params.candidateId);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    // Remove photo from Cloudinary
    if (candidate.photoPublicId) {
      await cloudinary.uploader.destroy(candidate.photoPublicId).catch(() => {});
    }

    election.candidates.pull(req.params.candidateId);
    await election.save();

    res.json({ message: 'Candidate removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error removing candidate' });
  }
});

// DELETE /api/elections/:id
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ message: 'Election not found' });

    // Clean up Cloudinary images
    for (const candidate of election.candidates) {
      if (candidate.photoPublicId) {
        await cloudinary.uploader.destroy(candidate.photoPublicId).catch(() => {});
      }
    }

    await Election.findByIdAndDelete(req.params.id);
    res.json({ message: 'Election deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting election' });
  }
});

module.exports = router;
