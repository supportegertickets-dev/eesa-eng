const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token invalid' });
    }
  } else {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const LEADERSHIP_ROLES = ['admin', 'chairperson', 'vice_chairperson', 'organizing_secretary', 'secretary_general', 'publicity_manager', '1st_cohort_rep', 'treasurer'];
const POWER_ROLES = ['admin', 'chairperson'];

const adminOnly = (req, res, next) => {
  if (req.user && POWER_ROLES.includes(req.user.role)) {
    next();
  } else {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
};

const leadershipOnly = (req, res, next) => {
  if (req.user && LEADERSHIP_ROLES.includes(req.user.role)) {
    next();
  } else {
    return res.status(403).json({ message: 'Access denied. Leadership only.' });
  }
};

module.exports = { protect, adminOnly, leadershipOnly, LEADERSHIP_ROLES, POWER_ROLES };
