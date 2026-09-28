/**
 * Certificate tests.
 *
 * Covers recording leadership terms from role changes, issuing and revoking
 * leadership certificates, members claiming membership certificates, the
 * signatories printed on them, and the public verification lookup. Cloudinary
 * is stubbed and MongoDB runs in memory.
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-32';
process.env.FRONTEND_URL = 'http://localhost:3000';
delete process.env.BREVO_API_KEY;
delete process.env.SMTP_HOST;
delete process.env.ACADEMIC_YEAR_START_MONTH;

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

const cloudinary = require('../config/cloudinary');

let uploadCount = 0;
const destroyed = [];
cloudinary.uploader.upload_stream = (options, callback) => ({
  end: () => {
    uploadCount += 1;
    const publicId = `${options.folder}/test-${uploadCount}`;
    setImmediate(() => callback(null, {
      secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.png`,
      public_id: publicId,
      width: 800,
      height: 300
    }));
  }
});
cloudinary.uploader.destroy = async (publicId) => {
  destroyed.push(publicId);
  return { result: 'ok' };
};
const wasDestroyed = (url) => destroyed.some((publicId) => url.endsWith(`/${publicId}.png`));

// A 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let mongod;
let app;
let User;
let Payment;
let Notification;
let LeadershipTerm;
let Certificate;
let Signatory;
let certificates;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  Payment = require('../models/Payment');
  Notification = require('../models/Notification');
  LeadershipTerm = require('../models/LeadershipTerm');
  Certificate = require('../models/Certificate');
  Signatory = require('../models/Signatory');
  certificates = require('../utils/certificates');
  await Promise.all([Certificate.init(), LeadershipTerm.init()]);

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
  app.use(express.json());
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/users', require('../routes/users'));
  app.use('/api/certificates', require('../routes/certificates'));
  app.use(notFound);
  app.use(errorHandler);
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

let counter = 0;
const DAY = 24 * 60 * 60 * 1000;

/** A member; `paid` gives them a subscription running for another 90 days. */
const makeUser = async ({ role = 'member', paid = false, expiry, department = 'Civil Engineering' } = {}) => {
  counter += 1;
  const res = await request(app).post('/api/auth/register').send({
    firstName: `Cert${counter}`,
    lastName: 'Holder',
    email: `cert${counter}-${Date.now()}@example.com`,
    password: 'Str0ngPass1',
    regNumber: `C13/0${counter}/26`,
    department
  });
  assert.equal(res.status, 201, res.body.message);
  const updates = {};
  if (role !== 'member') updates.role = role;
  if (paid) {
    updates.membershipPaid = true;
    updates.membershipExpiry = expiry || new Date(Date.now() + 90 * DAY);
  }
  if (Object.keys(updates).length) await User.updateOne({ _id: res.body._id }, updates);
  return { id: res.body._id, name: `Cert${counter} Holder`, auth: { Authorization: `Bearer ${res.body.token}` } };
};

const addSignatory = (admin, { name = 'Jane Wanjiru', title = 'Chairperson', types } = {}) => {
  const req = request(app).post('/api/certificates/signatories').set(admin.auth).field('name', name).field('title', title);
  if (types) req.field('certificateTypes', types.join(','));
  return req.attach('signature', PNG, { filename: 'signature.png', contentType: 'image/png' });
};

/** Start every group from the same signatories: one who signs everything. */
const resetSignatories = async (admin) => {
  await Signatory.deleteMany({});
  const res = await addSignatory(admin);
  assert.equal(res.status, 201, res.body.message);
  return res.body.signatory;
};

const setRole = (admin, member, role) => request(app).put(`/api/users/${member.id}/role`).set(admin.auth).send({ role });

const listTerms = (admin, params = '') => request(app).get(`/api/certificates/terms${params}`).set(admin.auth);

const termFor = (userId, extra = {}) => LeadershipTerm.findOne({ user: userId, ...extra }).sort({ createdAt: -1 }).lean();

