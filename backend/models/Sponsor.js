const mongoose = require('mongoose');

const sponsorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Sponsor name is required'],
    trim: true,
    maxlength: 200
  },
  logo: { type: String, default: '' },
  logoPublicId: { type: String, default: '' },
  website: { type: String, trim: true, default: '' },
  description: { type: String, maxlength: 1000 },
  tier: {
    type: String,
    enum: ['platinum', 'gold', 'silver', 'bronze', 'partner'],
    default: 'partner'
  },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Sponsor', sponsorSchema);
