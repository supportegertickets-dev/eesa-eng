/**
 * Election and event tests.
 *
 * Cloudinary is replaced with an in-process stub, so these never upload real
 * files, and MongoDB runs in memory.
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

const cloudinary = require('../config/cloudinary');

const uploaded = [];
const destroyed = [];
cloudinary.uploader.upload_stream = (options, callback) => ({
  end: () => {
    const publicId = `${options.folder}/test-${uploaded.length + 1}`;
    uploaded.push(publicId);
    setImmediate(() => callback(null, {
      secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.png`,
      public_id: publicId,
      width: 10,
      height: 10
    }));
  }
});
cloudinary.uploader.destroy = async (publicId) => {
  destroyed.push(publicId);
  return { result: 'ok' };
};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const png = (name = 'image.png') => [PNG, { filename: name, contentType: 'image/png' }];

let mongod;
let app;
let User;
let Vote;
let Election;
let Notification;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  Vote = require('../models/Vote');
  Election = require('../models/Election');
  Notification = require('../models/Notification');
  // The unique index is what stops double voting; build it before the
  // concurrency test runs.
  await Vote.init();

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
  app.use(express.json());
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/elections', require('../routes/elections'));
  app.use('/api/events', require('../routes/events'));
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
    firstName: `User${counter}`,
    lastName: 'Test',
    email: `user${counter}-${Date.now()}@example.com`,
    password: 'Str0ngPass1'
  });
  assert.equal(res.status, 201, res.body.message);
  if (role !== 'member') await User.updateOne({ _id: res.body._id }, { role });
  return { id: res.body._id, auth: { Authorization: `Bearer ${res.body.token}` } };
};

const hoursFromNow = (hours) => new Date(Date.now() + hours * 3600 * 1000).toISOString();

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

const createEvent = (user, { photos = 0, cover = true, fields = {} } = {}) => {
  let req = request(app).post('/api/events').set(user.auth)
    .field('title', fields.title || 'Robotics Workshop')
    .field('description', fields.description || 'Hands-on robotics session for all years.')
    .field('date', fields.date || hoursFromNow(24))
    .field('location', fields.location || 'Engineering Block A')
    .field('category', 'workshop');
  for (const [key, value] of Object.entries(fields)) {
    if (!['title', 'description', 'date', 'location'].includes(key)) req = req.field(key, value);
  }
  if (cover) req = req.attach('image', ...png('cover.png'));
  for (let i = 0; i < photos; i += 1) req = req.attach('photos', ...png(`photo-${i}.png`));
  return req;
};

describe('events with images', () => {
  let admin;
  before(async () => { admin = await makeUser('admin'); });

  test('an admin can create an event with a cover image and photos', async () => {
    const res = await createEvent(admin, { photos: 2 });
    assert.equal(res.status, 201, res.body.message);
    assert.match(res.body.image, /^https:\/\/res\.cloudinary\.com\//);
    assert.equal(res.body.photos.length, 2);
    assert.ok(res.body.photos.every((p) => p.url && p._id));
  });

  test('an event can still be created without images', async () => {
    const res = await createEvent(admin, { cover: false });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.image, '');
    assert.deepEqual(res.body.photos, []);
  });

  test('a member cannot create events', async () => {
    const member = await makeUser();
    const res = await createEvent(member);
    assert.equal(res.status, 403);
  });

  test('a file that is not an image is rejected', async () => {
    const res = await request(app).post('/api/events').set(admin.auth)
      .field('title', 'Bad upload').field('description', 'This should never be saved.')
      .field('date', hoursFromNow(24)).field('location', 'Hall')
      .attach('image', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' });
    assert.equal(res.status, 400);
  });

  test('an end time before the start is rejected', async () => {
    const res = await createEvent(admin, { cover: false, fields: { date: hoursFromNow(24), endDate: hoursFromNow(20) } });
    assert.equal(res.status, 400);
  });

  test('replacing the cover and removing a photo deletes the old files', async () => {
    const created = (await createEvent(admin, { photos: 2 })).body;
    const oldCover = created.imagePublicId;
    const removed = created.photos[0];

    const res = await request(app).put(`/api/events/${created._id}`).set(admin.auth)
      .field('title', 'Robotics Workshop, updated')
      .field('removePhotoIds', JSON.stringify([removed._id]))
      .attach('image', ...png('new-cover.png'));

    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.title, 'Robotics Workshop, updated');
    assert.equal(res.body.photos.length, 1);
    assert.notEqual(res.body.imagePublicId, oldCover);
    assert.ok(destroyed.includes(oldCover), 'old cover should be deleted from storage');
    assert.ok(destroyed.includes(removed.publicId), 'removed photo should be deleted from storage');
  });

  test('an event cannot hold more than ten photos', async () => {
    const created = (await createEvent(admin, { photos: 10, cover: false })).body;
    assert.equal(created.photos.length, 10);

    const res = await request(app).post(`/api/events/${created._id}/photos`).set(admin.auth)
      .attach('photos', ...png('one-too-many.png'));
    assert.equal(res.status, 400);
  });

  test('deleting an event deletes all of its images', async () => {
    const created = (await createEvent(admin, { photos: 2 })).body;
    const res = await request(app).delete(`/api/events/${created._id}`).set(admin.auth);
    assert.equal(res.status, 200);
    for (const id of [created.imagePublicId, ...created.photos.map((p) => p.publicId)]) {
      assert.ok(destroyed.includes(id), `${id} should be deleted`);
    }
  });

  test('RSVP respects the capacity limit', async () => {
    const created = (await createEvent(admin, { cover: false, fields: { maxAttendees: '1' } })).body;
    const first = await makeUser();
    const second = await makeUser();

    assert.equal((await request(app).post(`/api/events/${created._id}/rsvp`).set(first.auth)).status, 200);
    const full = await request(app).post(`/api/events/${created._id}/rsvp`).set(second.auth);
    assert.equal(full.status, 400);
    assert.match(full.body.message, /full/i);
  });
});

/* ------------------------------------------------------------------ *
 * Elections
 * ------------------------------------------------------------------ */

