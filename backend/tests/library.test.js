/**
 * Library tests: uploads, unit folders, review, editing, private file access.
 *
 * Cloudinary and the storage fetch are replaced with in-process stubs, so these
 * never touch real storage, and MongoDB runs in memory.
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-32';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.CLOUDINARY_CLOUD_NAME = 'demo';
process.env.CLOUDINARY_API_KEY = 'key';
process.env.CLOUDINARY_API_SECRET = 'secret';
delete process.env.BREVO_API_KEY;
delete process.env.SMTP_HOST;

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

const cloudinary = require('../config/cloudinary');

const uploads = [];
const destroyed = [];
cloudinary.uploader.upload_stream = (options, callback) => ({
  end: () => {
    const publicId = `${options.folder}/${options.public_id}`;
    uploads.push({ publicId, options });
    setImmediate(() => callback(null, {
      secure_url: `https://res.cloudinary.com/demo/raw/authenticated/v1/${publicId}`,
      public_id: publicId,
      resource_type: 'raw',
      type: 'authenticated'
    }));
  }
});
cloudinary.uploader.destroy = async (publicId, options) => {
  destroyed.push({ publicId, options });
  return { result: 'ok' };
};

const fetched = [];
const STORED_BODY = '%PDF-1.4 stored file';

let mongod;
let app;
let User;
let Notification;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  Notification = require('../models/Notification');
  await require('../models/Unit').init();

  // Stubbed only after the database is up, so nothing else is affected.
  global.fetch = async (url) => {
    fetched.push(String(url));
    return new Response(STORED_BODY, { status: 200, headers: { 'content-type': 'application/pdf' } });
  };

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
  app.use(express.json());
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/resources', require('../routes/resources'));
  app.use('/api/units', require('../routes/units'));
  app.use(notFound);
  app.use(errorHandler);
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

let counter = 0;
const makeUser = async (role = 'member') => {
  counter += 1;
  const res = await request(app).post('/api/auth/register').send({
    firstName: `Reader${counter}`,
    lastName: 'Test',
    email: `reader${counter}-${Date.now()}@example.com`,
    password: 'Str0ngPass1'
  });
  assert.equal(res.status, 201, res.body.message);
  if (role !== 'member') await User.updateOne({ _id: res.body._id }, { role });
  return { id: res.body._id, token: res.body.token, auth: { Authorization: `Bearer ${res.body.token}` } };
};

let fileCounter = 0;
const upload = (user, name, fields = {}, { content, contentType = 'application/pdf' } = {}) => {
  fileCounter += 1;
  let req = request(app).post('/api/resources').set(user.auth);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, String(value));
  const body = Buffer.from(content ?? `%PDF-1.4 unique body ${fileCounter}`);
  return req.attach('file', body, { filename: name, contentType });
};

/* ------------------------------------------------------------------ *
 * Uploading
 * ------------------------------------------------------------------ */

