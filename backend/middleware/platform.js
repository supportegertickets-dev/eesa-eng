const { resolveUser, readToken } = require('./auth');
const { ROLES } = require('../utils/roles');
const { getPlatformSettings, effectiveState, isFeatureDisabled } = require('../utils/platform');
const { featureForRequest } = require('../utils/platformFeatures');

/**
 * The kill switch, applied to every request below /api before any route.
 *
 * - maintenance: every request is refused with 503, except a superadmin's.
 * - read_only:   reads work; changes are refused, except a superadmin's.
 * - a switched-off feature: its requests are refused, except a superadmin's.
 *
 * Mount with `app.use('/api', platformGate)`; paths below are relative to /api.
 * Patterns are case-insensitive and allow a trailing slash, as Express does.
 */

const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const ID = '[a-f0-9]{24}';

// Reachable in every mode.
const ALWAYS_OPEN = [
  { method: 'GET', path: /^\/health\/?$/i },
  { method: 'GET', path: /^\/platform\/status\/?$/i },
  // A superadmin must be able to sign in during maintenance. The route turns
  // everyone else away, after checking the password.
  { method: 'POST', path: /^\/auth\/login\/?$/i },
  // Safaricom reporting a payment already taken from someone's phone. Refusing
  // it would lose the record of money received.
  { method: 'POST', path: /^\/payments\/mpesa\/callback\/?$/i }
];

// Writes that are side effects of reading, allowed in read-only mode so
// opening a notification or a file does not show an error.
const READ_ONLY_OPEN = [
  { method: 'PUT', path: new RegExp(`^/notifications/(${ID}/read|read-all)/?$`, 'i') },
  { method: 'PUT', path: new RegExp(`^/resources/${ID}/download/?$`, 'i') }
];

const matches = (rules, req) => rules.some((rule) => (rule.method === req.method || (rule.method === 'GET' && req.method === 'HEAD'))
  && rule.path.test(req.path));

/** Whether the request carries a valid superadmin session. */
const isSuperadminRequest = async (req) => {
  const token = readToken(req);
  if (!token) return false;
  try {
    const { user } = await resolveUser(token);
    return user?.role === ROLES.SUPERADMIN;
  } catch {
    return false;
  }
};

const platformGate = async (req, res, next) => {
  try {
    if (req.method === 'OPTIONS' || matches(ALWAYS_OPEN, req)) return next();

    const settings = await getPlatformSettings();
    const state = effectiveState(settings);
    const feature = featureForRequest(req.method, req.path);

    const maintenance = state.mode === 'maintenance';
    const readOnly = state.mode === 'read_only' && !READ_METHODS.includes(req.method) && !matches(READ_ONLY_OPEN, req);
    const switchedOff = feature && isFeatureDisabled(settings, feature.key) ? feature : null;
    if (!maintenance && !readOnly && !switchedOff) return next();

    // Only now is it worth a database read to learn who is asking.
    if (await isSuperadminRequest(req)) return next();

    // Not a fault: keeps these out of the recent-errors list on the health page.
    res.locals.platformBlocked = true;
    res.set('Cache-Control', 'no-store');

    if (maintenance) {
      const seconds = state.expectedBackAt ? Math.ceil((new Date(state.expectedBackAt) - Date.now()) / 1000) : 0;
      if (seconds > 0) res.set('Retry-After', String(seconds));
      return res.status(503).json({ message: state.message, code: 'maintenance', expectedBackAt: state.expectedBackAt });
    }
    if (readOnly) {
      return res.status(503).json({ message: state.message, code: 'read_only' });
    }
    return res.status(503).json({ message: switchedOff.message, code: 'feature_disabled', feature: switchedOff.key });
  } catch (error) {
    return next(error);
  }
};

module.exports = { platformGate };