const createElection = (admin, overrides = {}) => request(app).post('/api/elections').set(admin.auth).send({
  title: 'Committee Elections 2026',
  positions: ['Chairperson', 'Treasurer'],
  startDate: hoursFromNow(2),
  endDate: hoursFromNow(4),
  ...overrides
});

const apply = (user, electionId, position = 'Treasurer', withPhoto = false) => {
  let req = request(app).post(`/api/elections/${electionId}/apply`).set(user.auth)
    .field('position', position)
    .field('manifesto', 'I will publish the association accounts every month.');
  if (withPhoto) req = req.attach('photo', ...png('portrait.png'));
  return req;
};

describe('election setup', () => {
  test('an office holder without admin rights cannot create elections', async () => {
    const treasurer = await makeUser('treasurer');
    assert.equal((await createElection(treasurer)).status, 403);
  });

  test('voting must close after it opens', async () => {
    const admin = await makeUser('admin');
    const res = await createElection(admin, { startDate: hoursFromNow(5), endDate: hoursFromNow(3) });
    assert.equal(res.status, 400);
  });

  test('nominations must close before voting opens', async () => {
    const admin = await makeUser('admin');
    const res = await createElection(admin, { nominationDeadline: hoursFromNow(3) });
    assert.equal(res.status, 400);
  });

  test('the status follows the schedule', async () => {
    const admin = await makeUser('admin');
    const res = await createElection(admin, { startDate: hoursFromNow(-1), endDate: hoursFromNow(1) });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.status, 'active');
  });
});

describe('nominations', () => {
  let admin;
  let election;
  before(async () => {
    admin = await makeUser('admin');
    election = (await createElection(admin)).body;
  });

  test('an application stays hidden from other members until approved', async () => {
    const applicant = await makeUser();
    const other = await makeUser();

    const res = await apply(applicant, election._id, 'Treasurer', true);
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.election.myApplication.status, 'pending');
    assert.match(res.body.election.myApplication.photo, /^https:\/\//);

    const asOther = await request(app).get(`/api/elections/${election._id}`).set(other.auth);
    assert.equal(asOther.body.candidates.length, 0);

    const asAdmin = await request(app).get(`/api/elections/${election._id}`).set(admin.auth);
    assert.equal(asAdmin.body.candidates.length, 1);
  });

  test('a member cannot apply twice', async () => {
    const applicant = await makeUser();
    assert.equal((await apply(applicant, election._id)).status, 201);
    assert.equal((await apply(applicant, election._id)).status, 409);
  });

  test('the position must be on the ballot', async () => {
    const applicant = await makeUser();
    assert.equal((await apply(applicant, election._id, 'Supreme Leader')).status, 400);
  });

  test('an admin cannot review their own application', async () => {
    const candidateAdmin = await makeUser('admin');
    const applied = await apply(candidateAdmin, election._id);
    const own = applied.body.election.myApplication;
    const res = await request(app).put(`/api/elections/${election._id}/candidates/${own._id}/review`)
      .set(candidateAdmin.auth).send({ status: 'approved' });
    assert.equal(res.status, 403);
  });

  test('approval notifies the applicant', async () => {
    const applicant = await makeUser();
    const application = (await apply(applicant, election._id)).body.election.myApplication;

    const res = await request(app).put(`/api/elections/${election._id}/candidates/${application._id}/review`)
      .set(admin.auth).send({ status: 'approved' });
    assert.equal(res.status, 200, res.body.message);

    const note = await Notification.findOne({ targetUsers: applicant.id, type: 'election' });
    assert.ok(note, 'the applicant should receive a notification');
  });

  test('a rejection needs a reason, and the member can then reapply', async () => {
    const applicant = await makeUser();
    const application = (await apply(applicant, election._id)).body.election.myApplication;
    const url = `/api/elections/${election._id}/candidates/${application._id}/review`;

    assert.equal((await request(app).put(url).set(admin.auth).send({ status: 'rejected' })).status, 400);
    assert.equal((await request(app).put(url).set(admin.auth).send({ status: 'rejected', rejectionReason: 'Manifesto is incomplete.' })).status, 200);

    const again = await apply(applicant, election._id);
    assert.equal(again.status, 201, again.body.message);
    assert.equal(again.body.election.myApplication.status, 'pending');
  });
});