describe('uploading', () => {
  let member;
  let admin;
  before(async () => {
    member = await makeUser();
    admin = await makeUser('admin');
  });

  test('files an upload under the unit named in its file name and holds it for review', async () => {
    const res = await upload(member, 'EEEN_481 Project Management.pdf', { year: 4, semester: 2, category: 'notes' });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.status, 'pending');
    assert.equal(res.body.unit.code, 'EEEN 481');
    assert.equal(res.body.unit.verified, false);
    assert.equal(res.body.year, 4);
    assert.equal(res.body.title, 'EEEN 481 Project Management');
  });

  test('stores files privately and never exposes storage details', async () => {
    const res = await upload(member, 'EEEN 482 notes.pdf', { year: 4, semester: 2 });
    assert.equal(res.status, 201, res.body.message);
    const { options } = uploads.at(-1);
    assert.equal(options.type, 'authenticated');
    assert.equal(options.resource_type, 'raw');
    for (const field of ['fileUrl', 'filePublicId', 'fileHash', 'downloadedBy']) {
      assert.equal(res.body[field], undefined, `${field} leaked`);
    }
  });

  test('uses an existing unit\'s year and semester over the uploader\'s choice', async () => {
    const unit = await request(app).post('/api/units').set(admin.auth).send({ code: 'MATH 222', name: 'Integral Calculus', year: 1, semester: 2 });
    assert.equal(unit.status, 201, unit.body.message);

    const res = await upload(member, 'MATH222 cat.pdf', { year: 3, semester: 1 });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.unit._id, unit.body._id);
    assert.equal(res.body.year, 1);
    assert.equal(res.body.semester, 2);
  });

  test('accepts a unit chosen explicitly instead of detected', async () => {
    const unit = await request(app).post('/api/units').set(admin.auth).send({ code: 'EEEN 216', name: 'Service unit' });
    const res = await upload(member, 'handout.pdf', { unit: unit.body._id });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.unitCode, 'EEEN 216');
    assert.equal(res.body.year, null);
  });

  test('refuses a file with no recognisable unit and stores nothing', async () => {
    const before = uploads.length;
    const res = await upload(member, 'April 2024 revision.pdf');
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.unitCode);
    assert.equal(uploads.length, before);
  });

  test('validates details before storing the file', async () => {
    const before = uploads.length;
    const res = await upload(member, 'EEEN 483.pdf', { title: 'x'.repeat(201) });
    assert.equal(res.status, 400);
    assert.equal(uploads.length, before);
  });

  test('refuses a duplicate of a file already in the library', async () => {
    const content = '%PDF-1.4 the same bytes twice';
    const first = await upload(member, 'EEEN 484 a.pdf', { year: 4, semester: 1 }, { content });
    assert.equal(first.status, 201, first.body.message);

    const before = uploads.length;
    const second = await upload(member, 'EEEN 484 b.pdf', { year: 4, semester: 1 }, { content });
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'duplicate_file');
    assert.equal(uploads.length, before);
  });

  test('publishes a reviewer\'s upload at once and confirms its new unit', async () => {
    const res = await upload(admin, 'EEEN 436 Power Electronics.pdf', { year: 4, semester: 1, unitName: 'Power Electronics' });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.status, 'approved');
    assert.equal(res.body.unit.verified, true);
    assert.equal(res.body.unit.name, 'Power Electronics');
  });

  test('keeps non-English file names intact', async () => {
    const res = await upload(member, 'EEEN 441 Système embarqué.pdf', { year: 4, semester: 2 });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.originalFileName, 'EEEN 441 Système embarqué.pdf');
  });

  test('recognises an Office document sent as a generic binary', async () => {
    const res = await upload(member, 'EEEN 442 slides.pptx', { year: 4, semester: 2 }, { contentType: 'application/octet-stream' });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.fileType, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  });
});

/* ------------------------------------------------------------------ *
 * Browsing and review
 * ------------------------------------------------------------------ */

