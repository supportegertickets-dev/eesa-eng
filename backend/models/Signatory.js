const mongoose = require('mongoose');
const { CERTIFICATE_TYPES } = require('./Certificate');

/**
 * Someone whose signature is printed on certificates, such as the Chairperson
 * or the Patron. Each signs the certificate types listed in `certificateTypes`,
 * left to right in `order`.
 */
const MAX_SIGNATORIES_PER_TYPE = 3;

const signatorySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Enter the signatory\'s name.'], trim: true, maxlength: 80 },
  title: { type: String, required: [true, 'Enter the signatory\'s title.'], trim: true, maxlength: 80 },
  signatureUrl: { type: String, required: true },
  signaturePublicId: { type: String, default: '' },
  certificateTypes: {
    type: [{ type: String, enum: CERTIFICATE_TYPES }],
    default: () => [...CERTIFICATE_TYPES],
    validate: { validator: (types) => types.length > 0, message: 'Choose at least one kind of certificate.' }
  },
  order: { type: Number, default: 0 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

signatorySchema.index({ order: 1, createdAt: 1 });

module.exports = mongoose.model('Signatory', signatorySchema);
module.exports.MAX_SIGNATORIES_PER_TYPE = MAX_SIGNATORIES_PER_TYPE;
