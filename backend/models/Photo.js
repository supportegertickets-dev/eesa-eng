const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  url: { type: String, required: true },
  publicId: { type: String, default: '' },
  // Stored so galleries can reserve each photo's space before it loads.
  width: Number,
  height: Number,
  caption: { type: String, trim: true, maxlength: 500, default: '' },
  position: { type: Number, default: 0 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

photoSchema.index({ album: 1, position: 1, createdAt: 1 });

module.exports = mongoose.model('Photo', photoSchema);
