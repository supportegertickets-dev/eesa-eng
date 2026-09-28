/**
 * Membership card tests.
 *
 * Covers who may submit a passport photo, the review queue, issuing the card
 * and its member number, and the public verification lookup. Cloudinary is
 * stubbed and MongoDB runs in memory.
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

const cloudinary = require('../config/cloudinary');

let uploadCount = 0;
const destroyed = [];
cloudinary.uploader.upload_stream = (options, callback) => ({
  end: () => {
    uploadCount += 1;
    const publicId = `${options.folder}/test-${uploadCount}`;
    setImmediate(() => callback(null, {
      secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.jpg`,
      public_id: publicId,
      width: 420,
      height: 540
    }));
  }
});
cloudinary.uploader.destroy = async (publicId) => {
  destroyed.push(publicId);
  return { result: 'ok' };
};

const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

let mongod;
let app;
let User;
let PassportPhoto;
let Notification;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  PassportPhoto = require('../models/PassportPhoto');
  Notification = require('../models/Notification');

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
  app.use(express.json());
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/membership', require('../routes/membership'));
  app.use(notFound);
  app.use(errorHandler);
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const DAY = 24 * 60 * 60 * 1000;

/** A member; `paid` gives them a subscription running for another 90 days. */
const makeUser = async ({ role = 'member', paid = false, expiry } = {}) => {
  const user = await registerApproved(app, { department: 'Electrical Engineering' });
  const updates = {};
  if (role !== 'member') updates.role = role;
  if (paid) {
    updates.membershipPaid = true;
    updates.membershipExpiry = expiry || new Date(Date.now() + 90 * DAY);
  }
  if (Object.keys(updates).length) await User.updateOne({ _id: user.id }, updates);
  return user;
};

const uploadPhoto = (member) => request(app)
  .post('/api/membership/photo')
  .set(member.auth)
  .attach('photo', JPEG, { filename: 'passport.jpg', contentType: 'image/jpeg' });

const review = (admin, photoId, body) => request(app)
  .put(`/api/membership/photos/${photoId}/review`)
  .set(admin.auth)
  .send(body);

/** A paid member whose photo an administrator has approved. */
const cardHolder = async (admin, options) => {
  const member = await makeUser({ paid: true, ...options });
  const upload = await uploadPhoto(member);
  assert.equal(upload.status, 201, upload.body.message);
  const approved = await review(admin, upload.body.photo._id, { status: 'approved' });
  assert.equal(approved.status, 200, approved.body.message);
  return member;
};

describe('submitting a passport photo', () => {
  test('a member who has not paid is told to pay first', async () => {
    const member = await makeUser();
    const res = await uploadPhoto(member);
    assert.equal(res.status, 403);
    assert.match(res.body.message, /Pay your membership subscription first/);
    assert.equal(await PassportPhoto.countDocuments({ user: member.id }), 0);
  });

  test('a member whose subscription has expired cannot submit either', async () => {
    const member = await makeUser({ paid: true, expiry: new Date(Date.now() - DAY) });
    const res = await uploadPhoto(member);
    assert.equal(res.status, 403);
  });

  test('a paid member can submit a photo, which waits for review', async () => {
    const member = await makeUser({ paid: true });
    const res = await uploadPhoto(member);
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.photo.status, 'pending');

    const card = await request(app).get('/api/membership/card').set(member.auth);
    assert.equal(card.status, 200);
    assert.equal(card.body.card, null, 'no card before approval');
    assert.equal(card.body.membership.current, true);
    assert.equal(card.body.photo.latest.status, 'pending');
  });

  test('a new submission replaces one still waiting, and its file is deleted', async () => {
    const member = await makeUser({ paid: true });
    const first = await uploadPhoto(member);
    const second = await uploadPhoto(member);
    assert.equal(second.status, 201);

    const photos = await PassportPhoto.find({ user: member.id }).lean();
    assert.equal(photos.length, 1);
    assert.equal(String(photos[0]._id), second.body.photo._id);
    assert.ok(destroyed.some((id) => first.body.photo.url.includes(id)), 'the replaced file is removed from storage');
  });

  test('a request without a file is rejected', async () => {
    const member = await makeUser({ paid: true });
    const res = await request(app).post('/api/membership/photo').set(member.auth);
    assert.equal(res.status, 400);
  });
});

