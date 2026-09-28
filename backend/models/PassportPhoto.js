const mongoose = require('mongoose');

/**
 * A passport photo a member submitted for their membership card.
 *
 * Each upload is reviewed by an administrator. An approved photo is copied onto
 * the member's account and printed on the card; the one it replaces is marked
 * `replaced`. A member has at most one `pending` submission at a time.
 */
const PHOTO_STATUSES = ['pending', 'approved', 'rejected', 'replaced'];

const passportPhotoSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url: { type: String, required: true },
  publicId: { type: String, default: '' },
  status: { type: String, enum: PHOTO_STATUSES, default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  rejectionReason: { type: String, trim: true, maxlength: 300 }
}, { timestamps: true });

passportPhotoSchema.index({ status: 1, createdAt: 1 });
passportPhotoSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('PassportPhoto', passportPhotoSchema);
module.exports.PHOTO_STATUSES = PHOTO_STATUSES;
