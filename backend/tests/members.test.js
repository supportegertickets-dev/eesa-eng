/**
 * Member profile and administration tests.
 *
 * Covers what each audience may see about a member, the rules for editing a
 * member on their behalf, manual membership changes and the CSV export.
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-32';
process.env.FRONTEND_URL = 'http://localhost:3000';
delete process.env.BREVO_API_KEY;
delete process.env.SMTP_HOST;

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

let mongod;
let app;
let User;
let Payment;
let Resource;
let Project;
let Election;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  Payment = require('../models/Payment');
  Resource = require('../models/Resource');
  Project = require('../models/Project');
  Election = require('../models/Election');
  // The registration number conflict test relies on the unique index existing.
  await User.init();

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
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

let counter = 0;
const makeUser = async (role = 'member', fields = {}) => {
  counter += 1;
  const res = await request(app).post('/api/auth/register').send({
    firstName: `Member${counter}`,
    lastName: 'Test',
    email: `members${counter}-${Date.now()}@example.com`,
    password: 'Str0ngPass1'
  });
  assert.equal(res.status, 201, res.body.message);
  if (role !== 'member' || Object.keys(fields).length) {
    await User.updateOne({ _id: res.body._id }, { role, ...fields });
  }
  return { id: res.body._id, auth: { Authorization: `Bearer ${res.body.token}` } };
};

const DAY = 24 * 60 * 60 * 1000;

describe('member profiles', () => {
  test('members see a limited profile with approved contributions only', async () => {
    const viewer = await makeUser();
    const subject = await makeUser('member', { phone: '+254700000000', regNumber: 'ENG-PROFILE-1', bio: 'Robotics.' });

    await Resource.create([
      { title: 'Statics notes', uploadedBy: subject.id, status: 'approved' },
      { title: 'Unreviewed upload', uploadedBy: subject.id, status: 'pending' }
    ]);
    await Project.create({ title: 'Solar dryer', description: 'A dryer.', teamLead: viewer.id, teamMembers: [subject.id] });

    const res = await request(app).get(`/api/users/${subject.id}`).set(viewer.auth);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.user.bio, 'Robotics.');
    for (const field of ['email', 'phone', 'regNumber', 'membershipPaid', 'lastLoginAt', 'isActive']) {
      assert.equal(res.body.user[field], undefined, `${field} must not be exposed to other members`);
    }
    assert.equal(res.body.contributions.resourceCount, 1);
    assert.deepEqual(res.body.contributions.resources.map((r) => r.title), ['Statics notes']);
    assert.equal(res.body.contributions.projects.length, 1);
    assert.equal(res.body.contributions.projects[0].isLead, false);
  });

  test('a deactivated member has no profile, and a malformed id is rejected', async () => {
    const viewer = await makeUser();
    const subject = await makeUser('member', { isActive: false });

    assert.equal((await request(app).get(`/api/users/${subject.id}`).set(viewer.auth)).status, 404);
    assert.equal((await request(app).get('/api/users/not-an-id').set(viewer.auth)).status, 400);
  });

  test('profiles require a session', async () => {
    const subject = await makeUser();
    assert.equal((await request(app).get(`/api/users/${subject.id}`)).status, 401);
  });

  test('named routes are not shadowed by the profile route', async () => {
    const res = await request(app).get('/api/users/stats');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.total, 'number');
  });
});

describe('admin member profile', () => {
  test('is closed to members and to office holders without member management', async () => {
    const member = await makeUser();
    const treasurer = await makeUser('treasurer');
    const subject = await makeUser();

    assert.equal((await request(app).get(`/api/users/admin/${subject.id}`).set(member.auth)).status, 403);
    assert.equal((await request(app).get(`/api/users/admin/${subject.id}`).set(treasurer.auth)).status, 403);
  });

  test('shows contact details, payments and nominations but never ballots', async () => {
    const chair = await makeUser('chairperson');
    const subject = await makeUser('member', { phone: '+254711111111' });
    const voter = await makeUser();

    await Payment.create([
      { user: subject.id, type: 'registration', amount: 500, status: 'verified' },
      { user: subject.id, type: 'renewal', amount: 300, status: 'pending' }
    ]);
    await Election.create({
      title: '2026 Committee',
      positions: ['Treasurer'],
      startDate: new Date(Date.now() - 2 * DAY),
      endDate: new Date(Date.now() - DAY),
      status: 'completed',
      candidates: [{ user: subject.id, position: 'Treasurer', status: 'approved', votes: [voter.id] }]
    });

    const res = await request(app).get(`/api/users/admin/${subject.id}`).set(chair.auth);
    assert.equal(res.status, 200, res.body.message);
    assert.match(res.body.user.email, /@example\.com$/);
    assert.equal(res.body.user.phone, '+254711111111');
    assert.equal(res.body.user.password, undefined);
    assert.equal(res.body.payments.length, 2);
    assert.equal(res.body.paymentSummary.verifiedAmount, 500);
    assert.equal(res.body.paymentSummary.pending, 1);
    assert.equal(res.body.nominations.length, 1);
    assert.equal(res.body.nominations[0].position, 'Treasurer');
    assert.equal(res.body.nominations[0].election.title, '2026 Committee');
    assert.doesNotMatch(JSON.stringify(res.body), new RegExp(voter.id), 'a ballot leaked into the response');
  });
});

describe('editing member details', () => {
  test('a chairperson cannot edit an admin, but an admin can', async () => {
    const chair = await makeUser('chairperson');
    const admin = await makeUser('admin');
    const otherAdmin = await makeUser('admin');

    const denied = await request(app).patch(`/api/users/${otherAdmin.id}`).set(chair.auth).send({ firstName: 'Changed' });
    assert.equal(denied.status, 403);

    const res = await request(app).patch(`/api/users/${otherAdmin.id}`).set(admin.auth)
      .send({ firstName: 'Changed', department: 'Civil Engineering' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.user.firstName, 'Changed');
    assert.equal(res.body.user.department, 'Civil Engineering');
  });

  test('nobody can edit their own record here', async () => {
    const admin = await makeUser('admin');
    const res = await request(app).patch(`/api/users/${admin.id}`).set(admin.auth).send({ regNumber: 'SELF-1' });
    assert.equal(res.status, 400);
  });

  test('registration numbers stay unique and can be cleared', async () => {
    const admin = await makeUser('admin');
    const first = await makeUser();
    const second = await makeUser();
    const regNumber = `eng/${Date.now()}`;

    const set = await request(app).patch(`/api/users/${first.id}`).set(admin.auth).send({ regNumber });
    assert.equal(set.status, 200, set.body.message);
    assert.equal((await User.findById(first.id).lean()).regNumber, regNumber.toUpperCase());

    const clash = await request(app).patch(`/api/users/${second.id}`).set(admin.auth).send({ regNumber });
    assert.equal(clash.status, 409);

    // Two cleared numbers must not collide on the unique index.
    assert.equal((await request(app).patch(`/api/users/${first.id}`).set(admin.auth).send({ regNumber: '' })).status, 200);
    assert.equal((await request(app).patch(`/api/users/${second.id}`).set(admin.auth).send({ regNumber: '' })).status, 200);
    assert.equal((await User.findById(first.id).lean()).regNumber, undefined);
  });

  test('moving an alumnus back to student restarts the academic clock', async () => {
    const admin = await makeUser('admin');
    const longAgo = new Date('2019-01-01');
    const alumnus = await makeUser('member', { academicStatus: 'alumni', yearOfStudy: 5, academicYearStartedAt: longAgo });

    const res = await request(app).patch(`/api/users/${alumnus.id}`).set(admin.auth)
      .send({ academicStatus: 'student', yearOfStudy: 4 });
    assert.equal(res.status, 200, res.body.message);

    const stored = await User.findById(alumnus.id).lean();
    assert.equal(stored.academicStatus, 'student');
    assert.equal(stored.yearOfStudy, 4);
    assert.ok(stored.academicYearStartedAt > new Date(Date.now() - DAY));
  });
});

describe('manual membership', () => {
  test('recording a cash payment marks the member paid and adds a verified payment', async () => {
    const chair = await makeUser('chairperson');
    const subject = await makeUser();

    const res = await request(app).patch(`/api/users/${subject.id}/membership`).set(chair.auth)
      .send({ membershipPaid: true, payment: { amount: 500, type: 'registration', reference: 'Receipt 12' } });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.user.membershipPaid, true);
    assert.ok(new Date(res.body.user.membershipExpiry) > new Date());

    const payments = await Payment.find({ user: subject.id }).lean();
    assert.equal(payments.length, 1);
    assert.equal(payments[0].status, 'verified');
    assert.equal(payments[0].amount, 500);
    assert.equal(String(payments[0].verifiedBy), chair.id);
  });

  test('marking a membership unpaid clears its expiry', async () => {
    const admin = await makeUser('admin');
    const subject = await makeUser('member', { membershipPaid: true, membershipExpiry: new Date(Date.now() + 30 * DAY) });

    const res = await request(app).patch(`/api/users/${subject.id}/membership`).set(admin.auth).send({ membershipPaid: false });
    assert.equal(res.status, 200, res.body.message);
    const stored = await User.findById(subject.id).lean();
    assert.equal(stored.membershipPaid, false);
    assert.equal(stored.membershipExpiry, undefined);
  });

  test('rejects a past expiry, a payment on an unpaid membership, and changes to your own', async () => {
    const admin = await makeUser('admin');
    const subject = await makeUser();
    const url = `/api/users/${subject.id}/membership`;

    const past = await request(app).patch(url).set(admin.auth).send({ membershipPaid: true, membershipExpiry: '2020-01-01' });
    assert.equal(past.status, 400);

    const unpaid = await request(app).patch(url).set(admin.auth).send({ membershipPaid: false, payment: { amount: 200 } });
    assert.equal(unpaid.status, 400);

    const self = await request(app).patch(`/api/users/${admin.id}/membership`).set(admin.auth).send({ membershipPaid: true });
    assert.equal(self.status, 400);

    assert.equal(await Payment.countDocuments({ user: subject.id }), 0);
  });
});

describe('member administration list', () => {
  test('filters by membership state', async () => {
    const admin = await makeUser('admin');
    const tag = `Filter${Date.now()}`;
    const paid = await makeUser('member', { lastName: tag, membershipPaid: true, membershipExpiry: new Date(Date.now() + DAY) });
    const lapsed = await makeUser('member', { lastName: tag, membershipPaid: true, membershipExpiry: new Date(Date.now() - DAY) });
    const unpaid = await makeUser('member', { lastName: tag });

    const idsFor = async (membership) => {
      const res = await request(app).get(`/api/users/admin/list?search=${tag}&membership=${membership}`).set(admin.auth);
      assert.equal(res.status, 200, res.body.message);
      return res.body.users.map((u) => u._id);
    };

    assert.deepEqual(await idsFor('current'), [paid.id]);
    assert.deepEqual(await idsFor('expired'), [lapsed.id]);
    assert.deepEqual(await idsFor('none'), [unpaid.id]);
  });

  test('summary counts are available to administrators', async () => {
    const chair = await makeUser('chairperson');
    const res = await request(app).get('/api/users/admin/summary').set(chair.auth);
    assert.equal(res.status, 200, res.body.message);
    for (const key of ['total', 'active', 'deactivated', 'paid', 'unpaid', 'joinedLast30Days']) {
      assert.equal(typeof res.body[key], 'number', key);
    }
  });

  test('exports CSV with spreadsheet formulas neutralised', async () => {
    const admin = await makeUser('admin');
    const tag = `Export${Date.now()}`;
    await makeUser('member', { firstName: '=HYPERLINK("http://evil.example")', lastName: tag });

    const res = await request(app).get(`/api/users/admin/export?search=${tag}`).set(admin.auth);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);

    const lines = res.text.replace(/^﻿/, '').trim().split('\r\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[1].startsWith('"\'=HYPERLINK(""http://evil.example"")"'), lines[1]);
  });

  test('export is limited to administrators', async () => {
    const member = await makeUser();
    assert.equal((await request(app).get('/api/users/admin/export').set(member.auth)).status, 403);
  });
});
