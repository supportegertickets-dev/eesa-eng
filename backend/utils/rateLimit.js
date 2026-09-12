const rateLimit = require('express-rate-limit');

/**
 * Rate-limiter factory.
 *
 * Wraps express-rate-limit so every limiter in the app shares the same header
 * behaviour and response shape, and so limiting can be switched off under test.
 * Without that escape hatch the suite exhausts the registration budget after a
 * handful of fixtures and every later assertion fails for the wrong reason.
 */
const createLimiter = ({ windowMs, max, message, skipSuccessfulRequests = false, skip }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: (req, res) => {
      if (process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true') return true;
      return skip ? skip(req, res) : false;
    },
    message: { message, code: 'rate_limited' }
  });

module.exports = { createLimiter };
