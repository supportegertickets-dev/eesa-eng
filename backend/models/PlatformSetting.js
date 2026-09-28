const mongoose = require('mongoose');
const { FEATURE_KEYS } = require('../utils/platformFeatures');

const MODES = ['normal', 'read_only', 'maintenance'];
const ANNOUNCEMENT_TONES = ['info', 'warning', 'critical'];

/**
 * The superadmin's controls for the whole platform. There is only ever one
 * document, keyed 'platform'; utils/platform.js reads it through a short cache.
 */
const platformSettingSchema = new mongoose.Schema({
  key: { type: String, default: 'platform', unique: true },

  // normal: everything works. read_only: people can browse and sign in, but
  // nothing can be changed. maintenance: nobody but a superadmin gets in.
  mode: { type: String, enum: MODES, default: 'normal' },
  message: { type: String, trim: true, maxlength: 500, default: '' },
  expectedBackAt: { type: Date },

  // Stored as the switched-off list, so a feature added later starts on.
  disabledFeatures: [{ type: String, enum: FEATURE_KEYS }],

  // Maintenance that starts and ends by itself.
  window: {
    startsAt: { type: Date },
    endsAt: { type: Date },
    message: { type: String, trim: true, maxlength: 500, default: '' }
  },

  // A site-wide banner.
  announcement: {
    message: { type: String, trim: true, maxlength: 300, default: '' },
    tone: { type: String, enum: ANNOUNCEMENT_TONES, default: 'info' },
    expiresAt: { type: Date }
  },

  // Sessions carry the epoch they were issued under. Raising it signs out
  // everyone signed in before, except superadmins.
  sessionEpoch: { type: Number, default: 0 },
  sessionsRevokedAt: { type: Date },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('PlatformSetting', platformSettingSchema);
module.exports.MODES = MODES;
module.exports.ANNOUNCEMENT_TONES = ANNOUNCEMENT_TONES;