describe('browsing and review', () => {
  let member;
  let classmate;
  let admin;
  let file;

  before(async () => {
    member = await makeUser();
    classmate = await makeUser();
    admin = await makeUser('admin');
    const res = await upload(member, 'EEEN 492 2023 exam.pdf', { year: 4, semester: 2, category: 'past-papers' });
    assert.equal(res.status, 201, res.body.message);
    file = res.body;
  });

  test('hides pending files and unconfirmed units from other members', async () => {
    const list = await request(app).get('/api/resources?search=EEEN 492').set(classmate.auth);
    assert.equal(list.body.total, 0);

    const units = await request(app).get('/api/units').set(classmate.auth);
    assert.ok(!units.body.units.some((u) => u.code === 'EEEN 492'));

    assert.equal((await request(app).get(`/api/resources/${file._id}`).set(classmate.auth)).status, 404);
    assert.equal((await request(app).get(`/api/resources/${file._id}/ticket`).set(classmate.auth)).status, 404);
  });

  test('shows reviewers the queue and lets them preview before deciding', async () => {
    const queue = await request(app).get('/api/resources/pending').set(admin.auth);
    assert.ok(queue.body.resources.some((r) => r._id === file._id));
    assert.equal((await request(app).get(`/api/resources/${file._id}/ticket`).set(admin.auth)).status, 200);
    assert.equal((await request(app).get('/api/resources/pending').set(member.auth)).status, 403);
  });

  test('requires a reason to reject', async () => {
    const res = await request(app).put(`/api/resources/${file._id}/review`).set(admin.auth).send({ status: 'rejected' });
    assert.equal(res.status, 400);
  });

  test('approving publishes the file, confirms its unit and notifies the uploader', async () => {
    const res = await request(app).put(`/api/resources/${file._id}/review`).set(admin.auth).send({ status: 'approved' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.unit.verified, true);

    const units = await request(app).get('/api/units').set(classmate.auth);
    const unit = units.body.units.find((u) => u.code === 'EEEN 492');
    assert.equal(unit.files.total, 1);
    assert.equal(unit.files.byType['past-papers'], 1);
    assert.equal(unit.files.pending, undefined);

    const folder = await request(app).get(`/api/resources?unit=${unit._id}&type=past-papers`).set(classmate.auth);
    assert.equal(folder.body.total, 1);

    const note = await Notification.findOne({ targetUsers: member.id, type: 'resource' }).lean();
    assert.ok(note, 'uploader was not notified');
    assert.equal(note.target, 'specific');
    assert.match(note.message, /Year 4 › Semester 2 › EEEN 492 › Past papers/);
  });

  test('refuses to repeat a decision already made', async () => {
    const res = await request(app).put(`/api/resources/${file._id}/review`).set(admin.auth).send({ status: 'approved' });
    assert.equal(res.status, 409);
  });

  test('search matches unit names and compact codes', async () => {
    await request(app).put(`/api/units/${file.unit._id}`).set(admin.auth).send({ name: 'Power Systems Protection' });
    const byName = await request(app).get('/api/resources?search=systems protection').set(classmate.auth);
    assert.ok(byName.body.resources.some((r) => r._id === file._id));
    const byCode = await request(app).get('/api/resources?search=eeen492').set(classmate.auth);
    assert.ok(byCode.body.resources.some((r) => r._id === file._id));
  });
});

/* ------------------------------------------------------------------ *
 * Editing and moving
 * ------------------------------------------------------------------ */

describe('editing and moving', () => {
  let member;
  let other;
  let admin;

  before(async () => {
    member = await makeUser();
    other = await makeUser();
    admin = await makeUser('admin');
  });

  test('editing a rejected file sends it back for review', async () => {
    const created = await upload(member, 'EEEN 464 comms.pdf', { year: 4, semester: 2 });
    await request(app).put(`/api/resources/${created.body._id}/review`).set(admin.auth).send({ status: 'rejected', rejectionReason: 'Wrong type' });

    const res = await request(app).patch(`/api/resources/${created.body._id}`).set(member.auth).send({ title: 'Digital comms notes', category: 'notes' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.status, 'pending');
    assert.equal(res.body.rejectionReason, undefined);
    assert.equal(res.body.category, 'notes');
  });

  test('moving a file refiles it and removes the empty unit it left', async () => {
    const target = await request(app).post('/api/units').set(admin.auth).send({ code: 'EEEN 335', name: 'Digital Electronic Systems', year: 3, semester: 2 });
    const created = await upload(member, 'EEEN 3350 typo.pdf', { year: 3, semester: 2 });
    assert.equal(created.body.unitCode, 'EEEN 3350');

    const res = await request(app).patch(`/api/resources/${created.body._id}`).set(member.auth).send({ unit: target.body._id });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.unitCode, 'EEEN 335');
    assert.equal(res.body.year, 3);

    const all = await request(app).get('/api/units?scope=all').set(admin.auth);
    assert.ok(!all.body.units.some((u) => u.code === 'EEEN 3350'));
  });

  test('members cannot edit or delete someone else\'s file', async () => {
    const created = await upload(member, 'EEEN 465 notes.pdf', { year: 4, semester: 2 });
    assert.equal((await request(app).patch(`/api/resources/${created.body._id}`).set(other.auth).send({ title: 'Mine now' })).status, 403);
    assert.equal((await request(app).delete(`/api/resources/${created.body._id}`).set(other.auth)).status, 403);
  });

  test('deleting a file removes it from private storage', async () => {
    const created = await upload(member, 'EEEN 466 notes.pdf', { year: 4, semester: 2 });
    const res = await request(app).delete(`/api/resources/${created.body._id}`).set(member.auth);
    assert.equal(res.status, 200, res.body.message);
    const removed = destroyed.at(-1);
    assert.equal(removed.publicId, uploads.at(-1).publicId);
    assert.equal(removed.options.type, 'authenticated');
    assert.equal(removed.options.resource_type, 'raw');
  });
});

/* ------------------------------------------------------------------ *
 * File access
 * ------------------------------------------------------------------ */

describe('file access', () => {
  let member;
  let admin;
  let file;
  let other;

  before(async () => {
    member = await makeUser();
    admin = await makeUser('admin');
    file = (await upload(admin, 'EEEN 453 feedback control.pdf', { year: 4, semester: 1 })).body;
    other = (await upload(admin, 'EEEN 454 extra.pdf', { year: 4, semester: 1 })).body;
  });

  const ticketFor = async (user, id) => {
    const res = await request(app).get(`/api/resources/${id}/ticket`).set(user.auth);
    assert.equal(res.status, 200, res.body.message);
    return res.body.token;
  };

  test('streams the file through a signed private URL', async () => {
    const token = await ticketFor(member, file._id);
    const res = await request(app).get(`/api/resources/${file._id}/file/${encodeURIComponent(file.originalFileName)}?token=${token}`);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/pdf/);
    assert.match(res.headers['content-disposition'], /^inline/);
    assert.equal(Buffer.from(res.body).toString() || res.text, STORED_BODY);
    assert.match(fetched.at(-1), /\/raw\/authenticated\/s--/);
  });

  test('offers the file as an attachment for downloads', async () => {
    const token = await ticketFor(member, file._id);
    const res = await request(app).get(`/api/resources/${file._id}/file?token=${token}&download=1`);
    assert.match(res.headers['content-disposition'], /^attachment/);
  });

  test('refuses a session token or a ticket for another file', async () => {
    assert.equal((await request(app).get(`/api/resources/${file._id}/file?token=${member.token}`)).status, 403);
    const token = await ticketFor(member, other._id);
    assert.equal((await request(app).get(`/api/resources/${file._id}/file?token=${token}`)).status, 403);
  });

  test('counts each member once per file', async () => {
    const first = await request(app).put(`/api/resources/${file._id}/download`).set(member.auth);
    const second = await request(app).put(`/api/resources/${file._id}/download`).set(member.auth);
    assert.equal(first.body.counted, true);
    assert.equal(second.body.counted, false);
    const res = await request(app).get(`/api/resources/${file._id}`).set(member.auth);
    assert.equal(res.body.downloads, 1);
  });
});

