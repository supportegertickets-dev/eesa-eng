const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'News title is required'],
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: [true, 'News content is required'],
    maxlength: 10000
  },
  excerpt: {
    type: String,
    maxlength: 500
  },
  image: {
    type: String,
    default: ''
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: ['announcement', 'achievement', 'update', 'article', 'other'],
    default: 'announcement'
  },
  tags: [{
    type: String,
    trim: true
  }],
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date
  }
}, {
  timestamps: true
});

newsSchema.index({ isPublished: 1, publishedAt: -1 });

module.exports = mongoose.model('News', newsSchema);
