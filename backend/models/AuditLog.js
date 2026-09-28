const mongoose = require('mongoose');

const CATEGORIES = ['platform', 'security', 'members', 'payments'];

/**
 * A record of a sensitive action: who did what, to what, and when. Written by
 * utils/audit.js and read by the superadmin. Entries are never edited.
 */
const auditLogSchema = new mongoose.Schema({
  // Dotted, category first: 'platform.mode', 'members.role', 'security.locked'.
  action: { type: String, required: true, trim: true, maxlength: 60 },
  category: { type: String, enum: CATEGORIES, required: true },
  summary: { type: String, required: true, trim: true, maxlength: 500 },

  // Empty for actions nobody signed in performed, such as a lockout or the
  // server script.
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: { type: String, trim: true, maxlength: 120 },
  actorRole: { type: String, trim: true, maxlength: 40 },

  // Deliberately not a reference to User. Account deletion refuses any account
  // that other records point to, so a reference here would mean a junk account
  // could never be deleted once it had been deactivated.
  targetType: { type: String, trim: true, maxlength: 40 },
  targetId: { type: mongoose.Schema.Types.ObjectId },
  targetLabel: { type: String, trim: true, maxlength: 200 },

  details: { type: mongoose.Schema.Types.Mixed },
  ip: { type: String, trim: true, maxlength: 64 },
  userAgent: { type: String, trim: true, maxlength: 200 }
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ targetId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.CATEGORIES = CATEGORIES;
