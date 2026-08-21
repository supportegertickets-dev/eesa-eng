const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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
    trim: true,
    maxlength: 50
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
    minlength: 6
  },
  regNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  department: {
    type: String,
    enum: [
      'Civil Engineering',
      'Mechanical Engineering',
      'Electrical Engineering',
      'Agricultural Engineering',
      'Industrial Technology',
      'Other'
    ],
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
    enum: ['member', 'admin', 'chairperson', 'vice_chairperson', 'organizing_secretary', 'secretary_general', 'publicity_manager', 'project_manager', 'patron', '1st_cohort_rep', 'treasurer'],
    default: 'member'
  },
  bio: {
    type: String,
    maxlength: 500
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
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, {
  timestamps: true
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
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
