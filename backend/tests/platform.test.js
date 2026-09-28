/**
 * Superadmin and platform control tests.
 *
 * Covers who can hold and change the superadmin role, the kill switch
 * (maintenance, read-only, feature switches, scheduled maintenance, the server
 * override and signing everyone out), the audit log, account unlocking, jobs,
 * the health page and the server script.
 *
 * Signing everyone out invalidates every token the test helper issues, so that
 * block runs last.
 */
const { test, before, after, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFile } = require('child_process');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-32';
process.env.FRONTEND_URL = 'http://localhost:3000';
delete process.env.BREVO_API_KEY;
delete process.env.SMTP_HOST;
delete process.env.MAINTENANCE_OVERRIDE;

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { registerApproved } = require('./helpers');

const PASSWORD = 'Str0ngPass1';
const HOUR = 60 * 60 * 1000;

let mongod;
let app;
let User;
let AuditLog;
let PlatformSetting;
let platform;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  AuditLog = require('../models/AuditLog');
  PlatformSetting = require('../models/PlatformSetting');
  platform = require('../utils/platform');
  await User.init();

  // The same order as server.js: the gate sits in front of every route.
  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');
  const { platformGate } = require('../middleware/platform');

  app = express();
  app.use(express.json());
  app.use(mongoSanitize);
  app.use('/api', platformGate);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/users', require('../routes/users'));
  app.use('/api/notifications', require('../routes/notifications'));
  app.use('/api/platform', require('../routes/platform'));
  app.use(notFound);
  app.use(errorHandler);
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const makeUser = async (role = 'member', fields = {}) => {
  const user = await registerApproved(app);
  if (role !== 'member' || Object.keys(fields).length) await User.updateOne({ _id: user.id }, { role, ...fields });
  return user;
};

const signIn = (identifier, password = PASSWORD) => request(app).post('/api/auth/login').send({ identifier, password });

/** Put the platform back to normal between tests, straight in the database. */
const resetPlatform = async () => {
  await PlatformSetting.updateOne(
    { key: 'platform' },
    { $set: { mode: 'normal', message: '', disabledFeatures: [] }, $unset: { window: 1, announcement: 1, expectedBackAt: 1 } }
  );
  platform.invalidatePlatformCache();
  delete process.env.MAINTENANCE_OVERRIDE;
};

describe('the superadmin role', () => {
  test('cannot be given or taken away through the API', async () => {
    const admin = await makeUser('admin');
    const superadmin = await makeUser('superadmin');
    const member = await makeUser();

    const grant = await request(app).put(`/api/users/${member.id}/role`).set(admin.auth).send({ role: 'superadmin' });
    assert.equal(grant.status, 403);
    assert.match(grant.body.message, /only be given on the server/);

    // Not even by another superadmin.
    const bySuper = await request(app).put(`/api/users/${member.id}/role`).set(superadmin.auth).send({ role: 'superadmin' });
    assert.equal(bySuper.status, 403);

    const demote = await request(app).put(`/api/users/${superadmin.id}/role`).set(admin.auth).send({ role: 'member' });
    assert.equal(demote.status, 403);
    assert.equal((await User.findById(superadmin.id)).role, 'superadmin');
  });

  test('admins cannot deactivate, edit, delete or mark the superadmin account', async () => {
    const admin = await makeUser('admin');
    const superadmin = await makeUser('superadmin');

    const attempts = [
      request(app).patch(`/api/users/${superadmin.id}/status`).set(admin.auth).send({ isActive: false }),
      request(app).patch(`/api/users/${superadmin.id}`).set(admin.auth).send({ firstName: 'Changed' }),
      request(app).patch(`/api/users/${superadmin.id}/membership`).set(admin.auth).send({ membershipPaid: true }),
      request(app).delete(`/api/users/admin/${superadmin.id}`).set(admin.auth),
      request(app).delete(`/api/users/${superadmin.id}`).set(admin.auth)
    ];
    for (const res of await Promise.all(attempts)) {
      assert.equal(res.status, 403, res.body.message);
    }
    const stored = await User.findById(superadmin.id);
    assert.equal(stored.isActive, true);
    assert.notEqual(stored.firstName, 'Changed');
  });

  test('is left out of the directory, the leaders list, profiles and public counts', async () => {
    const viewer = await makeUser();
    const superadmin = await makeUser('superadmin');

    const directory = await request(app).get('/api/users?limit=50').set(viewer.auth);
    assert.equal(directory.status, 200);
    assert.ok(!directory.body.users.some((u) => String(u._id) === superadmin.id));

    const leaders = await request(app).get('/api/users/leaders');
    assert.ok(!leaders.body.some((u) => String(u._id) === superadmin.id));

    const profile = await request(app).get(`/api/users/${superadmin.id}`).set(viewer.auth);
    assert.equal(profile.status, 404);

    const stats = await request(app).get('/api/users/stats');
    const listed = await User.countDocuments({ isActive: true, role: { $ne: 'superadmin' } });
    assert.equal(stats.body.total, listed);
  });

  test('has every admin power, including role changes', async () => {
    const superadmin = await makeUser('superadmin');
    const member = await makeUser();

    const list = await request(app).get('/api/users/admin/list').set(superadmin.auth);
    assert.equal(list.status, 200);

    const promote = await request(app).put(`/api/users/${member.id}/role`).set(superadmin.auth).send({ role: 'admin' });
    assert.equal(promote.status, 200, promote.body.message);
    assert.equal((await User.findById(member.id)).role, 'admin');
  });

  test('bulk membership changes skip the superadmin', async () => {
    const admin = await makeUser('admin');
    const superadmin = await makeUser('superadmin');
    const member = await makeUser();

    const res = await request(app).post('/api/users/admin/membership').set(admin.auth).send({
      membershipPaid: true,
      ids: [superadmin.id, member.id],
      membershipExpiry: new Date(Date.now() + 90 * 24 * HOUR).toISOString()
    });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.matched, 1);
    assert.equal((await User.findById(superadmin.id)).membershipPaid, false);
  });
});

