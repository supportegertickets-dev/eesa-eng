const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  position: { type: String, required: true, trim: true },
  manifesto: { type: String, maxlength: 2000 },
  photo: { type: String, default: '' },
  photoPublicId: { type: String, default: '' },
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { _id: true });

const electionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Election title is required'],
    trim: true,
    maxlength: 200
  },
  description: { type: String, maxlength: 2000 },
  positions: [{ type: String, trim: true }],
  candidates: [candidateSchema],
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed'],
    default: 'upcoming'
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Election', electionSchema);
