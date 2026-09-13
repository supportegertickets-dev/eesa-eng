const mongoose = require('mongoose');

const EVENT_CATEGORIES = ['workshop', 'seminar', 'competition', 'social', 'trip', 'meeting', 'other'];
const EVENT_STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'];
const MAX_EVENT_PHOTOS = 10;

const photoSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, default: '' },
  width: Number,
  height: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true, timestamps: { createdAt: true, updatedAt: false } });

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
    enum: EVENT_CATEGORIES,
    default: 'other'
  },
  // Cover image, shown on event cards and as the banner on the detail page.
  image: {
    type: String,
    default: ''
  },
  imagePublicId: {
    type: String,
    default: ''
  },
  // Additional photos, for example pictures added after the event.
  photos: {
    type: [photoSchema],
    default: [],
    validate: {
      validator: (photos) => photos.length <= MAX_EVENT_PHOTOS,
      message: `An event can have at most ${MAX_EVENT_PHOTOS} photos.`
    }
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
    default: 0,
    min: 0
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: EVENT_STATUSES,
    default: 'upcoming'
  }
}, {
  timestamps: true
});

eventSchema.index({ date: 1, status: 1 });
eventSchema.index({ isPublic: 1, date: -1 });

eventSchema.pre('validate', function (next) {
  if (this.endDate && this.date && this.endDate < this.date) {
    this.invalidate('endDate', 'The end time must be after the start time.');
  }
  next();
});

module.exports = mongoose.model('Event', eventSchema);
module.exports.EVENT_CATEGORIES = EVENT_CATEGORIES;
module.exports.EVENT_STATUSES = EVENT_STATUSES;
module.exports.MAX_EVENT_PHOTOS = MAX_EVENT_PHOTOS;
