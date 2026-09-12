/**
 * API smoke tests.
 *
 * These cover the authentication and authorisation rules that are easy to
 * regress and expensive to get wrong: password policy, brute-force lockout,
 * session invalidation, operator injection, and the privilege boundaries around
 * role changes.
 *
 * Run with:  npm test
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-32';
process.env.FRONTEND_URL = 'http://localhost:3000';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

let mongod;
let app;
let User;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  await mongoose.connect(process.env.MONGODB_URI);

  User = require('../models/User');

  // Build the express app without server.js, which would bind a port and run
  // its own connect/shutdown lifecycle.
  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/users', require('../routes/users'));
  app.use(notFound);
  app.use(errorHandler);
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const uniqueEmail = () => `u${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;

const registerUser = async (overrides = {}) => {
  const payload = {
    firstName: 'Test',
    lastName: 'User',
    email: uniqueEmail(),
    password: 'Str0ngPass1',
    ...overrides
  };
  const res = await request(app).post('/api/auth/register').send(payload);
  return { res, payload };
};

describe('password policy', () => {
  test('rejects a password under the minimum length', async () => {
    const { res } = await registerUser({ password: 'Ab1' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /at least 8 characters/);
  });

  test('rejects a password with no digit', async () => {
    const { res } = await registerUser({ password: 'abcdefghij' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /number/);
  });

  test('rejects a blocklisted password', async () => {
    const { res } = await registerUser({ password: 'password123' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /too common/);
  });

  test('accepts a compliant password', async () => {
    const { res } = await registerUser();
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
  });
});

describe('registration hygiene', () => {
  test('never returns the password hash', async () => {
    const { res } = await registerUser();
    assert.equal(res.status, 201);
    assert.equal(res.body.password, undefined);
  });

  test('stores names verbatim rather than HTML-escaped', async () => {
    const { res } = await registerUser({ firstName: "O'Brien", lastName: 'D<>' });
    assert.equal(res.status, 201);
    // The old .escape() sanitiser turned this into O&#x27;Brien.
    assert.equal(res.body.firstName, "O'Brien");
  });

  test('rejects a duplicate email with 409', async () => {
    const { payload } = await registerUser();
    const again = await request(app).post('/api/auth/register').send({ ...payload, username: undefined });
    assert.equal(again.status, 409);
  });
});

describe('login', () => {
  test('signs in with the correct password', async () => {
    const { payload } = await registerUser();
    const res = await request(app).post('/api/auth/login')
      .send({ identifier: payload.email, password: payload.password });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  test('rejects operator injection in the identifier', async () => {
    await registerUser();
    const res = await request(app).post('/api/auth/login')
      .send({ identifier: { $ne: null }, password: { $ne: null } });
    // The sanitiser empties the object and validation then rejects it; either
    // way it must not authenticate.
    assert.notEqual(res.status, 200);
    assert.equal(res.body.token, undefined);
  });

  test('locks the account after repeated failures', async () => {
    const { payload } = await registerUser();

    let lastStatus;
    for (let i = 0; i < 9; i += 1) {
      const res = await request(app).post('/api/auth/login')
        .send({ identifier: payload.email, password: 'WrongPass9' });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 429, 'expected the account to be locked out');

    // Even the correct password is refused while the lock holds.
    const correct = await request(app).post('/api/auth/login')
      .send({ identifier: payload.email, password: payload.password });
    assert.equal(correct.status, 429);
  });

  test('refuses a deactivated account', async () => {
    const { payload } = await registerUser();
    await User.updateOne({ email: payload.email }, { isActive: false });

    const res = await request(app).post('/api/auth/login')
      .send({ identifier: payload.email, password: payload.password });
    assert.equal(res.status, 403);
  });
});

describe('sessions', () => {
  test('changing a password invalidates existing tokens', async () => {
    const { res: reg, payload } = await registerUser();
    const oldToken = reg.body.token;

    const before = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    assert.equal(before.status, 200);

    const changed = await request(app).put('/api/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ currentPassword: payload.password, newPassword: 'An0therPass2' });
    assert.equal(changed.status, 200);

    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    assert.equal(after.status, 401, 'the old token should no longer work');

    // The response carries a replacement token so the current device stays in.
    const fresh = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${changed.body.token}`);
    assert.equal(fresh.status, 200);
  });

  test('a deactivated user cannot keep using a valid token', async () => {
    const { res: reg, payload } = await registerUser();
    const token = reg.body.token;

    await User.updateOne({ email: payload.email }, { isActive: false });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 403);
  });

  test('rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });
});

describe('authorisation', () => {
  test('the member directory requires a session', async () => {
    const res = await request(app).get('/api/users');
    assert.equal(res.status, 401);
  });

  test('a member cannot change roles', async () => {
    const { res: a } = await registerUser();
    const { res: b } = await registerUser();

    const res = await request(app).put(`/api/users/${b.body._id}/role`)
      .set('Authorization', `Bearer ${a.body.token}`)
      .send({ role: 'admin' });
    assert.equal(res.status, 403);
  });

  test('an admin cannot change their own role', async () => {
    const { res: reg, payload } = await registerUser();
    await User.updateOne({ email: payload.email }, { role: 'admin' });

    const res = await request(app).put(`/api/users/${reg.body._id}/role`)
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ role: 'member' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /your own role/i);
  });

  test('a chairperson cannot promote anyone to admin', async () => {
    const { res: chair, payload } = await registerUser();
    await User.updateOne({ email: payload.email }, { role: 'chairperson' });
    const { res: target } = await registerUser();

    const res = await request(app).put(`/api/users/${target.body._id}/role`)
      .set('Authorization', `Bearer ${chair.body.token}`)
      .send({ role: 'admin' });
    assert.equal(res.status, 403, 'only the admin role may grant admin');
  });
});

describe('search safety', () => {
  test('a regex metacharacter search does not error', async () => {
    const { res: reg } = await registerUser();
    const res = await request(app).get('/api/users?search=' + encodeURIComponent('(a+)+$'))
      .set('Authorization', `Bearer ${reg.body.token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
  });
});

describe('error shape', () => {
  test('an unknown route returns a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    assert.equal(res.status, 404);
    assert.ok(res.body.message);
  });

  test('a malformed id returns 400 rather than 500', async () => {
    const { res: reg, payload } = await registerUser();
    await User.updateOne({ email: payload.email }, { role: 'admin' });

    const res = await request(app).put('/api/users/not-an-id/role')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ role: 'member' });
    assert.equal(res.status, 400);
  });
});