const issue = (admin, termId) => request(app).post(`/api/certificates/terms/${termId}/certificate`).set(admin.auth);

/** A finished term, recorded by hand, for a member. */
const finishedTerm = async (admin, member, office = 'Treasurer') => {
  const res = await request(app).post('/api/certificates/terms').set(admin.auth).send({
    userId: member.id,
    office,
    startDate: '2024-09-01',
    endDate: '2025-08-31'
  });
  assert.equal(res.status, 201, res.body.message);
  return res.body.term;
};

describe('academic years', () => {
  test('the year turns over at the start of September in Nairobi', () => {
    const { academicYearOf } = certificates;
    assert.equal(academicYearOf(new Date('2026-09-28T09:00:00Z')), '2026/2027');
    assert.equal(academicYearOf(new Date('2026-03-15T09:00:00Z')), '2025/2026');
    // 1 September, 01:00 in Nairobi, is still 31 August in UTC.
    assert.equal(academicYearOf(new Date('2026-08-31T22:00:00Z')), '2026/2027');
    assert.equal(academicYearOf(new Date('2026-08-31T20:00:00Z')), '2025/2026');
  });

  test('the starting month can be configured', () => {
    process.env.ACADEMIC_YEAR_START_MONTH = '1';
    try {
      assert.equal(certificates.academicYearOf(new Date('2026-03-15T09:00:00Z')), '2026/2027');
    } finally {
      delete process.env.ACADEMIC_YEAR_START_MONTH;
    }
  });
});

describe('recording leadership terms', () => {
  test('giving a member an office opens a term, and taking it away ends it', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await makeUser();

    const before = Date.now();
    assert.equal((await setRole(admin, member, 'treasurer')).status, 200);
    let term = await termFor(member.id);
    assert.equal(term.role, 'treasurer');
    assert.equal(term.office, 'Treasurer');
    assert.equal(term.source, 'recorded');
    assert.equal(term.name, member.name);
    assert.ok(term.startDate.getTime() >= before - 1000);
    assert.equal(term.endDate, null);

    assert.equal((await setRole(admin, member, 'member')).status, 200);
    term = await termFor(member.id);
    assert.ok(term.endDate, 'the term ends when the office is taken away');
    assert.equal(await LeadershipTerm.countDocuments({ user: member.id }), 1);
  });

  test('moving between offices ends one term and opens the next', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await makeUser();
    await setRole(admin, member, 'publicity_manager');
    await setRole(admin, member, 'vice_chairperson');

    const terms = await LeadershipTerm.find({ user: member.id }).sort({ createdAt: 1 }).lean();
    assert.deepEqual(terms.map((t) => t.role), ['publicity_manager', 'vice_chairperson']);
    assert.ok(terms[0].endDate);
    assert.equal(terms[1].endDate, null);
  });

  test('the admin role is not an office, so it records no term', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await makeUser();
    await setRole(admin, member, 'admin');
    assert.equal(await LeadershipTerm.countDocuments({ user: member.id }), 0);
  });

  test('people already in office get a term without a start date, once', async () => {
    const admin = await makeUser({ role: 'admin' });
    const sitting = await makeUser({ role: 'secretary_general' });

    const first = await listTerms(admin, '?state=serving');
    assert.equal(first.status, 200, first.body.message);
    await listTerms(admin, '?state=serving');

    const terms = await LeadershipTerm.find({ user: sitting.id }).lean();
    assert.equal(terms.length, 1);
    assert.equal(terms[0].source, 'existing');
    assert.equal(terms[0].startDate, null);

    const row = first.body.terms.find((t) => t.user?._id === sitting.id);
    assert.equal(row.status, 'serving');
    assert.equal(row.office, 'Secretary General');
    assert.equal(row.certificate, null);
  });

  test('the serving list is in order of office', async () => {
    const admin = await makeUser({ role: 'admin' });
    await makeUser({ role: 'treasurer' });
    await makeUser({ role: 'chairperson' });
    const res = await listTerms(admin, '?state=serving&limit=50');
    const roles = res.body.terms.map((t) => t.role);
    assert.ok(roles.indexOf('chairperson') < roles.indexOf('treasurer'));
  });

  test('only the admin and chairperson can see or change terms', async () => {
    const treasurer = await makeUser({ role: 'treasurer' });
    const member = await makeUser();
    for (const user of [treasurer, member]) {
      assert.equal((await listTerms(user)).status, 403);
      const create = await request(app).post('/api/certificates/terms').set(user.auth)
        .send({ name: 'Someone', office: 'Chairperson', startDate: '2020-09-01', endDate: '2021-08-31' });
      assert.equal(create.status, 403);
    }
  });
});