describe('reviewing photos', () => {
  test('ordinary members and other office holders cannot see or review the queue', async () => {
    const member = await makeUser({ paid: true });
    const treasurer = await makeUser({ role: 'treasurer' });
    const upload = await uploadPhoto(member);

    for (const user of [member, treasurer]) {
      assert.equal((await request(app).get('/api/membership/photos').set(user.auth)).status, 403);
      assert.equal((await review(user, upload.body.photo._id, { status: 'approved' })).status, 403);
    }
  });

  test('the queue lists pending photos oldest first, with the member and their membership state', async () => {
    const admin = await makeUser({ role: 'admin' });
    await PassportPhoto.deleteMany({});
    const first = await makeUser({ paid: true });
    const second = await makeUser({ paid: true });
    await uploadPhoto(first);
    await uploadPhoto(second);

    const res = await request(app).get('/api/membership/photos').set(admin.auth);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.pending, 2);
    assert.deepEqual(res.body.photos.map((p) => String(p.user._id)), [first.id, second.id]);
    assert.equal(res.body.photos[0].membershipCurrent, true);
    assert.equal(res.body.photos[0].user.regNumber, first.regNumber);
  });

  test('rejecting needs a reason, and the member is told why', async () => {
    const admin = await makeUser({ role: 'chairperson' });
    const member = await makeUser({ paid: true });
    const upload = await uploadPhoto(member);

    const noReason = await review(admin, upload.body.photo._id, { status: 'rejected' });
    assert.equal(noReason.status, 400);

    const res = await review(admin, upload.body.photo._id, { status: 'rejected', reason: 'Face is not visible.' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.photo.status, 'rejected');

    const card = await request(app).get('/api/membership/card').set(member.auth);
    assert.equal(card.body.card, null);
    assert.equal(card.body.photo.latest.status, 'rejected');
    assert.equal(card.body.photo.latest.rejectionReason, 'Face is not visible.');

    const note = await Notification.findOne({ targetUsers: member.id, type: 'membership' }).lean();
    assert.match(note.message, /Face is not visible/);
  });

  test('a photo can only be reviewed once', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await makeUser({ paid: true });
    const upload = await uploadPhoto(member);
    assert.equal((await review(admin, upload.body.photo._id, { status: 'approved' })).status, 200);
    const again = await review(admin, upload.body.photo._id, { status: 'rejected', reason: 'Changed my mind' });
    assert.equal(again.status, 409);
  });
});

describe('the card', () => {
  test('approval issues a card with a member number and the member is notified', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await cardHolder(admin);

    const res = await request(app).get('/api/membership/card').set(member.auth);
    assert.equal(res.status, 200);
    const { card } = res.body;
    assert.ok(card, 'card issued');
    assert.match(card.memberNumber, /^EESA-\d{2}-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(card.department, 'Electrical Engineering');
    assert.match(card.photo, /passport-photos/);
    assert.ok(card.validUntil);

    const note = await Notification.findOne({ targetUsers: member.id, title: 'Your membership card is ready' });
    assert.ok(note);
  });

  test('the member number stays the same when a new photo is approved, and the old photo is deleted', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await cardHolder(admin);
    const before = await User.findById(member.id).lean();

    const upload = await uploadPhoto(member);
    await review(admin, upload.body.photo._id, { status: 'approved' });

    const after = await User.findById(member.id).lean();
    assert.equal(after.memberNumber, before.memberNumber);
    assert.notEqual(after.passportPhoto, before.passportPhoto);
    assert.ok(destroyed.includes(before.passportPhotoId));
    assert.equal(await PassportPhoto.countDocuments({ user: member.id, status: 'replaced' }), 1);
  });

  test('the card disappears when the subscription expires', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await cardHolder(admin);
    await User.updateOne({ _id: member.id }, { membershipExpiry: new Date(Date.now() - DAY) });

    const res = await request(app).get('/api/membership/card').set(member.auth);
    assert.equal(res.body.card, null);
    assert.equal(res.body.membership.current, false);
    assert.ok(res.body.photo.approvedUrl, 'the approved photo is kept for when they renew');
  });
});

describe('public verification', () => {
  const verify = (number) => request(app).get(`/api/membership/verify/${encodeURIComponent(number)}`);

  test('a current card verifies as active without exposing contact details', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await cardHolder(admin);
    const { memberNumber } = await User.findById(member.id).lean();

    // Case and spacing are forgiven, since numbers are typed off a card.
    const res = await verify(` ${memberNumber.toLowerCase()} `);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.status, 'active');
    assert.equal(res.body.memberNumber, memberNumber);
    assert.ok(res.body.fullName);
    assert.ok(res.body.photo);
    for (const field of ['email', 'phone', 'regNumber', '_id']) assert.equal(res.body[field], undefined, `${field} is not exposed`);
  });

  test('an expired card verifies as expired', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await cardHolder(admin);
    const { memberNumber } = await User.findByIdAndUpdate(member.id, { membershipExpiry: new Date(Date.now() - DAY) }, { new: true }).lean();

    const res = await verify(memberNumber);
    assert.equal(res.body.valid, false);
    assert.equal(res.body.status, 'expired');
  });

  test('a deactivated member\'s card is revoked and describes no one', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await cardHolder(admin);
    const { memberNumber } = await User.findByIdAndUpdate(member.id, { isActive: false }, { new: true }).lean();

    const res = await verify(memberNumber);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { memberNumber, valid: false, status: 'revoked' });
  });

  test('malformed and unknown numbers are rejected', async () => {
    assert.equal((await verify('12345')).status, 400);
    assert.equal((await verify('EESA-26-AAAAAA')).status, 404);
  });
});

