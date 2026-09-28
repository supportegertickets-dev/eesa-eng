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
const { registerApproved } = require('./helpers');

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

let serial = 50000;
const uniqueRegNumber = () => `B24/${(serial += 1)}/25`;

/** Submit the registration form. The account it creates waits for approval. */
const registerUser = async (overrides = {}) => {
  const payload = {
    firstName: 'Achieng',
    lastName: 'Otieno',
    email: uniqueEmail(),
    password: 'Str0ngPass1',
    regNumber: uniqueRegNumber(),
    ...overrides
  };
  const res = await request(app).post('/api/auth/register').send(payload);
  return { res, payload };
};

/** A registered and approved member, with a session. */
const approvedUser = (fields) => registerApproved(app, fields);

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
    assert.equal(res.status, 201, res.body.message);
  });
});

describe('registration hygiene', () => {
  test('never returns the password hash', async () => {
    const { res } = await registerUser();
    assert.equal(res.status, 201);
    assert.equal(res.body.password, undefined);
  });

  test('stores names verbatim rather than HTML-escaped', async () => {
    const { res, payload } = await registerUser({ firstName: "O'Brien", lastName: 'Nyambura-Kamau' });
    assert.equal(res.status, 201, res.body.message);
    // The old .escape() sanitiser turned this into O&#x27;Brien.
    const stored = await User.findOne({ email: payload.email }).lean();
    assert.equal(stored.firstName, "O'Brien");
    assert.equal(stored.lastName, 'Nyambura-Kamau');
  });

  test('rejects a duplicate email with 409', async () => {
    const { payload } = await registerUser();
    const again = await request(app).post('/api/auth/register').send({ ...payload, username: undefined });
    assert.equal(again.status, 409);
  });
});