describe('terms added by hand', () => {
  test('a past leader without an account needs a name, an office and both dates', async () => {
    const admin = await makeUser({ role: 'chairperson' });
    const missing = await request(app).post('/api/certificates/terms').set(admin.auth).send({ office: 'Chairperson', startDate: '2019-09-01' });
    assert.equal(missing.status, 400);
    assert.ok(missing.body.errors.name);
    assert.ok(missing.body.errors.endDate);

    const res = await request(app).post('/api/certificates/terms').set(admin.auth).send({
      name: 'Peter Otieno', office: 'Chairperson', startDate: '2019-09-01', endDate: '2020-08-31'
    });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.term.name, 'Peter Otieno');
    assert.equal(res.body.term.user, null);
    assert.equal(res.body.term.source, 'manual');
    assert.equal(res.body.term.status, 'ended');
  });

  test('a term cannot end before it starts', async () => {
    const admin = await makeUser({ role: 'admin' });
    const res = await request(app).post('/api/certificates/terms').set(admin.auth).send({
      name: 'Backwards', office: 'Treasurer', startDate: '2020-09-01', endDate: '2020-01-01'
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /end after it starts/);
  });

  test('nobody records a term for themselves', async () => {
    const admin = await makeUser({ role: 'chairperson' });
    const res = await request(app).post('/api/certificates/terms').set(admin.auth).send({
      userId: admin.id, office: 'Chairperson', startDate: '2020-09-01', endDate: '2021-08-31'
    });
    assert.equal(res.status, 403);
  });

  test('a hand-made term for a sitting office holder does not hide their current term', async () => {
    const admin = await makeUser({ role: 'admin' });
    const chair = await makeUser({ role: 'chairperson' });
    await finishedTerm(admin, chair, 'Chairperson');
    await listTerms(admin);
    assert.equal(await LeadershipTerm.countDocuments({ user: chair.id, source: 'existing', role: 'chairperson' }), 1);
  });

  test('dates can be corrected, but a manual term keeps its end date', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await makeUser();
    const term = await finishedTerm(admin, member);

    const moved = await request(app).put(`/api/certificates/terms/${term._id}`).set(admin.auth).send({ startDate: '2024-10-01' });
    assert.equal(moved.status, 200, moved.body.message);
    assert.equal(moved.body.term.startDate.slice(0, 10), '2024-10-01');

    const cleared = await request(app).put(`/api/certificates/terms/${term._id}`).set(admin.auth).send({ endDate: '' });
    assert.equal(cleared.status, 400);
  });

  test('a sitting office holder\'s open term cannot be deleted', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await makeUser();
    await setRole(admin, member, 'project_manager');
    const term = await termFor(member.id);
    const res = await request(app).delete(`/api/certificates/terms/${term._id}`).set(admin.auth);
    assert.equal(res.status, 409);

    const past = await finishedTerm(admin, member);
    assert.equal((await request(app).delete(`/api/certificates/terms/${past._id}`).set(admin.auth)).status, 200);
  });
});

