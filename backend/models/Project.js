const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: [true, 'Project description is required'],
    maxlength: 5000
  },
  category: {
    type: String,
    enum: ['research', 'community', 'competition', 'innovation', 'other'],
    default: 'other'
  },
  status: {
    type: String,
    enum: ['planning', 'in-progress', 'completed', 'on-hold'],
    default: 'planning'
  },
  image: {
    type: String,
    default: ''
  },
  teamLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  teamMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  technologies: [{
    type: String,
    trim: true
  }],
  links: {
    github: String,
    demo: String,
    documentation: String
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Project', projectSchema);
