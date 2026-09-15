/**
 * Gallery album tests.
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

let uploadCount = 0;
const destroyed = [];
cloudinary.uploader.upload_stream = (options, callback) => ({
  end: () => {
    uploadCount += 1;
    const publicId = `${options.folder}/test-${uploadCount}`;
    setImmediate(() => callback(null, {
      secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.png`,
      public_id: publicId,
      width: 1600,
      height: 1200
    }));
  }
});
cloudinary.uploader.destroy = async (publicId) => {
  destroyed.push(publicId);
  return { result: 'ok' };
};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let mongod;
let app;
let User;
let Album;
let Event;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  Album = require('../models/Album');
  Event = require('../models/Event');
  await Album.init();

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
  app.use(express.json());
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/gallery', require('../routes/gallery'));
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
    email: `gallery${counter}-${Date.now()}@example.com`,
    password: 'Str0ngPass1'
  });
  assert.equal(res.status, 201, res.body.message);
  if (role !== 'member') await User.updateOne({ _id: res.body._id }, { role });
  return { id: res.body._id, auth: { Authorization: `Bearer ${res.body.token}` } };
};

const createAlbum = (user, fields = {}) => request(app).post('/api/gallery/albums').set(user.auth).send({
  title: 'Engineering Week 2026',
  category: 'events',
  ...fields
});

const uploadPhoto = (user, albumId, caption) => {
  let req = request(app).post(`/api/gallery/albums/${albumId}/photos`).set(user.auth);
  if (caption) req = req.field('caption', caption);
  return req.attach('photo', PNG, { filename: 'photo.png', contentType: 'image/png' });
};

const albumWithPhotos = async (user, count) => {
  const album = (await createAlbum(user, { title: `Album ${Date.now()} ${Math.random()}` })).body;
  const photos = [];
  for (let i = 0; i < count; i += 1) photos.push((await uploadPhoto(user, album._id)).body);
  return { album, photos };
};

const getAlbum = (key) => request(app).get(`/api/gallery/albums/${key}`);

describe('albums', () => {
  let leader;
  before(async () => { leader = await makeUser('publicity_manager'); });

  test('any office holder can create an album, and it gets a readable URL', async () => {
    const res = await createAlbum(leader, { title: 'Field Trip: Olkaria!' });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.slug, 'field-trip-olkaria');
    assert.equal(res.body.photoCount, 0);
    assert.equal(res.body.createdBy.firstName.startsWith('User'), true);
  });

  test('albums with the same title get distinct URLs', async () => {
    const first = await createAlbum(leader, { title: 'Freshers Night' });
    const second = await createAlbum(leader, { title: 'Freshers Night' });
    assert.equal(first.body.slug, 'freshers-night');
    assert.equal(second.body.slug, 'freshers-night-2');
  });

  test('a member cannot create albums or upload photos', async () => {
    const member = await makeUser();
    assert.equal((await createAlbum(member)).status, 403);

    const album = (await createAlbum(leader)).body;
    assert.equal((await uploadPhoto(member, album._id)).status, 403);
  });

  test('an album can be linked to an event, and found by it', async () => {
    const event = await Event.create({
      title: 'Robotics Workshop',
      description: 'Hands-on robotics session.',
      date: new Date(),
      location: 'Block A',
      organizer: leader.id
    });

    assert.equal((await createAlbum(leader, { event: new mongoose.Types.ObjectId().toString() })).status, 400);

    const album = (await createAlbum(leader, { title: 'Robotics photos', event: String(event._id) })).body;
    assert.equal(album.event.title, 'Robotics Workshop');
    await uploadPhoto(leader, album._id);

    const res = await request(app).get(`/api/gallery/albums?event=${event._id}`);
    assert.deepEqual(res.body.albums.map((a) => a._id), [album._id]);
  });
});

describe('uploading photos', () => {
  let leader;
  before(async () => { leader = await makeUser('secretary_general'); });

  test('photos keep their upload order, and the first becomes the cover', async () => {
    const { album, photos } = await albumWithPhotos(leader, 3);
    assert.ok(photos.every((photo) => photo.url && photo.width === 1600 && photo.height === 1200));

    const res = await getAlbum(album.slug);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.album.photoCount, 3);
    assert.deepEqual(res.body.photos.map((p) => p._id), photos.map((p) => p._id));
    assert.equal(res.body.album.cover.url, photos[0].url);
  });

  test('photos uploaded at the same moment all arrive with distinct positions', async () => {
    const album = (await createAlbum(leader, { title: 'Parallel uploads' })).body;
    const results = await Promise.all(Array.from({ length: 6 }, () => uploadPhoto(leader, album._id)));
    assert.ok(results.every((r) => r.status === 201));

    const res = await getAlbum(album._id);
    assert.equal(res.body.album.photoCount, 6);
    assert.equal(new Set(res.body.photos.map((p) => p.position)).size, 6);
  });

  test('a caption can be sent with the photo', async () => {
    const album = (await createAlbum(leader)).body;
    const res = await uploadPhoto(leader, album._id, 'Opening ceremony');
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.caption, 'Opening ceremony');
  });

  test('a file that is not an image is rejected', async () => {
    const album = (await createAlbum(leader)).body;
    const res = await request(app).post(`/api/gallery/albums/${album._id}/photos`).set(leader.auth)
      .attach('photo', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' });
    assert.equal(res.status, 400);
  });

  test('a full album refuses more photos', async () => {
    const album = (await createAlbum(leader)).body;
    await Album.updateOne({ _id: album._id }, { photoCount: Album.MAX_ALBUM_PHOTOS });
    const res = await uploadPhoto(leader, album._id);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /up to 500 photos/);
  });
});

describe('browsing', () => {
  before(async () => {
    const leader = await makeUser('project_manager');
    const make = async (title, category, date, photos) => {
      const album = (await createAlbum(leader, { title, category, date })).body;
      for (let i = 0; i < photos; i += 1) await uploadPhoto(leader, album._id);
    };
    await make('Zeta Hackathon', 'competitions', '2026-03-01', 1);
    await make('alpha campus tour', 'campus', '2026-05-01', 1);
    await make('Empty Album Browsing', 'campus', '2026-06-01', 0);
  });

  test('empty albums are hidden from visitors but listed for leaders who ask', async () => {
    const leader = await makeUser('treasurer');
    const visitor = await request(app).get('/api/gallery/albums?search=Empty Album Browsing');
    assert.equal(visitor.body.total, 0);

    const asLeader = await request(app).get('/api/gallery/albums?search=Empty Album Browsing&includeEmpty=true').set(leader.auth);
    assert.equal(asLeader.body.total, 1);

    const member = await makeUser();
    const asMember = await request(app).get('/api/gallery/albums?search=Empty Album Browsing&includeEmpty=true').set(member.auth);
    assert.equal(asMember.body.total, 0);
  });

  test('albums can be searched and filtered by category', async () => {
    const res = await request(app).get('/api/gallery/albums?search=hackathon');
    assert.deepEqual(res.body.albums.map((a) => a.title), ['Zeta Hackathon']);

    const campus = await request(app).get('/api/gallery/albums?category=campus');
    assert.ok(campus.body.albums.every((a) => a.category === 'campus'));
  });

  test('search terms are matched literally', async () => {
    const res = await request(app).get('/api/gallery/albums?search=.*');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
  });

  test('albums sort by date either way, and by title ignoring case', async () => {
    const titles = async (sort) => (await request(app).get(`/api/gallery/albums?sort=${sort}&search=a&limit=48`)).body.albums
      .map((a) => a.title)
      .filter((t) => ['Zeta Hackathon', 'alpha campus tour'].includes(t));

    assert.deepEqual(await titles('newest'), ['alpha campus tour', 'Zeta Hackathon']);
    assert.deepEqual(await titles('oldest'), ['Zeta Hackathon', 'alpha campus tour']);
    assert.deepEqual(await titles('title'), ['alpha campus tour', 'Zeta Hackathon']);
  });

  test('an unknown album is a 404', async () => {
    assert.equal((await getAlbum('no-such-album')).status, 404);
  });
});

describe('organising an album', () => {
  let leader;
  before(async () => { leader = await makeUser('vice_chairperson'); });

  test('a new order must include every photo exactly once', async () => {
    const { album, photos } = await albumWithPhotos(leader, 3);
    const url = `/api/gallery/albums/${album._id}/order`;

    const partial = await request(app).put(url).set(leader.auth).send({ photoIds: [photos[0]._id, photos[1]._id] });
    assert.equal(partial.status, 409);

    const reversed = photos.map((p) => p._id).reverse();
    const res = await request(app).put(url).set(leader.auth).send({ photoIds: reversed });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.cover.url, photos[2].url, 'without a chosen cover, the new first photo is the cover');

    assert.deepEqual((await getAlbum(album._id)).body.photos.map((p) => p._id), reversed);
  });

  test('photos uploaded after a reorder go to the end', async () => {
    const { album, photos } = await albumWithPhotos(leader, 2);
    await request(app).put(`/api/gallery/albums/${album._id}/order`).set(leader.auth).send({ photoIds: [photos[1]._id, photos[0]._id] });
    const added = (await uploadPhoto(leader, album._id)).body;

    const order = (await getAlbum(album._id)).body.photos.map((p) => p._id);
    assert.equal(order[order.length - 1], added._id);
  });

  test('a chosen cover stays through reorders, and must belong to the album', async () => {
    const { album, photos } = await albumWithPhotos(leader, 3);
    const other = await albumWithPhotos(leader, 1);
    const url = `/api/gallery/albums/${album._id}`;

    assert.equal((await request(app).put(url).set(leader.auth).send({ coverPhoto: other.photos[0]._id })).status, 400);

    const chosen = await request(app).put(url).set(leader.auth).send({ coverPhoto: photos[1]._id });
    assert.equal(chosen.status, 200, chosen.body.message);
    assert.equal(chosen.body.cover.url, photos[1].url);

    await request(app).put(`${url}/order`).set(leader.auth).send({ photoIds: [photos[2]._id, photos[0]._id, photos[1]._id] });
    assert.equal((await getAlbum(album._id)).body.album.cover.url, photos[1].url);
  });

  test('album details can be edited without changing its URL', async () => {
    const album = (await createAlbum(leader, { title: 'Before rename' })).body;
    const res = await request(app).put(`/api/gallery/albums/${album._id}`).set(leader.auth)
      .send({ title: 'After rename', description: 'Now with a description', category: 'social' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.title, 'After rename');
    assert.equal(res.body.category, 'social');
    assert.equal(res.body.slug, album.slug);
  });

  test('any leader can edit captions; members cannot', async () => {
    const { photos } = await albumWithPhotos(leader, 1);
    const otherLeader = await makeUser('patron');
    const member = await makeUser();
    const url = `/api/gallery/photos/${photos[0]._id}`;

    assert.equal((await request(app).patch(url).set(member.auth).send({ caption: 'Nope' })).status, 403);
    const res = await request(app).patch(url).set(otherLeader.auth).send({ caption: '  The winning team  ' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.caption, 'The winning team');
  });
});

describe('deleting', () => {
  let owner;
  let otherLeader;
  let chair;
  before(async () => {
    owner = await makeUser('organizing_secretary');
    otherLeader = await makeUser('1st_cohort_rep');
    chair = await makeUser('chairperson');
  });

  test("a leader can delete their own photos but not another leader's", async () => {
    const { album, photos } = await albumWithPhotos(owner, 1);
    const theirs = (await uploadPhoto(otherLeader, album._id)).body;

    assert.equal((await request(app).delete(`/api/gallery/photos/${photos[0]._id}`).set(otherLeader.auth)).status, 403);

    const own = await request(app).delete(`/api/gallery/photos/${theirs._id}`).set(otherLeader.auth);
    assert.equal(own.status, 200, own.body.message);
    assert.equal(own.body.album.photoCount, 1);
    assert.ok(destroyed.includes(theirs.url.match(/upload\/v1\/(.+)\.png$/)[1]));
  });

  test("the album's creator can delete any photo in it", async () => {
    const { album } = await albumWithPhotos(owner, 0);
    const theirs = (await uploadPhoto(otherLeader, album._id)).body;
    assert.equal((await request(app).delete(`/api/gallery/photos/${theirs._id}`).set(owner.auth)).status, 200);
  });

  test('deleting the cover falls back to the next photo', async () => {
    const { album, photos } = await albumWithPhotos(owner, 2);
    const res = await request(app).delete(`/api/gallery/photos/${photos[0]._id}`).set(owner.auth);
    assert.equal(res.body.album.cover.url, photos[1].url);
  });

  test('several photos can be deleted at once, all or nothing', async () => {
    const { album, photos } = await albumWithPhotos(otherLeader, 3);
    const url = `/api/gallery/albums/${album._id}/photos/delete`;
    const mine = (await uploadPhoto(owner, album._id)).body;

    const mixed = await request(app).post(url).set(owner.auth).send({ photoIds: [mine._id, photos[0]._id] });
    assert.equal(mixed.status, 403);
    assert.equal((await getAlbum(album._id)).body.album.photoCount, 4, 'nothing is deleted when any photo is refused');

    const res = await request(app).post(url).set(chair.auth).send({ photoIds: [photos[0]._id, photos[1]._id, mine._id] });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.deleted, 3);
    assert.equal(res.body.album.photoCount, 1);
    assert.equal(res.body.album.cover.url, photos[2].url);
  });

  test('only the creator or an admin can delete an album, which removes every file', async () => {
    const { album, photos } = await albumWithPhotos(owner, 2);
    const url = `/api/gallery/albums/${album._id}`;

    assert.equal((await request(app).delete(url).set(otherLeader.auth)).status, 403);

    const res = await request(app).delete(url).set(chair.auth);
    assert.equal(res.status, 200, res.body.message);
    assert.equal((await getAlbum(album._id)).status, 404);
    for (const photo of photos) {
      assert.ok(destroyed.includes(photo.url.match(/upload\/v1\/(.+)\.png$/)[1]), 'each file should be deleted from storage');
    }
  });
});

describe('announcing new photos', () => {
  test('members are emailed once per batch, and only for an admin or the chairperson', async () => {
    const chair = await makeUser('chairperson');
    const leader = await makeUser('treasurer');
    const { album } = await albumWithPhotos(chair, 2);
    const url = `/api/gallery/albums/${album._id}/announce`;

    assert.deepEqual((await request(app).post(url).set(leader.auth)).body, { sent: false });

    const first = await request(app).post(url).set(chair.auth);
    assert.equal(first.status, 200, first.body.message);
    assert.deepEqual(first.body, { sent: true, photos: 2 });

    await uploadPhoto(chair, album._id);
    assert.deepEqual((await request(app).post(url).set(chair.auth)).body, { sent: false });
  });

  test('an album with no new photos is not announced', async () => {
    const chair = await makeUser('admin');
    const album = (await createAlbum(chair)).body;
    assert.deepEqual((await request(app).post(`/api/gallery/albums/${album._id}/announce`).set(chair.auth)).body, { sent: false });
  });
});
