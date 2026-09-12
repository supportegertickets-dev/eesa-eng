/**
 * Central password policy.
 *
 * Kept in one place so registration, reset and change-password all enforce the
 * same rules, and so the rules can be surfaced to the frontend verbatim.
 */

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

// Passwords seen constantly in credential-stuffing lists. Cheap to check and
// blocks the worst choices without pulling in a dictionary dependency.
const BLOCKLIST = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'letmein1', 'welcome1', 'admin123', 'iloveyou',
  'football', 'baseball', 'sunshine', 'princess', 'passw0rd', 'trustno1',
  'engineering', 'egerton123', 'eesa1234'
]);

const RULES_TEXT = `At least ${MIN_LENGTH} characters, including a letter and a number.`;

/**
 * Validate a candidate password.
 * @returns {{ valid: boolean, message?: string }}
 */
const validatePassword = (password) => {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password must be text.' };
  }
  if (password.length < MIN_LENGTH) {
    return { valid: false, message: `Password must be at least ${MIN_LENGTH} characters.` };
  }
  if (password.length > MAX_LENGTH) {
    return { valid: false, message: `Password must be ${MAX_LENGTH} characters or fewer.` };
  }
  if (!/[A-Za-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number.' };
  }
  if (BLOCKLIST.has(password.toLowerCase())) {
    return { valid: false, message: 'That password is too common. Choose something less predictable.' };
  }
  return { valid: true };
};

/**
 * express-validator custom validator. Throws with the policy message so the
 * client receives the specific rule that failed rather than a generic error.
 */
const passwordValidator = (value) => {
  const { valid, message } = validatePassword(value);
  if (!valid) throw new Error(message);
  return true;
};

module.exports = { validatePassword, passwordValidator, MIN_LENGTH, MAX_LENGTH, RULES_TEXT };