describe('leadership certificates', () => {
  test('a finished term is certified with the signatories of the day, and the leader is told', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const member = await makeUser({ department: 'Mechanical Engineering' });
    const term = await finishedTerm(admin, member);

    const res = await issue(admin, term._id);
    assert.equal(res.status, 201, res.body.message);
    const { certificate } = res.body;
    assert.match(certificate.number, /^EESA-CERT-\d{2}-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(certificate.type, 'leadership');
    assert.equal(certificate.recipientName, member.name);
    assert.equal(certificate.department, 'Mechanical Engineering');
    assert.equal(certificate.office, 'Treasurer');
    assert.equal(certificate.startDate.slice(0, 10), '2024-09-01');
    assert.equal(certificate.endDate.slice(0, 10), '2025-08-31');
    assert.equal(certificate.signatories.length, 1);
    assert.equal(certificate.signatories[0].title, 'Chairperson');
    assert.ok(certificate.signatories[0].signatureUrl);

    const notice = await Notification.findOne({ targetUsers: member.id, type: 'certificate' }).lean();
    assert.ok(notice, 'the leader is notified');
    assert.match(notice.message, /Treasurer from 1 September 2024 to 31 August 2025/);

    const mine = await request(app).get('/api/certificates/my').set(member.auth);
    assert.deepEqual(mine.body.certificates.map((c) => c.number), [certificate.number]);
  });

  test('a term without its dates cannot be certified yet', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    await makeUser({ role: 'organizing_secretary' });
    await listTerms(admin);
    const term = await LeadershipTerm.findOne({ source: 'existing', role: 'organizing_secretary' }).lean();
    const res = await issue(admin, term._id);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /started and ended/);
  });

  test('without a signatory for leadership certificates nothing is issued', async () => {
    const admin = await makeUser({ role: 'admin' });
    await Signatory.deleteMany({});
    const res0 = await addSignatory(admin, { types: ['membership'] });
    assert.equal(res0.status, 201, res0.body.message);
    const term = await finishedTerm(admin, await makeUser());
    const res = await issue(admin, term._id);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /signatory/);
  });

  test('one valid certificate per term; the term is locked until it is revoked', async () => {
    const admin = await makeUser({ role: 'chairperson' });
    await resetSignatories(admin);
    const member = await makeUser();
    const term = await finishedTerm(admin, member);
    const first = await issue(admin, term._id);
    assert.equal(first.status, 201);

    assert.equal((await issue(admin, term._id)).status, 409);
    const edit = await request(app).put(`/api/certificates/terms/${term._id}`).set(admin.auth).send({ endDate: '2025-07-31' });
    assert.equal(edit.status, 409);
    assert.match(edit.body.message, /Revoke it first/);

    const revoked = await request(app).post(`/api/certificates/${first.body.certificate._id}/revoke`).set(admin.auth).send({ reason: 'Wrong end date' });
    assert.equal(revoked.status, 200, revoked.body.message);
    assert.equal(revoked.body.certificate.status, 'revoked');

    assert.equal((await request(app).put(`/api/certificates/terms/${term._id}`).set(admin.auth).send({ endDate: '2025-07-31' })).status, 200);
    const second = await issue(admin, term._id);
    assert.equal(second.status, 201, second.body.message);
    assert.notEqual(second.body.certificate.number, first.body.certificate.number);
    assert.equal(second.body.certificate.endDate.slice(0, 10), '2025-07-31');
  });

  test('nobody certifies their own term', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const chair = await makeUser();
    await setRole(admin, chair, 'chairperson');
    const term = await termFor(chair.id);
    await LeadershipTerm.updateOne({ _id: term._id }, { endDate: new Date(Date.now() + 30 * DAY) });

    const res = await issue(chair, term._id);
    assert.equal(res.status, 403);
    assert.equal((await issue(admin, term._id)).status, 201, 'another administrator can');
  });

  test('a past leader without an account can be certified', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const created = await request(app).post('/api/certificates/terms').set(admin.auth).send({
      name: 'Mary Achieng', office: 'Secretary General', startDate: '2018-09-01', endDate: '2019-08-31'
    });
    const res = await issue(admin, created.body.term._id);
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.certificate.recipientName, 'Mary Achieng');
    assert.equal(res.body.certificate.user, null);
  });

  test('ordinary members cannot issue, list or revoke certificates', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const term = await finishedTerm(admin, await makeUser());
    const issued = await issue(admin, term._id);
    const member = await makeUser({ role: 'publicity_manager' });

    assert.equal((await issue(member, term._id)).status, 403);
    assert.equal((await request(app).get('/api/certificates').set(member.auth)).status, 403);
    assert.equal((await request(app).post(`/api/certificates/${issued.body.certificate._id}/revoke`).set(member.auth).send({ reason: 'x' })).status, 403);
  });
});