/* ------------------------------------------------------------------ *
 * Units
 * ------------------------------------------------------------------ */

describe('managing units', () => {
  let member;
  let admin;

  before(async () => {
    member = await makeUser();
    admin = await makeUser('admin');
  });

  test('only reviewers can create units', async () => {
    const res = await request(app).post('/api/units').set(member.auth).send({ code: 'EEEN 999' });
    assert.equal(res.status, 403);
  });

  test('refuses a duplicate code', async () => {
    await request(app).post('/api/units').set(admin.auth).send({ code: 'EEEN 130' });
    const res = await request(app).post('/api/units').set(admin.auth).send({ code: 'eeen130' });
    assert.equal(res.status, 409);
  });

  test('imports many units, updating existing ones and reporting bad rows', async () => {
    const res = await request(app).post('/api/units/import').set(admin.auth).send({
      units: [
        { code: 'eeen 110', name: 'Intro to EE', year: 1, semester: 1 },
        { code: 'not a code' },
        { code: 'EEEN 110', name: 'Introduction to Electrical and Electronic Engineering' },
        { code: 'EEEN 111', year: 1 }
      ]
    });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.created, 1);
    assert.equal(res.body.updated, 1);
    assert.equal(res.body.skipped.length, 2);

    const units = await request(app).get('/api/units').set(member.auth);
    const unit = units.body.units.find((u) => u.code === 'EEEN 110');
    assert.equal(unit.name, 'Introduction to Electrical and Electronic Engineering');
    assert.equal(unit.year, 1);
  });

  test('changing a unit\'s placement refiles its files', async () => {
    const unit = await request(app).post('/api/units').set(admin.auth).send({ code: 'EEEN 211', year: 2, semester: 1 });
    const created = await upload(admin, 'EEEN 211 circuits.pdf');
    assert.equal(created.body.year, 2);

    await request(app).put(`/api/units/${unit.body._id}`).set(admin.auth).send({ semester: 2 });
    const res = await request(app).get(`/api/resources/${created.body._id}`).set(admin.auth);
    assert.equal(res.body.semester, 2);
  });

  test('a unit with files cannot be deleted, but can be merged', async () => {
    const source = await request(app).post('/api/units').set(admin.auth).send({ code: 'EEEN 2311', year: 2, semester: 2 });
    const target = await request(app).post('/api/units').set(admin.auth).send({ code: 'EEEN 231', year: 2, semester: 2 });
    const created = await upload(admin, 'EEEN 2311 devices.pdf');

    assert.equal((await request(app).delete(`/api/units/${source.body._id}`).set(admin.auth)).status, 409);

    const merged = await request(app).post(`/api/units/${source.body._id}/merge`).set(admin.auth).send({ into: target.body._id });
    assert.equal(merged.status, 200, merged.body.message);

    const res = await request(app).get(`/api/resources/${created.body._id}`).set(admin.auth);
    assert.equal(res.body.unitCode, 'EEEN 231');
    assert.equal((await request(app).delete(`/api/units/${target.body._id}`).set(admin.auth)).status, 409);
  });
});

/* ------------------------------------------------------------------ *
 * Unit code detection
 * ------------------------------------------------------------------ */

describe('unit code detection', () => {
  const { findUnitCodes, normalizeUnitCode } = require('../utils/library');

  test('finds codes written in any common style', () => {
    assert.deepEqual(findUnitCodes('EEEN_481 notes, eeen482-cat and EEEN 5610'), ['EEEN 481', 'EEEN 482', 'EEEN 5610']);
  });

  test('ignores dates, page numbers and standards that look like codes', () => {
    assert.deepEqual(findUnitCodes('Shopping list 2024, April 2023, page 120, ISO 9001, Notes 1999'), []);
  });

  test('still accepts a typed code that resembles a year', () => {
    assert.equal(normalizeUnitCode('abcd 2024'), 'ABCD 2024');
  });
});
