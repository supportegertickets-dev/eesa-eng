const mongoose = require('mongoose');

/**
 * A certificate the association has issued.
 *
 * Everything printed on it is copied here when it is issued: the name, the
 * office and dates or academic year, and the signatories with their signature
 * images. The certificate is drawn from this record every time it is viewed,
 * so later changes to a profile, a term or the signatories never alter one
 * already given out. An administrator corrects a mistake by editing it, which
 * keeps its number and QR code and is recorded in `edits`, or by revoking it
 * and issuing another.
 */
const CERTIFICATE_TYPES = ['leadership', 'membership'];
const CERTIFICATE_STATUSES = ['valid', 'revoked'];

// One correction: who made it, when, and each field's value before and after.
// Values are kept as text (dates as ISO strings) so the log reads the same
// however the field is stored.
const editSchema = new mongoose.Schema({
  editedAt: { type: Date, default: Date.now },
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changes: [{
    _id: false,
    field: { type: String, required: true },
    from: { type: String, default: '' },
    to: { type: String, default: '' }
  }]
}, { _id: false });

const signatureSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  signatureUrl: { type: String, default: '' }
}, { _id: false });

const certificateSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: CERTIFICATE_TYPES, required: true },
  // Empty for a past leader without an account.
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recipientName: { type: String, required: true, trim: true },
  regNumber: { type: String, default: '' },
  department: { type: String, default: '' },

  // Leadership
  term: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadershipTerm' },
  office: { type: String, trim: true },
  startDate: Date,
  endDate: Date,

  // Membership: "2026/2027"
  academicYear: { type: String, trim: true },

  signatories: { type: [signatureSchema], default: [] },
  issuedAt: { type: Date, default: Date.now },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  edits: { type: [editSchema], default: [] },

  status: { type: String, enum: CERTIFICATE_STATUSES, default: 'valid' },
  revokedAt: Date,
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revokeReason: { type: String, trim: true, maxlength: 300 }
}, { timestamps: true });

// One valid certificate per term, and per member and academic year. Revoked
// ones stay on record, so a replacement can be issued alongside them.
certificateSchema.index(
  { term: 1 },
  { unique: true, partialFilterExpression: { type: 'leadership', status: 'valid' } }
);
certificateSchema.index(
  { user: 1, academicYear: 1 },
  { unique: true, partialFilterExpression: { type: 'membership', status: 'valid' } }
);
certificateSchema.index({ user: 1, issuedAt: -1 });
certificateSchema.index({ type: 1, status: 1, issuedAt: -1 });

module.exports = mongoose.model('Certificate', certificateSchema);
module.exports.CERTIFICATE_TYPES = CERTIFICATE_TYPES;
module.exports.CERTIFICATE_STATUSES = CERTIFICATE_STATUSES;