describe('membership certificates', () => {
  test('a member who has never paid is told to pay first', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const member = await makeUser();
    const res = await request(app).post('/api/certificates/membership').set(member.auth).send({});
    assert.equal(res.status, 403);
    assert.match(res.body.message, /Pay your membership subscription first/);

    const mine = await request(app).get('/api/certificates/my').set(member.auth);
    assert.deepEqual(mine.body.membership.available, []);
    assert.equal(mine.body.membership.ready, true);
  });

  test('a paid member claims this year\'s certificate once; claiming again returns the same one', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const member = await makeUser({ paid: true, department: 'Other' });
    const year = certificates.academicYearOf();

    const before = await request(app).get('/api/certificates/my').set(member.auth);
    assert.deepEqual(before.body.membership.available, [year]);

    const first = await request(app).post('/api/certificates/membership').set(member.auth).send({});
    assert.equal(first.status, 201, first.body.message);
    assert.equal(first.body.certificate.type, 'membership');
    assert.equal(first.body.certificate.academicYear, year);
    assert.equal(first.body.certificate.recipientName, member.name);
    assert.equal(first.body.certificate.department, '', '"Other" is not printed');
    assert.match(first.body.certificate.regNumber, /^C13\//);

    const again = await request(app).post('/api/certificates/membership').set(member.auth).send({ academicYear: year });
    assert.equal(again.status, 200);
    assert.equal(again.body.certificate.number, first.body.certificate.number);
    assert.equal(await Certificate.countDocuments({ user: member.id }), 1);

    const after = await request(app).get('/api/certificates/my').set(member.auth);
    assert.deepEqual(after.body.membership.available, []);
    assert.equal(after.body.certificates.length, 1);
  });

  test('an earlier year a payment was verified in can be claimed too', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const member = await makeUser();
    await Payment.create({ user: member.id, type: 'registration', amount: 500, status: 'verified', verifiedAt: new Date('2025-02-10T09:00:00Z') });

    const mine = await request(app).get('/api/certificates/my').set(member.auth);
    assert.deepEqual(mine.body.membership.available, ['2024/2025']);

    const res = await request(app).post('/api/certificates/membership').set(member.auth).send({ academicYear: '2024/2025' });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.certificate.academicYear, '2024/2025');

    const other = await request(app).post('/api/certificates/membership').set(member.auth).send({ academicYear: '2023/2024' });
    assert.equal(other.status, 403);
    const malformed = await request(app).post('/api/certificates/membership').set(member.auth).send({ academicYear: '2023/2025' });
    assert.equal(malformed.status, 400);
  });

  test('an expired subscription does not give this year\'s certificate', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const member = await makeUser({ paid: true, expiry: new Date(Date.now() - DAY) });
    const res = await request(app).post('/api/certificates/membership').set(member.auth).send({});
    assert.equal(res.status, 403);
  });

  test('before anyone signs membership certificates, members are asked to wait', async () => {
    const admin = await makeUser({ role: 'admin' });
    await Signatory.deleteMany({});
    await addSignatory(admin, { types: ['leadership'] });
    const member = await makeUser({ paid: true });

    const mine = await request(app).get('/api/certificates/my').set(member.auth);
    assert.equal(mine.body.membership.ready, false);
    const res = await request(app).post('/api/certificates/membership').set(member.auth).send({});
    assert.equal(res.status, 409);
  });

  test('a revoked certificate can be claimed again while the member is still eligible', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const member = await makeUser({ paid: true });
    const first = await request(app).post('/api/certificates/membership').set(member.auth).send({});
    await request(app).post(`/api/certificates/${first.body.certificate._id}/revoke`).set(admin.auth).send({ reason: 'Name misspelt' });

    const notice = await Notification.findOne({ targetUsers: member.id, title: 'A certificate was withdrawn' }).lean();
    assert.match(notice.message, /Name misspelt/);

    const mine = await request(app).get('/api/certificates/my').set(member.auth);
    assert.equal(mine.body.certificates.length, 0, 'revoked certificates are not offered for download');
    const second = await request(app).post('/api/certificates/membership').set(member.auth).send({});
    assert.equal(second.status, 201);
    assert.notEqual(second.body.certificate.number, first.body.certificate.number);
  });
});

