const mongoose = require('mongoose');
const { OFFICE_ROLES } = require('../utils/roles');

/**
 * A period someone held an office in the association.
 *
 * Terms are what leadership certificates are issued from. They come from three
 * places:
 *  recorded  an administrator gave a member an office role; the term opens then
 *            and closes when the role is taken away
 *  existing  the member already held the office when terms began to be
 *            recorded, so the start date is unknown until someone enters it
 *  manual    added by hand, usually for a leader from before the platform, who
 *            may not have an account
 *
 * `endDate` is empty while the office is still held.
 */
const TERM_SOURCES = ['recorded', 'existing', 'manual'];

const leadershipTermSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // The holder's name when the term was created, and the only name for someone without an account.
  name: { type: String, required: true, trim: true, maxlength: 100 },
  // The office role, for terms that follow role changes. Manual terms may name an office that is no longer a role.
  role: { type: String, enum: [...OFFICE_ROLES, null], default: null },
  office: { type: String, required: true, trim: true, maxlength: 80 },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  source: { type: String, enum: TERM_SOURCES, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

leadershipTermSchema.index({ user: 1, role: 1, endDate: 1 });
leadershipTermSchema.index({ endDate: -1, startDate: -1 });
// A holder found in office is given one term for it, however many times the list is loaded.
leadershipTermSchema.index({ user: 1, role: 1 }, { unique: true, partialFilterExpression: { source: 'existing' } });

leadershipTermSchema.pre('validate', function (next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'The term must end after it starts.');
  }
  next();
});

module.exports = mongoose.model('LeadershipTerm', leadershipTermSchema);
module.exports.TERM_SOURCES = TERM_SOURCES;
