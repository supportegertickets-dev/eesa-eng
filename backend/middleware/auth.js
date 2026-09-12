const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { advanceAcademicYears } = require('../utils/academicYear');
const { LEADERSHIP_ROLES, POWER_ROLES, ROLES } = require('../utils/roles');

/**
 * Resolve a bearer token to a user document.
 *
 * Returns a discriminated result rather than throwing so callers can decide
 * between rejecting (protect) and continuing anonymously (optionalAuth).
 */
const resolveUser = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    // Distinguish expiry from tampering so the client can silently refresh the
    // session instead of showing a scary error.
    if (error.name === 'TokenExpiredError') {
      return { error: 'token_expired', message: 'Your session has expired. Please sign in again.' };
    }
    return { error: 'token_invalid', message: 'Not authorized, token invalid' };
  }

  // The academic-year rollover is internally throttled to once an hour, so this
  // is a no-op on almost every request. It runs before the user is loaded so the
  // caller sees their current year of study.
  try {
    await advanceAcademicYears();
  } catch (rolloverError) {
    console.error('Academic year rollover failed:', rolloverError.message);
  }

  const user = await User.findById(decoded.id).select('-password');
  if (!user) {
    return { error: 'user_not_found', message: 'Account no longer exists.' };
  }

  // A deactivated account must not be able to keep using an already-issued
  // token. Previously this was only checked at login.
  if (!user.isActive) {
    return { error: 'account_disabled', message: 'This account has been deactivated.' };
  }

  // Any password change invalidates tokens minted under an earlier version, so
  // a reset genuinely signs out other devices. Tokens issued before this claim
  // existed carry no `pv`, which matches the default of 0 for accounts that have
  // never changed their password.
  const tokenVersion = decoded.pv || 0;
  if ((user.passwordVersion || 0) !== tokenVersion) {
    return { error: 'token_stale', message: 'Your password was changed. Please sign in again.' };
  }

  return { user };
};

const readToken = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    return token || null;
  }
  return null;
};

/** Require a valid session. */
const protect = async (req, res, next) => {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token', code: 'no_token' });
  }

  try {
    const { user, error, message } = await resolveUser(token);
    if (error) {
      const status = error === 'account_disabled' ? 403 : 401;
      return res.status(status).json({ message, code: error });
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Attach `req.user` when a valid token is present, but never reject.
 * Lets public endpoints personalise a response without a second request.
 */
const optionalAuth = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return next();

  try {
    const { user } = await resolveUser(token);
    if (user) req.user = user;
  } catch {
    // Anonymous access is the fallback; a broken token is not an error here.
  }
  return next();
};

/** Build a middleware that allows only the listed roles. */
const requireRole = (roles, label) => (req, res, next) => {
  if (req.user && roles.includes(req.user.role)) return next();
  return res.status(403).json({ message: `Access denied. ${label} only.`, code: 'forbidden' });
};

/** Admins and the chairperson: approvals, verification, member management. */
const adminOnly = requireRole(POWER_ROLES, 'Administrators');

/** The admin role alone: role changes, destructive operations. */
const adminRoleOnly = requireRole([ROLES.ADMIN], 'Admin role');

/** Any elected or appointed office holder: content management. */
const leadershipOnly = requireRole(LEADERSHIP_ROLES, 'Leadership');

module.exports = {
  protect, optionalAuth, adminOnly, adminRoleOnly, leadershipOnly, requireRole,
  LEADERSHIP_ROLES, POWER_ROLES
};