describe('voting and results', () => {
  let admin;
  let election;
  let candidateA;
  let candidateB;
  const voters = [];

  before(async () => {
    admin = await makeUser('admin');
    election = (await createElection(admin, { positions: ['Chairperson'] })).body;

    for (const label of ['A', 'B']) {
      const person = await makeUser();
      const application = (await apply(person, election._id, 'Chairperson')).body.election.myApplication;
      await request(app).put(`/api/elections/${election._id}/candidates/${application._id}/review`)
        .set(admin.auth).send({ status: 'approved' });
      if (label === 'A') candidateA = application._id;
      else candidateB = application._id;
    }

    for (let i = 0; i < 4; i += 1) voters.push(await makeUser());
  });

  test('voting cannot open without an approved candidate', async () => {
    const empty = (await createElection(admin)).body;
    const res = await request(app).post(`/api/elections/${empty._id}/open`).set(admin.auth);
    assert.equal(res.status, 400);
  });

  test('members cannot vote before voting opens', async () => {
    const res = await request(app).post(`/api/elections/${election._id}/vote/${candidateA}`).set(voters[0].auth);
    assert.equal(res.status, 400);
  });

  test('results are hidden before and during voting', async () => {
    const res = await request(app).get(`/api/elections/${election._id}/results`).set(admin.auth);
    assert.equal(res.status, 403);
  });

  test('an admin can open voting early', async () => {
    const res = await request(app).post(`/api/elections/${election._id}/open`).set(admin.auth);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.election.status, 'active');
  });

  test('a member can vote once per position', async () => {
    const first = await request(app).post(`/api/elections/${election._id}/vote/${candidateA}`).set(voters[0].auth);
    assert.equal(first.status, 201, first.body.message);

    const second = await request(app).post(`/api/elections/${election._id}/vote/${candidateB}`).set(voters[0].auth);
    assert.equal(second.status, 409);
  });

  test('simultaneous votes from one member count once', async () => {
    const attempts = await Promise.all(Array.from({ length: 6 }, () =>
      request(app).post(`/api/elections/${election._id}/vote/${candidateB}`).set(voters[1].auth)));

    assert.equal(attempts.filter((r) => r.status === 201).length, 1);
    assert.equal(await Vote.countDocuments({ voter: voters[1].id }), 1);
  });

  test('election responses never reveal who voted for whom', async () => {
    const res = await request(app).get(`/api/elections/${election._id}`).set(voters[2].auth);
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes('"votes"'), 'vote arrays must not be sent');
    assert.ok(!body.includes(voters[0].id), "another member's id must not appear");
  });

  test('results stay hidden while voting is open', async () => {
    const res = await request(app).get(`/api/elections/${election._id}/results`).set(voters[2].auth);
    assert.equal(res.status, 403);
  });

  test('closing voting publishes results with the winner', async () => {
    await request(app).post(`/api/elections/${election._id}/vote/${candidateA}`).set(voters[2].auth);

    const closed = await request(app).post(`/api/elections/${election._id}/close`).set(admin.auth);
    assert.equal(closed.status, 200, closed.body.message);
    assert.equal(closed.body.election.status, 'completed');

    const res = await request(app).get(`/api/elections/${election._id}/results`).set(voters[3].auth);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.results.turnout, 3);

    const [chair] = res.body.results.positions;
    const top = chair.candidates[0];
    assert.equal(String(top._id), String(candidateA));
    assert.equal(top.voteCount, 2);
    assert.equal(top.isWinner, true);
    assert.equal(chair.tie, false);
  });

  test('no votes are accepted after voting closes', async () => {
    const res = await request(app).post(`/api/elections/${election._id}/vote/${candidateA}`).set(voters[3].auth);
    assert.equal(res.status, 400);
  });
});

describe('legacy elections', () => {
  test('votes stored by the previous system still count', async () => {
    const admin = await makeUser('admin');
    const candidate = await makeUser();
    const voter = await makeUser();

    const legacy = await Election.create({
      title: '2025 Committee Elections',
      positions: ['Treasurer'],
      startDate: new Date(Date.now() - 2 * 86400000),
      endDate: new Date(Date.now() - 86400000),
      status: 'completed',
      createdBy: admin.id,
      candidates: [{ user: candidate.id, position: 'Treasurer', votes: [voter.id] }]
    });

    const res = await request(app).get(`/api/elections/${legacy._id}/results`).set(admin.auth);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.results.positions[0].candidates[0].voteCount, 1);

    const view = await request(app).get(`/api/elections/${legacy._id}`).set(voter.auth);
    assert.equal(Object.keys(view.body.myVotes).length, 1, 'a legacy voter still sees that they voted');
  });
});
