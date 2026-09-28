const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    maxlength: 3000
  },
  // Partnership enquiries come from the Partner with us page and carry the
  // organisation's details.
  category: {
    type: String,
    enum: ['general', 'partnership'],
    default: 'general'
  },
  organization: {
    type: String,
    trim: true,
    maxlength: 150
  },
  phone: {
    type: String,
    trim: true,
    maxlength: 30
  },
  interest: {
    type: String,
    trim: true,
    maxlength: 60
  },
  isRead: {
    type: Boolean,
    default: false
  },
  repliedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Contact', contactSchema);
