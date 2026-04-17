const express = require('express');
const { body, validationResult } = require('express-validator');
const Project = require('../models/Project');
const { protect, leadershipOnly, POWER_ROLES } = require('../middleware/auth');
const { sendEmailToMembers } = require('../utils/email');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/projects
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const category = req.query.category;

    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .populate('teamLead', 'firstName lastName avatar')
        .populate('teamMembers', 'firstName lastName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Project.countDocuments(filter)
    ]);

    res.json({
      projects,
      page,
      totalPages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching projects' });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('teamLead', 'firstName lastName avatar bio')
      .populate('teamMembers', 'firstName lastName avatar');

    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching project' });
  }
});

// POST /api/projects
router.post('/', protect, leadershipOnly, [
  body('title').trim().notEmpty().withMessage('Title is required').escape(),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category').optional().isIn(['research', 'community', 'competition', 'innovation', 'other']),
  body('status').optional().isIn(['planning', 'in-progress', 'completed', 'on-hold']),
  validate
], async (req, res) => {
  try {
    const project = await Project.create({
      ...req.body,
      teamLead: req.user._id
    });

    await project.populate('teamLead', 'firstName lastName');

    if (POWER_ROLES.includes(req.user.role)) {
      const subject = `New EESA project: ${project.title}`;
      const htmlContent = `
        <h2>New project added by ${req.user.firstName} ${req.user.lastName}</h2>
        <p><strong>${project.title}</strong></p>
        <p>${project.description || ''}</p>
        <p>Visit the EESA portal to learn more and join the project.</p>
      `;
      sendEmailToMembers(subject, htmlContent).catch(err => console.error('Notification email failed:', err));
    }

    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating project' });
  }
});

// PUT /api/projects/:id
router.put('/:id', protect, leadershipOnly, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const allowedFields = ['title', 'description', 'category', 'status', 'image', 'technologies', 'links', 'startDate', 'endDate'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const updated = await Project.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true
    }).populate('teamLead', 'firstName lastName');

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating project' });
  }
});

// POST /api/projects/:id/join - Member: join project
router.post('/:id/join', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const isMember = project.teamMembers.includes(req.user._id);
    if (isMember) {
      project.teamMembers = project.teamMembers.filter(id => id.toString() !== req.user._id.toString());
      await project.save();
      return res.json({ message: 'Left project', joined: false });
    }

    project.teamMembers.push(req.user._id);
    await project.save();
    res.json({ message: 'Joined project', joined: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error processing request' });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', protect, leadershipOnly, async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json({ message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting project' });
  }
});

module.exports = router;
