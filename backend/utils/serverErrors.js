/**
 * The most recent server faults, kept in memory for the superadmin's health
 * page. They are lost on restart; the host's logs keep the full history.
 */

const MAX_ENTRIES = 50;
const recent = [];

/**
 * Middleware: note every response with a 5xx status once it has been sent.
 * Refusals from the kill switch are deliberate and are left out. The central
 * error handler leaves the error's message in res.locals.errorMessage.
 */
const trackServerErrors = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 500 || res.locals.platformBlocked) return;
    recent.unshift({
      at: new Date(),
      method: req.method,
      // Without the query string, which can carry search terms.
      path: (req.originalUrl || req.url || '').split('?')[0].slice(0, 200),
      status: res.statusCode,
      message: res.locals.errorMessage ? String(res.locals.errorMessage).slice(0, 300) : ''
    });
    if (recent.length > MAX_ENTRIES) recent.length = MAX_ENTRIES;
  });
  next();
};

const recentServerErrors = () => recent.map((entry) => ({ ...entry }));

module.exports = { trackServerErrors, recentServerErrors };