describe('cards for administrators', () => {
  const uploadFor = (admin, member) => request(app)
    .post(`/api/membership/cards/${member.id}/photo`)
    .set(admin.auth)
    .attach('photo', JPEG, { filename: 'passport.jpg', contentType: 'image/jpeg' });

  test('only the admin and chairperson can list, open or issue members\' cards', async () => {
    const member = await makeUser({ paid: true });
    for (const role of ['member', 'treasurer', 'secretary_general']) {
      const user = await makeUser({ role });
      assert.equal((await request(app).get('/api/membership/cards').set(user.auth)).status, 403);
      assert.equal((await request(app).get(`/api/membership/cards/${member.id}`).set(user.auth)).status, 403);
      assert.equal((await uploadFor(user, member)).status, 403);
    }
  });

  test('an admin uploading a paid member\'s photo issues the card at once and tells the member', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await makeUser({ paid: true });
    // Anything the member had waiting is replaced by the admin's photo.
    await uploadPhoto(member);

    const res = await uploadFor(admin, member);
    assert.equal(res.status, 201, res.body.message);
    assert.ok(res.body.card, 'card issued');
    assert.match(res.body.card.memberNumber, /^EESA-\d{2}-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(res.body.photo.latest.status, 'approved');
    assert.equal(await PassportPhoto.countDocuments({ user: member.id, status: 'pending' }), 0);
    assert.ok(await Notification.findOne({ targetUsers: member.id, title: 'Your membership card is ready' }));

    const own = await request(app).get('/api/membership/card').set(member.auth);
    assert.equal(own.body.card.memberNumber, res.body.card.memberNumber);
  });

  test('an unpaid member\'s photo is kept, but no card is made until they pay', async () => {
    const admin = await makeUser({ role: 'chairperson' });
    const member = await makeUser();

    const res = await uploadFor(admin, member);
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.card, null);
    assert.equal(res.body.membership.current, false);
    assert.ok(res.body.photo.approvedUrl);

    const before = await request(app).get(`/api/membership/cards/${member.id}`).set(admin.auth);
    // The fields the manual membership form needs to mark them paid from the card screen.
    assert.equal(before.body.member.membershipPaid, false);
    assert.ok('lastPaymentDate' in before.body.member && 'membershipExpiry' in before.body.member);

    await User.updateOne({ _id: member.id }, { membershipPaid: true, membershipExpiry: new Date(Date.now() + 30 * DAY) });
    const opened = await request(app).get(`/api/membership/cards/${member.id}`).set(admin.auth);
    assert.equal(opened.status, 200);
    assert.ok(opened.body.card, 'the card appears once the subscription is current');
    assert.equal(opened.body.member.email.includes('@'), true);
  });

  test('deactivated accounts cannot be issued a card', async () => {
    const admin = await makeUser({ role: 'admin' });
    const member = await makeUser({ paid: true });
    await User.updateOne({ _id: member.id }, { isActive: false });
    assert.equal((await uploadFor(admin, member)).status, 409);
  });

  test('the list sorts every active member into one card state, with counts and search', async () => {
    const admin = await makeUser({ role: 'admin' });
    const ready = await cardHolder(admin);
    const waiting = await makeUser({ paid: true });
    await uploadPhoto(waiting);
    const needsPhoto = await makeUser({ paid: true });
    const unpaid = await makeUser();
    // A ready card stays ready while a replacement photo waits.
    const replacing = await cardHolder(admin);
    await uploadPhoto(replacing);

    const all = await request(app).get('/api/membership/cards?limit=50').set(admin.auth);
    assert.equal(all.status, 200, all.body.message);
    const stateOf = async (member) => {
      const { memberNumber, email } = await User.findById(member.id).lean();
      const search = await request(app).get(`/api/membership/cards?search=${encodeURIComponent(memberNumber || email)}`).set(admin.auth);
      return search.body.members.find((m) => String(m._id) === member.id)?.state;
    };
    assert.equal(await stateOf(ready), 'ready');
    assert.equal(await stateOf(waiting), 'waiting');
    assert.equal(await stateOf(needsPhoto), 'needs-photo');
    assert.equal(await stateOf(unpaid), 'unpaid');
    assert.equal(await stateOf(replacing), 'ready');

    const { counts } = all.body;
    const active = await User.countDocuments({ isActive: true });
    assert.equal(counts.ready + counts.waiting + counts['needs-photo'] + counts.unpaid, active, 'every active member is in exactly one state');

    const readyOnly = await request(app).get('/api/membership/cards?state=ready&limit=50').set(admin.auth);
    assert.ok(readyOnly.body.members.length >= 2);
    assert.ok(readyOnly.body.members.every((m) => m.state === 'ready' && m.card?.memberNumber && m.card.photo));
    assert.equal(readyOnly.body.members.find((m) => String(m._id) === ready.id).card.regNumber, ready.regNumber);
  });
});
