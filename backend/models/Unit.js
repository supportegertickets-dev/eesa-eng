const mongoose = require('mongoose');
const { UNIT_CODE_FORMAT, YEARS, SEMESTERS } = require('../utils/library');

/**
 * A course unit: the folder library files are filed under.
 *
 * Units used to be a list hard-coded in the backend, so adding or renaming one
 * needed a deploy. They are now data. Reviewers manage them from the portal, and
 * an upload that names an unknown unit creates one that stays unverified until a
 * reviewer approves a file in it.
 *
 * A unit with no year and semester is a service or elective unit and appears
 * under "Other units".
 */
const unitSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Unit code is required'],
    unique: true,
    trim: true,
    uppercase: true,
    match: [UNIT_CODE_FORMAT, 'Unit codes look like EEEN 481.']
  },
  name: {
    type: String,
    trim: true,
    maxlength: [150, 'Unit names can be at most 150 characters.'],
    default: ''
  },
  year: { type: Number, enum: { values: YEARS, message: 'Year must be between 1 and 5.' }, default: null },
  semester: { type: Number, enum: { values: SEMESTERS, message: 'Semester must be 1 or 2.' }, default: null },
  verified: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

unitSchema.index({ year: 1, semester: 1, code: 1 });

unitSchema.pre('validate', function (next) {
  if ((this.year == null) !== (this.semester == null)) {
    this.invalidate('semester', 'Set both the year and the semester, or neither.');
  }
  next();
});

module.exports = mongoose.model('Unit', unitSchema);
