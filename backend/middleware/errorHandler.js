const multer = require('multer');

/**
 * Terminal 404 for unmatched API routes.
 */
const notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}`, code: 'not_found' });
};

/**
 * Central error handler.
 *
 * Previously every error became a bare 500 with no detail, so a file that was
 * merely too large, a duplicate email, or a malformed id all looked like a
 * server crash to the user. This maps the errors the app actually produces onto
 * accurate statuses and messages, while keeping internal details out of the
 * response in production.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // A response already in flight cannot be replaced; hand back to Express so it
  // closes the connection rather than throwing "headers already sent".
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code;
  let details;

  // Errors thrown by route handlers as `new ApiError(status, message)`.
  if (err.name === 'ApiError') {
    details = err.details;
  } else if (err instanceof multer.MulterError) {
    status = 400;
    code = err.code;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'That file is too large. Documents may be up to 20MB and images up to 5MB.'
      : err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT'
        ? 'Too many files, or a file was sent in an unexpected field.'
        : 'File upload failed.';
  } else if (err.message === 'File type not supported' || err.message === 'Only image files are allowed') {
    status = 400;
    message = err.message;
  } else if (err.name === 'ValidationError') {
    // Mongoose schema validation.
    status = 400;
    code = 'validation_failed';
    details = Object.fromEntries(Object.entries(err.errors || {}).map(([k, v]) => [k, v.message]));
    message = Object.values(details)[0] || 'Some fields are invalid.';
  } else if (err.name === 'CastError') {
    // A malformed ObjectId in the URL is a client mistake, not a server fault.
    status = 400;
    code = 'invalid_id';
    message = 'That identifier is not valid.';
  } else if (err.code === 11000) {
    status = 409;
    code = 'duplicate';
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    const labels = { email: 'email address', username: 'username', regNumber: 'registration number' };
    message = `That ${labels[field] || field || 'value'} is already in use.`;
  } else if (err.message === 'Not allowed by CORS') {
    status = 403;
    code = 'cors_blocked';
    message = 'Request blocked by CORS policy.';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    code = 'payload_too_large';
    message = 'That request is too large.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    code = 'invalid_json';
    message = 'The request body is not valid JSON.';
  }

  // Server-side faults are logged in full but never described to the client.
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ->`, err);
    if (process.env.NODE_ENV === 'production') {
      message = 'Something went wrong on our end. Please try again.';
      details = undefined;
    }
  }

  const payload = { message };
  if (code) payload.code = code;
  if (details) payload.errors = details;
  if (status >= 500 && process.env.NODE_ENV !== 'production') payload.stack = err.stack;

  res.status(status).json(payload);
};

module.exports = { notFound, errorHandler };
