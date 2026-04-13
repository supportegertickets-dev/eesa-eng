const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    maxlength: 2000
  },
  type: {
    type: String,
    enum: ['general', 'event', 'payment', 'election', 'resource', 'announcement'],
    default: 'general'
  },
  target: {
    type: String,
    enum: ['all', 'members', 'leaders', 'specific'],
    default: 'all'
  },
  targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
