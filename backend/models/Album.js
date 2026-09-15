const mongoose = require('mongoose');

const GALLERY_CATEGORIES = ['events', 'projects', 'campus', 'workshops', 'competitions', 'social', 'other'];
const MAX_ALBUM_PHOTOS = 500;

/**
 * A gallery album. Photos live in their own collection (see Photo.js) so a
 * large album does not approach the document size limit, and uploads into the
 * same album from several leaders at once do not overwrite each other.
 *
 * `photoCount` and `cover` are summaries of that collection, kept here so the
 * album list renders from one query.
 */
const albumSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Album title is required'],
    trim: true,
    maxlength: 120
  },
  // URL name, e.g. "engineering-week-2026". Unique, and stable once created so
  // shared links keep working when the title is edited.
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  category: { type: String, enum: GALLERY_CATEGORIES, default: 'events' },
  // When the photos were taken, which orders the gallery; not when they were uploaded.
  date: { type: Date, default: Date.now },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },

  // The cover a leader chose. When unset, or when that photo is deleted, the
  // first photo in album order is used.
  coverPhoto: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', default: null },
  cover: {
    url: { type: String, default: '' },
    width: Number,
    height: Number
  },
  photoCount: { type: Number, default: 0, min: 0 },
  // Next free position. Incremented atomically so photos uploaded in parallel
  // still get distinct positions in the order they arrived.
  nextPosition: { type: Number, default: 0 },

  // When members were last emailed about new photos, so a batch produces one email.
  announcedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

albumSchema.index({ date: -1 });
albumSchema.index({ category: 1, date: -1 });
albumSchema.index({ event: 1 });

albumSchema.methods.toJSON = function toJSON() {
  const album = this.toObject();
  delete album.nextPosition;
  delete album.__v;
  return album;
};

module.exports = mongoose.model('Album', albumSchema);
module.exports.GALLERY_CATEGORIES = GALLERY_CATEGORIES;
module.exports.MAX_ALBUM_PHOTOS = MAX_ALBUM_PHOTOS;
