const mongoose = require('mongoose');
const { RESOURCE_TYPES, YEARS, SEMESTERS } = require('../utils/library');

// Storage details only the server needs. They are stripped from every JSON
// response, so the authorised file endpoint is the only way to reach a file.
const PRIVATE_FIELDS = ['fileUrl', 'filePublicId', 'fileResourceType', 'fileDeliveryType', 'fileHash', 'downloadedBy'];

const resourceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: 200
  },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  // The document type, shown as the innermost folder: Year › Semester › Unit › Type.
  category: {
    type: String,
    enum: RESOURCE_TYPES,
    default: 'other'
  },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  // Copied from the unit so folders can be filtered and sorted without a join.
  // Kept in step by utils/libraryUnits.syncUnitResources whenever a unit changes.
  unitCode: { type: String, trim: true, uppercase: true },
  year: { type: Number, enum: YEARS, default: null },
  semester: { type: Number, enum: SEMESTERS, default: null },

  originalFileName: { type: String, trim: true },
  fileUrl: { type: String, default: '' },
  filePublicId: { type: String, default: '' },
  // Cloudinary addressing. Absent on uploads made before files were private;
  // utils/libraryStorage infers them from fileUrl in that case.
  fileResourceType: { type: String, enum: ['raw', 'image', 'video'] },
  fileDeliveryType: { type: String, enum: ['upload', 'authenticated', 'private'] },
  fileType: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  // SHA-256 of the file contents, used to refuse duplicate uploads.
  fileHash: { type: String },

  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  rejectionReason: { type: String, maxlength: 500 },

  // Distinct members who opened or downloaded the file. The counter used to rise
  // on every click, so a single member could inflate it without limit.
  downloads: { type: Number, default: 0 },
  downloadedBy: { type: [mongoose.Schema.Types.ObjectId], select: false, default: undefined }
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      PRIVATE_FIELDS.forEach((field) => delete ret[field]);
      delete ret.__v;
      return ret;
    }
  }
});

// Folder browsing, the review queue, "My uploads" and duplicate detection.
resourceSchema.index({ status: 1, year: 1, semester: 1, unitCode: 1, category: 1, createdAt: -1 });
resourceSchema.index({ unit: 1, status: 1, category: 1 });
resourceSchema.index({ status: 1, createdAt: -1 });
resourceSchema.index({ uploadedBy: 1, createdAt: -1 });
resourceSchema.index({ fileHash: 1 }, { sparse: true });

module.exports = mongoose.model('Resource', resourceSchema);
