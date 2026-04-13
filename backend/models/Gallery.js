const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: 200
  },
  description: { type: String, maxlength: 500 },
  imageUrl: { type: String, required: true },
  imagePublicId: { type: String, default: '' },
  category: {
    type: String,
    enum: ['events', 'projects', 'campus', 'workshops', 'competitions', 'social', 'other'],
    default: 'other'
  },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Gallery', gallerySchema);