describe('signatories', () => {
  test('a signatory needs a name, a title and a signature image', async () => {
    const admin = await makeUser({ role: 'admin' });
    await Signatory.deleteMany({});
    const noFile = await request(app).post('/api/certificates/signatories').set(admin.auth).field('name', 'A').field('title', 'Patron');
    assert.equal(noFile.status, 400);
    const noTitle = await request(app).post('/api/certificates/signatories').set(admin.auth).field('name', 'A')
      .attach('signature', PNG, { filename: 's.png', contentType: 'image/png' });
    assert.equal(noTitle.status, 400);
    assert.ok(noTitle.body.errors.title);

    const res = await addSignatory(admin, { name: 'Dr. Kamau', title: 'Patron', types: ['leadership'] });
    assert.equal(res.status, 201, res.body.message);
    assert.deepEqual(res.body.signatory.certificateTypes, ['leadership']);
    assert.match(res.body.signatory.signatureUrl, /eesa\/signatures/);
  });

  test('each kind of certificate has room for three signatures', async () => {
    const admin = await makeUser({ role: 'admin' });
    await Signatory.deleteMany({});
    for (let i = 0; i < 3; i += 1) assert.equal((await addSignatory(admin, { name: `S${i}` })).status, 201);
    const fourth = await addSignatory(admin, { name: 'S3', types: ['membership'] });
    assert.equal(fourth.status, 409);
    assert.match(fourth.body.message, /Membership certificates already have 3/);
  });

  test('certificates keep the signatures they were issued with', async () => {
    const admin = await makeUser({ role: 'admin' });
    const signatory = await resetSignatories(admin);
    const term = await finishedTerm(admin, await makeUser());
    const issued = await issue(admin, term._id);
    assert.equal(issued.status, 201);

    const renamed = await request(app).put(`/api/certificates/signatories/${signatory._id}`).set(admin.auth)
      .field('name', 'New Chair')
      .attach('signature', PNG, { filename: 'new.png', contentType: 'image/png' });
    assert.equal(renamed.status, 200, renamed.body.message);
    assert.equal(renamed.body.signatory.name, 'New Chair');
    assert.notEqual(renamed.body.signatory.signatureUrl, signatory.signatureUrl);

    const stored = await Certificate.findById(issued.body.certificate._id).lean();
    assert.equal(stored.signatories[0].name, 'Jane Wanjiru');
    assert.equal(stored.signatories[0].signatureUrl, signatory.signatureUrl);
    assert.ok(!wasDestroyed(signatory.signatureUrl), 'a signature printed on a certificate is kept');

    // One never printed on anything is deleted with its signatory.
    const unused = renamed.body.signatory;
    await request(app).delete(`/api/certificates/signatories/${unused._id}`).set(admin.auth);
    assert.ok(wasDestroyed(unused.signatureUrl));
  });

  test('the order on the certificate can be changed', async () => {
    const admin = await makeUser({ role: 'admin' });
    await Signatory.deleteMany({});
    const a = (await addSignatory(admin, { name: 'Left' })).body.signatory;
    const b = (await addSignatory(admin, { name: 'Right', title: 'Patron' })).body.signatory;
    const res = await request(app).put('/api/certificates/signatories/order').set(admin.auth).send({ ids: [b._id, a._id] });
    assert.equal(res.status, 200, res.body.message);
    assert.deepEqual(res.body.signatories.map((s) => s.name), ['Right', 'Left']);
    assert.deepEqual((await certificates.signatoriesFor('membership')).map((s) => s.name), ['Right', 'Left']);
  });

  test('only the admin and chairperson manage signatories', async () => {
    const treasurer = await makeUser({ role: 'treasurer' });
    assert.equal((await request(app).get('/api/certificates/signatories').set(treasurer.auth)).status, 403);
    assert.equal((await addSignatory(treasurer)).status, 403);
  });
});