describe('platform controls access', () => {
  test('the status is public; everything else is the superadmin\'s alone', async () => {
    const status = await request(app).get('/api/platform/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.mode, 'normal');

    const admin = await makeUser('admin');
    const chair = await makeUser('chairperson');
    const superadmin = await makeUser('superadmin');

    for (const who of [admin, chair]) {
      const res = await request(app).get('/api/platform/overview').set(who.auth);
      assert.equal(res.status, 403);
    }
    const anonymous = await request(app).get('/api/platform/overview');
    assert.equal(anonymous.status, 401);

    const res = await request(app).get('/api/platform/overview').set(superadmin.auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.state.mode, 'normal');
    assert.ok(res.body.features.some((f) => f.key === 'registration'));
  });
});

describe('maintenance and read-only mode', () => {
  afterEach(resetPlatform);

  test('a wrong password changes nothing and is logged', async () => {
    const superadmin = await makeUser('superadmin');
    const res = await request(app).put('/api/platform/mode').set(superadmin.auth).send({ mode: 'maintenance', password: 'Wrong0ne1' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'wrong_password');

    const status = await request(app).get('/api/platform/status');
    assert.equal(status.body.mode, 'normal');
    assert.ok(await AuditLog.exists({ action: 'security.password_failed', actor: superadmin.id }));

    const missing = await request(app).put('/api/platform/mode').set(superadmin.auth).send({ mode: 'maintenance' });
    assert.equal(missing.status, 400);
  });

  test('maintenance keeps everyone out but the superadmin', async () => {
    const superadmin = await makeUser('superadmin');
    const admin = await makeUser('admin');
    const member = await makeUser();

    const on = await request(app).put('/api/platform/mode').set(superadmin.auth)
      .send({ mode: 'maintenance', message: 'Upgrading the database.', expectedBackAt: new Date(Date.now() + HOUR).toISOString(), password: PASSWORD });
    assert.equal(on.status, 200, on.body.message);
    assert.equal(on.body.overview.state.mode, 'maintenance');

    for (const who of [member, admin]) {
      const res = await request(app).get('/api/users').set(who.auth);
      assert.equal(res.status, 503);
      assert.equal(res.body.code, 'maintenance');
      assert.equal(res.body.message, 'Upgrading the database.');
      assert.ok(Number(res.headers['retry-after']) > 0);
    }
    const anonymous = await request(app).get('/api/users/leaders');
    assert.equal(anonymous.status, 503);

    // The public status stays reachable, so the site can say why.
    const status = await request(app).get('/api/platform/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.mode, 'maintenance');

    assert.equal((await request(app).get('/api/users').set(superadmin.auth)).status, 200);

    // Sign-in: the right password is refused with the maintenance notice, a
    // wrong one is refused as usual, and the superadmin gets in.
    const memberSignIn = await signIn(member.email);
    assert.equal(memberSignIn.status, 503);
    assert.equal(memberSignIn.body.code, 'maintenance');
    assert.equal((await signIn(member.email, 'Wrong0ne1')).status, 401);
    const superSignIn = await signIn(superadmin.email);
    assert.equal(superSignIn.status, 200, superSignIn.body.message);
    assert.ok(superSignIn.body.token);

    const off = await request(app).put('/api/platform/mode').set(superadmin.auth).send({ mode: 'normal', password: PASSWORD });
    assert.equal(off.status, 200);
    assert.equal((await request(app).get('/api/users').set(member.auth)).status, 200);

    const logged = await AuditLog.find({ action: 'platform.mode' }).sort({ createdAt: 1 }).lean();
    assert.deepEqual(logged.slice(-2).map((entry) => entry.details.to), ['maintenance', 'normal']);
  });

  test('read-only lets people browse and sign in but not change anything', async () => {
    const superadmin = await makeUser('superadmin');
    const member = await makeUser();

    const on = await request(app).put('/api/platform/mode').set(superadmin.auth).send({ mode: 'read_only', password: PASSWORD });
    assert.equal(on.status, 200, on.body.message);

    assert.equal((await request(app).get('/api/users').set(member.auth)).status, 200);
    assert.equal((await signIn(member.email)).status, 200);

    const write = await request(app).put('/api/auth/profile').set(member.auth).send({ bio: 'Hello' });
    assert.equal(write.status, 503);
    assert.equal(write.body.code, 'read_only');

    // Reading a notification is not a change anyone would expect to fail.
    assert.equal((await request(app).put('/api/notifications/read-all').set(member.auth)).status, 200);

    // The superadmin can still make changes.
    assert.equal((await request(app).put('/api/auth/profile').set(superadmin.auth).send({ bio: 'Fixing things' })).status, 200);
  });

  test('the expected return time must be in the future', async () => {
    const superadmin = await makeUser('superadmin');
    const res = await request(app).put('/api/platform/mode').set(superadmin.auth)
      .send({ mode: 'maintenance', expectedBackAt: new Date(Date.now() - HOUR).toISOString(), password: PASSWORD });
    assert.equal(res.status, 400);
  });
});

describe('feature switches', () => {
  afterEach(resetPlatform);

  test('switching off sign-ups closes registration, however the path is written', async () => {
    const superadmin = await makeUser('superadmin');
    const res = await request(app).put('/api/platform/features').set(superadmin.auth).send({ disabled: ['registration'], password: PASSWORD });
    assert.equal(res.status, 200, res.body.message);
    assert.deepEqual(res.body.overview.settings.disabledFeatures, ['registration']);

    const payload = { firstName: 'Achieng', lastName: 'Otieno', email: `paused${Date.now()}@example.com`, password: PASSWORD, regNumber: 'B24/77777/25' };
    for (const url of ['/api/auth/register', '/API/Auth/Register/']) {
      const blocked = await request(app).post(url).send(payload);
      assert.equal(blocked.status, 503, url);
      assert.equal(blocked.body.code, 'feature_disabled');
      assert.equal(blocked.body.feature, 'registration');
    }

    const status = await request(app).get('/api/platform/status');
    assert.deepEqual(status.body.disabledFeatures.map((f) => f.key), ['registration']);

    await request(app).put('/api/platform/features').set(superadmin.auth).send({ disabled: [], password: PASSWORD });
    assert.equal((await request(app).post('/api/auth/register').send(payload)).status, 201);
  });

  test('switching off sign-ins lets only the superadmin sign in', async () => {
    const superadmin = await makeUser('superadmin');
    const member = await makeUser();
    await request(app).put('/api/platform/features').set(superadmin.auth).send({ disabled: ['login'], password: PASSWORD });

    const refused = await signIn(member.email);
    assert.equal(refused.status, 503);
    assert.equal(refused.body.code, 'feature_disabled');
    assert.equal((await signIn(superadmin.email)).status, 200);
    // Existing sessions carry on.
    assert.equal((await request(app).get('/api/auth/me').set(member.auth)).status, 200);
  });

  test('rejects unknown features and logs what changed', async () => {
    const superadmin = await makeUser('superadmin');
    const bad = await request(app).put('/api/platform/features').set(superadmin.auth).send({ disabled: ['everything'], password: PASSWORD });
    assert.equal(bad.status, 400);

    await request(app).put('/api/platform/features').set(superadmin.auth).send({ disabled: ['voting', 'payments'], password: PASSWORD });
    const entry = await AuditLog.findOne({ action: 'platform.features' }).sort({ createdAt: -1 }).lean();
    assert.match(entry.summary, /switched off payments and election voting/);
  });

  test('each feature covers the requests it should', () => {
    const { featureForRequest } = require('../utils/platformFeatures');
    const id = '0123456789abcdef01234567';
    const cases = [
      ['POST', '/payments/mpesa/stkpush', 'payments'],
      ['POST', '/payments', 'payments'],
      ['POST', `/merchandise/orders/${id}/mpesa`, 'payments'],
      ['POST', `/merchandise/orders/${id}/manual`, 'payments'],
      ['POST', '/merchandise/orders', 'shop'],
      ['POST', '/resources', 'libraryUploads'],
      ['POST', `/gallery/albums/${id}/photos`, 'galleryUploads'],
      ['POST', `/elections/${id}/vote/${id}`, 'voting'],
      ['POST', '/contact/', 'contactForm'],
      ['POST', '/payments/mpesa/callback', null],
      ['GET', '/merchandise/orders', null],
      ['GET', '/resources', null]
    ];
    for (const [method, url, expected] of cases) {
      assert.equal(featureForRequest(method, url)?.key ?? null, expected, `${method} ${url}`);
    }
  });
});

describe('scheduled maintenance, the banner and the server override', () => {
  afterEach(resetPlatform);

  test('an upcoming window is announced, and a current one locks the platform', async () => {
    const superadmin = await makeUser('superadmin');
    const member = await makeUser();

    const upcoming = await request(app).put('/api/platform/schedule').set(superadmin.auth).send({
      startsAt: new Date(Date.now() + HOUR).toISOString(), endsAt: new Date(Date.now() + 2 * HOUR).toISOString(), password: PASSWORD
    });
    assert.equal(upcoming.status, 200, upcoming.body.message);
    let status = await request(app).get('/api/platform/status');
    assert.equal(status.body.mode, 'normal');
    assert.ok(status.body.scheduledMaintenance?.startsAt);

    // Still announced while the platform is read-only.
    await request(app).put('/api/platform/mode').set(superadmin.auth).send({ mode: 'read_only', password: PASSWORD });
    status = await request(app).get('/api/platform/status');
    assert.ok(status.body.scheduledMaintenance?.startsAt);
    await request(app).put('/api/platform/mode').set(superadmin.auth).send({ mode: 'normal', password: PASSWORD });

    await request(app).put('/api/platform/schedule').set(superadmin.auth).send({
      startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + HOUR).toISOString(),
      message: 'Scheduled upgrade.', password: PASSWORD
    });
    status = await request(app).get('/api/platform/status');
    assert.equal(status.body.mode, 'maintenance');
    assert.equal(status.body.message, 'Scheduled upgrade.');
    assert.equal((await request(app).get('/api/users').set(member.auth)).status, 503);

    const cancel = await request(app).put('/api/platform/schedule').set(superadmin.auth).send({ password: PASSWORD });
    assert.equal(cancel.status, 200);
    assert.equal((await request(app).get('/api/users').set(member.auth)).status, 200);

    const backwards = await request(app).put('/api/platform/schedule').set(superadmin.auth).send({
      startsAt: new Date(Date.now() + 2 * HOUR).toISOString(), endsAt: new Date(Date.now() + HOUR).toISOString(), password: PASSWORD
    });
    assert.equal(backwards.status, 400);
  });

  test('the announcement shows until it expires or is removed', async () => {
    const superadmin = await makeUser('superadmin');
    const set = await request(app).put('/api/platform/announcement').set(superadmin.auth)
      .send({ message: 'Elections open on Monday.', tone: 'warning' });
    assert.equal(set.status, 200, set.body.message);
    let status = await request(app).get('/api/platform/status');
    assert.deepEqual(status.body.announcement, { message: 'Elections open on Monday.', tone: 'warning' });

    const past = await request(app).put('/api/platform/announcement').set(superadmin.auth)
      .send({ message: 'Too late', expiresAt: new Date(Date.now() - HOUR).toISOString() });
    assert.equal(past.status, 400);

    await request(app).put('/api/platform/announcement').set(superadmin.auth).send({ message: '' });
    status = await request(app).get('/api/platform/status');
    assert.equal(status.body.announcement, null);
  });

  test('MAINTENANCE_OVERRIDE beats whatever the database says', async () => {
    const superadmin = await makeUser('superadmin');
    const member = await makeUser();

    process.env.MAINTENANCE_OVERRIDE = 'on';
    assert.equal((await request(app).get('/api/users').set(member.auth)).status, 503);
    const overview = await request(app).get('/api/platform/overview').set(superadmin.auth);
    assert.equal(overview.body.override, 'maintenance');
    assert.equal(overview.body.state.source, 'override');

    // The way back in when the database has the platform locked.
    await request(app).put('/api/platform/mode').set(superadmin.auth).send({ mode: 'maintenance', password: PASSWORD });
    process.env.MAINTENANCE_OVERRIDE = 'off';
    assert.equal((await request(app).get('/api/users').set(member.auth)).status, 200);

    process.env.MAINTENANCE_OVERRIDE = 'read_only';
    assert.equal((await request(app).put('/api/auth/profile').set(member.auth).send({ bio: 'x' })).status, 503);
  });
});

describe('the audit log', () => {
  test('records role changes and can be filtered and searched', async () => {
    const superadmin = await makeUser('superadmin');
    const admin = await makeUser('admin');
    const member = await makeUser('member', { firstName: 'Zawadi' });

    await request(app).put(`/api/users/${member.id}/role`).set(admin.auth).send({ role: 'treasurer' });

    const res = await request(app).get('/api/platform/audit?category=members&search=Zawadi').set(superadmin.auth);
    assert.equal(res.status, 200);
    const entry = res.body.entries.find((e) => e.action === 'members.role');
    assert.ok(entry, 'role change is logged');
    assert.match(entry.summary, /from Member to Treasurer/);
    assert.equal(String(entry.actor), admin.id);

    const bad = await request(app).get('/api/platform/audit?category=nonsense').set(superadmin.auth);
    assert.equal(bad.status, 400);
  });

  test('being named in the log does not stop a junk account being deleted', async () => {
    const admin = await makeUser('admin');
    const junk = await makeUser();

    assert.equal((await request(app).patch(`/api/users/${junk.id}/status`).set(admin.auth).send({ isActive: false })).status, 200);
    assert.ok(await AuditLog.exists({ action: 'members.deactivated', targetId: junk.id }));

    const res = await request(app).delete(`/api/users/admin/${junk.id}`).set(admin.auth);
    assert.equal(res.status, 200, res.body.message);
    assert.ok(await AuditLog.exists({ action: 'members.deleted', targetId: junk.id }));
  });
});

describe('accounts, jobs and health', () => {
  test('a locked account is listed, logged without an actor, and can be unlocked', async () => {
    const superadmin = await makeUser('superadmin');
    const member = await makeUser();

    for (let i = 0; i < 8; i += 1) await signIn(member.email, 'Wrong0ne1');
    assert.equal((await signIn(member.email)).status, 429);

    const lock = await AuditLog.findOne({ action: 'security.locked', targetId: member.id }).lean();
    assert.ok(lock);
    assert.equal(lock.actor, undefined);

    const locked = await request(app).get('/api/platform/accounts/locked').set(superadmin.auth);
    assert.ok(locked.body.accounts.some((a) => String(a._id) === member.id && a.lockedUntil));

    const unlock = await request(app).post(`/api/platform/accounts/${member.id}/unlock`).set(superadmin.auth);
    assert.equal(unlock.status, 200);
    assert.equal((await signIn(member.email)).status, 200);
  });

  test('lists admins with the superadmin first', async () => {
    const superadmin = await makeUser('superadmin');
    await makeUser('admin');
    const res = await request(app).get('/api/platform/admins').set(superadmin.auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.admins[0].role, 'superadmin');
    assert.ok(res.body.admins.every((a) => ['superadmin', 'admin'].includes(a.role)));
  });

  test('runs a background job by hand', async () => {
    const superadmin = await makeUser('superadmin');
    const jobs = await request(app).get('/api/platform/jobs').set(superadmin.auth);
    assert.deepEqual(jobs.body.jobs.map((j) => j.key), ['expire-orders', 'academic-rollover']);

    const res = await request(app).post('/api/platform/jobs/academic-rollover').set(superadmin.auth);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(typeof res.body.count, 'number');
    assert.equal((await request(app).post('/api/platform/jobs/format-disk').set(superadmin.auth)).status, 400);
  });

  test('reports on the server, database and services', async () => {
    const superadmin = await makeUser('superadmin');
    const res = await request(app).get('/api/platform/health').set(superadmin.auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.database.state, 'connected');
    assert.equal(typeof res.body.database.pingMs, 'number');
    assert.ok(res.body.services.some((s) => s.key === 'email' && s.ok === false));
    assert.ok(Array.isArray(res.body.recentErrors));
    // No secrets in the report.
    assert.doesNotMatch(JSON.stringify(res.body), /test-secret/);
  });
});

describe('the superadmin script', () => {
  const runScript = (...args) => new Promise((resolve) => {
    execFile(process.execPath, [path.join(__dirname, '..', 'scripts', 'superadmin.js'), ...args], {
      // dotenv never overrides a variable that is already set, so the script
      // talks to the test database, never the one in backend/.env.
      env: { ...process.env, MONGODB_URI: mongod.getUri(), SUPERADMIN_PASSWORD: 'Sup3rSecretPass' }
    }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }));
  });

  test('grants, lists, resets and revokes', async () => {
    const email = `ops${Date.now()}@example.com`;

    const granted = await runScript('grant', email, '--first-name', 'Platform', '--last-name', 'Operator');
    assert.equal(granted.code, 0, granted.stderr);
    assert.equal((await User.findOne({ email })).role, 'superadmin');
    assert.equal((await signIn(email, 'Sup3rSecretPass')).status, 200);

    const listed = await runScript('list');
    assert.match(listed.stdout, new RegExp(email));

    const member = await makeUser();
    const promoted = await runScript('grant', member.email);
    assert.equal(promoted.code, 0, promoted.stderr);
    assert.equal((await User.findById(member.id)).role, 'superadmin');

    const reset = await runScript('reset-password', member.email);
    assert.equal(reset.code, 0, reset.stderr);
    assert.equal((await signIn(member.email, 'Sup3rSecretPass')).status, 200);

    const revoked = await runScript('revoke', member.email, '--role', 'admin');
    assert.equal(revoked.code, 0, revoked.stderr);
    assert.equal((await User.findById(member.id)).role, 'admin');

    assert.notEqual((await runScript('revoke', member.email)).code, 0);
    assert.notEqual((await runScript('grant', 'not-an-email')).code, 0);
    assert.ok(await AuditLog.exists({ action: 'security.superadmin_granted', actorName: 'Server script' }));
  });
});

// Last: after this every token the helper issues is out of date.
describe('signing everyone out', () => {
  test('ends every session but the superadmin\'s', async () => {
    const superadmin = await makeUser('superadmin');
    const admin = await makeUser('admin');
    const member = await makeUser();

    const res = await request(app).post('/api/platform/sessions/revoke').set(superadmin.auth).send({ password: PASSWORD });
    assert.equal(res.status, 200, res.body.message);

    for (const who of [admin, member]) {
      const me = await request(app).get('/api/auth/me').set(who.auth);
      assert.equal(me.status, 401);
      assert.equal(me.body.code, 'session_revoked');
    }
    assert.equal((await request(app).get('/api/auth/me').set(superadmin.auth)).status, 200);

    // Signing in again issues a session under the new epoch.
    const again = await signIn(member.email);
    assert.equal(again.status, 200);
    assert.equal((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${again.body.token}` })).status, 200);
  });
});
