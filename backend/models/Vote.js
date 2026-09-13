const mongoose = require('mongoose');

/**
 * One ballot choice: a member's vote for one position in one election.
 *
 * Votes used to be pushed into an array on each candidate. That had two faults.
 * The arrays were returned by the public election endpoints, so anyone could see
 * exactly who voted for whom. And the "already voted?" check ran before the
 * write, so two requests sent together could both pass it and both be counted.
 *
 * Storing votes separately keeps them out of every election response, and the
 * unique index below makes a second vote for the same position impossible at
 * the database level, however the requests are timed.
 */
const voteSchema = new mongoose.Schema({
  election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
  position: { type: String, required: true, trim: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, required: true },
  voter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

voteSchema.index({ election: 1, position: 1, voter: 1 }, { unique: true });
voteSchema.index({ election: 1, candidate: 1 });

module.exports = mongoose.model('Vote', voteSchema);