describe('issued certificates and verification', () => {
  test('administrators list certificates by kind and status, and search them', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const member = await makeUser({ paid: true });
    const claimed = await request(app).post('/api/certificates/membership').set(member.auth).send({});

    const list = await request(app).get('/api/certificates?type=membership').set(admin.auth);
    assert.equal(list.status, 200, list.body.message);
    assert.ok(list.body.certificates.every((c) => c.type === 'membership' && c.status === 'valid'));
    assert.ok(list.body.counts.membership >= 1);

    const found = await request(app).get(`/api/certificates?search=${claimed.body.certificate.number}`).set(admin.auth);
    assert.deepEqual(found.body.certificates.map((c) => c.number), [claimed.body.certificate.number]);
  });

  test('anyone can verify a certificate, without seeing contact details', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const member = await makeUser();
    const term = await finishedTerm(admin, member, 'Organizing Secretary');
    const { certificate } = (await issue(admin, term._id)).body;

    const res = await request(app).get(`/api/certificates/verify/${certificate.number.toLowerCase()}`);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.recipientName, member.name);
    assert.equal(res.body.office, 'Organizing Secretary');
    assert.equal(res.body.regNumber, undefined);
    assert.equal(res.body.signatories, undefined);

    await request(app).post(`/api/certificates/${certificate._id}/revoke`).set(admin.auth).send({ reason: 'Issued in error' });
    const revoked = await request(app).get(`/api/certificates/verify/${certificate.number}`);
    assert.equal(revoked.body.valid, false);
    assert.equal(revoked.body.status, 'revoked');
    assert.equal(revoked.body.recipientName, undefined);

    const again = await request(app).post(`/api/certificates/${certificate._id}/revoke`).set(admin.auth).send({ reason: 'Twice' });
    assert.equal(again.status, 409);
  });

  test('unknown and malformed numbers are reported as such', async () => {
    assert.equal((await request(app).get('/api/certificates/verify/EESA-CERT-26-AAAAAA')).status, 404);
    const malformed = await request(app).get('/api/certificates/verify/EESA-26-AAAAAA');
    assert.equal(malformed.status, 400);
    assert.match(malformed.body.message, /EESA-CERT-/);
  });

  test('revoking needs a reason', async () => {
    const admin = await makeUser({ role: 'admin' });
    await resetSignatories(admin);
    const term = await finishedTerm(admin, await makeUser());
    const { certificate } = (await issue(admin, term._id)).body;
    const res = await request(app).post(`/api/certificates/${certificate._id}/revoke`).set(admin.auth).send({ reason: ' ' });
    assert.equal(res.status, 400);
  });
});
