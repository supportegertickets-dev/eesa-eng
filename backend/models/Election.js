const mongoose = require('mongoose');

const ELECTION_STATUSES = ['upcoming', 'active', 'completed'];
const CANDIDATE_STATUSES = ['pending', 'approved', 'rejected'];

const candidateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  position: { type: String, required: true, trim: true },
  manifesto: { type: String, maxlength: 2000, default: '' },
  photo: { type: String, default: '' },
  photoPublicId: { type: String, default: '' },
  // Candidates created before self-nomination existed were added by an admin,
  // so the default keeps them approved and on the ballot.
  status: { type: String, enum: CANDIDATE_STATUSES, default: 'approved' },
  nominatedBy: { type: String, enum: ['self', 'admin'], default: 'admin' },
  rejectionReason: { type: String, maxlength: 500, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  // Ballots cast before votes moved to the Vote collection. Read when counting
  // results of older elections; never written to, and never sent to clients.
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { _id: true, timestamps: true });

const electionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Election title is required'],
    trim: true,
    maxlength: 200
  },
  description: { type: String, maxlength: 2000, default: '' },
  positions: {
    type: [{ type: String, trim: true }],
    validate: { validator: (positions) => positions.length >= 1, message: 'At least one position is required.' }
  },
  candidates: [candidateSchema],
  status: {
    type: String,
    enum: ELECTION_STATUSES,
    default: 'upcoming'
  },
  // When applications stop being accepted. Defaults to the moment voting opens.
  nominationDeadline: Date,
  startDate: { type: Date, required: [true, 'Voting start time is required'] },
  endDate: { type: Date, required: [true, 'Voting end time is required'] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

electionSchema.index({ status: 1, startDate: 1, endDate: 1 });

electionSchema.pre('validate', function (next) {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    this.invalidate('endDate', 'Voting must close after it opens.');
  }
  if (this.nominationDeadline && this.startDate && this.nominationDeadline > this.startDate) {
    this.invalidate('nominationDeadline', 'Nominations must close before voting opens.');
  }
  const seen = new Set();
  for (const position of this.positions || []) {
    const key = position.toLowerCase();
    if (seen.has(key)) {
      this.invalidate('positions', `"${position}" is listed more than once.`);
      break;
    }
    seen.add(key);
  }
  next();
});

electionSchema.methods.nominationsCloseAt = function () {
  return this.nominationDeadline || this.startDate;
};

electionSchema.methods.nominationsOpen = function (now = new Date()) {
  return this.status === 'upcoming' && now < this.nominationsCloseAt();
};

/**
 * Move elections forward through their schedule: upcoming to active when
 * voting opens, and to completed when it closes.
 *
 * Status used to change only when an admin picked it from a dropdown, so an
 * election could keep accepting votes long after its end date. Transitions are
 * forward-only, so an election an admin opened or closed early is never pulled
 * back by its original dates.
 */
electionSchema.statics.syncStatuses = async function (now = new Date()) {
  await this.updateMany(
    { status: 'upcoming', startDate: { $lte: now }, endDate: { $gt: now } },
    { $set: { status: 'active' } }
  );
  await this.updateMany(
    { status: { $in: ['upcoming', 'active'] }, endDate: { $lte: now } },
    { $set: { status: 'completed' } }
  );
};

module.exports = mongoose.model('Election', electionSchema);
module.exports.ELECTION_STATUSES = ELECTION_STATUSES;
module.exports.CANDIDATE_STATUSES = CANDIDATE_STATUSES;