describe('sign-up checks', () => {
  test('turns away profanity, keyboard mashing and placeholder names', async () => {
    const junk = [
      ['Fuck', 'Fuck'],
      ['Uufgjkjghb', 'Kamau'],
      ['Wanjiru', 'Asdfgh'],
      ['Test', 'User'],
      ['Brian', 'Sh1t'],
      ['Mjinga', 'Otieno'],
      ['F u c k', 'Kamau'],
      ['John3', 'Kamau']
    ];
    for (const [firstName, lastName] of junk) {
      const { res } = await registerUser({ firstName, lastName });
      assert.equal(res.status, 400, `${firstName} ${lastName} should be refused`);
    }
  });

  test('refuses the same name typed twice', async () => {
    const { res } = await registerUser({ firstName: 'Wanjiru', lastName: 'wanjiru' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /first and last names are the same/);
  });

  test('accepts real names, including ones that contain rude-looking letters', async () => {
    const names = [["Ng'ang'a", 'Mũthoni'], ['Dickson', 'Shitanda'], ['Liberty', 'Hancock'], ['Kipngetich', 'Chepkwony']];
    for (const [firstName, lastName] of names) {
      const { res } = await registerUser({ firstName, lastName });
      assert.equal(res.status, 201, `${firstName} ${lastName}: ${res.body.message}`);
    }
  });

  test('requires an engineering registration number, tidied into the standard form', async () => {
    const missing = await registerUser({ regNumber: '' });
    assert.equal(missing.res.status, 400);
    assert.match(missing.res.body.message, /Registration number is required/);

    for (const regNumber of ['Uufgjkjghb', 'S13/12345/21', 'B1/12345/21']) {
      const { res } = await registerUser({ regNumber });
      assert.equal(res.status, 400, regNumber);
      assert.match(res.body.message, /engineering registration number, for example B12\/12345\/21/);
    }

    const { res, payload } = await registerUser({ regNumber: ' b12-54321-24 ' });
    assert.equal(res.status, 201, res.body.message);
    assert.equal((await User.findOne({ email: payload.email }).lean()).regNumber, 'B12/54321/24');

    const taken = await registerUser({ regNumber: 'B12/54321/24' });
    assert.equal(taken.res.status, 409);
  });

  test('refuses an offensive username and a throwaway inbox', async () => {
    assert.equal((await registerUser({ username: 'dick.head' })).res.status, 400);
    assert.equal((await registerUser({ email: `x${Date.now()}@mailinator.com` })).res.status, 400);
  });
});

describe('approval', () => {
  test('a new account waits for approval: no session, and sign-in explains why', async () => {
    const { res, payload } = await registerUser();
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.pending, true);
    assert.equal(res.body.token, undefined, 'no session before approval');
    assert.match(res.body.message, /once your account is approved/);

    const stored = await User.findOne({ email: payload.email }).lean();
    assert.equal(stored.isActive, false);
    assert.equal(stored.pendingApproval, true);

    const signIn = await request(app).post('/api/auth/login').send({ identifier: payload.email, password: payload.password });
    assert.equal(signIn.status, 403);
    assert.match(signIn.body.message, /waiting for approval/);

    // The wrong password gets the ordinary answer, so nobody can probe who has applied.
    const guess = await request(app).post('/api/auth/login').send({ identifier: payload.email, password: 'WrongPass9' });
    assert.equal(guess.status, 401);
  });

  test('waiting accounts are left out of the directory and the public count', async () => {
    const viewer = await approvedUser();
    const before = (await request(app).get('/api/users/stats')).body.total;

    const { res } = await registerUser({ firstName: 'Nasimiyu', lastName: 'Wekesa' });
    assert.equal(res.status, 201, res.body.message);

    assert.equal((await request(app).get('/api/users/stats')).body.total, before);
    const directory = await request(app).get('/api/users?search=Nasimiyu').set(viewer.auth);
    assert.equal(directory.body.total, 0);
  });

  test('an approved member cannot rename themselves to something that would be turned away', async () => {
    const member = await approvedUser();

    const rude = await request(app).put('/api/auth/profile').set(member.auth).send({ firstName: 'Fuck' });
    assert.equal(rude.status, 400);
    const twice = await request(app).put('/api/auth/profile').set(member.auth).send({ firstName: 'Kamau', lastName: 'Kamau' });
    assert.equal(twice.status, 400);
    const bio = await request(app).put('/api/auth/profile').set(member.auth).send({ bio: 'This is bullshit' });
    assert.equal(bio.status, 400);

    const fine = await request(app).put('/api/auth/profile').set(member.auth).send({ firstName: 'Achieng', bio: 'Power systems, Year 3.' });
    assert.equal(fine.status, 200, fine.body.message);
    assert.equal(fine.body.firstName, 'Achieng');
  });

  test('a member with an older record that fails today\'s rules can still save other changes', async () => {
    const member = await approvedUser();
    await User.updateOne({ _id: member.id }, { firstName: 'Member1', lastName: 'Member1', bio: 'Engineering is shit hard.' });

    // The profile form resends every field, unchanged ones included.
    const res = await request(app).put('/api/auth/profile').set(member.auth)
      .send({ firstName: 'Member1', lastName: 'Member1', bio: 'Engineering is shit hard.', phone: '0712345678' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.phone, '0712345678');

    // Changing the name still has to meet the rules.
    const rename = await request(app).put('/api/auth/profile').set(member.auth).send({ firstName: 'Member2' });
    assert.equal(rename.status, 400);
  });
});

describe('login', () => {
  test('signs in with the correct password', async () => {
    const member = await approvedUser();
    const res = await request(app).post('/api/auth/login')
      .send({ identifier: member.email, password: 'Str0ngPass1' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  test('rejects operator injection in the identifier', async () => {
    await approvedUser();
    const res = await request(app).post('/api/auth/login')
      .send({ identifier: { $ne: null }, password: { $ne: null } });
    // The sanitiser empties the object and validation then rejects it; either
    // way it must not authenticate.
    assert.notEqual(res.status, 200);
    assert.equal(res.body.token, undefined);
  });

  test('locks the account after repeated failures', async () => {
    const member = await approvedUser();
    const payload = { email: member.email, password: 'Str0ngPass1' };

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
    const member = await approvedUser();
    await User.updateOne({ _id: member.id }, { isActive: false });

    const res = await request(app).post('/api/auth/login')
      .send({ identifier: member.email, password: 'Str0ngPass1' });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /deactivated/);
  });
});

describe('sessions', () => {
  test('changing a password invalidates existing tokens', async () => {
    const member = await approvedUser();
    const payload = { password: 'Str0ngPass1' };
    const oldToken = member.token;

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
    const member = await approvedUser();
    const { token } = member;

    await User.updateOne({ _id: member.id }, { isActive: false });

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
    const a = await approvedUser();
    const b = await approvedUser();

    const res = await request(app).put(`/api/users/${b.id}/role`)
      .set(a.auth)
      .send({ role: 'admin' });
    assert.equal(res.status, 403);
  });

  test('an admin cannot change their own role', async () => {
    const admin = await approvedUser();
    await User.updateOne({ _id: admin.id }, { role: 'admin' });

    const res = await request(app).put(`/api/users/${admin.id}/role`)
      .set(admin.auth)
      .send({ role: 'member' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /your own role/i);
  });

  test('a chairperson cannot promote anyone to admin', async () => {
    const chair = await approvedUser();
    await User.updateOne({ _id: chair.id }, { role: 'chairperson' });
    const target = await approvedUser();

    const res = await request(app).put(`/api/users/${target.id}/role`)
      .set(chair.auth)
      .send({ role: 'admin' });
    assert.equal(res.status, 403, 'only the admin role may grant admin');
  });
});

describe('search safety', () => {
  test('a regex metacharacter search does not error', async () => {
    const member = await approvedUser();
    const res = await request(app).get('/api/users?search=' + encodeURIComponent('(a+)+$'))
      .set(member.auth);
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
    const admin = await approvedUser();
    await User.updateOne({ _id: admin.id }, { role: 'admin' });

    const res = await request(app).put('/api/users/not-an-id/role')
      .set(admin.auth)
      .send({ role: 'member' });
    assert.equal(res.status, 400);
  });
});
