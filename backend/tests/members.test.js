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
const { registerApproved } = require('./helpers');

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

const makeUser = async (role = 'member', fields = {}) => {
  const user = await registerApproved(app);
  if (role !== 'member' || Object.keys(fields).length) {
    await User.updateOne({ _id: user.id }, { role, ...fields });
  }
  return user;
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

  test('marking a member paid tells them, and says what their card still needs', async () => {
    const admin = await makeUser('admin');
    const noPhoto = await makeUser();
    const withPhoto = await makeUser('member', { passportPhoto: 'https://res.cloudinary.com/demo/image/upload/v1/p.jpg' });
    const Notification = mongoose.model('Notification');

    for (const subject of [noPhoto, withPhoto]) {
      const res = await request(app).patch(`/api/users/${subject.id}/membership`).set(admin.auth).send({ membershipPaid: true });
      assert.equal(res.status, 200, res.body.message);
    }

    const toNew = await Notification.findOne({ targetUsers: noPhoto.id, title: 'Membership active' }).lean();
    assert.match(toNew.message, /paid until/);
    assert.match(toNew.message, /Upload a passport photo/);
    const toCardHolder = await Notification.findOne({ targetUsers: withPhoto.id, title: 'Membership active' }).lean();
    assert.match(toCardHolder.message, /card is valid/);

    // Marking someone unpaid sends nothing.
    await request(app).patch(`/api/users/${noPhoto.id}/membership`).set(admin.auth).send({ membershipPaid: false });
    assert.equal(await Notification.countDocuments({ targetUsers: noPhoto.id }), 1);
  });

  test('changing a paid member\'s expiry says so', async () => {
    const admin = await makeUser('admin');
    const subject = await makeUser('member', { membershipPaid: true, membershipExpiry: new Date(Date.now() + 30 * DAY) });
    const expiry = new Date(Date.now() + 90 * DAY);

    const res = await request(app).patch(`/api/users/${subject.id}/membership`).set(admin.auth)
      .send({ membershipPaid: true, membershipExpiry: expiry.toISOString() });
    assert.equal(res.status, 200, res.body.message);
    assert.match(res.body.message, /membership now runs until/);
    assert.equal(new Date(res.body.user.membershipExpiry).toISOString(), expiry.toISOString());
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
    assert.deepEqual((await idsFor('unpaid')).sort(), [lapsed.id, unpaid.id].sort(), 'not paid up: never paid or expired');
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

describe('marking members paid together', () => {
  const bulk = (admin, body) => request(app).post('/api/users/admin/membership').set(admin.auth).send(body);
  const inDays = (days) => new Date(Date.now() + days * DAY);
  const stored = (member) => User.findById(member.id).lean();

  test('ticked members are marked paid until the chosen date; the preview changes nothing', async () => {
    const admin = await makeUser('admin');
    const unpaid = await makeUser();
    const lapsed = await makeUser('member', { membershipPaid: true, membershipExpiry: inDays(-5) });
    const paidLonger = await makeUser('member', { membershipPaid: true, membershipExpiry: inDays(400) });
    const deactivated = await makeUser('member', { isActive: false });
    const expiry = inDays(120).toISOString();
    const ids = [unpaid.id, lapsed.id, paidLonger.id, deactivated.id, admin.id];

    const preview = await bulk(admin, { membershipPaid: true, ids, membershipExpiry: expiry, dryRun: true });
    assert.equal(preview.status, 200, preview.body.message);
    assert.equal(preview.body.dryRun, true);
    assert.equal(preview.body.matched, 5);
    assert.equal(preview.body.updated, 2);
    assert.deepEqual(preview.body.skipped, { self: 1, inactive: 1, unchanged: 1 });
    assert.equal((await stored(unpaid)).membershipPaid, false, 'a preview changes nothing');

    const res = await bulk(admin, { membershipPaid: true, ids, membershipExpiry: expiry });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.updated, 2);
    assert.match(res.body.message, /2 members marked as paid until/);
    assert.match(res.body.message, /1 already paid until then or later; 1 deactivated; your own account/);

    for (const member of [unpaid, lapsed]) {
      const user = await stored(member);
      assert.equal(user.membershipPaid, true);
      assert.equal(user.membershipExpiry.toISOString(), expiry);
    }
    assert.ok((await stored(paidLonger)).membershipExpiry > inDays(399), 'a longer membership is never shortened');
    assert.equal((await stored(deactivated)).membershipPaid, false);
    assert.equal((await stored(admin)).membershipPaid, false);

    // Both are told, in one shared notification since their message is the same.
    const Notification = mongoose.model('Notification');
    const notices = await Notification.find({ targetUsers: { $in: [unpaid.id, lapsed.id] }, title: 'Membership active' }).lean();
    assert.equal(notices.length, 1);
    assert.equal(notices[0].targetUsers.length, 2);
    assert.equal(await Payment.countDocuments({ user: { $in: [unpaid.id, lapsed.id] } }), 0, 'no payment unless asked for');
  });

  test('everyone matching the list filters can be marked paid at once', async () => {
    const chair = await makeUser('chairperson');
    const tag = `Bulk${Date.now()}`;
    const first = await makeUser('member', { lastName: tag, yearOfStudy: 2 });
    const second = await makeUser('member', { lastName: tag, yearOfStudy: 2, membershipPaid: true, membershipExpiry: inDays(-1) });
    const otherYear = await makeUser('member', { lastName: tag, yearOfStudy: 3 });

    const res = await bulk(chair, {
      membershipPaid: true,
      filter: { search: tag, year: '2', status: 'student', membership: 'unpaid', active: 'true' },
      membershipExpiry: inDays(90).toISOString()
    });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.matched, 2);
    assert.equal(res.body.updated, 2);
    assert.equal((await stored(first)).membershipPaid, true);
    assert.ok((await stored(second)).membershipExpiry > new Date());
    assert.equal((await stored(otherYear)).membershipPaid, false);

    const invalid = await bulk(chair, { membershipPaid: true, filter: { department: 'Astronomy' }, membershipExpiry: inDays(90).toISOString() });
    assert.equal(invalid.status, 400);
  });

  test('a payment of the standard fee can be recorded for each: registration if new, renewal if returning', async () => {
    const admin = await makeUser('admin');
    const newcomer = await makeUser();
    const returning = await makeUser('member', { lastPaymentDate: inDays(-200), membershipPaid: true, membershipExpiry: inDays(-20) });
    const body = { membershipPaid: true, ids: [newcomer.id, returning.id], membershipExpiry: inDays(180).toISOString(), recordPayment: true };

    const saved = { registration: process.env.REGISTRATION_FEE, renewal: process.env.RENEWAL_FEE };
    try {
      process.env.REGISTRATION_FEE = '500';
      delete process.env.RENEWAL_FEE;
      const missingFee = await bulk(admin, body);
      assert.equal(missingFee.status, 400);
      assert.match(missingFee.body.message, /renewal fee is not set/);

      process.env.RENEWAL_FEE = '300';
      const preview = await bulk(admin, { ...body, dryRun: true });
      assert.deepEqual(preview.body.payments, { registration: { count: 1, fee: 500 }, renewal: { count: 1, fee: 300 }, total: 800 });

      const res = await bulk(admin, body);
      assert.equal(res.status, 200, res.body.message);
    } finally {
      for (const [key, value] of [['REGISTRATION_FEE', saved.registration], ['RENEWAL_FEE', saved.renewal]]) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }

    const payments = await Payment.find({ user: { $in: [newcomer.id, returning.id] } }).lean();
    const byUser = Object.fromEntries(payments.map((p) => [String(p.user), p]));
    assert.equal(byUser[newcomer.id].type, 'registration');
    assert.equal(byUser[newcomer.id].amount, 500);
    assert.equal(byUser[returning.id].type, 'renewal');
    assert.equal(byUser[returning.id].amount, 300);
    assert.ok(payments.every((p) => p.status === 'verified' && String(p.verifiedBy) === admin.id));
    assert.ok((await stored(newcomer)).lastPaymentDate);
  });

  test('ticked members can be marked not paid again, to undo a mistake', async () => {
    const admin = await makeUser('admin');
    const paid = await makeUser('member', { membershipPaid: true, membershipExpiry: inDays(60) });
    const neverPaid = await makeUser();

    const res = await bulk(admin, { membershipPaid: false, ids: [paid.id, neverPaid.id] });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.updated, 1);
    assert.match(res.body.message, /1 member marked as not paid\. Left alone: 1 already not paid/);
    const user = await stored(paid);
    assert.equal(user.membershipPaid, false);
    assert.equal(user.membershipExpiry, undefined);

    // Marking everyone matching the filters as not paid is too easy to do by accident.
    const everyone = await bulk(admin, { membershipPaid: false, filter: { membership: 'current' } });
    assert.equal(everyone.status, 400);
  });

  test('refuses a missing or past expiry, both kinds of selection, and non-administrators', async () => {
    const admin = await makeUser('admin');
    const subject = await makeUser();
    const treasurer = await makeUser('treasurer');

    assert.equal((await bulk(admin, { membershipPaid: true, ids: [subject.id] })).status, 400);
    assert.equal((await bulk(admin, { membershipPaid: true, ids: [subject.id], membershipExpiry: '2020-01-01' })).status, 400);
    assert.equal((await bulk(admin, { membershipPaid: true, ids: [subject.id], filter: {}, membershipExpiry: inDays(30).toISOString() })).status, 400);
    assert.equal((await bulk(admin, { membershipPaid: true, membershipExpiry: inDays(30).toISOString() })).status, 400);
    assert.equal((await bulk(treasurer, { membershipPaid: true, ids: [subject.id], membershipExpiry: inDays(30).toISOString() })).status, 403);
    assert.equal((await stored(subject)).membershipPaid, false);
  });
});

