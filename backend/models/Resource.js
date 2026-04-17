const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: 200
  },
  description: { type: String, maxlength: 1000 },
  category: {
    type: String,
    enum: ['notes', 'past-papers', 'textbooks', 'tutorials', 'lab-reports', 'other'],
    default: 'other'
  },
  department: {
    type: String,
    enum: [
      'All', 'Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering',
      'Agricultural Engineering', 'General', 'Other'
    ],
    default: 'General'
  },
  year: {
    type: Number,
    min: 1,
    max: 5,
  },
  fileUrl: { type: String, required: true },
  filePublicId: { type: String, default: '' },
  fileType: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  rejectionReason: { type: String, maxlength: 500 },
  downloads: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Resource', resourceSchema);
