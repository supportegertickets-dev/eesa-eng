const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { ALL_ROLES, ROLES } = require('../utils/roles');
const { MIN_LENGTH } = require('../utils/password');

const DEPARTMENTS = [
  'Civil Engineering',
  'Mechanical Engineering',
  'Electrical Engineering',
  'Agricultural Engineering',
  'Industrial Technology',
  'Other'
];

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: 50
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: 50,
    // Usernames appear in URLs and mentions, so keep them to a predictable set.
    match: [/^[a-z0-9._-]+$/, 'Username may only contain letters, numbers, dots, underscores and hyphens']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: MIN_LENGTH,
    // Never ship the hash by default; routes that need it opt in with
    // `.select('+password')`. This closes the door on accidental leaks through
    // populate() or a forgotten projection.
    select: false
  },
  regNumber: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true
  },
  department: {
    type: String,
    enum: DEPARTMENTS,
    default: 'Other'
  },
  yearOfStudy: {
    type: Number,
    min: 1,
    max: 5,
    default: 1
  },
  academicStatus: {
    type: String,
    enum: ['student', 'alumni'],
    default: 'student'
  },
  academicYearStartedAt: {
    type: Date,
    default: Date.now
  },
  role: {
    type: String,
    enum: ALL_ROLES,
    default: ROLES.MEMBER
  },
  bio: {
    type: String,
    maxlength: 500,
    trim: true
  },
  avatar: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  membershipPaid: {
    type: Boolean,
    default: false
  },
  membershipExpiry: {
    type: Date
  },
  lastPaymentDate: {
    type: Date
  },
  lastLoginAt: {
    type: Date
  },
  // Shown to the member; not used for authorisation.
  passwordChangedAt: {
    type: Date
  },
  // Incremented on every password change. Tokens embed the version they were
  // minted under, so a change invalidates every older token exactly. A
  // timestamp cannot do this reliably: JWT `iat` has one-second granularity, so
  // a token issued in the same second as the change is indistinguishable from
  // one issued just before it.
  passwordVersion: {
    type: Number,
    default: 0
  },
  // Throttling state for failed sign-in attempts.
  failedLoginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lockedUntil: {
    type: Date,
    select: false
  },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for the queries the app actually runs: the member directory filters on
// isActive + department and sorts by creation date; the leaders list filters on
// role. Without these, every directory page is a collection scan.
userSchema.index({ isActive: 1, createdAt: -1 });
userSchema.index({ isActive: 1, department: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ academicStatus: 1, academicYearStartedAt: 1 });

userSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

userSchema.virtual('isLocked').get(function () {
  return Boolean(this.lockedUntil && this.lockedUntil > Date.now());
});

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
  return resetToken;
};

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);

  if (!this.isNew) {
    this.passwordChangedAt = new Date();
    this.passwordVersion = (this.passwordVersion || 0) + 1;
  }
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

// Strip sensitive fields from every serialised response, including nested
// populate() results.
userSchema.methods.toJSON = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.failedLoginAttempts;
  delete obj.lockedUntil;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
module.exports.DEPARTMENTS = DEPARTMENTS;