describe('sign-up approval', () => {
  let applications = 0;
  /** Submit the registration form, leaving an account awaiting approval. */
  const apply = async (fields = {}) => {
    applications += 1;
    const payload = {
      firstName: 'Nekesa',
      lastName: 'Barasa',
      email: `applicant${applications}-${Date.now()}@example.com`,
      password: 'Str0ngPass1',
      regNumber: `B30/${String(applications).padStart(5, '0')}/26`,
      department: 'Electrical Engineering',
      ...fields
    };
    const res = await request(app).post('/api/auth/register').send(payload);
    assert.equal(res.status, 201, res.body.message);
    const user = await User.findOne({ email: payload.email }).lean();
    return { id: String(user._id), ...payload };
  };
  const approve = (actor, ids) => request(app).post('/api/users/admin/approve').set(actor.auth).send({ ids });
  const listed = async (admin, applicant, active) => {
    const res = await request(app).get(`/api/users/admin/list?active=${active}&search=${encodeURIComponent(applicant.regNumber)}`).set(admin.auth);
    assert.equal(res.status, 200, res.body.message);
    return res.body.users.map((u) => u._id);
  };

  test('administrators are told, and the applicant is listed only under awaiting approval', async () => {
    const admin = await makeUser('admin');
    const chair = await makeUser('chairperson');
    const member = await makeUser();
    const applicant = await apply();
    const Notification = mongoose.model('Notification');

    const notice = await Notification.findOne({ title: 'New member awaiting approval', createdBy: applicant.id }).lean();
    const told = notice.targetUsers.map(String);
    assert.ok(told.includes(admin.id) && told.includes(chair.id), 'admins and the chairperson are told');
    assert.ok(!told.includes(member.id), 'ordinary members are not');
    assert.match(notice.message, new RegExp(`Nekesa Barasa \\(${applicant.regNumber}, Electrical Engineering\\)`));

    assert.deepEqual(await listed(admin, applicant, 'pending'), [applicant.id]);
    assert.deepEqual(await listed(admin, applicant, 'false'), [], 'not counted as deactivated');
    assert.deepEqual(await listed(admin, applicant, 'true'), []);

    const summary = await request(app).get('/api/users/admin/summary').set(admin.auth);
    assert.ok(summary.body.pending >= 1);
  });

  test('approving lets the applicant sign in and welcomes them', async () => {
    const chair = await makeUser('chairperson');
    const applicant = await apply();

    const res = await approve(chair, [applicant.id]);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.approved, 1);
    assert.match(res.body.message, /Nekesa Barasa is approved/);

    const stored = await User.findById(applicant.id).lean();
    assert.equal(stored.isActive, true);
    assert.equal(stored.pendingApproval, undefined);
    assert.equal(String(stored.approvedBy), chair.id);

    const signIn = await request(app).post('/api/auth/login').send({ identifier: applicant.email, password: applicant.password });
    assert.equal(signIn.status, 200, signIn.body.message);
    assert.ok(signIn.body.token);

    const welcome = await mongoose.model('Notification').findOne({ title: 'Welcome to EESA', targetUsers: applicant.id }).lean();
    assert.ok(welcome, 'the new member is welcomed in the portal');

    assert.equal((await approve(chair, [applicant.id])).status, 400, 'already approved');
  });

  test('several can be approved at once; accounts not waiting are left alone', async () => {
    const admin = await makeUser('admin');
    const first = await apply();
    const second = await apply();
    const existing = await makeUser();

    const res = await approve(admin, [first.id, second.id, existing.id]);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.approved, 2);
    assert.match(res.body.message, /2 accounts approved\. They can now sign in\. 1 other was not waiting for approval\./);
  });

  test('only administrators approve, and restoring cannot skip approval', async () => {
    const admin = await makeUser('admin');
    const member = await makeUser();
    const treasurer = await makeUser('treasurer');
    const applicant = await apply();

    assert.equal((await approve(member, [applicant.id])).status, 403);
    assert.equal((await approve(treasurer, [applicant.id])).status, 403);

    const restore = await request(app).patch(`/api/users/${applicant.id}/status`).set(admin.auth).send({ isActive: true });
    assert.equal(restore.status, 400);
    assert.match(restore.body.message, /waiting for approval/);
    assert.equal((await User.findById(applicant.id).lean()).isActive, false);
  });
});

