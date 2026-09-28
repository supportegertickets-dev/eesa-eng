/**
 * Accounts for API tests.
 *
 * Registration leaves an account waiting for an administrator's approval and
 * issues no session. Tests register through the real endpoint, so its checks
 * stay exercised, then approve the account directly and sign a token for it.
 */
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');

let sequence = 0;

/** Names may not contain digits, so a sequence number is spelt in letters: 0 → "a", 27 → "bb". */
const letters = (n) => {
  let out = '';
  let rest = n;
  do {
    out = String.fromCharCode(97 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  } while (rest > 0);
  return out;
};

/** A valid engineering registration number no other test account has. */
const nextRegNumber = () => `B12/${String(sequence).padStart(5, '0')}/21`;

/**
 * Register and approve a member.
 * @returns {Promise<{ id: string, token: string, auth: object, name: string, regNumber: string, email: string }>}
 */
const registerApproved = async (app, fields = {}) => {
  sequence += 1;
  const payload = {
    firstName: 'Wanjiru',
    lastName: `Kamau ${letters(sequence).toUpperCase()}`,
    email: `member${sequence}-${Date.now()}@example.com`,
    password: 'Str0ngPass1',
    regNumber: nextRegNumber(),
    ...fields
  };
  const res = await request(app).post('/api/auth/register').send(payload);
  assert.equal(res.status, 201, res.body.message);

  const user = await mongoose.model('User').findOneAndUpdate(
    { email: payload.email.toLowerCase() },
    { isActive: true, $unset: { pendingApproval: 1 } },
    { new: true }
  );
  const token = jwt.sign({ id: user._id, pv: user.passwordVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });

  return {
    id: String(user._id),
    token,
    auth: { Authorization: `Bearer ${token}` },
    name: `${user.firstName} ${user.lastName}`,
    regNumber: user.regNumber,
    email: user.email
  };
};

module.exports = { registerApproved, letters };
