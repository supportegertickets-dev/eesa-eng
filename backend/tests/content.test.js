/**
 * News and contact message tests.
 *
 * Covers who may open an unpublished article, and the administrators' inbox
 * for messages sent from the public contact page.
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
let News;
let Contact;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  News = require('../models/News');
  Contact = require('../models/Contact');

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
  app.use(express.json());
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/news', require('../routes/news'));
  app.use('/api/contact', require('../routes/contact'));
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
    email: `content${counter}-${Date.now()}@example.com`,
    password: 'Str0ngPass1'
  });
  assert.equal(res.status, 201, res.body.message);
  if (role !== 'member') await User.updateOne({ _id: res.body._id }, { role });
  return { id: res.body._id, auth: { Authorization: `Bearer ${res.body.token}` } };
};

describe('news articles', () => {
  // Created directly, so publishing does not trigger the members' email.
  const makeArticle = async (fields = {}) => {
    const author = await makeUser('admin');
    return News.create({ title: 'Robotics team wins', content: 'Full story.', author: author.id, ...fields });
  };

  test('anyone can read a published article', async () => {
    const article = await makeArticle({ isPublished: true, publishedAt: new Date() });
    const res = await request(app).get(`/api/news/${article._id}`);
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.title, 'Robotics team wins');
  });

  test('a draft is hidden from the public, members and other office holders', async () => {
    const draft = await makeArticle({ title: 'Unannounced sponsor' });
    const member = await makeUser();
    const secretary = await makeUser('secretary_general');

    assert.equal((await request(app).get(`/api/news/${draft._id}`)).status, 404);
    assert.equal((await request(app).get(`/api/news/${draft._id}`).set(member.auth)).status, 404);
    assert.equal((await request(app).get(`/api/news/${draft._id}`).set(secretary.auth)).status, 404);

    const list = await request(app).get('/api/news');
    assert.equal(list.body.news.some((a) => a._id === String(draft._id)), false);
  });

  test('administrators and the chairperson can open a draft', async () => {
    const draft = await makeArticle();
    for (const role of ['admin', 'chairperson']) {
      const editor = await makeUser(role);
      const res = await request(app).get(`/api/news/${draft._id}`).set(editor.auth);
      assert.equal(res.status, 200, `${role}: ${res.body.message}`);
    }
  });

  test('a malformed id is rejected rather than failing on the server', async () => {
    assert.equal((await request(app).get('/api/news/not-an-id')).status, 400);
  });
});

describe('contact messages', () => {
  const send = (fields = {}) => request(app).post('/api/contact').send({
    name: 'Jane Visitor',
    email: 'jane@example.com',
    subject: 'Sponsorship enquiry',
    message: 'We would like to sponsor the robotics team.',
    ...fields
  });

  test('anyone can send a message, but only administrators can read the inbox', async () => {
    assert.equal((await send()).status, 201);

    const member = await makeUser();
    const treasurer = await makeUser('treasurer');
    assert.equal((await request(app).get('/api/contact')).status, 401);
    assert.equal((await request(app).get('/api/contact').set(member.auth)).status, 403);
    assert.equal((await request(app).get('/api/contact').set(treasurer.auth)).status, 403);
  });

  test('the inbox filters by read state and always counts every unread message', async () => {
    await Contact.deleteMany({});
    const chairperson = await makeUser('chairperson');
    for (const subject of ['First', 'Second', 'Third']) assert.equal((await send({ subject })).status, 201);

    const all = await request(app).get('/api/contact').set(chairperson.auth);
    assert.equal(all.status, 200, all.body.message);
    assert.equal(all.body.total, 3);
    assert.equal(all.body.unread, 3);

    const first = all.body.messages.find((m) => m.subject === 'First');
    assert.equal((await request(app).put(`/api/contact/${first._id}/read`).set(chairperson.auth)).status, 200);

    const unread = await request(app).get('/api/contact?status=unread').set(chairperson.auth);
    assert.deepEqual(unread.body.messages.map((m) => m.subject).sort(), ['Second', 'Third']);
    assert.equal(unread.body.unread, 2);

    const read = await request(app).get('/api/contact?status=read').set(chairperson.auth);
    assert.deepEqual(read.body.messages.map((m) => m.subject), ['First']);
    assert.equal(read.body.unread, 2);

    assert.equal((await request(app).get('/api/contact?status=starred').set(chairperson.auth)).status, 400);
  });

  test('a message can be marked unread again', async () => {
    const admin = await makeUser('admin');
    await send({ subject: 'Toggle me' });
    const message = await Contact.findOne({ subject: 'Toggle me' });

    const unread = await request(app).put(`/api/contact/${message._id}/read`).set(admin.auth).send({ isRead: false });
    assert.equal(unread.status, 200, unread.body.message);
    assert.equal(unread.body.isRead, false);

    const read = await request(app).put(`/api/contact/${message._id}/read`).set(admin.auth).send({});
    assert.equal(read.body.isRead, true);
  });

  test('deleting a message removes it for good', async () => {
    const admin = await makeUser('admin');
    await send({ subject: 'Delete me' });
    const message = await Contact.findOne({ subject: 'Delete me' });

    assert.equal((await request(app).delete(`/api/contact/${message._id}`).set(admin.auth)).status, 200);
    assert.equal((await request(app).delete(`/api/contact/${message._id}`).set(admin.auth)).status, 404);
    assert.equal((await request(app).delete('/api/contact/not-an-id').set(admin.auth)).status, 400);
  });
});
