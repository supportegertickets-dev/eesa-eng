/**
 * Shared input-sanitisation helpers.
 *
 * These guard the two injection paths that reach MongoDB from user input:
 *  - operator injection, where a JSON body supplies `{ "$ne": null }` in place
 *    of a scalar and changes the shape of a query;
 *  - regular-expression injection, where a search term containing regex
 *    metacharacters is interpolated straight into `$regex`, which at best
 *    returns wrong results and at worst causes catastrophic backtracking.
 */

const FORBIDDEN_KEY = /^\$|\./;

/**
 * Recursively strip keys that Mongo treats as operators (`$...`) or as dotted
 * paths. Mutates in place and returns the number of keys removed so callers can
 * log suspicious traffic.
 */
const stripOperators = (value, removed = { count: 0 }) => {
  if (Array.isArray(value)) {
    value.forEach((entry) => stripOperators(entry, removed));
    return removed.count;
  }

  if (value === null || typeof value !== 'object') return removed.count;

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      delete value[key];
      removed.count += 1;
      continue;
    }
    stripOperators(value[key], removed);
  }

  return removed.count;
};

/**
 * Express middleware. Sanitises body, query and route params.
 *
 * `req.query` is a getter-only property on Express 5 and a plain object on
 * Express 4, so it is mutated in place rather than reassigned.
 */
const mongoSanitize = (req, res, next) => {
  let removed = 0;
  for (const source of [req.body, req.query, req.params]) {
    if (source) removed += stripOperators(source);
  }
  if (removed > 0) {
    console.warn(`Sanitised ${removed} illegal key(s) from ${req.method} ${req.originalUrl}`);
  }
  next();
};

/**
 * Escape regex metacharacters so a user-supplied search term is matched
 * literally. Always use this before building a `$regex` filter.
 */
const escapeRegex = (input = '') => String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a safe case-insensitive "contains" filter from a user search term.
 * Returns null when the term is empty so callers can skip the filter entirely.
 * The term is capped to keep pathological inputs out of the query planner.
 */
const buildSearchRegex = (term, maxLength = 80) => {
  const trimmed = String(term || '').trim().slice(0, maxLength);
  if (!trimmed) return null;
  return { $regex: escapeRegex(trimmed), $options: 'i' };
};

module.exports = { mongoSanitize, escapeRegex, buildSearchRegex, stripOperators };
