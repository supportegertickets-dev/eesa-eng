/**
 * Wrap an async Express handler so a rejected promise reaches the central error
 * middleware instead of hanging the request.
 *
 * Express 4 does not catch rejections from async handlers; without this each
 * route needs its own try/catch, which is how several routes ended up
 * swallowing the underlying error and returning a bare 500.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * An error carrying an HTTP status, so handlers can `throw new ApiError(404, ...)`
 * and let the central handler decide how to render it.
 */
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (details) this.details = details;
  }
}

module.exports = { asyncHandler, ApiError };
