const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: [true, 'Event description is required'],
    maxlength: 5000
  },
  date: {
    type: Date,
    required: [true, 'Event date is required']
  },
  endDate: {
    type: Date
  },
  location: {
    type: String,
    required: [true, 'Event location is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['workshop', 'seminar', 'competition', 'social', 'trip', 'meeting', 'other'],
    default: 'other'
  },
  image: {
    type: String,
    default: ''
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attendees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  maxAttendees: {
    type: Number,
    default: 0
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
    default: 'upcoming'
  }
}, {
  timestamps: true
});

eventSchema.index({ date: 1, status: 1 });

module.exports = mongoose.model('Event', eventSchema);
