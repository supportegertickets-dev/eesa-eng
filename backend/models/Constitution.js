const mongoose = require('mongoose');

const MAX_SECTIONS = 150;

/**
 * One article (or chapter, or the preamble) of the constitution.
 * `body` is plain text: one paragraph or clause per line.
 */
const sectionSchema = new mongoose.Schema({
  number: { type: String, trim: true, maxlength: 20, default: '' },
  title: { type: String, trim: true, maxlength: 200, required: [true, 'Every article needs a title'] },
  body: { type: String, maxlength: 30000, default: '' }
});

/**
 * A version of the association's constitution.
 *
 * An administrator uploads the signed document; the browser reads it and splits
 * it into articles, which the administrator checks before publishing. The site
 * shows the current version as readable documentation, and the original file
 * stays available to download. Earlier versions are kept for reference.
 */
const constitutionSchema = new mongoose.Schema({
  title: { type: String, trim: true, maxlength: 200, default: 'Constitution of the Egerton Engineering Student Association' },
  version: { type: String, trim: true, required: [true, 'Version is required'], maxlength: 30 },
  adoptedOn: { type: Date },
  summary: { type: String, trim: true, maxlength: 1000, default: '' },
  sections: {
    type: [sectionSchema],
    default: [],
    validate: {
      validator: (list) => list.length <= MAX_SECTIONS,
      message: `The constitution can have at most ${MAX_SECTIONS} articles.`
    }
  },
  file: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
    name: { type: String, default: '' },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: '' }
  },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  // Exactly one published version is current; the public page shows it.
  isCurrent: { type: Boolean, default: false },
  publishedAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

constitutionSchema.index({ isCurrent: 1 });
constitutionSchema.index({ status: 1, publishedAt: -1 });

module.exports = mongoose.model('Constitution', constitutionSchema);
module.exports.MAX_SECTIONS = MAX_SECTIONS;
