const { validationResult } = require('express-validator');

/**
 * Turn express-validator failures into one consistent response shape.
 *
 * Routes previously returned a bare `errors` array, which the frontend could not
 * render, so validation failures surfaced as "Something went wrong". This sends
 * a readable top-level `message` plus per-field detail the forms can use to mark
 * the offending input.
 */
const validate = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array();
  const fieldErrors = {};
  for (const error of errors) {
    const field = error.path || error.param;
    // Keep the first error per field: it is the most specific rule that failed.
    if (field && !fieldErrors[field]) fieldErrors[field] = error.msg;
  }

  res.status(400).json({
    message: errors[0].msg,
    code: 'validation_failed',
    errors: fieldErrors
  });
};

module.exports = { validate };
