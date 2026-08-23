const express = require('express');
const User = require('../models/User');
const Event = require('../models/Event');
const News = require('../models/News');
const Project = require('../models/Project');
const Payment = require('../models/Payment');
const Resource = require('../models/Resource');
const Election = require('../models/Election');
const Contact = require('../models/Contact');
const Notification = require('../models/Notification');
const { protect, adminRoleOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/overview', protect, adminRoleOnly, async (req, res) => {
  try {
    const [
      totalMembers, activeMembers, pendingPayments, pendingResources, unreadMessages,
      events, publishedNews, activeProjects, activeElections, recentUsers,
      recentPayments, recentResources, recentContacts, recentNotifications
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Payment.countDocuments({ status: 'pending' }),
      Resource.countDocuments({ status: 'pending' }),
      Contact.countDocuments({ isRead: false }),
      Event.countDocuments({ status: { $in: ['upcoming', 'ongoing'] } }),
      News.countDocuments({ isPublished: true }),
      Project.countDocuments({ status: { $in: ['planning', 'in-progress'] } }),
      Election.countDocuments({ status: { $in: ['upcoming', 'active'] } }),
      User.find().select('firstName lastName email department role createdAt').sort({ createdAt: -1 }).limit(5).lean(),
      Payment.find().populate('user', 'firstName lastName').sort({ createdAt: -1 }).limit(5).lean(),
      Resource.find().populate('uploadedBy', 'firstName lastName').select('title unitCode folder status uploadedBy createdAt').sort({ createdAt: -1 }).limit(5).lean(),
      Contact.find().select('name email subject isRead createdAt').sort({ createdAt: -1 }).limit(5).lean(),
      Notification.find().select('title type target createdAt').sort({ createdAt: -1 }).limit(5).lean()
    ]);

    res.json({
      generatedAt: new Date(),
      metrics: { totalMembers, activeMembers, pendingPayments, pendingResources, unreadMessages, events, publishedNews, activeProjects, activeElections },
      recent: { users: recentUsers, payments: recentPayments, resources: recentResources, contacts: recentContacts, notifications: recentNotifications }
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ message: 'Server error loading admin overview' });
  }
});

module.exports = router;