describe('deleting junk accounts', () => {
  const remove = (actor, id) => request(app).delete(`/api/users/admin/${id}`).set(actor.auth);

  test('a junk sign-up is deleted, with the notice about it', async () => {
    const admin = await makeUser('admin');
    const email = `junk${Date.now()}@example.com`;
    const reg = await request(app).post('/api/auth/register').send({
      firstName: 'Brian', lastName: 'Otieno', email, password: 'Str0ngPass1', regNumber: 'B31/00001/26'
    });
    assert.equal(reg.status, 201, reg.body.message);
    const junk = await User.findOne({ email }).lean();

    const res = await remove(admin, junk._id);
    assert.equal(res.status, 200, res.body.message);
    assert.match(res.body.message, /Brian Otieno's account has been deleted/);
    assert.equal(await User.findById(junk._id), null);
    assert.equal(await mongoose.model('Notification').countDocuments({ createdBy: junk._id }), 0);

    // The registration number is free again for its real owner.
    const again = await request(app).post('/api/auth/register').send({
      firstName: 'Brian', lastName: 'Otieno', email: `real${Date.now()}@example.com`, password: 'Str0ngPass1', regNumber: 'B31/00001/26'
    });
    assert.equal(again.status, 201, again.body.message);
  });

  test('an active account must be deactivated first; one with history is kept', async () => {
    const admin = await makeUser('admin');
    const member = await makeUser();
    const Notification = mongoose.model('Notification');

    const active = await remove(admin, member.id);
    assert.equal(active.status, 400);
    assert.match(active.body.message, /Deactivate .* before deleting/);

    await User.updateOne({ _id: member.id }, { isActive: false });
    await Payment.create({ user: member.id, type: 'registration', amount: 500, status: 'rejected' });
    const paid = await remove(admin, member.id);
    assert.equal(paid.status, 409);
    assert.match(paid.body.message, /has payments, so it cannot be deleted/);
    assert.ok(await User.findById(member.id));

    // With nothing but a read announcement, the account goes and the announcement stays.
    const quiet = await makeUser('member', { isActive: false });
    const announcement = await Notification.create({ title: 'AGM', message: 'Friday.', target: 'all', readBy: [quiet.id], createdBy: admin.id });
    assert.equal((await remove(admin, quiet.id)).status, 200);
    assert.deepEqual((await Notification.findById(announcement._id).lean()).readBy, []);
  });

  test('office holders are kept, and nobody deletes themselves or an account above them', async () => {
    const admin = await makeUser('admin');
    const chair = await makeUser('chairperson');
    const member = await makeUser();
    const treasurer = await makeUser('treasurer', { isActive: false });
    const otherAdmin = await makeUser('admin', { isActive: false });

    const office = await remove(admin, treasurer.id);
    assert.equal(office.status, 409);
    assert.match(office.body.message, /the Treasurer role/);

    assert.equal((await remove(admin, admin.id)).status, 400);
    assert.equal((await remove(chair, otherAdmin.id)).status, 403);
    assert.equal((await remove(member, treasurer.id)).status, 403);
  });
});
